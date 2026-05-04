# Supply Chain Tracking - Teammate Setup Guide

This README is the exact setup order for a new teammate to run the project locally with:

- Hardhat local blockchain
- Contract deployment
- Next.js web app
- Manual private-key sign in

## 0) Prerequisites

Install these before starting:

- Node.js 20+ (recommended: 20 LTS)
- npm 10+
- Git

Optional:

- Docker Desktop (only if you want to run `docker compose` flow)

## 1) Clone and enter repo

```bash
git clone <REPO_URL>
cd supply-chain-tracking
```

## 2) Create env files

There are 2 required env files:

- root `.env` (used by Hardhat/deploy/scripts)
- `services/web/.env.local` (used by Next.js frontend)

### 2.1 Root `.env`

Copy from example:

```bash
cp .env.example .env
```

Set local values:

```env
# --- Tenderly Virtual TestNet (only needed for `npm run deploy:tenderly`) ---
TENDERLY_RPC_URL=http://127.0.0.1:8545
TENDERLY_CHAIN_ID=1337
TENDERLY_DEPLOYER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# --- ChainProof contract registry (deploy script) ---
CONTRACT_REGISTRY_KEY=chainproof
CONTRACT_REGISTRY_PATH=/config/contracts.json
CONTRACT_VERSION=2.0.0
```

Notes:

- `CONTRACT_REGISTRY_PATH=/config/contracts.json` is okay; deploy script auto-falls back to local `services/smart-contracts/config/contracts.json` when `/config` is not present.
- Use test keys only. Never use a real mainnet key.

### 2.2 Frontend `services/web/.env.local`

Copy from example:

```bash
cp services/web/.env.example services/web/.env.local
```

Set local values:

```env
NEXT_PUBLIC_CHAIN_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=1337
NEXT_PUBLIC_CONTRACT_REGISTRY_KEY=chainproof
```

## 3) Install dependencies

Install per service:

```bash
cd services/smart-contracts && npm install
cd ../web && npm install
cd ../..
```

## 4) Choose your chain target

You can deploy either to:

- local Hardhat node (fast local dev)
- Tenderly Virtual TestNet (shared persistent testnet)

### 4A) Local Hardhat node (Terminal A)

```bash
cd services/smart-contracts
npx hardhat node
```

Keep this terminal running.

The node starts at:

- RPC: `http://127.0.0.1:8545`
- Chain ID: `1337`

It will print funded accounts and private keys. Those are test-only keys for local use.

### 4B) Tenderly Virtual TestNet

Set these in root `.env`:

```env
TENDERLY_RPC_URL=https://virtual.mainnet.rpc.tenderly.co/<project>/<testnet>
TENDERLY_CHAIN_ID=<your_virtual_chain_id>
TENDERLY_DEPLOYER_PRIVATE_KEY=0x<test_private_key>
```

Then deploy:

```bash
cd services/smart-contracts
npm run deploy:tenderly
```

## 5) Deploy contract (Terminal B)

Open a second terminal:

Local:

```bash
cd services/smart-contracts
npm run deploy:local
```

Tenderly Virtual TestNet:

```bash
cd services/smart-contracts
npm run deploy:tenderly
```

Expected result:

- Shows deployed `ChainProof` address
- Updates `services/smart-contracts/config/contracts.json` under:
  - key `chainproof`
  - deployed chain id (for local usually `1337`; for Tenderly use your virtual chain id)

## 6) Start web app (Terminal C)

Open a third terminal:

```bash
cd services/web
npm run dev
```

Open:

- `http://localhost:3000`

## 7) Sign in on web app

1. Go to login page.
2. Paste one private key from Hardhat node output (for example Account #1).
3. Click **Sign In**.
4. If role is `none`, assign role on-chain from the UI.

## 8) Quick verification checklist

- Chain display in UI shows `1337`
- No `Wrong RPC network` error
- No `No contract code found at ... on chain 1337` error
- Role assignment succeeds
- Producer dashboard actions (for producer role) submit transactions

## 9) Common issues and fixes

### Issue: `No contract code found at ... on chain 1337`

Cause: Hardhat node restarted, but contract was not redeployed.

Fix:

1. Ensure `npx hardhat node` is running.
2. Re-run deploy:
   ```bash
   cd services/smart-contracts
   npx hardhat run scripts/deploy.js --network localhost
   ```
3. Refresh web page (restart `npm run dev` if needed).

### Issue: Wrong chain/network mismatch

Cause: `.env` and `.env.local` chain/RPC do not match.

Fix: Both must point to same chain/RPC pair (`127.0.0.1:8545` + `1337` for local).

### Issue: Role assignment reverts

Most common causes:

- You are pointed at wrong contract address for current chain.
- Contract for that chain is old or missing expected function.
- You restarted local node and forgot redeploy.

## 10) Day-2 workflow (regular dev loop)

Every time you restart local blockchain:

1. Start `npx hardhat node`
2. Re-deploy contract (`scripts/deploy.js --network localhost`)
3. Run web app (`npm run dev`)

## Optional: Docker compose flow

If preferred, run the local Hardhat blockchain with Docker:

```bash
docker compose up
```

- Hardhat RPC is exposed on `localhost:8545`

You still run the web app from `services/web` with `npm run dev`.