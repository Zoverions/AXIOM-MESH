// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract CitizenshipNFT is Ownable, ERC721 {
    address public computeBondAddress;
    address public dialecticArbitrationAddress;

    uint256 private tokenIdCounter;

    struct CitizenshipMetadata {
        string jurisdiction;
        uint256 expiry;
        string rightsTier;
        bytes32 zkProofHash;
        string issuerGuildID;
        string metadataURI;
    }

    mapping(uint256 => CitizenshipMetadata) public citizenshipData;
    mapping(uint256 => bool) public isRevoked;

    event CitizenshipMinted(uint256 indexed tokenId, address indexed holder, string jurisdiction);
    event CitizenshipRevoked(uint256 indexed tokenId, string reason);

    modifier onlyAuthorized() {
        require(msg.sender == owner() || msg.sender == dialecticArbitrationAddress, "Unauthorized");
        _;
    }

    constructor() Ownable(msg.sender) ERC721("GovernmentalCitizenshipNFT", "CITIZEN") {}

    function setComputeBondAddress(address _computeBond) external onlyOwner {
        computeBondAddress = _computeBond;
    }

    function setDialecticArbitrationAddress(address _arbitration) external onlyOwner {
        dialecticArbitrationAddress = _arbitration;
    }

    function mintCitizenship(
        address holder,
        string calldata jurisdiction,
        uint256 expiry,
        string calldata rightsTier,
        bytes32 zkProofHash,
        string calldata issuerGuildID,
        string calldata metadataURI
    ) external {
        // Gated by Guild staking + VRF (reusing ComputeBond active status as proxy here)
        require(computeBondAddress != address(0), "ComputeBond not set");
        (bool success, bytes memory data) = computeBondAddress.staticcall(
            abi.encodeWithSignature("stakerActive(address)", msg.sender)
        );
        require(success && abi.decode(data, (bool)), "Active bond required to issue");

        tokenIdCounter++;
        uint256 newItemId = tokenIdCounter;

        _mint(holder, newItemId);

        citizenshipData[newItemId] = CitizenshipMetadata({
            jurisdiction: jurisdiction,
            expiry: expiry,
            rightsTier: rightsTier,
            zkProofHash: zkProofHash,
            issuerGuildID: issuerGuildID,
            metadataURI: metadataURI
        });

        emit CitizenshipMinted(newItemId, holder, jurisdiction);
    }

    function revokeCitizenship(uint256 tokenId, string calldata reason) external onlyAuthorized {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        isRevoked[tokenId] = true;
        emit CitizenshipRevoked(tokenId, reason);
    }

    // Soulbound implementation
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "CitizenshipNFT: Transfer not allowed (Soulbound)");
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return citizenshipData[tokenId].metadataURI;
    }
}
