// Loading env configs for deploying and public contract source
require('dotenv').config();

// Using hardhat-ethers plugin for deploying
// See here: https://hardhat.org/plugins/nomiclabs-hardhat-ethers.html
//           https://hardhat.org/guides/deploying.html
require('@nomicfoundation/hardhat-toolbox');

// This plugin runs solhint on the project's sources and prints the report
require('@nomiclabs/hardhat-solhint');

// Hardhat task list
require('./tasks/generateAccount');

const {
  generateAccount,
  generateAccounts,
} = require('./common/account');

const accounts = [generateAccount(process.env.ETHEREUM_ACCOUNT_SECRET_SEED)].concat(generateAccounts(9));
const privateKeys = accounts.map(item => item.privateKey);

const config = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      accounts
    },
    localhost: {
      accounts: privateKeys,
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    avax_mainnet: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      gas: 8000000,
      gasPrice: 25000000000,
      chainId: 43114,
      accounts: privateKeys,
    },
  },

  solidity: {
    compilers: [
      {
        version: '0.8.9',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
    deploy: 'deploy',
    deployments: 'deployments',
  },
  mocha: {
    timeout: 300000,
    useColors: true,
    reporter: 'mocha-multi-reporters',
    reporterOptions: {
      configFile: './mocha-report.json',
    },
  },
};

module.exports = config;
