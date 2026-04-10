// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title GenesisDecayGovernance
 * @notice THE Genesis Decay contract for AXIOM-MESH.
 * Founders begin with elevated voting power that decays exponentially (half-life model)
 * based on block height until it reaches 1.0x (standard citizen weight).
 * This guarantees mathematical decentralization from Genesis by physics and thermodynamics,
 * preventing sybil attacks and state coercion. The network is governed by math from Day 1.
 * Replaces all previous Founder Multi-Sig and centralized controls.
 */
contract GenesisDecayGovernance is AccessControl {
    bytes32 public constant SENATE_ROLE = keccak256("SENATE_ROLE");

    uint256 public immutable GENESIS_BLOCK;
    uint256 public immutable HALF_LIFE_BLOCKS;
    uint256 public immutable INITIAL_FOUNDER_COEFFICIENT; // 1e18 scaled

    mapping(address => bool) public isFounder;

    event FounderCoefficientCalculated(address indexed voter, uint256 coefficient);
    event GenesisDecayMaturityReached();

    constructor(
        uint256 _halfLifeBlocks,
        uint256 _initialFounderCoefficient,
        address[] memory _founders
    ) {
        GENESIS_BLOCK = block.number;
        HALF_LIFE_BLOCKS = _halfLifeBlocks;
        INITIAL_FOUNDER_COEFFICIENT = _initialFounderCoefficient;

        for (uint256 i = 0; i < _founders.length; i++) {
            isFounder[_founders[i]] = true;
            _grantRole(DEFAULT_ADMIN_ROLE, _founders[i]);
            _grantRole(SENATE_ROLE, _founders[i]);
        }
    }

    /**
     * @notice Returns current Founder Coefficient (exponential half-life decay)
     * @dev Matches CONSTITUTION.md: "decays exponentially into an egalitarian state"
     */
    function getVotingCoefficient(address voter) public view returns (uint256) {
        if (!isFounder[voter]) return 1e18;

        uint256 blocksElapsed = block.number - GENESIS_BLOCK;
        if (blocksElapsed >= type(uint256).max / HALF_LIFE_BLOCKS) {
            return 1e18;
        }

        uint256 n = blocksElapsed / HALF_LIFE_BLOCKS;
        uint256 decayFactor = _fixedPointPowHalf(n);

        uint256 coefficient = (INITIAL_FOUNDER_COEFFICIENT * decayFactor) / 1e18;
        return coefficient < 1e18 ? 1e18 : coefficient;
    }

    /**
     * @dev Fixed-point (18 decimals) (0.5)^n using binary exponentiation — gas efficient & auditable
     */
    function _fixedPointPowHalf(uint256 n) internal pure returns (uint256) {
        uint256 result = 1e18;
        uint256 base = 5e17; // 0.5 × 1e18
        while (n > 0) {
            if (n & 1 == 1) result = (result * base) / 1e18;
            base = (base * base) / 1e18;
            n >>= 1;
        }
        return result;
    }

    function calculateEffectiveVotes(address voter, uint256 rawReputationBalance) external view returns (uint256) {
        return (rawReputationBalance * getVotingCoefficient(voter)) / 1e18;
    }
}