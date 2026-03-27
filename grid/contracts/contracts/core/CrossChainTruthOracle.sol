// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../ZkMLCrossChainVerifier.sol";

interface ITruthDerivative {
    function resolveClaim(bytes32 claimId, bool result) external;
}

contract CrossChainTruthOracle is Ownable {
    ZkMLCrossChainVerifier public zkMLVerifier;
    ITruthDerivative public truthDerivativeMarket;

    // Mapping of authorized chains/oracles (e.g., LayerZero endpoints or other message bridging endpoints)
    mapping(uint256 => mapping(address => bool)) public authorizedCrossChainOracles;

    // claimId => verdict
    mapping(bytes32 => bool) public claimVerdicts;
    mapping(bytes32 => bool) public isClaimResolved;

    event TruthAttested(bytes32 indexed claimId, bool verdict, uint256 chainId, address source);
    event OracleAuthorized(uint256 chainId, address oracle, bool status);

    constructor(address _zkMLVerifier, address _truthDerivativeMarket) Ownable(msg.sender) {
        zkMLVerifier = ZkMLCrossChainVerifier(_zkMLVerifier);
        truthDerivativeMarket = ITruthDerivative(_truthDerivativeMarket);
    }

    function setZkMLVerifier(address _zkMLVerifier) external onlyOwner {
        zkMLVerifier = ZkMLCrossChainVerifier(_zkMLVerifier);
    }

    function setTruthDerivativeMarket(address _market) external onlyOwner {
        truthDerivativeMarket = ITruthDerivative(_market);
    }

    function authorizeCrossChainOracle(uint256 chainId, address oracle, bool status) external onlyOwner {
        authorizedCrossChainOracles[chainId][oracle] = status;
        emit OracleAuthorized(chainId, oracle, status);
    }

    // Direct Attestation (e.g., within same chain or verified by internal zkML logic)
    function attestTruthLocally(bytes32 claimId, bytes calldata zkProof, bool verdict) external {
        require(!isClaimResolved[claimId], "Claim already resolved");

        // Securely bind the verdict to the claimId to prevent front-running/manipulation
        // The zkML proof must validate this exact combined identifier
        bytes32 boundContext = keccak256(abi.encode(claimId, verdict));

        // Verify the zkML proof representing the truth validation
        zkMLVerifier.verifyZkML(zkProof, boundContext, block.chainid);

        isClaimResolved[claimId] = true;
        claimVerdicts[claimId] = verdict;

        emit TruthAttested(claimId, verdict, block.chainid, msg.sender);

        if (address(truthDerivativeMarket) != address(0)) {
            truthDerivativeMarket.resolveClaim(claimId, verdict);
        }
    }

    // Cross-Chain Attestation (e.g., payload received from Wormhole or LayerZero)
    function attestTruthCrossChain(bytes32 claimId, uint256 sourceChainId, address sourceOracle, bool verdict) external {
        require(authorizedCrossChainOracles[sourceChainId][sourceOracle], "Unauthorized cross-chain oracle");
        require(msg.sender == sourceOracle || authorizedCrossChainOracles[sourceChainId][msg.sender], "Unauthorized caller");
        require(!isClaimResolved[claimId], "Claim already resolved");

        isClaimResolved[claimId] = true;
        claimVerdicts[claimId] = verdict;

        emit TruthAttested(claimId, verdict, sourceChainId, sourceOracle);

        if (address(truthDerivativeMarket) != address(0)) {
            truthDerivativeMarket.resolveClaim(claimId, verdict);
        }
    }
}
