# Software Design Context

## Purpose
ChainProof links a scanned physical tag, a wallet-authenticated operator, and the on-chain batch record that represents custody of goods. The software is designed so the platform can recognize a batch from IoT hardware, route the user into the correct workflow, and only expose actions that match that actor's role.

## System Scope
- **In scope**
  - NFC deep-link ingestion through the deployed web application.
  - Wallet-based authentication and role-aware application routing.
  - Batch creation, receipt, transfer, and hardware recognition.
  - On-chain enforcement of custody and actor permissions.
- **Out of scope**
  - Identity systems beyond wallet ownership.
  - ERP, analytics, or third-party business integrations.
  - Physical anti-tamper guarantees for the hardware itself.

## Main Components
- **IoT firmware (`services/iot/blink`)**
  - Writes a signed NFC payload that includes the `hardware_id` and scan context.
  - Gives the platform enough data to recognize which batch the device is attached to.
- **Web application (`services/web`)**
  - Receives the scan on the public site, verifies the payload, and resolves the batch.
  - Orchestrates wallet session state, role-aware routing, and transaction initiation.
- **Smart contracts (`services/smart-contracts`)**
  - Store the authoritative batch record, current handler, pending recipient, and role assignments.
  - Enforce which actor can create, receive, or transfer custody.

## Runtime Boundaries
- **Client**
  - Handles wallet UX, page routing, and action submission.
  - Shows only the actions available to the connected role.
- **Server**
  - Verifies NFC authenticity and replay constraints.
  - Reads contract state needed to restore batch context from the scan.
- **Contract**
  - Holds the canonical supply-chain record.
  - Enforces role permissions and custody transitions.

## Actor Model
- **Producer**
  - Creates a new batch on-chain.
  - Optionally binds the batch to a hardware identifier so later scans can resolve it immediately.
  - Transfers the batch to the next actor once production custody is complete.
- **Warehouse**
  - Receives custody of incoming batches.
  - Holds and dispatches inventory while recorded as current handler.
  - Can split a batch into smaller operational units when warehouse handling requires it.
- **Transporter**
  - Receives a batch for in-transit custody.
  - Transfers the batch onward to the next approved actor.
  - Acts as the custody bridge between production and storage/distribution steps.

## Core Flows
- **Scan to context**
  - An NFC scan opens the deployed web app with signed parameters.
  - The backend verifies the payload and resolves `hardware_id -> batch_id`.
  - The app restores the batch context before the user takes any action.
- **Authentication to role**
  - The user connects a wallet.
  - The platform reads the on-chain role for that address.
  - The interface is tailored to the actor's allowed workflow.
- **Action to state update**
  - The user submits a transaction from the web app.
  - The contract validates both the role and current custody state.
  - The UI refreshes from chain state after confirmation.

## State Management Strategy
- **On-chain state**
  - Roles, batches, current handlers, pending recipients, and hardware-to-batch mapping.
- **Server-side runtime state**
  - Replay protection data and scan verification artifacts.
- **Client transient state**
  - Scan context preserved across authentication and page transitions.

## Deployment Assumptions
- The public web application and the smart contract configuration point to the same deployed chain environment.
- Mobile users may still switch between the browser and wallet app during signing, but the website itself is reached through its deployed domain.
