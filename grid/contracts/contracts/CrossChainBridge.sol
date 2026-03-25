// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { Origin } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import "./FounderCommitment.sol";
import "./UniversalDistributionPool.sol";
import "./ShadowBridge.sol";

contract CrossChainBridge is OApp {
    FounderCommitment public immutable founder;
    UniversalDistributionPool public immutable pool;
    ShadowBridge public immutable shadow;

    event ArbitrageExecuted(uint256 profit, address token);

    constructor(address _endpoint, address _founder, address payable _pool, address _shadow) OApp(_endpoint, msg.sender) Ownable(msg.sender) {
        founder = FounderCommitment(_founder);
        pool = UniversalDistributionPool(_pool);
        shadow = ShadowBridge(_shadow);
    }

    // LayerZero omnichain payroll/UBI transfer
    function bridgePayroll(uint256 amount, uint32 dstEid, bytes calldata options, bytes32 zkProof) external payable {
        pool.distribute(msg.sender, amount, zkProof);
        bytes memory payload = abi.encode(msg.sender, amount, zkProof);
        _lzSend(dstEid, payload, options, MessagingFee(msg.value, 0), payable(msg.sender));
    }

    // Arbitrage function that acts on price sync data to benefit the platform
    function executeArbitrage(uint256 amount, uint32 dstEid, bytes calldata options) external payable {
        require(msg.sender == address(founder), "Only platform can execute arbitrage");
        // Simulate arbitrary logic to sync prices and make platform profit
        uint256 profit = amount / 10;
        emit ArbitrageExecuted(profit, address(0));
        bytes memory payload = abi.encode(msg.sender, amount, bytes32(0));
        _lzSend(dstEid, payload, options, MessagingFee(msg.value, 0), payable(msg.sender));
    }

    function _lzReceive(Origin calldata _origin, bytes32 _guid, bytes calldata payload, address _executor, bytes calldata _extraData) internal override {
        // Receive shadow contribution or robot payroll on destination chain
        (address recipient, uint256 amount, bytes32 zkProof) = abi.decode(payload, (address, uint256, bytes32));
        pool.distribute(recipient, amount, zkProof);
    }
}
