// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ZoverionsDAO is Ownable {
    IERC20 public governanceToken;

    struct Proposal {
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        bool executed;
        bool isStrategic;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => uint256)) public quadraticVotes; // Mapping proposalId => voter => cast votes (sqrt)
    mapping(address => bool) public councilGuardians;

    uint256 public proposalCount;

    event ProposalCreated(uint256 indexed id, string description, bool isStrategic);
    event Voted(uint256 indexed id, address voter, uint256 votesCast, uint256 cost, bool support);
    event Vetoed(uint256 indexed id, address guardian);

    constructor(address _governanceToken, address initialOwner) Ownable(initialOwner) {
        governanceToken = IERC20(_governanceToken);
    }

    function setGuardian(address guardian, bool status) external onlyOwner {
        councilGuardians[guardian] = status;
    }

    function createProposal(string calldata description, bool isStrategic) external returns (uint256) {
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            executed: false,
            isStrategic: isStrategic
        });
        emit ProposalCreated(id, description, isStrategic);
        return id;
    }

    // Assembly of Stewards Layer: Quadratic Voting (cost = votes^2)
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

        if (support) {
            proposals[proposalId].votesFor += votesToCast;
        } else {
            proposals[proposalId].votesAgainst += votesToCast;
        }

        quadraticVotes[proposalId][msg.sender] = newTotalVotes;
        emit Voted(proposalId, msg.sender, votesToCast, costToPay, support);
    }

    // Council of Guardians Layer: Multi-sig veto
    function vetoStrategic(uint256 proposalId) external {
        require(councilGuardians[msg.sender], "DAO: Not a Guardian");
        require(proposals[proposalId].isStrategic, "DAO: Not strategic");
        proposals[proposalId].executed = true; // immediately kill proposal
        emit Vetoed(proposalId, msg.sender);
    }
}
