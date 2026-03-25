// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../treasury/NetworkTreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract OntarioHealthGuild is NetworkTreasury {
    using SafeERC20 for IERC20;

    bool public isRevoked;
    address public overseer;

    event AccessRevoked(address indexed by);
    event FundsMigrated(address indexed token, address indexed to, uint256 amount);

    modifier onlyWhenActive() {
        require(!isRevoked, "OntarioHealthGuild: Access revoked (fail-closed)");
        _;
    }

    modifier onlyOverseer() {
        require(msg.sender == overseer, "OntarioHealthGuild: Unauthorized overseer");
        _;
    }

    constructor(address _owner, address _overseer) NetworkTreasury(_owner) {
        overseer = _overseer;
        isRevoked = false;
    }

    // Explicit function for M10.5 testnet evidence and revocation/fail-closed tests
    function revokeAccess() external onlyOverseer {
        require(!isRevoked, "OntarioHealthGuild: Already revoked");
        isRevoked = true;
        emit AccessRevoked(msg.sender);
    }

    // Migrate funds to another entity (e.g. for guild migration demo)
    function migrateFunds(address token, address to, uint256 amount) external onlyOwner onlyWhenActive {
        require(to != address(0), "OntarioHealthGuild: Invalid destination");
        require(amount > 0, "OntarioHealthGuild: Invalid amount");

        if (token == address(0)) {
            // Native token migration
            require(address(this).balance >= amount, "OntarioHealthGuild: Insufficient balance");
            (bool success, ) = to.call{value: amount}("");
            require(success, "OntarioHealthGuild: Native transfer failed");
        } else {
            // ERC20 migration
            IERC20(token).safeTransfer(to, amount);
        }

        emit FundsMigrated(token, to, amount);
    }

    // Override or wrap other treasury functions if necessary to enforce fail-closed
    // For this pilot, the primary operation is the migration and explicit revocation.

}
