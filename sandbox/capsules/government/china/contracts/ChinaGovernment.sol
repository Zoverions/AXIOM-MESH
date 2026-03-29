// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ChinaGovernment {
    enum ActionState { Listed, Processing, Resolved }

    struct PublicAction {
        string description;
        address provinceRegistry;
        ActionState state;
        address citizen;
    }

    mapping(string => PublicAction) public provincialActions;

    event ActionListed(string actionId, string description, address registry);
    event ServicePulled(string actionId, address citizen, string description);

    function listPublicAction(string memory actionId, string memory description) external {
        provincialActions[actionId] = PublicAction({
            description: description,
            provinceRegistry: msg.sender,
            state: ActionState.Listed,
            citizen: address(0)
        });
        emit ActionListed(actionId, description, msg.sender);
    }

    // "Pull not push" mechanism
    function pullService(string memory actionId) external {
        require(provincialActions[actionId].provinceRegistry != address(0), "Action not found");
        require(provincialActions[actionId].state == ActionState.Listed, "Action already initiated");

        provincialActions[actionId].state = ActionState.Processing;
        provincialActions[actionId].citizen = msg.sender;

        emit ServicePulled(actionId, msg.sender, provincialActions[actionId].description);
    }
}
