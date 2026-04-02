// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CommunityRecognitionNFT is ERC721, Ownable {
    enum CommunityType { None, MutantCats, CheechAndChong, HexSacrificer }

    mapping(uint256 => CommunityType) public communityType;
    uint256 public totalSupply;

    constructor() ERC721("Axiom Community Recognition", "ACR") Ownable(msg.sender) {}

    function mintRecognition(address to, CommunityType cType) external onlyOwner {
        communityType[totalSupply] = cType;
        _mint(to, totalSupply);
        totalSupply++;
    }
}
