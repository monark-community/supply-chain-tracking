'use client';

import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';
import type { Eip1193Provider } from 'ethers';

export const ROLE_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Producer',
  2: 'Processor',
  3: 'Warehouse',
  4: 'Transporter',
  5: 'Customer',
};

const CHAINPROOF_READ_ABI = [
  'function owner() view returns (address)',
  'function batchCount() view returns (uint256)',
  'function roles(address) view returns (uint8)',
  'function batches(uint256) view returns (uint256 id, address creator, string origin, string ipfsHash, uint256 quantity, string trackingCode, uint8 status, uint256 createdAt, uint256 updatedAt, address currentHandler)',
  'function getBatchIdByTrackingCode(string trackingCode) view returns (uint256)',
  'function getParentBatches(uint256 batchId) view returns (uint256[])',
  'function getChildBatches(uint256 batchId) view returns (uint256[])',
  'event BatchHarvested(uint256 indexed id, address indexed creator, uint256 quantity, string trackingCode, uint256 timestamp)',
  'event BatchSplit(uint256 indexed parentId, uint256[] childIds, address indexed handler, uint256 timestamp)',
  'event BatchMerged(uint256[] inputBatchIds, uint256 indexed outputBatchId, address indexed handler, uint256 timestamp)',
  'event BatchTransformed(uint256[] inputBatchIds, uint256 indexed outputBatchId, string processType, address indexed handler, uint256 timestamp)',
  'event BatchTransferInitiated(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp)',
  'event BatchReceived(uint256 indexed id, address indexed receiver, uint256 timestamp)',
] as const;

type RegistryEntry = {
  chainId: number;
  address: string;
};

type RegistryShape = Record<string, Record<string, RegistryEntry>>;
type EventArgMap = Record<string, unknown>;
type EventLike = { args?: EventArgMap; transactionHash: string };

export type ChainproofReadContext = {
  provider: BrowserProvider | JsonRpcProvider;
  contract: Contract;
  chainId: number;
  contractAddress: string;
};

const defaultRpcUrl = process.env.NEXT_PUBLIC_CHAINPROOF_RPC_URL || 'http://127.0.0.1:8545';
const defaultContractKey = process.env.NEXT_PUBLIC_CHAINPROOF_CONTRACT_KEY || 'chainproof';
const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAINPROOF_CHAIN_ID || '1337');

async function fetchRegistry(): Promise<RegistryShape> {
  const response = await fetch('/api/blockchain/registry', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Could not load on-chain contract registry.');
  }
  return response.json();
}

async function getProvider() {
  const ethereum =
    typeof window !== 'undefined'
      ? (window as Window & { ethereum?: Eip1193Provider }).ethereum
      : undefined;
  if (ethereum) {
    try {
      return new BrowserProvider(ethereum);
    } catch {
      return new JsonRpcProvider(defaultRpcUrl);
    }
  }
  return new JsonRpcProvider(defaultRpcUrl);
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => toNumber(item)) : [];
}

function resolveAddressFromRegistry(registry: RegistryShape, contractKey: string, chainId: number) {
  const byKey = registry[contractKey] || {};
  const entry = byKey[String(chainId)];
  return entry?.address || '';
}

export async function createChainproofReadContext(
  contractKey: string = defaultContractKey
): Promise<ChainproofReadContext> {
  const [registry, provider] = await Promise.all([fetchRegistry(), getProvider()]);
  const network = await provider.getNetwork();
  const detectedChainId = Number(network.chainId);
  const chainId = Number.isFinite(detectedChainId) && detectedChainId > 0 ? detectedChainId : configuredChainId;

  const contractAddress = resolveAddressFromRegistry(registry, contractKey, chainId);
  if (!contractAddress) {
    throw new Error(`No contract registry entry found for key "${contractKey}" on chain ${chainId}.`);
  }

  const code = await provider.getCode(contractAddress);
  if (!code || code === '0x') {
    throw new Error(`No contract code found at ${contractAddress} on chain ${chainId}.`);
  }

  const contract = new Contract(contractAddress, CHAINPROOF_READ_ABI, provider);
  await contract.owner();
  return { provider, contract, chainId, contractAddress };
}

export async function readChainproofSummary(viewerAddress?: string) {
  const context = await createChainproofReadContext();
  const [owner, batchCount] = await Promise.all([context.contract.owner(), context.contract.batchCount()]);

  let viewerRole: string | null = null;
  if (viewerAddress) {
    try {
      const roleValue = Number(await context.contract.roles(viewerAddress));
      viewerRole = ROLE_LABELS[roleValue] ?? 'Unknown';
    } catch {
      viewerRole = null;
    }
  }

  return {
    ...context,
    owner: String(owner),
    batchCount: Number(batchCount),
    viewerRole,
  };
}

export async function readBatchByTrackingOrId(lookup: string) {
  const context = await createChainproofReadContext();
  const trimmed = lookup.trim();
  if (!trimmed) {
    throw new Error('Enter a batch id or tracking code.');
  }

  const parsedId = Number(trimmed);
  const batchId =
    Number.isFinite(parsedId) && parsedId > 0
      ? parsedId
      : Number(await context.contract.getBatchIdByTrackingCode(trimmed));

  if (!batchId) {
    throw new Error('Batch not found.');
  }

  const [batchRaw, parentsRaw, childrenRaw] = await Promise.all([
    context.contract.batches(batchId),
    context.contract.getParentBatches(batchId),
    context.contract.getChildBatches(batchId),
  ]);

  const batch = {
    id: Number(batchRaw.id),
    creator: String(batchRaw.creator),
    origin: String(batchRaw.origin),
    ipfsHash: String(batchRaw.ipfsHash),
    quantity: Number(batchRaw.quantity),
    trackingCode: String(batchRaw.trackingCode),
    status: Number(batchRaw.status),
    createdAt: Number(batchRaw.createdAt),
    updatedAt: Number(batchRaw.updatedAt),
    currentHandler: String(batchRaw.currentHandler),
  };

  const parents = Array.from(parentsRaw || [], (value) => Number(value));
  const children = Array.from(childrenRaw || [], (value) => Number(value));

  const timeline: { type: string; timestamp: number; text: string; txHash: string }[] = [];

  const harvestEvents = await context.contract.queryFilter(context.contract.filters.BatchHarvested(batchId));
  harvestEvents.forEach((rawEvent) => {
    const event = rawEvent as unknown as EventLike;
    timeline.push({
      type: 'HARVEST',
      timestamp: toNumber(event.args?.timestamp),
      text: `Harvested by ${toString(event.args?.creator) || 'unknown'}`,
      txHash: event.transactionHash,
    });
  });

  const transferEvents = await context.contract.queryFilter(context.contract.filters.BatchTransferInitiated(batchId));
  transferEvents.forEach((rawEvent) => {
    const event = rawEvent as unknown as EventLike;
    timeline.push({
      type: 'TRANSFER',
      timestamp: toNumber(event.args?.timestamp),
      text: `${toString(event.args?.from) || 'unknown'} -> ${toString(event.args?.to) || 'unknown'}`,
      txHash: event.transactionHash,
    });
  });

  const receiveEvents = await context.contract.queryFilter(context.contract.filters.BatchReceived(batchId));
  receiveEvents.forEach((rawEvent) => {
    const event = rawEvent as unknown as EventLike;
    timeline.push({
      type: 'RECEIVE',
      timestamp: toNumber(event.args?.timestamp),
      text: `Received by ${toString(event.args?.receiver) || 'unknown'}`,
      txHash: event.transactionHash,
    });
  });

  const splitEvents = await context.contract.queryFilter(context.contract.filters.BatchSplit());
  splitEvents.forEach((rawEvent) => {
    const event = rawEvent as unknown as EventLike;
    const parentId = toNumber(event.args?.parentId);
    const childIds = toNumberArray(event.args?.childIds);
    if (parentId === batchId || childIds.includes(batchId)) {
      timeline.push({
        type: 'SPLIT',
        timestamp: toNumber(event.args?.timestamp),
        text: `Parent ${parentId} -> children [${childIds.join(', ')}]`,
        txHash: event.transactionHash,
      });
    }
  });

  const transformEvents = await context.contract.queryFilter(context.contract.filters.BatchTransformed(null, batchId));
  transformEvents.forEach((rawEvent) => {
    const event = rawEvent as unknown as EventLike;
    timeline.push({
      type: 'TRANSFORM',
      timestamp: toNumber(event.args?.timestamp),
      text: `Output ${toNumber(event.args?.outputBatchId)} (${toString(event.args?.processType) || 'process'})`,
      txHash: event.transactionHash,
    });
  });

  const mergeEvents = await context.contract.queryFilter(context.contract.filters.BatchMerged(null, batchId));
  mergeEvents.forEach((rawEvent) => {
    const event = rawEvent as unknown as EventLike;
    timeline.push({
      type: 'MERGE',
      timestamp: toNumber(event.args?.timestamp),
      text: `Merged into output ${toNumber(event.args?.outputBatchId)}`,
      txHash: event.transactionHash,
    });
  });

  timeline.sort((a, b) => a.timestamp - b.timestamp);

  return {
    chainId: context.chainId,
    contractAddress: context.contractAddress,
    batch,
    parents,
    children,
    timeline,
  };
}
