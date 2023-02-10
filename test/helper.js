const { ethers } = require('hardhat');
const { expect } = require('chai');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

function hexToDec(hex) {
  return BigInt(hex).toString();
}

async function getCurrentTimestamp() {
  const currentBlockNumber = await ethers.provider.getBlockNumber();
  return (await ethers.provider.getBlock(currentBlockNumber)).timestamp;
}

async function increaseTime(provider, s) {
  await provider.send('evm_increaseTime', [s]);
  await mine();
}

async function expectBalance(token, address, expectedBalance) {
  const balance = await token.balanceOf(address);
  expect(balance).to.equal(expectedBalance, 'IncorrectBalance');
}

module.exports = {
  maxUInt256: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  nullAddress: '0x0000000000000000000000000000000000000000',
  hexToDec,
  getCurrentTimestamp,
  increaseTime,
  expectBalance,
};
