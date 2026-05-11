// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract FounderNFT is ERC721 {
    constructor(address founderAddress) ERC721("AxiomMesh Founder", "AXMF") {
        require(founderAddress == 0x1c2cBabF75e1938ED2f2c59e734e83aa5FBe1B73, "Invalid founder address");
        _mint(founderAddress, 1);
    }
}