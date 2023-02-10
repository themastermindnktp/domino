const { ethers } = require('hardhat');
const { expect } = require('chai');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const { nullAddress, maxUInt256 } = require('./helper');

describe('3. AuctionManager', async () => {
  before(async () => {
    RandomAlgorithm = await ethers.getContractFactory('RandomAlgorithm');
    DominoManager = await ethers.getContractFactory('DominoManager');
    AuctionManager = await ethers.getContractFactory('AuctionManager');

    MockRandomAlgorithm = await ethers.getContractFactory('MockRandomAlgorithm');
    MockCash = await ethers.getContractFactory('MockCash');

    [admin, user1, user2, user3] = await ethers.getSigners();
  });

  beforeEach(async () => {
    randomAlgorithm = await MockRandomAlgorithm.deploy();
    cash = await MockCash.deploy();
    dominoManager = await DominoManager.deploy(cash.address, randomAlgorithm.address);
    auctionManager = await AuctionManager.deploy(cash.address, dominoManager.address);

    await cash.mintFor(user1.address, 10);
    await cash.mintFor(user2.address, 10);
    await cash.mintFor(user3.address, 10);

    await cash.connect(user1).approve(dominoManager.address, maxUInt256);
    await cash.connect(user2).approve(dominoManager.address, maxUInt256);
    await cash.connect(user3).approve(dominoManager.address, maxUInt256);

    await dominoManager.startNewRound(10000, 10, 1);

    await randomAlgorithm.setFirstValue(1);
    await randomAlgorithm.setSecondValue(2);

    await dominoManager.connect(user1).drawDomino();

    await mine(5);
  });

  describe('3.1. constructor', async () => {
    it('3.1.1. Correct `admin` address', async () => {
      const adminAddress = await auctionManager.admin();
      expect(adminAddress).to.equal(admin.address, 'Incorrect `admin` address');
    });

    it('3.1.2. Correct `cash` address', async () => {
      const cashAddress = await auctionManager.cash();
      expect(cashAddress).to.equal(cash.address, 'Incorrect `cash` address');
    });

    it('3.1.3. Correct `dominoManager` address', async () => {
      const dominoManagerAddress = await auctionManager.dominoManager();
      expect(dominoManagerAddress).to.equal(dominoManager.address, 'Incorrect `dominoManager` address');
    });

    it('3.1.4. Registered in `dominoManager`', async () => {
      const auctionManagerAddress = await dominoManager.auctionManager();
      expect(auctionManagerAddress).to.equal(auctionManager.address, 'Incorrect `auctionManager` address in ');
    });

    it('3.1.5. Variables are initially default values', async () => {
      const auctionNumber = await auctionManager.auctionNumber();
      expect(auctionNumber).to.equal(0, 'Initial `auctionNumber` is not 0');

      const fee = await auctionManager.fee();
      expect(fee).to.equal(0, 'Initial `fee` is not 0');
    });
  });

});
