## ChainProof Documentation

This directory contains architecture and design-context references for the project.

### Architecture Contexts
- [System Architecture](./system-architecture.md)
  - Academic-style architecture overview with layered responsibilities, trust boundaries, and system diagram.
- [End-to-End Sequence Diagram](./end-to-end-sequence-diagram.md)
  - Academic-style sequence diagram covering scan, verification, batch lookup, user action, wallet approval, and transaction.
- [Implementation Details](./implementation-details.md)
  - Academic-style implementation section covering smart contracts, web app, IoT firmware, NFC flow, wallet auth, and data flow.
- [Software Design Context](./software-design-context.md)
  - System scope, component responsibilities, runtime boundaries, and actor-focused workflows.
- [Smart Contracts Design Context](./smart-contracts-design-context.md)
  - `ChainProof.sol` custody model, actor permissions, hardware recognition, and core invariants.
- [Integration Context](./integration-context.md)
  - End-to-end Web ↔ IoT ↔ Contract flow from scan recognition to role-permitted actions.