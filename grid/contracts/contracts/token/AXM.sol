// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract AXM is ERC20, ERC20Burnable {
    // FIN-A.2: Enforce Operational Tokenomics Controls: Bridge the gap between the implemented AXM.sol contract split (5/10/85) and the governance/evidence controls that are not yet fully locked operationally.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant FOUNDER_PERCENT = 5;
    uint256 public constant NETWORK_TREASURY_PERCENT = 10;
    uint256 public constant ECOSYSTEM_RESERVE_PERCENT = 85;
    uint256 public constant ECOSYSTEM_EMISSION_DURATION = 3650 days; // 10-year linear release

    address public immutable ecosystemReserveWallet;
    uint256 public immutable ecosystemEmissionStart;
    uint256 public immutable ecosystemReserveCap;
    uint256 public ecosystemReserveEmitted;

    event EcosystemEmissionReleased(uint256 amount, uint256 cumulativeEmitted, address indexed beneficiary);

    constructor(address founderEntity, address networkTreasury, address ecosystemReserve) ERC20("AxiomMesh", "AXM") {
        require(
            FOUNDER_PERCENT + NETWORK_TREASURY_PERCENT + ECOSYSTEM_RESERVE_PERCENT == 100,
            "Invalid token split"
        );
        require(founderEntity != address(0), "Invalid founder");
        require(networkTreasury != address(0), "Invalid treasury");
        require(ecosystemReserve != address(0), "Invalid reserve");

        uint256 founderAmount = TOTAL_SUPPLY * FOUNDER_PERCENT / 100;
        uint256 networkTreasuryAmount = TOTAL_SUPPLY * NETWORK_TREASURY_PERCENT / 100;
        uint256 ecosystemReserveAmount = TOTAL_SUPPLY - founderAmount - networkTreasuryAmount;

        ecosystemReserveWallet = ecosystemReserve;
        ecosystemEmissionStart = block.timestamp;
        ecosystemReserveCap = ecosystemReserveAmount;

        _mint(founderEntity, founderAmount);
        _mint(networkTreasury, networkTreasuryAmount);
        // Reserve is minted to this contract and emitted via a deterministic linear schedule.
        _mint(address(this), ecosystemReserveAmount);
    }

    function releasableEcosystemEmission() public view returns (uint256) {
        uint256 elapsed = block.timestamp - ecosystemEmissionStart;
        if (elapsed >= ECOSYSTEM_EMISSION_DURATION) {
            return ecosystemReserveCap - ecosystemReserveEmitted;
        }

        uint256 vested = (ecosystemReserveCap * elapsed) / ECOSYSTEM_EMISSION_DURATION;
        if (vested <= ecosystemReserveEmitted) {
            return 0;
        }
        return vested - ecosystemReserveEmitted;
    }

    function releaseEcosystemEmission() external returns (uint256 released) {
        released = releasableEcosystemEmission();
        require(released > 0, "Nothing to release");

        ecosystemReserveEmitted += released;
        _transfer(address(this), ecosystemReserveWallet, released);
        emit EcosystemEmissionReleased(released, ecosystemReserveEmitted, ecosystemReserveWallet);
    }
}
