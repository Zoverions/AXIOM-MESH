// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PortfolioVault
 * @notice An NFT-bound smart contract wallet.
 *         Designed to hold arbitrary ecosystem assets including native gas tokens (PLS),
 *         bridged stablecoins, existing ecosystem tokens (e.g. HEX, PLSX), and NFTs.
 *         Only the holder of the specific `tokenId` in `parentNFT` can execute transactions.
 */
contract PortfolioVault is ReentrancyGuard, ERC721Holder {
    IERC721 public immutable parentNFT;
    uint256 public immutable tokenId;

    constructor(address _parentNFT, uint256 _tokenId) {
        parentNFT = IERC721(_parentNFT);
        tokenId = _tokenId;
    }

    modifier onlyNFTOwner() {
        require(parentNFT.ownerOf(tokenId) == msg.sender, "Not the NFT owner");
        _;
    }

    /**
     * @notice Allows the NFT owner to execute arbitrary low-level calls from the vault.
     *         This handles sending ERC20s, ERC721s, native tokens, or calling other contracts.
     * @param to The target address for the transaction
     * @param value Native token value (e.g., PLS) to send with the call
     * @param data The calldata payload
     */
    function execute(address to, uint256 value, bytes calldata data) external nonReentrant onlyNFTOwner returns (bytes memory) {
        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "Execution failed");
        return result;
    }

    // Allows the vault to receive native gas tokens (e.g. PLS, ETH) directly
    receive() external payable {}
}

/**
 * @title PortfolioNFT
 * @notice Mints NFT "keys" that automatically deploy and control a unique `PortfolioVault`.
 *         Holding the NFT transfers ownership of the vault and all contents within it.
 */
contract PortfolioNFT is ERC721 {
    uint256 private _nextTokenId;
    mapping(uint256 => address) public vaultOf;

    event PortfolioCreated(uint256 indexed tokenId, address vault, address owner);

    constructor() ERC721("Portfolio NFT", "PNFT") {}

    /**
     * @notice Mints a new Portfolio NFT and generates its paired Vault.
     */
    function mint() external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        PortfolioVault vault = new PortfolioVault(address(this), tokenId);
        vaultOf[tokenId] = address(vault);

        emit PortfolioCreated(tokenId, address(vault), msg.sender);
        return tokenId;
    }
}
