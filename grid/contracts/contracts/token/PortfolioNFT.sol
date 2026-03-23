// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PortfolioVault is ReentrancyGuard, ERC721Holder {
    using SafeERC20 for IERC20;

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

    function execute(address to, uint256 value, bytes calldata data) external nonReentrant onlyNFTOwner returns (bytes memory) {
        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "Execution failed");
        return result;
    }

    receive() external payable {}
}

contract PortfolioNFT is ERC721 {
    uint256 private _nextTokenId;
    mapping(uint256 => address) public vaultOf;

    event PortfolioCreated(uint256 indexed tokenId, address vault, address owner);

    constructor() ERC721("Portfolio NFT", "PNFT") {}

    function mint() external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        PortfolioVault vault = new PortfolioVault(address(this), tokenId);
        vaultOf[tokenId] = address(vault);

        emit PortfolioCreated(tokenId, address(vault), msg.sender);
        return tokenId;
    }
}
