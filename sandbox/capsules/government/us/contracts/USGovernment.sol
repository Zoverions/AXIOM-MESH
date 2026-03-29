// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract USGovernment {
    enum ServiceStatus { Registered, InProgress, Completed }

    struct Service {
        string name;
        address agency;
        ServiceStatus status;
        address citizen;
    }

    mapping(string => Service) public services;

    event ServicePulled(string serviceId, address citizen, string name);
    event ServiceRegistered(string serviceId, string name, address agency);

    function registerService(string memory serviceId, string memory name) external {
        services[serviceId] = Service({
            name: name,
            agency: msg.sender,
            status: ServiceStatus.Registered,
            citizen: address(0)
        });
        emit ServiceRegistered(serviceId, name, msg.sender);
    }

    // "Pull not push" mechanism
    function pullService(string memory serviceId) external {
        require(services[serviceId].agency != address(0), "Service not found");
        require(services[serviceId].status == ServiceStatus.Registered, "Service already pulled");

        services[serviceId].status = ServiceStatus.InProgress;
        services[serviceId].citizen = msg.sender;

        emit ServicePulled(serviceId, msg.sender, services[serviceId].name);
    }
}
