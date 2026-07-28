// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract GenesisNFT is ERC721 {
    constructor(address deployer) ERC721("AxiomMesh Genesis Deployer", "AXMG") {
        _mint(deployer, 1);
    }
}