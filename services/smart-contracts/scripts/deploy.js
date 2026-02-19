const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEFAULT_CONTRACT_KEY = process.env.CHAINPROOF_CONTRACT_KEY || "chainproof";
const DEFAULT_CONTRACT_VERSION = process.env.CHAINPROOF_CONTRACT_VERSION || "2.0.0";
const LOCAL_REGISTRY_PATH = path.resolve(__dirname, "../config/contracts.json");
const requestedRegistryPath = process.env.CHAINPROOF_REGISTRY_PATH || "";
const REGISTRY_PATH =
  requestedRegistryPath.startsWith("/config/") && !fs.existsSync("/config")
    ? LOCAL_REGISTRY_PATH
    : requestedRegistryPath || LOCAL_REGISTRY_PATH;

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    return {};
  }
  const raw = fs.readFileSync(registryPath, "utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}

function writeRegistry(registryPath, data) {
  const parentDir = path.dirname(registryPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const ChainProof = await hre.ethers.getContractFactory("ChainProof");
  const chainProof = await ChainProof.deploy();
  await chainProof.waitForDeployment();

  const address = await chainProof.getAddress();
  const [deployer, account1, account2, account3, account4, account5] =
    await hre.ethers.getSigners();
  const networkInfo = await hre.ethers.provider.getNetwork();
  const chainId = Number(networkInfo.chainId);
  const networkName = hre.network.name || "unknown";

  const registry = loadRegistry(REGISTRY_PATH);
  const contractMap = registry[DEFAULT_CONTRACT_KEY] || {};
  contractMap[String(chainId)] = {
    networkName,
    chainId,
    address,
    version: DEFAULT_CONTRACT_VERSION,
    deployedAtBlock: Number(await hre.ethers.provider.getBlockNumber()),
    updatedAt: new Date().toISOString(),
  };
  registry[DEFAULT_CONTRACT_KEY] = contractMap;
  writeRegistry(REGISTRY_PATH, registry);

  console.log("====================================================");
  console.log("Network:", networkName);
  console.log("Chain ID:", chainId);
  console.log("ChainProof deployed to:", address);
  console.log("Owner/Admin address:", deployer.address);
  if (account1 && account2 && account3 && account4 && account5) {
    console.log("Suggested demo accounts:");
    console.log("  Producer   ->", account1.address);
    console.log("  Processor  ->", account2.address);
    console.log("  Warehouse  ->", account3.address);
    console.log("  Transporter->", account4.address);
    console.log("  Customer   ->", account5.address);
  } else {
    console.log("Additional demo accounts are not available on this network.");
  }
  console.log("Artifacts are in: /app/artifacts/contracts/ChainProof.sol/ChainProof.json");
  console.log("Registry updated at:", REGISTRY_PATH);
  console.log("====================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});