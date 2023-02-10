const ethers = require('ethers')

function generateAccount(secret) {
  const privateKey = ethers.utils.id(secret)
  const account = new ethers.Wallet(privateKey)
  return {
    address: account.address,
    privateKey: account.privateKey,
    balance: '10000000000000000000000000' // 1000000 ETH
  }
}

function generateAccounts(number) {
  let accounts = []
  for (let i = 1; i <= number; ++i) {
    accounts.push(generateAccount(`domino ${i}`))
  }
  return accounts;
}

module.exports = {
  generateAccount,
  generateAccounts
}
