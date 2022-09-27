require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("hardhat-contract-sizer")
require("dotenv").config()

const GOERLI_RPC_URL =
  process.env.GOERLI_RPC_URL || "https://goerli.infura.io/v3/174af4826d9444c59c5fad24f128e4c5"
const PRIVATE_KEY =
  process.env.PRIVATE_KEY || "932f5c6bfdd5575c48ce7a4a57e18fbe2d9f6a56e4d1bad5f4f89c33a0cd206d"
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "T3BS3Y1DFTNJCQH9SPXIIYW8X152BQRH5E"

module.exports = {
  defaultNetwork: "hardhat",
  solidity: "0.8.8",
  namedAccounts: {
    deployer: {
      default: 0,
    },
    user: {
      default: 1,
    },
  },
  networks: {
    goerli: {
      url: GOERLI_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 5,
      blockConfirmations: 6,
    },
    hardhat: {
      chainId: 31337,
      blockConfirmations: 1,
    },
  },
  gasReporter: {
    enabled: false,
    outputFile: "gas-report.txt",
    noColors: true,
    currency: "USD",
    // coinmarketcap: COINMARKETCAP_API_KEY,
  },
  mocha: {
    timeout: 300000,
  },
}
