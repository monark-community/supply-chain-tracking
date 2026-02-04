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
}