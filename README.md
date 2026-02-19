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
TENDERLY_RPC_URL=http://127.0.0.1:8545
TENDERLY_CHAIN_ID=1337
DEPLOYER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

CHAINPROOF_RPC_URL=http://127.0.0.1:8545
CHAINPROOF_CHAIN_ID=1337
CHAINPROOF_CONTRACT_KEY=chainproof
CHAINPROOF_CONTRACT_VERSION=2.0.0
CHAINPROOF_REGISTRY_PATH=/config/contracts.json
CHAINPROOF_SIGNER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

Notes:

- `CHAINPROOF_REGISTRY_PATH=/config/contracts.json` is okay; deploy script auto-falls back to local `services/smart-contracts/config/contracts.json` when `/config` is not present.
- Use test keys only. Never use a real mainnet key.

### 2.2 Frontend `services/web/.env.local`

Copy from example:

```bash
cp services/web/.env.example services/web/.env.local
```

Set local values:

```env
NEXT_PUBLIC_CHAINPROOF_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAINPROOF_CHAIN_ID=1337
NEXT_PUBLIC_CHAINPROOF_CONTRACT_KEY=chainproof
```

## 3) Install dependencies

Install per service:

```bash
cd services/smart-contracts && npm install
cd ../web && npm install
cd ../..
```

## 4) Start local Hardhat node (Terminal A)

```bash
cd services/smart-contracts
npx hardhat node
```

Keep this terminal running.

The node starts at:

- RPC: `http://127.0.0.1:8545`
- Chain ID: `1337`

It will print funded accounts and private keys. Those are test-only keys for local use.

## 5) Deploy contract to local node (Terminal B)

Open a second terminal:

```bash
cd services/smart-contracts
npx hardhat run scripts/deploy.js --network localhost
```

Expected result:

- Shows deployed `ChainProof` address
- Updates `services/smart-contracts/config/contracts.json` under:
  - key `chainproof`
  - chain id `1337`

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

If preferred, run blockchain + dashboard with Docker:

```bash
docker compose up chain dashboard
```

- Hardhat RPC is exposed on `localhost:8545`
- Streamlit dashboard is exposed on `localhost:8501`

You still run the web app from `services/web` with `npm run dev`.