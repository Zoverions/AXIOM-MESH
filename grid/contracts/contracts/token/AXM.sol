// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AXM is ERC20 {
    // FIN-A.2: Enforce Operational Tokenomics Controls: Bridge the gap between the implemented AXM.sol contract split (5/10/85) and the governance/evidence controls that are not yet fully locked operationally.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant FOUNDER_PERCENT = 5;
    uint256 public constant NETWORK_TREASURY_PERCENT = 10;
    uint256 public constant ECOSYSTEM_RESERVE_PERCENT = 85;

    constructor(address founderEntity, address networkTreasury, address ecosystemReserve) ERC20("AxiomMesh", "AXM") {
        require(
            FOUNDER_PERCENT + NETWORK_TREASURY_PERCENT + ECOSYSTEM_RESERVE_PERCENT == 100,
            "Invalid token split"
        );

        uint256 founderAmount = TOTAL_SUPPLY * FOUNDER_PERCENT / 100;
        uint256 networkTreasuryAmount = TOTAL_SUPPLY * NETWORK_TREASURY_PERCENT / 100;
        uint256 ecosystemReserveAmount = TOTAL_SUPPLY - founderAmount - networkTreasuryAmount;

        _mint(founderEntity, founderAmount);
        _mint(networkTreasury, networkTreasuryAmount);
        _mint(ecosystemReserve, ecosystemReserveAmount);
    }
}
