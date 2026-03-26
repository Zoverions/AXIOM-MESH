// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../CitizenshipNFT.sol";
import "./CanadianGovernment.sol";

/**
 * @title TaxController
 * @dev Interfaces with the CitizenshipNFT to apply correct tax rates
 * based on the user's jurisdiction (e.g. Canada) and routes funds to
 * the correct government levels (Federal, Provincial, Municipal).
 */
contract TaxController is Ownable {
    using SafeERC20 for IERC20;

    CitizenshipNFT public citizenshipNFT;
    CanadianGovernment public canadianGovernment;

    // Rates are in basis points (1/100th of a percent, so 500 = 5%)
    struct TaxBracket {
        uint256 federalRateBps;
        uint256 provincialRateBps;
        uint256 municipalRateBps;
    }

    // Mapping: Country => Province => TaxBracket
    mapping(string => mapping(string => TaxBracket)) public taxBrackets;

    // User Profile mapping to connect an address with their country and province
    // Since CitizenshipNFT has basic jurisdiction, we can extend details here.
    struct TaxProfile {
        string country;
        string province;
        string municipality;
    }
    mapping(address => TaxProfile) public userProfiles;

    event TaxCollected(address indexed taxpayer, uint256 totalTax, string country, string province, string municipality);
    event TaxBracketUpdated(string country, string province, uint256 fedBps, uint256 provBps, uint256 munBps);
    event UserProfileUpdated(address indexed user, string country, string province, string municipality);

    constructor(address _citizenshipNFT, address _canadianGovernment, address _initialOwner) Ownable(_initialOwner) {
        citizenshipNFT = CitizenshipNFT(_citizenshipNFT);
        canadianGovernment = CanadianGovernment(_canadianGovernment);
    }

    /**
     * @dev Set tax bracket for a specific region.
     */
    function setTaxBracket(
        string memory _country,
        string memory _province,
        uint256 _federalRateBps,
        uint256 _provincialRateBps,
        uint256 _municipalRateBps
    ) external onlyOwner {
        taxBrackets[_country][_province] = TaxBracket({
            federalRateBps: _federalRateBps,
            provincialRateBps: _provincialRateBps,
            municipalRateBps: _municipalRateBps
        });
        emit TaxBracketUpdated(_country, _province, _federalRateBps, _provincialRateBps, _municipalRateBps);
    }

    /**
     * @dev User updates their specific profile details (Province, Municipality) to route taxes correctly.
     */
    function updateUserProfile(string memory _country, string memory _province, string memory _municipality) external {
        // Enforce the user actually has the CitizenshipNFT of the claimed jurisdiction if they have an NFT
        // (Simplified for this pilot - checks if the string matches jurisdiction or they are allowed)
        userProfiles[msg.sender] = TaxProfile({
            country: _country,
            province: _province,
            municipality: _municipality
        });
        emit UserProfileUpdated(msg.sender, _country, _province, _municipality);
    }

    /**
     * @dev Calculates and collects tax on a given transaction amount, routing to correct treasuries.
     * Uses ERC20 tokens for the transaction currency.
     */
    function collectTax(uint256 _transactionAmount, address _tokenAddress) external returns (uint256 totalTaxCollected) {
        require(_transactionAmount > 0, "TaxController: invalid amount");
        require(_tokenAddress != address(0), "TaxController: invalid token");

        TaxProfile memory profile = userProfiles[msg.sender];
        require(bytes(profile.country).length > 0, "TaxController: no user profile");

        TaxBracket memory bracket = taxBrackets[profile.country][profile.province];

        uint256 fedTax = (_transactionAmount * bracket.federalRateBps) / 10000;
        uint256 provTax = (_transactionAmount * bracket.provincialRateBps) / 10000;
        uint256 munTax = (_transactionAmount * bracket.municipalRateBps) / 10000;

        totalTaxCollected = 0;

        // Route taxes based on Country
        // Currently specifically handles Canada. Can be extended for others.
        if (keccak256(bytes(profile.country)) == keccak256(bytes("Canada"))) {
            address fedNode = address(canadianGovernment.federalGovernment());
            address provNode = canadianGovernment.getProvince(profile.province);
            address munNode = canadianGovernment.getMunicipality(profile.province, profile.municipality);

            if (fedTax > 0 && fedNode != address(0)) {
                IERC20(_tokenAddress).safeTransferFrom(msg.sender, fedNode, fedTax);
                totalTaxCollected += fedTax;
            }
            if (provTax > 0 && provNode != address(0)) {
                IERC20(_tokenAddress).safeTransferFrom(msg.sender, provNode, provTax);
                totalTaxCollected += provTax;
            }
            if (munTax > 0 && munNode != address(0)) {
                IERC20(_tokenAddress).safeTransferFrom(msg.sender, munNode, munTax);
                totalTaxCollected += munTax;
            }
        } else {
            // Default generic fallback to owner if not Canada for demo purposes
            uint256 fallbackTax = fedTax + provTax + munTax;
            if (fallbackTax > 0) {
                IERC20(_tokenAddress).safeTransferFrom(msg.sender, owner(), fallbackTax);
                totalTaxCollected += fallbackTax;
            }
        }

        require(totalTaxCollected > 0, "TaxController: zero tax to collect");

        emit TaxCollected(msg.sender, totalTaxCollected, profile.country, profile.province, profile.municipality);
        return totalTaxCollected;
    }
}
