# Smart Contracts Design Context

## Contract Overview
`ChainProof.sol` is the on-chain authority for role assignment, batch custody, and hardware-to-batch recognition. For the current product flow, the business actors that matter in documentation are the producer, warehouse, and transporter.

## Design Goals
- Keep custody and batch ownership state on-chain.
- Enforce actor permissions at the contract layer.
- Let the platform resolve a scanned hardware identifier back to the correct batch.
- Preserve a reliable transfer history between operational actors.

## Domain Model
- **Actors in scope**
  - **Producer** creates batches and can bind hardware to them.
  - **Warehouse** receives, stores, splits, and dispatches batches while it is the current handler.
  - **Transporter** receives batches for transit and transfers them onward.
- **Batch lifecycle**
  - A batch is either `Active` or `Consumed`.
- **Core batch fields**
  - identity: `id`, `trackingCode`
  - provenance: `origin`, `ipfsHash`
  - custody: `creator`, `currentHandler`, `pendingRecipients`
  - timing and weight: `weight`, `createdAt`, `updatedAt`

## Storage Layout
- `roles[address] -> Role`
- `batches[batchId] -> Batch`
- `pendingRecipients[batchId] -> address`
- `trackingCodeToBatch[keccak256(trackingCode)] -> batchId`
- `hardwareIdToBatch[keccak256(hardwareId)] -> batchId`
- `parentBatchIds[batchId] -> uint256[]`
- `childBatchIds[batchId] -> uint256[]`

## Permission Model
- **Contract owner**
  - Assigns roles with `assignRole(address, Role)`.
- **Test/demo helper**
  - `assignMyRole(Role)` allows self-assignment in non-production-style workflows.
- **Producer**
  - `harvestBatch`
  - `harvestBatchWithHardware`
  - `bindHardwareIdToBatch`
  - `initiateTransfer` when the producer is the current handler
- **Warehouse**
  - `receiveBatch`
  - `splitBatch` when the warehouse is the current handler
  - `initiateTransfer` when the warehouse is the current handler
- **Transporter**
  - `receiveBatch`
  - `initiateTransfer` when the transporter is the current handler

## Transfer Logic
- A transfer is always initiated by the current handler of the batch.
- The contract records the intended recipient in `pendingRecipients`.
- Custody changes only when the receiving address calls `receiveBatch`.
- Within the documented actor model, the common routes are:
  - producer -> warehouse
  - producer -> transporter
  - warehouse -> transporter
  - transporter -> warehouse
  - transporter -> transporter

## Critical Invariants
- **Batch existence**
  - A batch must exist before it can be updated.
- **Current-handler control**
  - Only the current handler can initiate transfer or perform custody-sensitive actions.
- **Weight conservation**
  - Warehouse splits must preserve total recorded weight across child batches.
- **Tracking uniqueness**
  - A tracking code can only be registered once.
- **Consumption safety**
  - Consumed batches cannot be reused as active inputs.

## Hardware Recognition Model
- The contract stores a hashed `hardwareId` as the lookup key.
- `getBatchIdByHardwareId` returns the batch currently associated with that hardware.
- Producers can bind or rebind hardware when a device is reused for a new production lifecycle.
- Hardware binding exists to support recognition from an IoT scan; it should be treated as platform functionality rather than a public traceability event.

## Public Lifecycle Surface
- The externally meaningful milestones for the platform are batch creation, transfer initiation, receipt, split, and consumption.
- Hardware association is used by the application to restore context from a scan, not as a public-facing milestone in the batch history.

## Integration Assumptions
- The contract address is resolved from `services/smart-contracts/config/contracts.json`.
- Frontend and contract clients use the same chain id and contract registry key.
- Off-chain scan authenticity is verified by the web layer before contract actions are taken.
