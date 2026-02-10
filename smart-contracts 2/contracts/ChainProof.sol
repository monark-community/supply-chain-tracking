// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChainProof {
    enum State { Harvested, Processed, Packed, Shipped, Received, Sold }

    struct Batch {
        uint256 id;
        address creator;
        string origin;
        string ipfsHash;
        State state;
        uint256 timestamp;
        address currentHandler;
    }

    mapping(uint256 => Batch) public batches;
    uint256 public batchCount;

    event BatchCreated(uint256 indexed id, address indexed creator, uint256 timestamp);

 
    event StateUpdated(uint256 indexed id, State newState, address indexed handler, uint256 timestamp); // Logs every state transition for a batch (who, what, and when).

    event BatchTransferred(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp); // Logs every batch transfer (from who, to who, and when).



    function harvestBatch(string memory _origin, string memory _ipfsHash) public {
        batchCount++;
        batches[batchCount] = Batch({
            id: batchCount,
            creator: msg.sender,
            origin: _origin,
            ipfsHash: _ipfsHash,
            state: State.Harvested,
            timestamp: block.timestamp,
            currentHandler: msg.sender
        });
        emit BatchCreated(batchCount, msg.sender, block.timestamp);
    }

    
    function updateBatchState(uint256 _id, State _newState) public {
        Batch storage batch = batches[_id]; // Get the batch from storage by ID

        require(batch.id != 0, "Batch does not exist"); // Make sure the batch was created

        require(
            uint256(_newState) > uint256(batch.state),
            "Invalid state transition"
        ); // So the state can only go forward, never backward 

        batch.state = _newState; // Updates the batch state
        batch.currentHandler = msg.sender; // Records who performed the action
        batch.timestamp = block.timestamp; // Records when the state was changedd

        emit StateUpdated(_id, _newState, msg.sender, block.timestamp); // Logs the state change on-chain
    }

    function transferBatch(uint256 _id, address _to) public {
        Batch storage batch = batches[_id]; // Get the batch from storage by ID

        require(batch.id != 0, "Batch does not exist"); // Make sure the batch was created
        require(msg.sender == batch.currentHandler, "Only current handler can transfer"); // Only the current handler can transfer the batch
        require(_to != address(0), "Invalid recipient"); // Prevents sending to a zero address
        require(_to != batch.currentHandler, "Already current handler"); // Prevents transferring to yourself

        address from = batch.currentHandler; // Stores the current handler before updating

        batch.currentHandler = _to; // Transfers responsibility to the new handler
        batch.timestamp = block.timestamp; // Records when the transfer happened

        emit BatchTransferred(_id, from, _to, block.timestamp); // Logs the transfer on-chain
    }


}