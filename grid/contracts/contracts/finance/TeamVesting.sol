// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/finance/VestingWallet.sol";

contract TeamVesting is VestingWallet {
    constructor(
        address beneficiaryAddress,
        uint64 startTimestamp,
        uint64 durationSeconds
    ) VestingWallet(beneficiaryAddress, startTimestamp, durationSeconds) {}
}
