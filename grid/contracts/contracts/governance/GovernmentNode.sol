// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title GovernmentNode
 * @dev Represents a generic government level (Federal, Provincial, Municipal).
 * It manages its own treasury and handles transparent contracting for resource allocation.
 */
contract GovernmentNode is Ownable {
    using SafeERC20 for IERC20;

    string public nodeName;
    uint256 public contractCount;

    struct ResourceContract {
        uint256 id;
        string description;
        address contractor;
        uint256 amount;
        bool isCompleted;
        bool isFunded;
        address token; // address(0) for native token
    }

    mapping(uint256 => ResourceContract) public contracts;

    event ContractCreated(uint256 indexed contractId, string description, address indexed contractor, uint256 amount, address token);
    event ContractFunded(uint256 indexed contractId);
    event ContractCompleted(uint256 indexed contractId, address indexed contractor, uint256 amount);
    event FundsReceived(address indexed sender, uint256 amount, address token);

    constructor(string memory _nodeName, address _initialOwner) Ownable(_initialOwner) {
        nodeName = _nodeName;
    }

    /**
     * @dev Create a new transparent contract for resource allocation.
     */
    function createContract(
        string memory _description,
        address _contractor,
        uint256 _amount,
        address _token
    ) external onlyOwner returns (uint256) {
        require(_contractor != address(0), "GovernmentNode: invalid contractor");
        require(_amount > 0, "GovernmentNode: invalid amount");

        contractCount++;
        uint256 newContractId = contractCount;

        contracts[newContractId] = ResourceContract({
            id: newContractId,
            description: _description,
            contractor: _contractor,
            amount: _amount,
            isCompleted: false,
            isFunded: false,
            token: _token
        });

        emit ContractCreated(newContractId, _description, _contractor, _amount, _token);
        return newContractId;
    }

    /**
     * @dev Fund a contract, earmarking funds.
     */
    function fundContract(uint256 _contractId) external onlyOwner {
        ResourceContract storage resourceContract = contracts[_contractId];
        require(resourceContract.id == _contractId, "GovernmentNode: contract does not exist");
        require(!resourceContract.isFunded, "GovernmentNode: already funded");

        if (resourceContract.token == address(0)) {
            require(address(this).balance >= resourceContract.amount, "GovernmentNode: insufficient native balance");
        } else {
            require(IERC20(resourceContract.token).balanceOf(address(this)) >= resourceContract.amount, "GovernmentNode: insufficient ERC20 balance");
        }

        resourceContract.isFunded = true;
        emit ContractFunded(_contractId);
    }

    /**
     * @dev Mark a contract as completed and release funds.
     */
    function completeContract(uint256 _contractId) external onlyOwner {
        ResourceContract storage resourceContract = contracts[_contractId];
        require(resourceContract.id == _contractId, "GovernmentNode: contract does not exist");
        require(resourceContract.isFunded, "GovernmentNode: contract not funded");
        require(!resourceContract.isCompleted, "GovernmentNode: already completed");

        resourceContract.isCompleted = true;

        if (resourceContract.token == address(0)) {
            (bool success, ) = resourceContract.contractor.call{value: resourceContract.amount}("");
            require(success, "GovernmentNode: native transfer failed");
        } else {
            IERC20(resourceContract.token).safeTransfer(resourceContract.contractor, resourceContract.amount);
        }

        emit ContractCompleted(_contractId, resourceContract.contractor, resourceContract.amount);
    }

    /**
     * @dev Receive native tokens
     */
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value, address(0));
    }

    /**
     * @dev Allow arbitrary ERC20 deposits to be logged
     */
    function depositERC20(address token, uint256 amount) external {
        require(token != address(0), "GovernmentNode: invalid token");
        require(amount > 0, "GovernmentNode: amount must be > 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit FundsReceived(msg.sender, amount, token);
    }
}
