// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title GovernmentCore
 * @dev Core governance contract template for governmental replacement capsules.
 * Provides fundamental mechanisms for fund allocation, proposal submission,
 * and transparent contracting. Designed to be extended by nation-specific implementations.
 * 
 * Features:
 * - Transparent fund allocation (no appropriation, only algorithmic distribution)
 * - Open bid/proposal submission system
 * - Automated contract award based on predefined criteria
 * - Multi-tier governance structure support
 * - Integration with digital agents for mundane tasks
 */
contract GovernmentCore is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== STRUCTS ====================

    struct Proposal {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 requestedAmount;
        address token; // address(0) for native token
        uint256 submissionTime;
        uint256 votingEndTime;
        bool executed;
        bool approved;
        uint256 votesFor;
        uint256 votesAgainst;
        mapping(address => bool) hasVoted;
    }

    struct Bid {
        uint256 id;
        uint256 proposalId;
        address bidder;
        uint256 amount;
        string deliverables;
        uint256 estimatedCompletionTime;
        uint256 submissionTime;
        bool awarded;
        bool completed;
        uint256 qualityScore; // 0-100, assigned after completion
    }

    struct ContractAward {
        uint256 id;
        uint256 proposalId;
        uint256 bidId;
        address contractor;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 milestoneCount;
        uint256 completedMilestones;
        bool active;
        bool completed;
        mapping(uint256 => Milestone) milestones;
    }

    struct Milestone {
        string description;
        uint256 amount;
        bool verified;
        bool paid;
    }

    struct GovernanceLevel {
        string name;
        address admin;
        uint256 budgetLimit; // Maximum single allocation without higher approval
        uint256 allocatedBudget;
        uint256 remainingBudget;
    }

    // ==================== STATE VARIABLES ====================

    uint256 public proposalCount;
    uint256 public bidCount;
    uint256 public contractCount;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => Bid[]) public proposalBids; // All bids for a proposal
    mapping(uint256 => ContractAward) public contractAwards;
    mapping(uint256 => uint256) public proposalToContract; // Maps proposal ID to contract ID

    // Governance hierarchy (Federal -> State/Provincial -> Local)
    mapping(string => GovernanceLevel) public governanceLevels;
    string[] public levelNames;

    // Agent registry for narrow AI task automation
    mapping(address => bool) public registeredAgents;
    mapping(address => string) public agentCapabilities;
    
    // Configuration
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant MIN_VOTING_QUORUM = 10; // Minimum votes required
    uint256 public constant APPROVAL_THRESHOLD = 51; // 51% approval needed (basis points: 5100 = 51%)
    uint256 public constant BASIS_POINTS = 10000;

    // ==================== EVENTS ====================

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string title, uint256 requestedAmount);
    event BidSubmitted(uint256 indexed bidId, uint256 indexed proposalId, address indexed bidder, uint256 amount);
    event ContractAwarded(uint256 indexed contractId, uint256 indexed proposalId, uint256 indexed bidId, address contractor);
    event MilestoneVerified(uint256 indexed contractId, uint256 milestoneIndex);
    event FundsReleased(uint256 indexed contractId, uint256 indexed milestoneIndex, address indexed recipient, uint256 amount);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event GovernanceLevelCreated(string indexed levelName, address admin, uint256 budgetLimit);
    event AgentRegistered(address indexed agent, string capabilities);
    event FundsDeposited(address indexed sender, uint256 amount, address token);
    event BudgetAllocated(string indexed levelName, uint256 amount);

    // ==================== MODIFIERS ====================

    modifier onlyRegisteredAgent() {
        require(registeredAgents[msg.sender], "GovernmentCore: Not a registered agent");
        _;
    }

    modifier onlyGovernanceAdmin(string memory _level) {
        require(governanceLevels[_level].admin == msg.sender, "GovernmentCore: Not admin for this level");
        _;
    }

    modifier proposalExists(uint256 _proposalId) {
        require(_proposalId > 0 && _proposalId <= proposalCount, "GovernmentCore: Proposal does not exist");
        _;
    }

    modifier votingActive(uint256 _proposalId) {
        require(block.timestamp <= proposals[_proposalId].votingEndTime, "GovernmentCore: Voting period ended");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(address _initialOwner) Ownable(_initialOwner) {
        // Initialize root governance level
        _createGovernanceLevel("Root", _initialOwner, type(uint256).max);
    }

    // ==================== GOVERNANCE LEVEL MANAGEMENT ====================

    /**
     * @dev Create a new governance level (e.g., Federal, State, Municipal)
     */
    function createGovernanceLevel(
        string memory _name,
        address _admin,
        uint256 _budgetLimit
    ) external onlyOwner {
        _createGovernanceLevel(_name, _admin, _budgetLimit);
    }

    function _createGovernanceLevel(
        string memory _name,
        address _admin,
        uint256 _budgetLimit
    ) internal {
        require(governanceLevels[_name].admin == address(0), "GovernmentCore: Level already exists");
        
        governanceLevels[_name] = GovernanceLevel({
            name: _name,
            admin: _admin,
            budgetLimit: _budgetLimit,
            allocatedBudget: 0,
            remainingBudget: _budgetLimit
        });
        
        levelNames.push(_name);
        
        emit GovernanceLevelCreated(_name, _admin, _budgetLimit);
    }

    function allocateBudget(
        string memory _levelName,
        uint256 _amount
    ) external onlyOwner {
        require(governanceLevels[_levelName].admin != address(0), "GovernmentCore: Level does not exist");
        require(_amount <= governanceLevels["Root"].remainingBudget, "GovernmentCore: Insufficient root budget");
        
        governanceLevels[_levelName].budgetLimit += _amount;
        governanceLevels[_levelName].remainingBudget += _amount;
        governanceLevels["Root"].allocatedBudget += _amount;
        governanceLevels["Root"].remainingBudget -= _amount;
        
        emit BudgetAllocated(_levelName, _amount);
    }

    // ==================== PROPOSAL SYSTEM ====================

    /**
     * @dev Submit a new proposal for resource allocation
     * Can be called by citizens or their agent representatives
     */
    function submitProposal(
        string memory _title,
        string memory _description,
        uint256 _requestedAmount,
        address _token
    ) external returns (uint256) {
        require(bytes(_title).length > 0, "GovernmentCore: Title required");
        require(_requestedAmount > 0, "GovernmentCore: Amount must be > 0");
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.title = _title;
        proposal.description = _description;
        proposal.proposer = msg.sender;
        proposal.requestedAmount = _requestedAmount;
        proposal.token = _token;
        proposal.submissionTime = block.timestamp;
        proposal.votingEndTime = block.timestamp + VOTING_PERIOD;
        
        emit ProposalCreated(proposalId, msg.sender, _title, _requestedAmount);
        return proposalId;
    }

    /**
     * @dev Cast vote on a proposal
     * Weight can be based on citizenship NFTs, reputation, or token holdings
     */
    function voteOnProposal(
        uint256 _proposalId,
        bool _support,
        uint256 _weight
    ) external proposalExists(_proposalId) votingActive(_proposalId) {
        Proposal storage proposal = proposals[_proposalId];
        require(!proposal.hasVoted[msg.sender], "GovernmentCore: Already voted");
        require(_weight > 0, "GovernmentCore: Weight must be > 0");
        
        proposal.hasVoted[msg.sender] = true;
        
        if (_support) {
            proposal.votesFor += _weight;
        } else {
            proposal.votesAgainst += _weight;
        }
        
        emit VoteCast(_proposalId, msg.sender, _support, _weight);
    }

    /**
     * @dev Execute proposal after voting period ends if approved
     */
    function executeProposal(uint256 _proposalId) external proposalExists(_proposalId) nonReentrant {
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp > proposal.votingEndTime, "GovernmentCore: Voting still active");
        require(!proposal.executed, "GovernmentCore: Already executed");
        
        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        require(totalVotes >= MIN_VOTING_QUORUM, "GovernmentCore: Quorum not met");
        
        uint256 approvalRate = (proposal.votesFor * BASIS_POINTS) / totalVotes;
        proposal.approved = approvalRate >= APPROVAL_THRESHOLD;
        proposal.executed = true;
        
        if (proposal.approved) {
            // Open bidding period for approved proposals
            // Contractors can now submit bids
        }
    }

    // ==================== BIDDING SYSTEM ====================

    /**
     * @dev Submit a bid for an approved proposal
     * Can be submitted by contractors or their agent representatives
     */
    function submitBid(
        uint256 _proposalId,
        uint256 _amount,
        string memory _deliverables,
        uint256 _estimatedCompletionTime
    ) external proposalExists(_proposalId) returns (uint256) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.executed && proposal.approved, "GovernmentCore: Proposal not approved");
        require(_amount > 0, "GovernmentCore: Amount must be > 0");
        
        bidCount++;
        uint256 bidId = bidCount;
        
        Bid memory bid = Bid({
            id: bidId,
            proposalId: _proposalId,
            bidder: msg.sender,
            amount: _amount,
            deliverables: _deliverables,
            estimatedCompletionTime: _estimatedCompletionTime,
            submissionTime: block.timestamp,
            awarded: false,
            completed: false,
            qualityScore: 0
        });
        
        proposalBids[_proposalId].push(bid);
        
        emit BidSubmitted(bidId, _proposalId, msg.sender, _amount);
        return bidId;
    }

    /**
     * @dev Award contract to winning bid
     * Uses automated selection criteria or manual selection by governance admin
     */
    function awardContract(
        uint256 _proposalId,
        uint256 _bidIndex
    ) external proposalExists(_proposalId) nonReentrant returns (uint256) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.executed && proposal.approved, "GovernmentCore: Proposal not approved");
        require(_bidIndex < proposalBids[_proposalId].length, "GovernmentCore: Invalid bid index");
        
        Bid storage bid = proposalBids[_proposalId][_bidIndex];
        require(!bid.awarded, "GovernmentCore: Bid already awarded");
        
        // Verify funds available
        address token = proposal.token;
        if (token == address(0)) {
            require(address(this).balance >= bid.amount, "GovernmentCore: Insufficient balance");
        } else {
            require(IERC20(token).balanceOf(address(this)) >= bid.amount, "GovernmentCore: Insufficient token balance");
        }
        
        contractCount++;
        uint256 contractId = contractCount;
        
        ContractAward storage award = contractAwards[contractId];
        award.id = contractId;
        award.proposalId = _proposalId;
        award.bidId = bid.id;
        award.contractor = bid.bidder;
        award.totalAmount = bid.amount;
        award.releasedAmount = 0;
        award.milestoneCount = 1; // Default single milestone
        award.completedMilestones = 0;
        award.active = true;
        
        // Initialize default milestone
        award.milestones[0] = Milestone({
            description: bid.deliverables,
            amount: bid.amount,
            verified: false,
            paid: false
        });
        
        bid.awarded = true;
        proposalToContract[_proposalId] = contractId;
        
        emit ContractAwarded(contractId, _proposalId, bid.id, bid.bidder);
        return contractId;
    }

    // ==================== MILESTONE VERIFICATION & PAYMENT ====================

    /**
     * @dev Verify milestone completion and release funds
     * Can be done by governance admin or automated via zkML proof
     */
    function verifyMilestone(
        uint256 _contractId,
        uint256 _milestoneIndex
    ) external nonReentrant {
        ContractAward storage award = contractAwards[_contractId];
        require(award.active, "GovernmentCore: Contract not active");
        require(_milestoneIndex < award.milestoneCount, "GovernmentCore: Invalid milestone");
        
        Milestone storage milestone = award.milestones[_milestoneIndex];
        require(!milestone.verified, "GovernmentCore: Already verified");
        
        milestone.verified = true;
        award.completedMilestones++;
        
        emit MilestoneVerified(_contractId, _milestoneIndex);
        
        // Auto-release payment if verified
        _releasePayment(_contractId, _milestoneIndex);
    }

    function _releasePayment(
        uint256 _contractId,
        uint256 _milestoneIndex
    ) internal {
        ContractAward storage award = contractAwards[_contractId];
        Milestone storage milestone = award.milestones[_milestoneIndex];
        
        require(!milestone.paid, "GovernmentCore: Already paid");
        
        milestone.paid = true;
        award.releasedAmount += milestone.amount;
        
        // Get token from associated proposal
        Proposal storage proposal = proposals[award.proposalId];
        address token = proposal.token;
        
        if (token == address(0)) {
            (bool success, ) = award.contractor.call{value: milestone.amount}("");
            require(success, "GovernmentCore: Native transfer failed");
        } else {
            IERC20(token).safeTransfer(award.contractor, milestone.amount);
        }
        
        emit FundsReleased(_contractId, _milestoneIndex, award.contractor, milestone.amount);
        
        // Mark contract complete if all milestones done
        if (award.completedMilestones >= award.milestoneCount) {
            award.active = false;
            award.completed = true;
        }
    }

    // ==================== AGENT REGISTRATION ====================

    /**
     * @dev Register a digital agent for narrow AI tasks
     */
    function registerAgent(
        address _agentAddress,
        string memory _capabilities
    ) external onlyOwner {
        require(!registeredAgents[_agentAddress], "GovernmentCore: Agent already registered");
        
        registeredAgents[_agentAddress] = true;
        agentCapabilities[_agentAddress] = _capabilities;
        
        emit AgentRegistered(_agentAddress, _capabilities);
    }

    /**
     * @dev Unregister an agent
     */
    function unregisterAgent(address _agentAddress) external onlyOwner {
        require(registeredAgents[_agentAddress], "GovernmentCore: Agent not registered");
        delete registeredAgents[_agentAddress];
        delete agentCapabilities[_agentAddress];
    }

    // ==================== FUND MANAGEMENT ====================

    /**
     * @dev Deposit native tokens
     */
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value, address(0));
    }

    /**
     * @dev Deposit ERC20 tokens
     */
    function depositERC20(address _token, uint256 _amount) external {
        require(_token != address(0), "GovernmentCore: Invalid token");
        require(_amount > 0, "GovernmentCore: Amount must be > 0");
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        emit FundsDeposited(msg.sender, _amount, _token);
    }

    // ==================== VIEW FUNCTIONS ====================

    function getProposal(uint256 _proposalId) external view returns (
        string memory title,
        string memory description,
        address proposer,
        uint256 requestedAmount,
        address token,
        uint256 submissionTime,
        uint256 votingEndTime,
        bool executed,
        bool approved,
        uint256 votesFor,
        uint256 votesAgainst
    ) {
        Proposal storage p = proposals[_proposalId];
        return (
            p.title,
            p.description,
            p.proposer,
            p.requestedAmount,
            p.token,
            p.submissionTime,
            p.votingEndTime,
            p.executed,
            p.approved,
            p.votesFor,
            p.votesAgainst
        );
    }

    function getBidsForProposal(uint256 _proposalId) external view returns (
        uint256[] memory ids,
        address[] memory bidders,
        uint256[] memory amounts,
        bool[] memory awarded
    ) {
        Bid[] storage bids = proposalBids[_proposalId];
        ids = new uint256[](bids.length);
        bidders = new address[](bids.length);
        amounts = new uint256[](bids.length);
        awarded = new bool[](bids.length);
        
        for (uint256 i = 0; i < bids.length; i++) {
            ids[i] = bids[i].id;
            bidders[i] = bids[i].bidder;
            amounts[i] = bids[i].amount;
            awarded[i] = bids[i].awarded;
        }
        
        return (ids, bidders, amounts, awarded);
    }

    function getGovernanceLevelCount() external view returns (uint256) {
        return levelNames.length;
    }

    function getAllGovernanceLevels() external view returns (string[] memory) {
        return levelNames;
    }
}
