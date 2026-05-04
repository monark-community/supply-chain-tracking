'use client';

import { Contract } from 'ethers';
import { isAddress } from 'ethers';
import type { Provider, Signer } from 'ethers';
import { getActiveWalletSession } from './active-wallet-session';

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
  weight: number;
  ipfsHash?: string;
  hardwareId?: string;
};

export type HarvestProducerBatchResult = {
  chainId: number;
  contractAddress: string;
  txHash: string;
  newBatchId: number | null;
  account: string;
  ipfsHash: string;
  hardwareId: string | null;
};

export type InitiateBatchTransferByIdInput = {
  batchId: number;
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

export type ReceiveTransferredBatchByIdInput = {
  batchId: number;
};

export type ReceiveTransferredBatchResult = {
  chainId: number;
  contractAddress: string;
  txHash: string;
  account: string;
  batchId: number;
};

type ChainproofWriteContext = {
  provider: Provider;
  signer: Signer;
  contract: Contract;
  chainId: number;
  contractAddress: string;
  account: string;
};

const CHAINPROOF_WRITE_ABI = [
  'function roles(address) view returns (uint8)',
  'function harvestBatch(string origin, string ipfsHash, uint256 weight, string trackingCode) returns (uint256 newBatchId)',
  'function harvestBatchWithHardware(string origin, string ipfsHash, uint256 weight, string trackingCode, string hardwareId) returns (uint256 newBatchId)',
  'function bindHardwareIdToBatch(uint256 batchId, string hardwareId)',
  'function getBatchIdByHardwareId(string hardwareId) view returns (uint256)',
  'function initiateTransfer(uint256 batchId, address to)',
  'function receiveBatch(uint256 batchId)',
  'event BatchHarvested(uint256 indexed id, address indexed creator, uint256 weight, string trackingCode, uint256 timestamp)',
  'event BatchTransferInitiated(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp)',
  'event BatchReceived(uint256 indexed id, address indexed receiver, uint256 timestamp)',
] as const;

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '1337');
const defaultContractKey = process.env.NEXT_PUBLIC_CONTRACT_REGISTRY_KEY || 'chainproof';
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

function makeTempIpfsHash(seed: string) {
  const normalized = seed.trim().replace(/\s+/g, '-').slice(0, 64) || 'batch';
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
  if (lowered.includes('weight must be greater than zero')) {
    return new Error('Weight must be greater than zero.');
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

async function createChainproofWriteContext(
  contractKey: string = defaultContractKey
): Promise<ChainproofWriteContext> {
  const registry = await fetchRegistry();
  const session = getActiveWalletSession();

  if (!session) {
    throw new Error('No active wallet session. Connect a wallet first.');
  }

  const { provider, signer, address: account } = session;
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

  const contract = new Contract(contractAddress, CHAINPROOF_WRITE_ABI, signer);
  return { provider, signer, contract, chainId, contractAddress, account };
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
  const hardwareId = input.hardwareId?.trim() || '';
  const weight = Math.floor(input.weight);
  const ipfsHash = input.ipfsHash?.trim() || makeTempIpfsHash(hardwareId || origin);

  if (!origin) {
    throw new Error('Origin is required.');
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error('Weight must be greater than zero.');
  }

  try {
    const context = await createChainproofWriteContext();
    const role = Number(await context.contract.roles(context.account));
    if (role !== PRODUCER_ROLE) {
      throw new Error('Role not allowed');
    }

    // The deployed contract still requires a trackingCode argument; we pass an empty string,
    // which short-circuits in `_registerTrackingCode` so no tracking-code mapping is created.
    const tx = hardwareId
      ? await context.contract.harvestBatchWithHardware(origin, ipfsHash, BigInt(weight), '', hardwareId)
      : await context.contract.harvestBatch(origin, ipfsHash, BigInt(weight), '');
    const receipt = await tx.wait();
    const newBatchId = getHarvestedBatchId(context.contract, receipt);

    return {
      chainId: context.chainId,
      contractAddress: context.contractAddress,
      txHash: String(tx.hash),
      newBatchId,
      account: context.account,
      ipfsHash,
      hardwareId: hardwareId || null,
    };
  } catch (error) {
    throw mapWriteError(error, { roleNotAllowedMessage: 'Connected wallet is not assigned the Producer role.' });
  }
}

async function initiateBatchTransferByIdWithContext(
  context: ChainproofWriteContext,
  input: InitiateBatchTransferByIdInput
): Promise<InitiateBatchTransferResult> {
  const recipient = input.to.trim();
  if (!isAddress(recipient)) {
    throw new Error('Recipient wallet address is invalid.');
  }
  const batchId = Math.floor(input.batchId);
  if (!Number.isFinite(batchId) || batchId <= 0) {
    throw new Error('Batch id is invalid.');
  }

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
}

export async function initiateBatchTransferById(
  input: InitiateBatchTransferByIdInput
): Promise<InitiateBatchTransferResult> {
  try {
    const context = await createChainproofWriteContext();
    return initiateBatchTransferByIdWithContext(context, input);
  } catch (error) {
    throw mapWriteError(error);
  }
}

async function receiveTransferredBatchByIdWithContext(
  context: ChainproofWriteContext,
  input: ReceiveTransferredBatchByIdInput
): Promise<ReceiveTransferredBatchResult> {
  const batchId = Math.floor(input.batchId);
  if (!Number.isFinite(batchId) || batchId <= 0) {
    throw new Error('Batch id is invalid.');
  }
  const tx = await context.contract.receiveBatch(BigInt(batchId));
  await tx.wait();

  return {
    chainId: context.chainId,
    contractAddress: context.contractAddress,
    txHash: String(tx.hash),
    account: context.account,
    batchId,
  };
}

export async function receiveTransferredBatchById(
  input: ReceiveTransferredBatchByIdInput
): Promise<ReceiveTransferredBatchResult> {
  try {
    const context = await createChainproofWriteContext();
    return receiveTransferredBatchByIdWithContext(context, input);
  } catch (error) {
    throw mapWriteError(error);
  }
}
