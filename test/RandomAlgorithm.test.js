const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const { getEventValues } = require('../common/transaction');
const { EXTENDED_TIMEOUT } = require('./config');
const { nullAddress, hexToDec } = require('./helper');

async function sampleRandomIntegers(bound, sampleSize, randomAlgorithm) {
  console.log('--------------------------------------------------');
  console.log(`[SAMPLING ${sampleSize} RANDOM INSTANCES]`);
  const c = Array(bound).fill(0);

  for (let i = 1; i <= sampleSize; ++i) {
    const x = (await getEventValues(randomAlgorithm.integer(bound)))[0].value.toNumber();
    c[x]++;
    if (i % 1000 === 0) console.log(`Sampled ${i} instances`);
  }
  console.log();

  sampleSize = sampleSize * 1.0;
  let entropy = 0.0;
  for (let i = 0; i < bound; ++i) {
    if (c[i]) {
      entropy += c[i] / sampleSize * Math.log(sampleSize / c[i]);
    }
  }

  const uniformEntropy = Math.log(bound);
  const normalizedEntropy = entropy / uniformEntropy;

  console.log(`Maximum Entropy:     ${Number(uniformEntropy).toFixed(5)}`);
  console.log(`Measured Entropy:    ${Number(entropy).toFixed(5)}`);
  console.log(`Normalized Entropy:  ${Number(normalizedEntropy).toFixed(5)}`);
  console.log();

  return normalizedEntropy;
}

describe('1. RandomAlgorithm', () => {
  before(async () => {
    RandomAlgorithm = await ethers.getContractFactory('RandomAlgorithm');

    [admin, user] = await ethers.getSigners();
  });

  beforeEach(async () => {
    randomAlgorithm = await RandomAlgorithm.deploy();
  });

  async function getNonce() {
    return hexToDec(await ethers.provider.getStorageAt(randomAlgorithm.address, '0x1'));
  }

  describe('1.1. constructor', async () => {
    it('1.1.1. Unregistered `dominoManager` address', async () => {
      const dominoManager = await randomAlgorithm.dominoManager();
      expect(dominoManager).to.equal(nullAddress, 'Initial `dominoManager` address is not null address');
    });

    it('1.1.2. Initial `nonce` is 0', async () => {
      const nonce = await getNonce();
      expect(nonce).to.equal('0', 'Initial `nonce` is not 0');
    });
  });

  describe('1.2. registerDominoManager', async () => {
    it('1.2.1. Register Domino Manager contract successfully', async () => {
      await randomAlgorithm.connect(user).registerDominoManager();
      const dominoManager = await randomAlgorithm.dominoManager();
      expect(dominoManager).to.equal(user.address, 'Incorrect `dominoManager` address');
    });

    it('1.2.2. Register Domino Manager contract unsuccessfully due to Domino Manager has already been registered', async () => {
      await randomAlgorithm.connect(user).registerDominoManager();
      await expect(randomAlgorithm.connect(admin).registerDominoManager()).to.be.revertedWith(
        'RandomAlgorithm: Domino Manager has already been registered',
      );
    });
  });

  describe('1.3. integer', async () => {
    beforeEach(async () => {
      await randomAlgorithm.registerDominoManager();
      await mine(5);
    });

    it('1.3.1. Generate unsuccessfully due to the caller is not `dominoManager`', async () => {
      await randomAlgorithm.integer(100);
      await expect(randomAlgorithm.connect(user).integer(100)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('1.3.2. Change `nonce` everytime', async () => {
      const nonce = getNonce();
      for (let _ = 0; _ < 1000; ++_) {
        await randomAlgorithm.integer(100);
        const newNonce = getNonce();
        assert.notEqual(nonce, newNonce, '`nonce` remains the same after one call');
      }
    }).timeout(EXTENDED_TIMEOUT);

    it('1.3.3. Measure distribution when the bound is 1000 and the sample size is 5000', async () => {
      const normalizedEntropy = await sampleRandomIntegers(1000, 5000, randomAlgorithm);
      assert.isAtLeast(normalizedEntropy, 0.95, 'The measured distribution is too deviated from the normal distribution');
      console.log('The measured distribution is asymptotically normal distribution');
    }).timeout(EXTENDED_TIMEOUT);

    it('1.3.4. Measure distribution when the bound is 100 and the sample size is 5000', async () => {
      const normalizedEntropy = await sampleRandomIntegers(100, 5000, randomAlgorithm);
      assert.isAtLeast(normalizedEntropy, 0.95, 'The measured distribution is too deviated from the normal distribution');
      console.log('The measured distribution is asymptotically normal distribution');
    }).timeout(EXTENDED_TIMEOUT);

    it('1.3.5. Measure distribution when the bound is 50 and the sample size is 5000', async () => {
      const normalizedEntropy = await sampleRandomIntegers(50, 5000, randomAlgorithm);
      assert.isAtLeast(normalizedEntropy, 0.95, 'The measured distribution is too deviated from the normal distribution');
      console.log('The measured distribution is asymptotically normal distribution');
    }).timeout(EXTENDED_TIMEOUT);

    it('1.3.6. Measure distribution when the bound is 10 and the sample size is 5000', async () => {
      const normalizedEntropy = await sampleRandomIntegers(10, 5000, randomAlgorithm);
      assert.isAtLeast(normalizedEntropy, 0.95, 'The measured distribution is too deviated from the normal distribution');
      console.log('The measured distribution is asymptotically normal distribution');
    }).timeout(EXTENDED_TIMEOUT);
  });
});
