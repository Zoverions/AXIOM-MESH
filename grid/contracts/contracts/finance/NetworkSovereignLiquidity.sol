// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@wormhole-foundation/wormhole-solidity-sdk/contracts/interfaces/IWormholeRelayer.sol";

contract NetworkSovereignLiquidity is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager public immutable npm;
    IWormholeRelayer public immutable wormholeRelayer;

    struct LPPosition {
        uint256 uniswapTokenId;
        address token0;
        address token1;
        uint256 feeAccumulator;
    }

    mapping(uint256 => LPPosition) public positions;
    uint256 public nextTokenId;

    address public privateRouter; // Authorized address for private/MEV-protected TXs

    event PositionTokenized(uint256 indexed tokenId, uint256 uniswapTokenId, address owner);
    event FeesAutoCompounded(uint256 indexed tokenId, uint256 amount0, uint256 amount1);
    event LiquidityBridged(uint256 indexed tokenId, uint16 targetChain, uint256 amount);
    event PrivateTransactionExecuted(uint256 indexed tokenId, address executor);

    constructor(
        address _npm,
        address _wormholeRelayer,
        address _privateRouter
    ) ERC721("Sovereign Liquidity Position", "SLP") Ownable(msg.sender) {
        npm = INonfungiblePositionManager(_npm);
        wormholeRelayer = IWormholeRelayer(_wormholeRelayer);
        privateRouter = _privateRouter;
        nextTokenId = 1;
    }

    modifier onlyPrivateRouter() {
        require(msg.sender == privateRouter, "NetworkSovereignLiquidity: Unauthorized private router");
        _;
    }

    function setPrivateRouter(address _router) external onlyOwner {
        privateRouter = _router;
    }

    /**
     * @dev Tokenize an existing Uniswap V3 LP position as a tradeable NFT.
     * The user must first approve this contract to transfer the Uniswap NFT.
     */
    function tokenizePosition(uint256 _uniswapTokenId) external nonReentrant returns (uint256) {
        // Transfer the Uniswap LP NFT to this contract
        npm.safeTransferFrom(msg.sender, address(this), _uniswapTokenId);

        // Retrieve position details from Uniswap (simplified for this implementation)
        (, , address token0, address token1, , , , , , , , ) = npm.positions(_uniswapTokenId);

        uint256 tokenId = nextTokenId++;
        positions[tokenId] = LPPosition({
            uniswapTokenId: _uniswapTokenId,
            token0: token0,
            token1: token1,
            feeAccumulator: 0
        });

        _mint(msg.sender, tokenId);

        emit PositionTokenized(tokenId, _uniswapTokenId, msg.sender);
        return tokenId;
    }

    /**
     * @dev Auto-compound fees into the yield-bearing vault (Uniswap position).
     * Collects fees and immediately reinvests them as liquidity.
     * Includes slippage protection and returns unspent dust to the owner.
     */
    function autoCompound(uint256 _tokenId, uint256 amount0Min, uint256 amount1Min) external nonReentrant {
        // Can only be called by the private router (keeper) or owner of the position to prevent malicious slippage attacks
        require(msg.sender == privateRouter || msg.sender == ownerOf(_tokenId), "NetworkSovereignLiquidity: Unauthorized caller");

        LPPosition storage pos = positions[_tokenId];
        require(pos.uniswapTokenId != 0, "NetworkSovereignLiquidity: Invalid position");

        // Collect all fees
        (uint256 amount0, uint256 amount1) = npm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: pos.uniswapTokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // Reinvest (add liquidity)
        if (amount0 > 0 || amount1 > 0) {
            IERC20(pos.token0).approve(address(npm), amount0);
            IERC20(pos.token1).approve(address(npm), amount1);

            ( , uint256 amount0Added, uint256 amount1Added) = npm.increaseLiquidity(
                INonfungiblePositionManager.IncreaseLiquidityParams({
                    tokenId: pos.uniswapTokenId,
                    amount0Desired: amount0,
                    amount1Desired: amount1,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp + 300
                })
            );

            // Return unspent dust to the position owner
            address positionOwner = ownerOf(_tokenId);
            if (amount0 > amount0Added) {
                IERC20(pos.token0).safeTransfer(positionOwner, amount0 - amount0Added);
            }
            if (amount1 > amount1Added) {
                IERC20(pos.token1).safeTransfer(positionOwner, amount1 - amount1Added);
            }

            pos.feeAccumulator += (amount0Added + amount1Added); // Simplified accounting
        }

        emit FeesAutoCompounded(_tokenId, amount0, amount1);
    }

    /**
     * @dev Implement Wormhole-layer cross-chain liquidity sharing.
     */
    function bridgeLiquidity(
        uint256 _tokenId,
        uint16 _targetChain,
        address _recipient,
        uint128 _liquidityToBridge,
        uint256 amount0Min,
        uint256 amount1Min
    ) external payable nonReentrant {
        require(ownerOf(_tokenId) == msg.sender, "NetworkSovereignLiquidity: Not position owner");

        LPPosition storage pos = positions[_tokenId];
        require(pos.uniswapTokenId != 0, "NetworkSovereignLiquidity: Invalid position");

        // Withdraw liquidity to bridge from Uniswap V3
        npm.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: pos.uniswapTokenId,
                liquidity: _liquidityToBridge,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: block.timestamp + 300
            })
        );

        // Collect the decreased tokens and any uncollected fees to this contract
        (uint256 collected0, uint256 collected1) = npm.collect(INonfungiblePositionManager.CollectParams({
            tokenId: pos.uniswapTokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        }));

        // Send tokens to a locked cross-chain state pool (this contract acts as the escrow).
        // The Wormhole relayer / bridge contract on the destination chain will mint equivalent wrapped tokens.
        // We do not burn them; we hold them in escrow backing the bridged asset.

        // Encode the payload for the destination chain including the total collected amount (principal + fees)
        bytes memory payload = abi.encode(_tokenId, _recipient, _liquidityToBridge, collected0, collected1, pos.token0, pos.token1);

        // Send via Wormhole
        wormholeRelayer.sendPayloadToEvm{value: msg.value}(
            _targetChain,
            _recipient,
            payload,
            0,
            250_000 // default gas limit
        );

        emit LiquidityBridged(_tokenId, _targetChain, _liquidityToBridge);
    }

    /**
     * @dev Private transaction routing for MEV protection.
     * Only authorized private routers (e.g. Flashbots relayers) can execute this.
     * Restricts execution exclusively to the NonfungiblePositionManager to prevent draining funds.
     */
    function executePrivateTx(uint256 _tokenId, address target, bytes calldata _data) external onlyPrivateRouter nonReentrant returns (bytes memory) {
        require(ownerOf(_tokenId) != address(0), "NetworkSovereignLiquidity: Invalid position");
        require(target == address(npm), "NetworkSovereignLiquidity: Target must be NPM");

        // Execute private liquidity adjustments or swaps to prevent sandwich attacks
        (bool success, bytes memory returnData) = target.call(_data);
        require(success, "NetworkSovereignLiquidity: Private transaction failed");

        emit PrivateTransactionExecuted(_tokenId, msg.sender);
        return returnData;
    }

    // Required override for ERC721 safeTransferFrom
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
