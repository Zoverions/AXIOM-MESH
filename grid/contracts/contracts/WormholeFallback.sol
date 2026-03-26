// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@wormhole-foundation/wormhole-solidity-sdk/contracts/interfaces/IWormholeRelayer.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// M12.9 Penetration testing, Load & stress tests, and Cross-chain failure mode drills.
contract WormholeFallback is Ownable {
    IWormholeRelayer public immutable wormholeRelayer;
    bool public drillModeActive; // Simulates failure modes for chaos testing

    event DrillModeToggled(bool active);

    constructor(address _wormholeRelayer, address initialOwner) Ownable(initialOwner) {
        wormholeRelayer = IWormholeRelayer(_wormholeRelayer);
    }

    function setDrillMode(bool _active) external onlyOwner {
        drillModeActive = _active;
        emit DrillModeToggled(_active);
    }

    function wormholeBridge(uint16 targetChain, address recipient, uint256 amount) public payable {
        require(!drillModeActive, "Cross-chain drill mode: Bridge is simulated offline");

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
