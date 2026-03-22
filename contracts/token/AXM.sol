// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AXM is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant FOUNDER_PERCENT = 5;

    constructor(address founderEntity) ERC20("AxiomMesh", "AXM") {
        _mint(founderEntity, TOTAL_SUPPLY * FOUNDER_PERCENT / 100);
    }
}