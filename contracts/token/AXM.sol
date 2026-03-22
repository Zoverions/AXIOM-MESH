// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AXM is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant FOUNDER_PERCENT = 5;

    constructor(address founderEntity, address networkTreasury) ERC20("AxiomMesh", "AXM") {
        uint256 founderAmount = TOTAL_SUPPLY * FOUNDER_PERCENT / 100;
        _mint(founderEntity, founderAmount);
        _mint(networkTreasury, TOTAL_SUPPLY - founderAmount);
    }
}