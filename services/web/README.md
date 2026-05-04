## ChainProof Web

Next.js frontend for the ChainProof workflow with:

- Wallet-based auth (MetaMask + WalletConnect)
- Role-based UI routing by on-chain wallet role
- Native NFC deep-link flow (phone scanner -> signed URL -> action page)

## Environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_CHAIN_RPC_URL`: RPC endpoint for your local chain
- `NEXT_PUBLIC_CHAIN_ID`: local chain id (for example `1337`)
- `NEXT_PUBLIC_CONTRACT_REGISTRY_KEY`: registry key (default `chainproof`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: WalletConnect project id (required for mobile/iOS WalletConnect)
- `NFC_DEVICE_DEFAULT_SECRET`: server-side default secret used by `/api/nfc/verify` to verify signed NFC query payloads
- `NFC_DEVICE_KEYS_JSON`: optional server-side per-device secret map JSON

> Note: backend variables for Hardhat / deploy live in the repo-root `.env`, not here. Next.js only loads env files from this directory.

## Run Locally

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open from desktop at `http://localhost:3000`.

## Wallet Login With Local Chain

1. Start your local chain and deploy contracts.
2. Ensure the RPC is reachable from your laptop browser at `NEXT_PUBLIC_CHAIN_RPC_URL`.
3. Add that network to MetaMask using the same chain id as `NEXT_PUBLIC_CHAIN_ID`.
4. Import/fund one of your local dev accounts in MetaMask.
5. Open the app and connect wallet from the login page.

## iPhone/iPad (WalletConnect + MetaMask)

1. Expose your local RPC to phone-accessible HTTPS (via Cloudflare Tunnel).
2. Point `NEXT_PUBLIC_CHAIN_RPC_URL` to that public RPC URL.
3. Run the web app on a phone-reachable host (`npm run dev -- --hostname 0.0.0.0 --port 3000`).
4. Open the site on iOS Safari.
5. Tap wallet connect in login, choose WalletConnect, then approve in MetaMask app.
6. Return to Safari and continue role assignment / app actions.

## NFC Native Scan Flow

1. Tag contains a signed URI payload pointing to `/nfc` with fields:
   - v2 monotonic payload: `v`, `hardware_id`, `boot_id`, `nfc_seq`, `sample_seq`, `temp_max`, `humi_max`, `flag`, `sig`
   - v1 legacy payload (migration compatibility): `hardware_id`, `temp_max`, `humi_max`, `flag`, `ts`, `sig`
   - `batch_id` may appear only as a non-authoritative legacy hint
2. Phone-native scanner opens the URL directly (no WebNFC button in browser).
3. Web app posts payload to `/api/nfc/verify` for server-side signature + replay validation.
4. App resolves `hardware_id -> batch_id` from ChainProof contract mapping.
5. If not signed in, scan context is persisted through login/role assignment.
6. User lands on `/scanner` with action-ready context (harvest, transfer, receive).

## Notes

- Contract writes are signed by the currently connected wallet account.
- On-chain role checks still determine allowed actions.
- Hardware no longer stores an authoritative active batch on the tag.
- Producer harvest binds or re-binds `hardware_id` to the latest batch on-chain.
