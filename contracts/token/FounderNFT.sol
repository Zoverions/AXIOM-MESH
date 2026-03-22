// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract FounderNFT is ERC721 {
    constructor(address founderAddress) ERC721("AxiomMesh Founder", "AXMF") {
        _mint(founderAddress, 1);
    }
}