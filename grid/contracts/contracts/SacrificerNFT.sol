// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SacrificerNFT is ERC721, Ownable {
    uint256 public totalSupply;

    constructor() ERC721("Axiom Sacrificer", "SACRIFICE") Ownable(msg.sender) {}

    function mintRecognition(address to) external onlyOwner {
        _mint(to, totalSupply);
        totalSupply++;
    }
}
