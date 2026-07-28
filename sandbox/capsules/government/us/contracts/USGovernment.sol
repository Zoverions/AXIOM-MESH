// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract USGovernment {
    enum ServiceStatus { Registered, InProgress, Completed }
    enum Jurisdiction { Federal, State }

    struct Service {
        string name;
        address agency;
        ServiceStatus status;
        address citizen;
        Jurisdiction jurisdiction;
        string stateCode; // Optional, used if jurisdiction is State
    }

    mapping(string => Service) public services;
    // state code => service id => bool
    mapping(string => mapping(string => bool)) public stateServicesRegistry;

    event ServicePulled(string serviceId, address citizen, string name);
    event ServiceRegistered(string serviceId, string name, address agency, Jurisdiction jurisdiction, string stateCode);

    function registerService(string memory serviceId, string memory name, Jurisdiction jurisdiction, string memory stateCode) external {
        if (jurisdiction == Jurisdiction.State) {
            require(bytes(stateCode).length > 0, "State code required for State jurisdiction");
            stateServicesRegistry[stateCode][serviceId] = true;
        }

        services[serviceId] = Service({
            name: name,
            agency: msg.sender,
            status: ServiceStatus.Registered,
            citizen: address(0),
            jurisdiction: jurisdiction,
            stateCode: stateCode
        });
        emit ServiceRegistered(serviceId, name, msg.sender, jurisdiction, stateCode);
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
