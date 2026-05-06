// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BootstrapInitiatorNFT
 * @notice Reward NFT for the person who initiates the initial funding of the AXIOM-MESH network.
 *         Unlocks future rewards as decided by the founder or governing body.
 *         Includes privacy-preserving metadata controls.
 */
contract BootstrapInitiatorNFT is ERC721, Ownable {
    uint256 public nextTokenId;

    struct InitiatorData {
        uint256 fundingAmount;
        uint256 timestamp;
        bool isRepaid;
        uint256 rewardValue;
        string metadataURI;
    }

    mapping(uint256 => InitiatorData) public initiatorData;

    event InitiatorRewarded(address indexed initiator, uint256 tokenId, uint256 amount);
    event MetadataUpdated(uint256 indexed tokenId, string newURI);

    constructor() ERC721("Axiom Bootstrap Initiator", "BINT") Ownable(msg.sender) {}

    /**
     * @notice Mints the achievement NFT to the initiator.
     * @param to The address of the initiator.
     * @param fundingAmount The amount funded to initiate the network.
     */
    function mintInitiator(address to, uint256 fundingAmount) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);

        initiatorData[tokenId] = InitiatorData({
            fundingAmount: fundingAmount,
            timestamp: block.timestamp,
            isRepaid: false,
            rewardValue: 0,
            metadataURI: ""
        });

        emit InitiatorRewarded(to, tokenId, fundingAmount);
        return tokenId;
    }

    /**
     * @notice Updates the repayment status of the NFT.
     * @param tokenId The ID of the NFT.
     * @param repaid True if the initiator has been repaid.
     */
    function setRepaid(uint256 tokenId, bool repaid) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        initiatorData[tokenId].isRepaid = repaid;
    }

    /**
     * @notice Updates the reward value for the NFT achievement.
     * @param tokenId The ID of the NFT.
     * @param value The value of the reward (e.g., in native tokens or credits).
     */
    function setRewardValue(uint256 tokenId, uint256 value) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        initiatorData[tokenId].rewardValue = value;
    }

    /**
     * @notice Updates the metadata URI. Allows the user to control their public profile.
     * @param tokenId The ID of the NFT.
     * @param newURI The new metadata URI.
     */
    function setMetadataURI(uint256 tokenId, string calldata newURI) external {
        require(ownerOf(tokenId) == msg.sender, "Only the owner can update metadata");
        initiatorData[tokenId].metadataURI = newURI;
        emit MetadataUpdated(tokenId, newURI);
    }

    /**
     * @notice Returns the metadata URI for the token.
     * @param tokenId The ID of the NFT.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return initiatorData[tokenId].metadataURI;
    }

    // Soulbound: This NFT is an achievement tied to the initial action
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "BootstrapInitiatorNFT: Achievement is non-transferable");
        return super._update(to, tokenId, auth);
    }
}
