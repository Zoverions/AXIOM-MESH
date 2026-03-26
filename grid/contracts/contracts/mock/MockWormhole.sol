// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@wormhole-foundation/wormhole-solidity-sdk/contracts/interfaces/IWormholeRelayer.sol";

contract MockWormhole {
    event PayloadSent(uint16 targetChain, address targetAddress, bytes payload, uint256 receiverValue, uint256 gasLimit);

    function sendPayloadToEvm(
        uint16 targetChain,
        address targetAddress,
        bytes memory payload,
        uint256 receiverValue,
        uint256 gasLimit
    ) external payable returns (uint64 sequence) {
        emit PayloadSent(targetChain, targetAddress, payload, receiverValue, gasLimit);
        return 1;
    }

    function sendPayloadToEvm(
        uint16 targetChain,
        address targetAddress,
        bytes memory payload,
        uint256 receiverValue,
        uint256 gasLimit,
        uint16 refundChain,
        address refundAddress
    ) external payable returns (uint64 sequence) {
        emit PayloadSent(targetChain, targetAddress, payload, receiverValue, gasLimit);
        return 1;
    }
}
