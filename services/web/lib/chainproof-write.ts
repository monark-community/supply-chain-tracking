'use client';

import { Contract } from 'ethers';
import { isAddress } from 'ethers';
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

export type InitiateBatchTransferInput = {
  lookup: string;
  to: string;
};

export type InitiateBatchTransferResult = {
  chainId: number;
  contractAddress: string;
  txHash: string;
  account: string;
  batchId: number;
  to: string;
};

export type ReceiveTransferredBatchInput = {
  lookup: string;
};

export type ReceiveTransferredBatchResult = {
  chainId: number;
  contractAddress: string;
  txHash: string;
  account: string;
  batchId: number;
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
  'function getBatchIdByTrackingCode(string trackingCode) view returns (uint256)',
  'function harvestBatch(string origin, string ipfsHash, uint256 quantity, string trackingCode) returns (uint256 newBatchId)',
  'function initiateTransfer(uint256 batchId, address to)',
  'function receiveBatch(uint256 batchId)',
  'event BatchHarvested(uint256 indexed id, address indexed creator, uint256 quantity, string trackingCode, uint256 timestamp)',
  'event BatchTransferInitiated(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp)',
  'event BatchReceived(uint256 indexed id, address indexed receiver, uint256 timestamp)',
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

function mapWriteError(
  error: unknown,
  options?: {
    roleNotAllowedMessage?: string;
  }
): Error {
  const message = error instanceof Error ? error.message : 'Transaction failed.';
  const lowered = message.toLowerCase();

  if (lowered.includes('user rejected') || lowered.includes('action_rejected') || lowered.includes('rejected')) {
    return new Error('Transaction was rejected.');
  }
  if (lowered.includes('role not allowed')) {
    return new Error(options?.roleNotAllowedMessage || 'Connected wallet role is not allowed for this action.');
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
  if (lowered.includes('batch does not exist') || lowered.includes('batch not found')) {
    return new Error('Batch not found.');
  }
  if (lowered.includes('invalid recipient')) {
    return new Error('Recipient wallet address is invalid.');
  }
  if (lowered.includes('recipient has no role')) {
    return new Error('Recipient has no assigned role on-chain.');
  }
  if (lowered.includes('cannot transfer to self')) {
    return new Error('Cannot transfer a batch to the same wallet.');
  }
  if (lowered.includes('sender role cannot transfer')) {
    return new Error('Current wallet role cannot initiate transfers.');
  }
  if (lowered.includes('invalid transfer route')) {
    return new Error('Transfer route is not allowed for sender and recipient roles.');
  }
  if (lowered.includes('only current handler can perform this action')) {
    return new Error('Only the current handler can transfer this batch.');
  }
  if (lowered.includes('no pending transfer for receiver')) {
    return new Error('No pending transfer exists for this batch and wallet.');
  }
  return new Error(message);
}

async function resolveBatchIdFromLookup(context: ChainproofWriteContext, lookup: string): Promise<number> {
  const trimmed = lookup.trim();
  if (!trimmed) {
    throw new Error('Enter a batch id or tracking code.');
  }

  if (/^\d+$/.test(trimmed)) {
    const batchId = Number(trimmed);
    if (Number.isFinite(batchId) && batchId > 0) {
      return batchId;
    }
  }

  const batchId = Number(await context.contract.getBatchIdByTrackingCode(trimmed));
  if (!batchId) {
    throw new Error('Batch not found.');
  }
  return batchId;
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
    throw mapWriteError(error, { roleNotAllowedMessage: 'Connected wallet is not assigned the Producer role.' });
  }
}

export async function initiateBatchTransfer(
  input: InitiateBatchTransferInput
): Promise<InitiateBatchTransferResult> {
  const recipient = input.to.trim();
  if (!isAddress(recipient)) {
    throw new Error('Recipient wallet address is invalid.');
  }

  try {
    const context = await createChainproofWriteContext();
    const batchId = await resolveBatchIdFromLookup(context, input.lookup);
    const tx = await context.contract.initiateTransfer(BigInt(batchId), recipient);
    await tx.wait();

    return {
      chainId: context.chainId,
      contractAddress: context.contractAddress,
      txHash: String(tx.hash),
      account: context.account,
      batchId,
      to: recipient,
    };
  } catch (error) {
    throw mapWriteError(error);
  }
}

export async function receiveTransferredBatch(
  input: ReceiveTransferredBatchInput
): Promise<ReceiveTransferredBatchResult> {
  try {
    const context = await createChainproofWriteContext();
    const batchId = await resolveBatchIdFromLookup(context, input.lookup);
    const tx = await context.contract.receiveBatch(BigInt(batchId));
    await tx.wait();

    return {
      chainId: context.chainId,
      contractAddress: context.contractAddress,
      txHash: String(tx.hash),
      account: context.account,
      batchId,
    };
  } catch (error) {
    throw mapWriteError(error);
  }
}
