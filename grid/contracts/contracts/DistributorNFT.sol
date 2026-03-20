// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CitizenshipNFT.sol";

contract DistributorNFT is CitizenshipNFT {
    mapping(uint256 => bool) public isBusinessGovDistributor;

    function mintDistributor(address to, uint256 tokenId, string calldata name, bool isBusiness) external {
        require(governance.isProposalPassed(keccak256(abi.encode(tokenId))), "Bicameral required");
        _safeMint(to, tokenId);
        isBusinessGovDistributor[tokenId] = isBusiness;
    }
}
