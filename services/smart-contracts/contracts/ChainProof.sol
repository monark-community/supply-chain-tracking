// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ChainProof {
    enum Role {
        None,
        Producer,
        Processor,
        Warehouse,
        Transporter,
        Customer
    }

    enum BatchStatus {
        Active,
        Consumed
    }

    struct Batch {
        uint256 id;
        address creator;
        string origin;
        string ipfsHash;
        uint256 quantity;
        string trackingCode;
        BatchStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        address currentHandler;
    }

    address public owner;
    uint256 public batchCount;

    mapping(address => Role) public roles;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => address) public pendingRecipients;
    mapping(bytes32 => uint256) private trackingCodeToBatch;
    mapping(uint256 => uint256[]) private parentBatchIds;
    mapping(uint256 => uint256[]) private childBatchIds;

    event RoleAssigned(
        address indexed account,
        Role indexed role,
        address indexed assignedBy,
        uint256 timestamp
    );
    event BatchHarvested(
        uint256 indexed id,
        address indexed creator,
        uint256 quantity,
        string trackingCode,
        uint256 timestamp
    );
    event BatchSplit(
        uint256 indexed parentId,
        uint256[] childIds,
        address indexed handler,
        uint256 timestamp
    );
    event BatchTransformed(
        uint256[] inputBatchIds,
        uint256 indexed outputBatchId,
        string processType,
        address indexed handler,
        uint256 timestamp
    );
    event BatchMerged(
        uint256[] inputBatchIds,
        uint256 indexed outputBatchId,
        address indexed handler,
        uint256 timestamp
    );
    event BatchTransferInitiated(
        uint256 indexed id,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );
    event BatchReceived(
        uint256 indexed id,
        address indexed receiver,
        uint256 timestamp
    );
    event BatchConsumed(uint256 indexed id, address indexed handler, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRole(Role requiredRole) {
        require(roles[msg.sender] == requiredRole, "Role not allowed");
        _;
    }

    modifier onlyRolePair(Role roleA, Role roleB) {
        Role senderRole = roles[msg.sender];
        require(senderRole == roleA || senderRole == roleB, "Role not allowed");
        _;
    }

    modifier onlyExistingBatch(uint256 batchId) {
        require(batches[batchId].id != 0, "Batch does not exist");
        _;
    }

    modifier onlyCurrentHandler(uint256 batchId) {
        require(
            batches[batchId].currentHandler == msg.sender,
            "Only current handler can perform this action"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function assignRole(address account, Role role) external onlyOwner {
        require(account != address(0), "Invalid address");
        roles[account] = role;
        emit RoleAssigned(account, role, msg.sender, block.timestamp);
    }

    // Test-mode helper: allow connected wallet to self-assign role.
    function assignMyRole(Role role) external {
        roles[msg.sender] = role;
        emit RoleAssigned(msg.sender, role, msg.sender, block.timestamp);
    }

    function harvestBatch(
        string calldata origin,
        string calldata ipfsHash,
        uint256 quantity,
        string calldata trackingCode
    ) external onlyRole(Role.Producer) returns (uint256 newBatchId) {
        require(quantity > 0, "Quantity must be greater than zero");
        newBatchId = _createBatch(
            msg.sender,
            origin,
            ipfsHash,
            quantity,
            trackingCode
        );
        emit BatchHarvested(
            newBatchId,
            msg.sender,
            quantity,
            trackingCode,
            block.timestamp
        );
    }

    function splitBatch(
        uint256 parentId,
        uint256[] calldata childQuantities,
        string[] calldata childIpfsHashes,
        string[] calldata childTrackingCodes
    )
        external
        onlyRolePair(Role.Processor, Role.Warehouse)
        onlyExistingBatch(parentId)
        onlyCurrentHandler(parentId)
        returns (uint256[] memory newChildIds)
    {
        require(
            childQuantities.length > 1,
            "Split must create at least two child batches"
        );
        require(
            childQuantities.length == childIpfsHashes.length &&
                childIpfsHashes.length == childTrackingCodes.length,
            "Input lengths mismatch"
        );
        require(
            batches[parentId].status == BatchStatus.Active,
            "Parent batch already consumed"
        );

        uint256 totalChildQuantity = 0;
        uint256 index = 0;
        while (index < childQuantities.length) {
            require(
                childQuantities[index] > 0,
                "Child quantity must be greater than zero"
            );
            totalChildQuantity += childQuantities[index];
            index++;
        }

        Batch storage parentBatch = batches[parentId];
        require(
            totalChildQuantity == parentBatch.quantity,
            "Split quantities must match parent quantity"
        );

        newChildIds = new uint256[](childQuantities.length);
        index = 0;
        while (index < childQuantities.length) {
            uint256 childId = _createBatch(
                msg.sender,
                parentBatch.origin,
                childIpfsHashes[index],
                childQuantities[index],
                childTrackingCodes[index]
            );
            parentBatchIds[childId].push(parentId);
            childBatchIds[parentId].push(childId);
            newChildIds[index] = childId;
            index++;
        }

        _consumeBatch(parentId);
        emit BatchSplit(parentId, newChildIds, msg.sender, block.timestamp);
    }

    function transformBatches(
        uint256[] calldata inputBatchIds,
        string calldata outputOrigin,
        string calldata outputIpfsHash,
        uint256 outputQuantity,
        string calldata outputTrackingCode,
        string calldata processType
    )
        external
        onlyRole(Role.Processor)
        returns (uint256 outputBatchId)
    {
        outputBatchId = _deriveBatchFromInputs(
            inputBatchIds,
            outputOrigin,
            outputIpfsHash,
            outputQuantity,
            outputTrackingCode
        );

        emit BatchTransformed(
            inputBatchIds,
            outputBatchId,
            processType,
            msg.sender,
            block.timestamp
        );
    }

    function mergeBatches(
        uint256[] calldata inputBatchIds,
        string calldata outputOrigin,
        string calldata outputIpfsHash,
        uint256 outputQuantity,
        string calldata outputTrackingCode
    )
        external
        onlyRolePair(Role.Processor, Role.Warehouse)
        returns (uint256 outputBatchId)
    {
        require(inputBatchIds.length > 1, "Merge needs at least two inputs");
        outputBatchId = _deriveBatchFromInputs(
            inputBatchIds,
            outputOrigin,
            outputIpfsHash,
            outputQuantity,
            outputTrackingCode
        );

        emit BatchMerged(inputBatchIds, outputBatchId, msg.sender, block.timestamp);
    }

    function initiateTransfer(
        uint256 batchId,
        address to
    )
        external
        onlyExistingBatch(batchId)
        onlyCurrentHandler(batchId)
    {
        require(
            roles[msg.sender] != Role.None && roles[msg.sender] != Role.Customer,
            "Sender role cannot transfer"
        );
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot transfer to self");
        require(roles[to] != Role.None, "Recipient has no role");
        require(
            _isValidTransfer(roles[msg.sender], roles[to]),
            "Invalid transfer route"
        );

        pendingRecipients[batchId] = to;
        emit BatchTransferInitiated(batchId, msg.sender, to, block.timestamp);
    }

    function receiveBatch(
        uint256 batchId
    ) external onlyExistingBatch(batchId) {
        require(
            pendingRecipients[batchId] == msg.sender,
            "No pending transfer for receiver"
        );
        require(roles[msg.sender] != Role.None, "Receiver has no role");

        batches[batchId].currentHandler = msg.sender;
        batches[batchId].updatedAt = block.timestamp;
        pendingRecipients[batchId] = address(0);

        emit BatchReceived(batchId, msg.sender, block.timestamp);
    }

    function getParentBatches(
        uint256 batchId
    ) external view returns (uint256[] memory) {
        return parentBatchIds[batchId];
    }

    function getChildBatches(
        uint256 batchId
    ) external view returns (uint256[] memory) {
        return childBatchIds[batchId];
    }

    function getBatchIdByTrackingCode(
        string calldata trackingCode
    ) external view returns (uint256) {
        return trackingCodeToBatch[keccak256(bytes(trackingCode))];
    }

    function _deriveBatchFromInputs(
        uint256[] calldata inputBatchIds,
        string calldata outputOrigin,
        string calldata outputIpfsHash,
        uint256 outputQuantity,
        string calldata outputTrackingCode
    ) internal returns (uint256 outputBatchId) {
        require(
            inputBatchIds.length > 0,
            "At least one input batch is required"
        );
        require(outputQuantity > 0, "Output quantity must be greater than zero");

        uint256 totalInputQuantity = 0;
        uint256 index = 0;
        while (index < inputBatchIds.length) {
            uint256 inputId = inputBatchIds[index];
            require(batches[inputId].id != 0, "Input batch does not exist");
            require(
                batches[inputId].status == BatchStatus.Active,
                "Input batch already consumed"
            );
            require(
                batches[inputId].currentHandler == msg.sender,
                "Only current handler can process input batch"
            );
            totalInputQuantity += batches[inputId].quantity;
            index++;
        }
        require(
            totalInputQuantity == outputQuantity,
            "Output quantity must match total input quantity"
        );

        outputBatchId = _createBatch(
            msg.sender,
            outputOrigin,
            outputIpfsHash,
            outputQuantity,
            outputTrackingCode
        );

        index = 0;
        while (index < inputBatchIds.length) {
            uint256 parentId = inputBatchIds[index];
            parentBatchIds[outputBatchId].push(parentId);
            childBatchIds[parentId].push(outputBatchId);
            _consumeBatch(parentId);
            index++;
        }
    }

    function _createBatch(
        address creator,
        string memory origin,
        string memory ipfsHash,
        uint256 quantity,
        string memory trackingCode
    ) internal returns (uint256 newBatchId) {
        batchCount++;
        newBatchId = batchCount;

        batches[newBatchId] = Batch({
            id: newBatchId,
            creator: creator,
            origin: origin,
            ipfsHash: ipfsHash,
            quantity: quantity,
            trackingCode: trackingCode,
            status: BatchStatus.Active,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            currentHandler: creator
        });

        _registerTrackingCode(newBatchId, trackingCode);
    }

    function _consumeBatch(uint256 batchId) internal {
        batches[batchId].status = BatchStatus.Consumed;
        batches[batchId].updatedAt = block.timestamp;
        emit BatchConsumed(batchId, msg.sender, block.timestamp);
    }

    function _registerTrackingCode(uint256 batchId, string memory trackingCode) internal {
        if (bytes(trackingCode).length == 0) {
            return;
        }

        bytes32 trackingHash = keccak256(bytes(trackingCode));
        require(trackingCodeToBatch[trackingHash] == 0, "Tracking code already used");
        trackingCodeToBatch[trackingHash] = batchId;
    }

    function _isValidTransfer(
        Role fromRole,
        Role toRole
    ) internal pure returns (bool) {
        if (fromRole == Role.Producer) {
            return toRole == Role.Transporter || toRole == Role.Warehouse || toRole == Role.Processor;
        }
        if (fromRole == Role.Processor) {
            return toRole == Role.Transporter || toRole == Role.Warehouse;
        }
        if (fromRole == Role.Warehouse) {
            return toRole == Role.Transporter || toRole == Role.Processor;
        }
        if (fromRole == Role.Transporter) {
            return
                toRole == Role.Processor ||
                toRole == Role.Warehouse ||
                toRole == Role.Transporter ||
                toRole == Role.Customer;
        }
        return false;
    }
}