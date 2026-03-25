// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StablecoinPayroll
 * @dev Manages payroll distributions using a specified stablecoin (ERC20).
 * Mirrors traditional payroll structures by allowing streaming or batch
 * claims on a set interval.
 */
contract StablecoinPayroll is Ownable, ReentrancyGuard {
    IERC20 public stablecoin;

    struct Employee {
        uint256 salaryPerInterval;
        uint256 lastClaimTime;
        bool isActive;
    }

    mapping(address => Employee) public employees;
    uint256 public constant PAYROLL_INTERVAL = 30 days;

    event EmployeeAdded(address indexed employee, uint256 salary);
    event EmployeeRemoved(address indexed employee);
    event SalaryClaimed(address indexed employee, uint256 amount);
    event FundsDeposited(address indexed depositor, uint256 amount);

    constructor(address _stablecoin) Ownable(msg.sender) {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        stablecoin = IERC20(_stablecoin);
    }

    /**
     * @dev Add or update an employee's salary.
     */
    function addEmployee(address _employee, uint256 _salaryPerInterval) external onlyOwner {
        require(_employee != address(0), "Invalid employee address");
        employees[_employee] = Employee({
            salaryPerInterval: _salaryPerInterval,
            lastClaimTime: block.timestamp,
            isActive: true
        });
        emit EmployeeAdded(_employee, _salaryPerInterval);
    }

    /**
     * @dev Remove an employee from active payroll.
     */
    function removeEmployee(address _employee) external onlyOwner {
        require(employees[_employee].isActive, "Employee not active");
        employees[_employee].isActive = false;
        emit EmployeeRemoved(_employee);
    }

    /**
     * @dev Deposit stablecoins into the payroll contract.
     * The caller must have approved the contract to spend the amount.
     */
    function deposit(uint256 _amount) external {
        require(_amount > 0, "Deposit must be greater than 0");
        require(stablecoin.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        emit FundsDeposited(msg.sender, _amount);
    }

    /**
     * @dev Allows an active employee to claim their accumulated salary.
     * Calculated proportionally based on the time since the last claim.
     */
    function claimSalary() external nonReentrant {
        Employee storage emp = employees[msg.sender];
        require(emp.isActive, "Not an active employee");

        uint256 timePassed = block.timestamp - emp.lastClaimTime;
        require(timePassed > 0, "No time has passed");

        // Calculate proportional salary
        uint256 amountToClaim = (emp.salaryPerInterval * timePassed) / PAYROLL_INTERVAL;
        require(amountToClaim > 0, "Amount too small to claim");
        require(stablecoin.balanceOf(address(this)) >= amountToClaim, "Insufficient contract funds");

        emp.lastClaimTime = block.timestamp;

        require(stablecoin.transfer(msg.sender, amountToClaim), "Transfer failed");
        emit SalaryClaimed(msg.sender, amountToClaim);
    }

    /**
     * @dev Emergency withdrawal of stablecoins by the owner.
     */
    function emergencyWithdraw(uint256 _amount) external onlyOwner {
        require(stablecoin.transfer(msg.sender, _amount), "Transfer failed");
    }
}
