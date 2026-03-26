// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GovernmentNode.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CanadianGovernment
 * @dev An entry point mirroring the Canadian government structure.
 * Initializes and manages the hierarchy: Federal -> Provincial -> Municipal levels.
 */
contract CanadianGovernment is Ownable {
    GovernmentNode public federalGovernment;
    mapping(string => GovernmentNode) public provincialGovernments;
    mapping(string => mapping(string => GovernmentNode)) public municipalGovernments;

    event FederalGovernmentCreated(address indexed federalNode);
    event ProvincialGovernmentCreated(string province, address indexed provincialNode);
    event MunicipalGovernmentCreated(string province, string municipality, address indexed municipalNode);

    constructor(address _initialOwner) Ownable(_initialOwner) {
        // Automatically initialize the federal level.
        federalGovernment = new GovernmentNode("Federal Government of Canada", _initialOwner);
        emit FederalGovernmentCreated(address(federalGovernment));
    }

    /**
     * @dev Creates a new provincial government node.
     */
    function createProvince(string memory _provinceName) external onlyOwner returns (address) {
        require(address(provincialGovernments[_provinceName]) == address(0), "CanadianGovernment: province already exists");

        GovernmentNode province = new GovernmentNode(_provinceName, owner());
        provincialGovernments[_provinceName] = province;

        emit ProvincialGovernmentCreated(_provinceName, address(province));
        return address(province);
    }

    /**
     * @dev Creates a new municipal government node under a specific province.
     */
    function createMunicipality(string memory _provinceName, string memory _municipalityName) external onlyOwner returns (address) {
        require(address(provincialGovernments[_provinceName]) != address(0), "CanadianGovernment: province does not exist");
        require(address(municipalGovernments[_provinceName][_municipalityName]) == address(0), "CanadianGovernment: municipality already exists");

        GovernmentNode municipality = new GovernmentNode(
            string(abi.encodePacked(_municipalityName, ", ", _provinceName)),
            owner()
        );
        municipalGovernments[_provinceName][_municipalityName] = municipality;

        emit MunicipalGovernmentCreated(_provinceName, _municipalityName, address(municipality));
        return address(municipality);
    }

    /**
     * @dev Get the address of a specific province.
     */
    function getProvince(string memory _provinceName) external view returns (address) {
        return address(provincialGovernments[_provinceName]);
    }

    /**
     * @dev Get the address of a specific municipality under a province.
     */
    function getMunicipality(string memory _provinceName, string memory _municipalityName) external view returns (address) {
        return address(municipalGovernments[_provinceName][_municipalityName]);
    }
}
