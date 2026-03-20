// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "./DarkComputePool.sol";
import "./FounderCommitment.sol";

contract ShadowPaymaster is BasePaymaster {
    DarkComputePool public immutable darkPool;
    FounderCommitment public immutable founder;

    constructor(IEntryPoint _entryPoint, address _darkPool, address _founder) BasePaymaster(_entryPoint) {
        darkPool = DarkComputePool(_darkPool);
        founder = FounderCommitment(_founder);
    }

    function _validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32, uint256)
        internal view override returns (bytes memory context, uint256 validationData) {
        // Blinded reward claim via phantom hash in userOp
        bytes32 phantomHash = abi.decode(userOp.paymasterAndData[4:], (bytes32));
        (, uint256 computeUnits, , ) = darkPool.contributions(phantomHash);
        require(computeUnits > 0, "No contribution");
        return ("", 0);
    }

    function _postOp(PostOpMode, bytes calldata, uint256, uint256) internal override {
        // Reward already allocated via DarkComputePool
    }

    function _authorizeUpgrade(address) internal virtual {
        require(founder.verifyFounder(""), "Unauthorized");
    }
}
