// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title L2StateRollup
 * @dev Placeholder contract for the Grid L2 optimistic state rollup mechanism.
 *      To batch process stigmergic state channel state roots to the main L1 ledger (PulseChain).
 */
contract L2StateRollup {
    bytes32 public latestStateRoot;
    uint256 public batchCount;

    event RollupCommitted(uint256 indexed batchId, bytes32 stateRoot);

    function commitBatch(bytes32 _stateRoot) external {
        latestStateRoot = _stateRoot;
        batchCount++;
        emit RollupCommitted(batchCount, _stateRoot);
    }
}
