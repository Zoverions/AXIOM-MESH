// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./WeightOracle.sol";

interface IStigmergicStateChannelGovernance {
    function setFeeBurnBpsOfTax(uint256 _feeBurnBpsOfTax) external;
}

interface IERC20Burnable {
    function burn(uint256 amount) external;
}

contract ZoverionsDAO is Ownable {
    IERC20 public governanceToken;
    WeightOracle public weightOracle;
    uint256 public constant DEFAULT_TOKEN_UNLOCK_DELAY = 7 days;
    uint256 public votingTokenUnlockDelay = DEFAULT_TOKEN_UNLOCK_DELAY;
    uint256 public totalLockedVotingTokens;

    struct Proposal {
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        bool executed;
        bool isStrategic;
        bool passed;
        bool feeBurnActivation;
        uint256 unlockAt;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint256)) public quadraticVotes; // Mapping proposalId => voter => cast votes (sqrt)
    mapping(uint256 => mapping(address => uint256)) public lockedTokensByProposal;
    mapping(uint256 => uint256) public proposalLockedTotals;
    mapping(address => bool) public councilGuardians;

    uint256 public proposalCount;

    event ProposalCreated(uint256 indexed id, string description, bool isStrategic);
    event Voted(uint256 indexed id, address voter, uint256 votesCast, uint256 cost, bool support);
    event Vetoed(uint256 indexed id, address guardian);
    event ProposalFinalized(uint256 indexed id, bool passed, uint256 unlockAt);
    event GovernanceFeeBurnActivated(uint256 indexed id, address indexed stateChannel, uint256 burnBpsOfTax);
    event VotingTokensReleased(uint256 indexed id, address indexed voter, uint256 amount);
    event VotingTokensBurned(uint256 indexed id, uint256 amount);
    event VotingTokenUnlockDelayUpdated(uint256 previousDelay, uint256 newDelay);

    constructor(address _governanceToken, address _weightOracle, address initialOwner) Ownable(initialOwner) {
        governanceToken = IERC20(_governanceToken);
        weightOracle = WeightOracle(_weightOracle);
    }

    function setGuardian(address guardian, bool status) external onlyOwner {
        councilGuardians[guardian] = status;
    }

    function createProposal(string memory description, bool isStrategic) public returns (uint256) {
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            executed: false,
            isStrategic: isStrategic,
            passed: false,
            feeBurnActivation: false,
            unlockAt: 0
        });
        emit ProposalCreated(id, description, isStrategic);
        return id;
    }

    /// @notice Creates a proposal that, when passed, activates fee burn on the state channel.
    /// @dev targetBurnBpsOfTax=50 corresponds to 0.5% of channel tax.
    function createFeeBurnActivationProposal(uint256 targetBurnBpsOfTax) external returns (uint256) {
        require(targetBurnBpsOfTax <= 10_000, "DAO: invalid bps");
        uint256 id = createProposal("Activate fee burn on state channel tax", true);
        proposals[id].feeBurnActivation = true;
        // Encode target in description for auditability without additional storage slots.
        proposals[id].description = string.concat("Activate fee burn BPS of tax: ", _toString(targetBurnBpsOfTax));
        return id;
    }

    // Assembly of Stewards Layer: Quadratic Voting with Truth Weighting (voting power = √(tokens) × truth_score)
    function vote(uint256 proposalId, uint256 votesToCast, bool support) external {
        require(!proposals[proposalId].executed, "DAO: Already executed");
        require(votesToCast > 0, "DAO: Must cast at least one vote");

        uint256 currentVotes = quadraticVotes[proposalId][msg.sender];
        uint256 newTotalVotes = currentVotes + votesToCast;

        uint256 totalCost = newTotalVotes * newTotalVotes;
        uint256 previousCost = currentVotes * currentVotes;
        uint256 costToPay = totalCost - previousCost;

        // Burn or lock the governance tokens used to pay the quadratic cost
        governanceToken.transferFrom(msg.sender, address(this), costToPay);

        uint256 truthScore = weightOracle.getWeight(msg.sender);
        uint256 effectiveVotes = votesToCast * truthScore;

        if (support) {
            proposals[proposalId].votesFor += effectiveVotes;
        } else {
            proposals[proposalId].votesAgainst += effectiveVotes;
        }

        quadraticVotes[proposalId][msg.sender] = newTotalVotes;
        lockedTokensByProposal[proposalId][msg.sender] += costToPay;
        proposalLockedTotals[proposalId] += costToPay;
        totalLockedVotingTokens += costToPay;
        emit Voted(proposalId, msg.sender, effectiveVotes, costToPay, support);
    }

    // Council of Guardians Layer: Multi-sig veto
    function vetoStrategic(uint256 proposalId) external {
        require(councilGuardians[msg.sender], "DAO: Not a Guardian");
        require(proposals[proposalId].isStrategic, "DAO: Not strategic");
        proposals[proposalId].executed = true; // immediately kill proposal
        emit Vetoed(proposalId, msg.sender);
    }

    /// @notice Finalizes a proposal and starts token unlock timer.
    function finalizeProposal(uint256 proposalId) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(!p.executed, "DAO: Already executed");
        p.executed = true;
        p.passed = p.votesFor > p.votesAgainst;
        p.unlockAt = block.timestamp + votingTokenUnlockDelay;
        emit ProposalFinalized(proposalId, p.passed, p.unlockAt);
    }

    /// @notice Governance action to activate 0.5% fee burn of channel tax.
    function activateFeeBurn(uint256 proposalId, address stateChannel) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(p.executed && p.passed, "DAO: Proposal not passed");
        require(p.feeBurnActivation, "DAO: Wrong proposal type");
        IStigmergicStateChannelGovernance(stateChannel).setFeeBurnBpsOfTax(50);
        emit GovernanceFeeBurnActivated(proposalId, stateChannel, 50);
    }

    /// @notice Releases a voter's locked tokens once a failed proposal unlocks.
    function releaseLockedVotingTokens(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.executed, "DAO: Proposal not finalized");
        require(!p.passed, "DAO: Passed proposals are not refundable");
        require(block.timestamp >= p.unlockAt, "DAO: Tokens still locked");

        uint256 amount = lockedTokensByProposal[proposalId][msg.sender];
        require(amount > 0, "DAO: Nothing to release");

        lockedTokensByProposal[proposalId][msg.sender] = 0;
        proposalLockedTotals[proposalId] -= amount;
        totalLockedVotingTokens -= amount;
        require(governanceToken.transfer(msg.sender, amount), "DAO: Release transfer failed");
        emit VotingTokensReleased(proposalId, msg.sender, amount);
    }

    /// @notice Burns locked voting tokens from a passed proposal after unlock delay.
    function burnLockedVotingTokens(uint256 proposalId, uint256 amount) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(p.executed && p.passed, "DAO: Passed proposal required");
        require(block.timestamp >= p.unlockAt, "DAO: Tokens still locked");
        require(amount > 0, "DAO: Invalid amount");
        require(proposalLockedTotals[proposalId] >= amount, "DAO: Exceeds proposal lock");

        proposalLockedTotals[proposalId] -= amount;
        totalLockedVotingTokens -= amount;

        // Burn in-contract if token supports burn(); otherwise move to dead address.
        (bool success, ) = address(governanceToken).call(abi.encodeWithSelector(IERC20Burnable.burn.selector, amount));
        if (!success) {
            require(governanceToken.transfer(address(0x000000000000000000000000000000000000dEaD), amount), "DAO: Dead transfer failed");
        }
        emit VotingTokensBurned(proposalId, amount);
    }

    function setVotingTokenUnlockDelay(uint256 newDelay) external onlyOwner {
        require(newDelay <= 90 days, "DAO: Delay too large");
        uint256 previous = votingTokenUnlockDelay;
        votingTokenUnlockDelay = newDelay;
        emit VotingTokenUnlockDelayUpdated(previous, newDelay);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
