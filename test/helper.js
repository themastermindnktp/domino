const { ethers } = require('hardhat')

async function getCurrentTimestamp() {
  const currentBlockNumber = await ethers.provider.getBlockNumber();
  return (await ethers.provider.getBlock(currentBlockNumber)).timestamp;
}

function hexToDec(hex) {
  return BigInt(hex).toString();
}

module.exports = {
  maxUInt256: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  nullAddress: '0x0000000000000000000000000000000000000000',
  getCurrentTimestamp,
  hexToDec
}
