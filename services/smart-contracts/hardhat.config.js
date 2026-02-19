require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.dev"), override: false });

/** @type import('hardhat/config').HardhatUserConfig */
const tenderlyRpcUrl = process.env.TENDERLY_RPC_URL || "";
const tenderlyChainId = process.env.TENDERLY_CHAIN_ID
  ? Number(process.env.TENDERLY_CHAIN_ID)
  : undefined;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || "";

const tenderlyNetworkConfig = tenderlyRpcUrl
  ? {
      url: tenderlyRpcUrl,
      chainId: tenderlyChainId,
      accounts: deployerKey ? [deployerKey] : [],
    }
  : undefined;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    ...(tenderlyNetworkConfig ? { tenderly: tenderlyNetworkConfig } : {}),
  },
};