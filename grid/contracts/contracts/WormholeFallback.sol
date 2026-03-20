// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@wormhole-foundation/wormhole-solidity-sdk/contracts/interfaces/IWormholeRelayer.sol";

contract WormholeFallback {
    IWormholeRelayer public immutable wormholeRelayer;

    constructor(address _wormholeRelayer) {
        wormholeRelayer = IWormholeRelayer(_wormholeRelayer);
    }

    function wormholeBridge(uint16 targetChain, address recipient, uint256 amount) public payable {
        // Simple forward payload to relayer for zkProof or fallback logic
        bytes memory payload = abi.encode(recipient, amount);
        wormholeRelayer.sendPayloadToEvm{value: msg.value}(
            targetChain,
            recipient,
            payload,
            0,
            250_000
        );
    }
}
