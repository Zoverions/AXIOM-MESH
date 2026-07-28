// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract InternalBadgeNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    bool public transfersEnabled;

    event SustainabilityThresholdMet(uint256 timestamp);

    constructor() ERC721("AXIOM Internal Badge", "AXMB") Ownable(msg.sender) {
        transfersEnabled = false; // Soul-bound until threshold
    }

    function mintBadge(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }

    // Called by governance/admin when sustainability threshold is met (e.g. >99.9% uptime, surplus)
    function unlockTransfers() external onlyOwner {
        transfersEnabled = true;
        emit SustainabilityThresholdMet(block.timestamp);
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        require(transfersEnabled, "Badges are soul-bound until sustainability threshold is met");
        super.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        require(transfersEnabled, "Badges are soul-bound until sustainability threshold is met");
        super.safeTransferFrom(from, to, tokenId, data);
    }
}
