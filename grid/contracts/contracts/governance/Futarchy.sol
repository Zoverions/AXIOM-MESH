// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Futarchy is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public governanceToken;

    struct Proposal {
        uint256 id;
        string description;
        uint256 passStake;
        uint256 failStake;
        uint256 deadline;
        bool executed;
        bool passed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint256)) public passStakes;
    mapping(uint256 => mapping(address => uint256)) public failStakes;

    uint256 public proposalCount;

    event ProposalCreated(uint256 indexed id, string description, uint256 deadline);
    event BetPlaced(uint256 indexed id, address indexed voter, bool support, uint256 amount);
    event ProposalResolved(uint256 indexed id, bool passed, uint256 passStake, uint256 failStake);
    event WinningsClaimed(uint256 indexed id, address indexed voter, uint256 amount);

    constructor(address _governanceToken, address initialOwner) Ownable(initialOwner) {
        governanceToken = IERC20(_governanceToken);
    }

    function createProposal(string calldata description, uint256 duration) external returns (uint256) {
        require(duration > 0, "Duration must be > 0");
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            id: id,
            description: description,
            passStake: 0,
            failStake: 0,
            deadline: block.timestamp + duration,
            executed: false,
            passed: false
        });
        emit ProposalCreated(id, description, proposals[id].deadline);
        return id;
    }

    function bet(uint256 proposalId, bool support, uint256 amount) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp < proposal.deadline, "Voting period has ended");
        require(amount > 0, "Amount must be > 0");

        governanceToken.transferFrom(msg.sender, address(this), amount);

        if (support) {
            proposal.passStake += amount;
            passStakes[proposalId][msg.sender] += amount;
        } else {
            proposal.failStake += amount;
            failStakes[proposalId][msg.sender] += amount;
        }

        emit BetPlaced(proposalId, msg.sender, support, amount);
    }

    function resolveProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.deadline, "Voting period not yet ended");
        require(!proposal.executed, "Proposal already executed");

        proposal.executed = true;

        if (proposal.passStake > proposal.failStake) {
            proposal.passed = true;
        } else {
            proposal.passed = false;
        }

        emit ProposalResolved(proposalId, proposal.passed, proposal.passStake, proposal.failStake);
    }

    function claimWinnings(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.executed, "Proposal not yet executed");

        uint256 reward = 0;

        if (proposal.passed) {
            uint256 stake = passStakes[proposalId][msg.sender];
            require(stake > 0, "No winning stake");
            passStakes[proposalId][msg.sender] = 0;

            reward = stake;
            if (proposal.passStake > 0 && proposal.failStake > 0) {
                reward += (stake * proposal.failStake) / proposal.passStake;
            }
        } else {
            uint256 stake = failStakes[proposalId][msg.sender];
            require(stake > 0, "No winning stake");
            failStakes[proposalId][msg.sender] = 0;

            reward = stake;
            if (proposal.failStake > 0 && proposal.passStake > 0) {
                reward += (stake * proposal.passStake) / proposal.failStake;
            }
        }

        require(reward > 0, "No reward to claim");
        governanceToken.safeTransfer(msg.sender, reward);

        emit WinningsClaimed(proposalId, msg.sender, reward);
    }
}
