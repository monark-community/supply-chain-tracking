const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // 1. Get the Contract Factory
  const ChainProof = await hre.ethers.getContractFactory("ChainProof");

  // 2. Deploy it
  const chainProof = await ChainProof.deploy();
  await chainProof.waitForDeployment();

  const address = await chainProof.getAddress();
  console.log("####################################################");
  console.log("ChainProof deployed to:", address);

  // OPTIONAL: This helps you find the ABI file later
  console.log("Artifacts are in: /app/artifacts/contracts/ChainProof.sol/ChainProof.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});