// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract ParallelCouncilSystem {

    struct CouncilPool {
        bytes32 poolId;
        bytes32 taskId;
        address[] members;  // Anonymized commitments
        bool isDigital;     // true = digital agents, false = humans
        uint256 consensusScore;
        bytes32 consensusHash;
        bytes32[] individualInsights;  // Preserved individual contributions
        bytes32[] dissentingOpinions;  // Minority views preserved
        uint256 completionTime;
        bool completed;
        uint256 historicalAccuracy;  // Pool's track record
    }

    struct Task {
        bytes32 taskId;
        string description;
        bytes32[] attachedDocuments;
        uint256 poolCount;  // Number of parallel pools
        bytes32[] poolIds;
        bytes32 finalConsensus;
        bool completed;
        uint256 submissionTime;
        uint256 completionTime;
    }

    mapping(bytes32 => Task) public tasks;
    mapping(bytes32 => CouncilPool) public pools;
    bytes32[] public taskHistory;

    event TaskCreated(bytes32 indexed taskId, uint256 poolCount);
    event PoolCompleted(bytes32 indexed poolId, bytes32 consensusHash);
    event TaskCompleted(bytes32 indexed taskId, bytes32 finalConsensus);
    event InsightPreserved(bytes32 indexed taskId, bytes32 insightHash);

    modifier onlyPoolMember(bytes32 _poolId) {
        // Simple verification for pool membership
        bool isMember = false;
        address[] memory members = pools[_poolId].members;
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == msg.sender) {
                isMember = true;
                break;
            }
        }
        require(isMember, "Not a pool member");
        _;
    }

    function createTask(
        string calldata _description,
        bytes32[] calldata _documents,
        uint256 _poolCount
    ) external returns (bytes32) {
        bytes32 taskId = keccak256(abi.encodePacked(_description, block.timestamp, msg.sender));

        tasks[taskId] = Task({
            taskId: taskId,
            description: _description,
            attachedDocuments: _documents,
            poolCount: _poolCount,
            poolIds: new bytes32[](_poolCount),
            finalConsensus: 0,
            completed: false,
            submissionTime: block.timestamp,
            completionTime: 0
        });

        // Create parallel pools
        for (uint256 i = 0; i < _poolCount; i++) {
            bytes32 poolId = createPool(taskId, i);
            tasks[taskId].poolIds[i] = poolId;
        }

        taskHistory.push(taskId);
        emit TaskCreated(taskId, _poolCount);

        return taskId;
    }

    function createPool(bytes32 _taskId, uint256 _poolIndex)
        internal
        returns (bytes32)
    {
        bytes32 poolId = keccak256(abi.encodePacked(_taskId, _poolIndex, block.timestamp));

        // Select pool members (anonymized, random)
        address[] memory members = selectPoolMembers(_poolIndex);

        // Determine if digital or human pool
        bool isDigital = (_poolIndex == tasks[_taskId].poolCount - 1);  // Last pool = digital

        pools[poolId] = CouncilPool({
            poolId: poolId,
            taskId: _taskId,
            members: members,
            isDigital: isDigital,
            consensusScore: 0,
            consensusHash: 0,
            individualInsights: new bytes32[](0),
            dissentingOpinions: new bytes32[](0),
            completionTime: 0,
            completed: false,
            historicalAccuracy: getPoolHistoricalAccuracy(poolId)
        });

        return poolId;
    }

    function submitPoolConsensus(
        bytes32 _poolId,
        bytes32 _consensusHash,
        bytes32[] calldata _individualInsights,
        bytes32[] calldata _dissentingOpinions
    ) external onlyPoolMember(_poolId) {
        CouncilPool storage pool = pools[_poolId];
        require(!pool.completed, "Pool already completed");

        pool.consensusHash = _consensusHash;
        pool.individualInsights = _individualInsights;
        pool.dissentingOpinions = _dissentingOpinions;
        pool.completionTime = block.timestamp;
        pool.completed = true;

        // Preserve individual insights on-chain
        for (uint256 i = 0; i < _individualInsights.length; i++) {
            emit InsightPreserved(pool.taskId, _individualInsights[i]);
        }

        emit PoolCompleted(_poolId, _consensusHash);

        // Check if all pools completed
        checkTaskCompletion(pool.taskId);
    }

    function checkTaskCompletion(bytes32 _taskId) internal {
        Task storage task = tasks[_taskId];
        uint256 completedPools = 0;

        for (uint256 i = 0; i < task.poolCount; i++) {
            if (pools[task.poolIds[i]].completed) {
                completedPools++;
            }
        }

        if (completedPools >= task.poolCount) {
            // Aggregate all pool results
            task.finalConsensus = aggregatePoolResults(_taskId);
            task.completed = true;
            task.completionTime = block.timestamp;

            emit TaskCompleted(_taskId, task.finalConsensus);
        }
    }

    function aggregatePoolResults(bytes32 _taskId)
        internal
        pure
        returns (bytes32)
    {
        // Aggregate consensus
        // Preserve outlier insights
        // Return final consensus hash

        // This would be implemented with actual aggregation logic
        return keccak256(abi.encodePacked("aggregated_consensus", _taskId));
    }

    function selectPoolMembers(uint256)
        internal
        view
        returns (address[] memory)
    {
        // VRF-based random selection from expert credential pool
        // Ensure anonymization
        // Maintain human/digital balance
        // This would be implemented with actual selection logic

        address[] memory members = new address[](5);
        members[0] = msg.sender; // Add msg.sender for easy testing purposes
        return members;
    }

    function getPoolHistoricalAccuracy(bytes32)
        internal
        pure
        returns (uint256)
    {
        // Query historical accuracy from past pool performances
        // This would be implemented with actual tracking

        return 75;  // Default 75% accuracy
    }
}