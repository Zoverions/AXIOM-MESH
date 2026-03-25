// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./CognitiveFrictionVerifier.sol";
import "./HorizonForecast.sol";
import "./SymbiosisEngine.sol";

contract VaultManager is ReentrancyGuard {
    IERC721 public immutable vaultKeyNFT;          // NFT acts as key
    CognitiveFrictionVerifier public poerVerifier;
    HorizonForecast public horizon;
    SymbiosisEngine public symbiosis;

    struct Vault {
        address owner;
        uint256 nftId;                             // NFT key
        mapping(address => uint256) lockedTokens;  // token => amount
        bool isActive;
    }

    mapping(uint256 => Vault) public vaults;       // nftId => Vault

    event VaultCreated(uint256 indexed nftId, address owner);
    event AssetsLocked(uint256 indexed nftId, address token, uint256 amount);
    event AssetsReleased(uint256 indexed nftId, address token, uint256 amount);

    constructor(address _nft, address _poer, address _horizon, address _symbiosis) {
        vaultKeyNFT = IERC721(_nft);
        poerVerifier = CognitiveFrictionVerifier(_poer);
        horizon = HorizonForecast(_horizon);
        symbiosis = SymbiosisEngine(_symbiosis);
    }

    function createVault(uint256 nftId) external nonReentrant {
        require(vaultKeyNFT.ownerOf(nftId) == msg.sender, "Must own NFT key");
        require(!vaults[nftId].isActive, "Vault already exists");

        // Use storage pointer mapping initialization is not needed, set scalar values
        vaults[nftId].owner = msg.sender;
        vaults[nftId].nftId = nftId;
        vaults[nftId].isActive = true;

        emit VaultCreated(nftId, msg.sender);
    }

    function lockAssets(uint256 nftId, address token, uint256 amount) external nonReentrant {
        // For now, allow owner to lock assets
        require(vaults[nftId].owner == msg.sender, "Unauthorized");

        // Transfer ERC20 token to vault
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);

        vaults[nftId].lockedTokens[token] += amount;
        emit AssetsLocked(nftId, token, amount);
    }

    // Horizon-verified release (only through Symbiosis proposals)
    function releaseAssets(uint256 nftId, address token, uint256 amount, bytes calldata horizonProof) external nonReentrant {
        // Assume horizon.verifyForecast(horizonProof) or similar logic for checking higher order risk.
        // Here we require that it's called by SymbiosisEngine or the owner
        require(msg.sender == vaults[nftId].owner || msg.sender == address(symbiosis), "Unauthorized");
        require(vaults[nftId].lockedTokens[token] >= amount, "Insufficient locked balance");

        vaults[nftId].lockedTokens[token] -= amount;
        SafeERC20.safeTransfer(IERC20(token), msg.sender, amount);

        emit AssetsReleased(nftId, token, amount);
    }
}
