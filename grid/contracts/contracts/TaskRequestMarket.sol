// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TaskRequestMarket
 * @notice Foundation contract for decentralized task contracting across digital and physical agents.
 * Rewards are escrowed in ERC20 and split between worker and public-goods treasury on completion.
 */
contract TaskRequestMarket is Ownable {
    enum TaskType {
        Digital,
        Physical,
        Hybrid
    }

    enum TaskStatus {
        Open,
        Accepted,
        Submitted,
        Completed,
        Cancelled
    }

    struct Task {
        uint256 id;
        address requester;
        address performer;
        uint256 reward;
        uint256 deadline;
        uint16 publicGoodsBps;
        TaskType taskType;
        TaskStatus status;
        string specURI;
        string submissionURI;
        string feedbackURI;
        uint8 feedbackScore;
    }

    IERC20 public immutable rewardToken;
    address public publicGoodsTreasury;
    uint256 public taskCounter;

    mapping(uint256 => Task) public tasks;

    event TaskCreated(uint256 indexed taskId, address indexed requester, uint256 reward, TaskType taskType);
    event TaskAccepted(uint256 indexed taskId, address indexed performer);
    event TaskSubmitted(uint256 indexed taskId, string submissionURI);
    event TaskFinalized(uint256 indexed taskId, address indexed performer, uint256 performerAmount, uint256 treasuryAmount, uint8 feedbackScore);
    event TaskCancelled(uint256 indexed taskId);
    event PublicGoodsTreasuryUpdated(address indexed treasury);

    error InvalidBps();
    error InvalidDeadline();
    error InvalidTaskState();
    error Unauthorized();

    constructor(address rewardToken_, address publicGoodsTreasury_) Ownable(msg.sender) {
        require(rewardToken_ != address(0), "reward token required");
        require(publicGoodsTreasury_ != address(0), "treasury required");
        rewardToken = IERC20(rewardToken_);
        publicGoodsTreasury = publicGoodsTreasury_;
    }

    function setPublicGoodsTreasury(address treasury) external onlyOwner {
        require(treasury != address(0), "treasury required");
        publicGoodsTreasury = treasury;
        emit PublicGoodsTreasuryUpdated(treasury);
    }

    function createTask(
        uint256 reward,
        uint256 deadline,
        uint16 publicGoodsBps,
        TaskType taskType,
        string calldata specURI
    ) external returns (uint256 taskId) {
        if (publicGoodsBps > 10_000) revert InvalidBps();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        require(reward > 0, "reward required");

        taskId = ++taskCounter;
        tasks[taskId] = Task({
            id: taskId,
            requester: msg.sender,
            performer: address(0),
            reward: reward,
            deadline: deadline,
            publicGoodsBps: publicGoodsBps,
            taskType: taskType,
            status: TaskStatus.Open,
            specURI: specURI,
            submissionURI: "",
            feedbackURI: "",
            feedbackScore: 0
        });

        require(rewardToken.transferFrom(msg.sender, address(this), reward), "escrow transfer failed");
        emit TaskCreated(taskId, msg.sender, reward, taskType);
    }

    function acceptTask(uint256 taskId) external {
        Task storage task = tasks[taskId];
        if (task.status != TaskStatus.Open) revert InvalidTaskState();
        if (block.timestamp > task.deadline) revert InvalidDeadline();
        if (msg.sender == task.requester) revert Unauthorized();

        task.performer = msg.sender;
        task.status = TaskStatus.Accepted;
        emit TaskAccepted(taskId, msg.sender);
    }

    function submitTask(uint256 taskId, string calldata submissionURI) external {
        Task storage task = tasks[taskId];
        if (task.status != TaskStatus.Accepted) revert InvalidTaskState();
        if (msg.sender != task.performer) revert Unauthorized();

        task.submissionURI = submissionURI;
        task.status = TaskStatus.Submitted;
        emit TaskSubmitted(taskId, submissionURI);
    }

    function finalizeTask(uint256 taskId, bool approved, uint8 feedbackScore, string calldata feedbackURI) external {
        Task storage task = tasks[taskId];
        if (task.status != TaskStatus.Submitted) revert InvalidTaskState();
        if (msg.sender != task.requester && msg.sender != owner()) revert Unauthorized();
        require(feedbackScore <= 100, "feedback out of range");

        task.feedbackScore = feedbackScore;
        task.feedbackURI = feedbackURI;
        task.status = TaskStatus.Completed;

        uint256 performerAmount;
        uint256 treasuryAmount;

        if (approved) {
            treasuryAmount = (task.reward * task.publicGoodsBps) / 10_000;
            performerAmount = task.reward - treasuryAmount;
            require(rewardToken.transfer(task.performer, performerAmount), "performer transfer failed");
            if (treasuryAmount > 0) {
                require(rewardToken.transfer(publicGoodsTreasury, treasuryAmount), "treasury transfer failed");
            }
        } else {
            require(rewardToken.transfer(task.requester, task.reward), "refund transfer failed");
        }

        emit TaskFinalized(taskId, task.performer, performerAmount, treasuryAmount, feedbackScore);
    }

    function cancelOpenTask(uint256 taskId) external {
        Task storage task = tasks[taskId];
        if (task.status != TaskStatus.Open) revert InvalidTaskState();
        if (msg.sender != task.requester) revert Unauthorized();

        task.status = TaskStatus.Cancelled;
        require(rewardToken.transfer(task.requester, task.reward), "refund transfer failed");
        emit TaskCancelled(taskId);
    }
}
