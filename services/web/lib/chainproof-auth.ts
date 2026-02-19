'use client';

import { Contract } from 'ethers';
import type { JsonRpcProvider, Signer } from 'ethers';
import type { AppRole } from './wallet-auth';
import { configuredChainId } from './wallet-auth';

type RegistryEntry = {
  chainId: number;
  address: string;
};

type RegistryShape = Record<string, Record<string, RegistryEntry>>;

type WalletRoleContext = {
  role: AppRole;
  chainId: number;
  contractAddress: string;
  owner: string;
};

export type AssignMyRoleResult = {
  txHash: string;
  account: string;
  chainId: number;
  contractAddress: string;
};

const defaultContractKey = process.env.NEXT_PUBLIC_CHAINPROOF_CONTRACT_KEY || 'chainproof';

const ROLE_BY_VALUE: Record<number, AppRole> = {
  0: 'none',
  1: 'producer',
  2: 'processor',
  3: 'warehouse',
  4: 'transporter',
  5: 'customer',
};

const ROLE_VALUE_BY_NAME: Record<AppRole, number> = {
  none: 0,
  producer: 1,
  processor: 2,
  warehouse: 3,
  transporter: 4,
  customer: 5,
};

const CHAINPROOF_AUTH_ABI = [
  'function owner() view returns (address)',
  'function roles(address) view returns (uint8)',
  'function assignMyRole(uint8 role)',
] as const;

export type ChainproofAuthClient = {
  provider: JsonRpcProvider;
  account: string;
  signer?: Signer;
};

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

async function buildRoleContractContext(
  client: ChainproofAuthClient,
  contractKey: string = defaultContractKey
) {
  const provider = client.provider;
  const [registry, network] = await Promise.all([fetchRegistry(), provider.getNetwork()]);
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

  return { provider, chainId, contractAddress };
}

export async function resolveWalletRoleContext(
  client: ChainproofAuthClient,
  contractKey: string = defaultContractKey
): Promise<WalletRoleContext> {
  const { provider, chainId, contractAddress } = await buildRoleContractContext(client, contractKey);
  const contract = new Contract(contractAddress, CHAINPROOF_AUTH_ABI, provider);
  const [owner, roleRaw] = await Promise.all([contract.owner(), contract.roles(client.account)]);
  const roleValue = Number(roleRaw);

  return {
    role: ROLE_BY_VALUE[roleValue] ?? 'none',
    chainId,
    contractAddress,
    owner: String(owner),
  };
}

function mapAssignRoleError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Role assignment failed.';
  const lowered = message.toLowerCase();
  if (lowered.includes('user rejected') || lowered.includes('action_rejected') || lowered.includes('rejected')) {
    return new Error('Role assignment was rejected in wallet.');
  }
  if (lowered.includes('insufficient funds')) {
    return new Error('Wallet has insufficient funds for gas.');
  }
  return new Error(message);
}

export async function assignMyWalletRole(
  role: Exclude<AppRole, 'none'>,
  client: ChainproofAuthClient,
  contractKey: string = defaultContractKey
): Promise<AssignMyRoleResult> {
  try {
    const { chainId, contractAddress } = await buildRoleContractContext(client, contractKey);
    if (!client.signer) {
      throw new Error('A signing wallet session is required to assign role.');
    }
    const signer = client.signer;
    const account = client.account;
    const contract = new Contract(contractAddress, CHAINPROOF_AUTH_ABI, signer);
    const tx = await contract.assignMyRole(ROLE_VALUE_BY_NAME[role]);
    await tx.wait();
    return {
      txHash: String(tx.hash),
      account,
      chainId,
      contractAddress,
    };
  } catch (error) {
    throw mapAssignRoleError(error);
  }
}
