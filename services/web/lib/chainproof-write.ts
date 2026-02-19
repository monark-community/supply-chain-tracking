'use client';

import { Contract } from 'ethers';
import type { JsonRpcProvider, Wallet } from 'ethers';
import { restoreManualWalletSession } from './manual-wallet';

type RegistryEntry = {
  chainId: number;
  address: string;
};

type RegistryShape = Record<string, Record<string, RegistryEntry>>;

type BatchHarvestedArgs = {
  id?: bigint;
};

export type HarvestProducerBatchInput = {
  origin: string;
  quantity: number;
  trackingCode: string;
  ipfsHash?: string;
};

export type HarvestProducerBatchResult = {
  chainId: number;
  contractAddress: string;
  txHash: string;
  newBatchId: number | null;
  account: string;
  ipfsHash: string;
};

type ChainproofWriteContext = {
  provider: JsonRpcProvider;
  wallet: Wallet;
  contract: Contract;
  chainId: number;
  contractAddress: string;
  account: string;
};

const CHAINPROOF_WRITE_ABI = [
  'function roles(address) view returns (uint8)',
  'function harvestBatch(string origin, string ipfsHash, uint256 quantity, string trackingCode) returns (uint256 newBatchId)',
  'event BatchHarvested(uint256 indexed id, address indexed creator, uint256 quantity, string trackingCode, uint256 timestamp)',
] as const;

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAINPROOF_CHAIN_ID || '1337');
const defaultContractKey = process.env.NEXT_PUBLIC_CHAINPROOF_CONTRACT_KEY || 'chainproof';
const PRODUCER_ROLE = 1;

async function fetchRegistry(): Promise<RegistryShape> {
  const response = await fetch('/api/blockchain/registry', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Could not load on-chain contract registry.');
  }
  return response.json();
}

function resolveAddressFromRegistry(registry: RegistryShape, contractKey: string, chainId: number) {
  const byKey = registry[contractKey] || {};
  const entry = byKey[String(chainId)];
  return entry?.address || '';
}

function makeTempIpfsHash(trackingCode: string) {
  const normalized = trackingCode.trim().replace(/\s+/g, '-').slice(0, 64) || 'batch';
  return `temp://harvest/${normalized}/${Date.now()}`;
}

function mapWriteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Transaction failed.';
  const lowered = message.toLowerCase();

  if (lowered.includes('user rejected') || lowered.includes('action_rejected') || lowered.includes('rejected')) {
    return new Error('Transaction was rejected.');
  }
  if (lowered.includes('role not allowed')) {
    return new Error('Connected wallet is not assigned the Producer role.');
  }
  if (lowered.includes('tracking code already used')) {
    return new Error('Tracking code is already used. Choose a unique code.');
  }
  if (lowered.includes('quantity must be greater than zero')) {
    return new Error('Quantity must be greater than zero.');
  }
  if (lowered.includes('insufficient funds')) {
    return new Error('Wallet has insufficient funds for gas.');
  }
  return new Error(message);
}

async function createChainproofWriteContext(
  contractKey: string = defaultContractKey
): Promise<ChainproofWriteContext> {
  const [registry, session] = await Promise.all([fetchRegistry(), restoreManualWalletSession()]);
  if (!session) {
    throw new Error('No active manual wallet session. Sign in with a private key first.');
  }
  const { provider, wallet, address: account } = session;
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  if (Number.isFinite(configuredChainId) && configuredChainId > 0 && chainId !== configuredChainId) {
    throw new Error(`Wrong RPC network. Configure chain ${configuredChainId} and retry.`);
  }

  const contractAddress = resolveAddressFromRegistry(registry, contractKey, chainId);
  if (!contractAddress) {
    throw new Error(`No contract registry entry found for key "${contractKey}" on chain ${chainId}.`);
  }

  const code = await provider.getCode(contractAddress);
  if (!code || code === '0x') {
    throw new Error(`No contract code found at ${contractAddress} on chain ${chainId}.`);
  }

  const contract = new Contract(contractAddress, CHAINPROOF_WRITE_ABI, wallet);
  return { provider, wallet, contract, chainId, contractAddress, account };
}

function getHarvestedBatchId(contract: Contract, receipt: { logs?: Array<{ data: string; topics: string[] }> } | null) {
  const logs = receipt?.logs || [];
  for (const log of logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'BatchHarvested') {
        const args = parsed.args as BatchHarvestedArgs;
        return typeof args.id === 'bigint' ? Number(args.id) : null;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function harvestProducerBatch(input: HarvestProducerBatchInput): Promise<HarvestProducerBatchResult> {
  const origin = input.origin.trim();
  const trackingCode = input.trackingCode.trim();
  const quantity = Math.floor(input.quantity);
  const ipfsHash = input.ipfsHash?.trim() || makeTempIpfsHash(trackingCode);

  if (!origin) {
    throw new Error('Origin is required.');
  }
  if (!trackingCode) {
    throw new Error('Tracking code is required.');
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  try {
    const context = await createChainproofWriteContext();
    const role = Number(await context.contract.roles(context.account));
    if (role !== PRODUCER_ROLE) {
      throw new Error('Role not allowed');
    }

    const tx = await context.contract.harvestBatch(origin, ipfsHash, BigInt(quantity), trackingCode);
    const receipt = await tx.wait();
    const newBatchId = getHarvestedBatchId(context.contract, receipt);

    return {
      chainId: context.chainId,
      contractAddress: context.contractAddress,
      txHash: String(tx.hash),
      newBatchId,
      account: context.account,
      ipfsHash,
    };
  } catch (error) {
    throw mapWriteError(error);
  }
}
