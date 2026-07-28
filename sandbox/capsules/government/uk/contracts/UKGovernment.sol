// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UKGovernment {
    enum ServiceStatus { Available, Requested, Fulfilled }

    struct Service {
        string identifier;
        address authority;
        ServiceStatus state;
        address beneficiary;
    }

    mapping(string => Service) public publicServices;

    event ServiceAvailable(string serviceId, string identifier, address authority);
    event ServicePulled(string serviceId, address beneficiary, string identifier);

    function addService(string memory serviceId, string memory identifier) external {
        publicServices[serviceId] = Service({
            identifier: identifier,
            authority: msg.sender,
            state: ServiceStatus.Available,
            beneficiary: address(0)
        });
        emit ServiceAvailable(serviceId, identifier, msg.sender);
    }

    // "Pull not push" mechanism
    function pullService(string memory serviceId) external {
        require(publicServices[serviceId].authority != address(0), "Public service does not exist");
        require(publicServices[serviceId].state == ServiceStatus.Available, "Service already claimed");

        publicServices[serviceId].state = ServiceStatus.Requested;
        publicServices[serviceId].beneficiary = msg.sender;

        emit ServicePulled(serviceId, msg.sender, publicServices[serviceId].identifier);
    }
}
