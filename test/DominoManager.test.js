const { ethers } = require('hardhat');
const { expect } = require('chai');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const { nullAddress, maxUInt256, increaseTime, expectBalance } = require('./helper');
const { getEventValues } = require('../common/transaction');
const { EXTENDED_TIMEOUT } = require('./config');

describe('2. DominoManager', () => {
  async function drawAndSubmitDominoChain(user, chain) {
    for (let i = 1; i < chain.length; ++i) {
      await randomAlgorithm.setFirstValue(chain[i - 1]);
      await randomAlgorithm.setSecondValue(chain[i]);

      await dominoManager.connect(user).drawDomino();
    }

    await dominoManager.connect(user).submitDominoChain(chain);
  }

  before(async () => {
    RandomAlgorithm = await ethers.getContractFactory('RandomAlgorithm');
    DominoManager = await ethers.getContractFactory('DominoManager');

    MockRandomAlgorithm = await ethers.getContractFactory('MockRandomAlgorithm');
    MockCash = await ethers.getContractFactory('MockCash');

    [admin, user1, user2, user3] = await ethers.getSigners();
  });

  beforeEach(async () => {
    randomAlgorithm = await MockRandomAlgorithm.deploy();
    cash = await MockCash.deploy();
    dominoManager = await DominoManager.deploy(cash.address, randomAlgorithm.address);

    await mine(5);
  });

  describe('2.1. constructor', async () => {
    it('2.1.1. Correct `admin` address', async () => {
      const adminAddress = await dominoManager.admin();
      expect(adminAddress).to.equal(admin.address, 'Incorrect `admin` address');
    });

    it('2.1.2. Correct `cash` address', async () => {
      const cashAddress = await dominoManager.cash();
      expect(cashAddress).to.equal(cash.address, 'Incorrect `cash` address');
    });

    it('2.1.3. Correct `randomAlgorithm` address', async () => {
      const randomAlgorithmAddress = await dominoManager.randomAlgorithm();
      expect(randomAlgorithmAddress).to.equal(randomAlgorithm.address, 'Incorrect `randomAlgorithm` address');
    });

    it('2.1.4. Registered in `randomAlgorithm`', async () => {
      const dominoManagerAddress = await randomAlgorithm.dominoManager();
      expect(dominoManagerAddress).to.equal(dominoManager.address, 'Incorrect `dominoManager` address in the `Random` contract');
    });

    it('2.1.5. Unregistered `auctionManager` address', async () => {
      const auctionManager = await dominoManager.auctionManager();
      expect(auctionManager).to.equal(nullAddress, 'Initial `auctionManager` address is not null address');
    });

    it('2.1.6. Variables are initially default values', async () => {
      const roundNumber = await dominoManager.roundNumber();
      expect(roundNumber).to.equal(0, 'Initial `roundNumber` is not 0');

      const fee = await dominoManager.fee();
      expect(fee).to.equal(0, 'Initial `fee` is not 0');
    });
  });

  describe('2.2. transferAdministration', async () => {
    it('2.2.1. Transfer administration successfully', async () => {
      await dominoManager.transferAdministration(user1.address);
      const adminAddress = await dominoManager.admin();
      expect(adminAddress).to.equal(user1.address, 'Incorrect `admin` address');
    });

    it('2.2.2. Transfer administration unsuccessfully due to the caller is not `admin`', async () => {
      await expect(dominoManager.connect(user1).transferAdministration(user2.address)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.2.3. Transfer administration unsuccessfully due to transferring to null address', async () => {
      await expect(dominoManager.transferAdministration(nullAddress)).to.be.revertedWith(
        'DominoManager: Prohibited null address',
      );
    });

    it('2.2.4. Transfer administration unsuccessfully due to transferring to the current `admin` address', async () => {
      await expect(dominoManager.transferAdministration(admin.address)).to.be.revertedWith(
        'DominoManager: The new admin is identical to the current admin',
      );
    });
  });

  describe('2.3. replaceRandomAlgorithm', async () => {
    it('2.3.1. Replace Random Algorithm successfully', async () => {
      const newRandomAlgorithm = await RandomAlgorithm.deploy();
      await dominoManager.replaceRandomAlgorithm(newRandomAlgorithm.address);

      const randomAlgorithmAddress = await dominoManager.randomAlgorithm();
      expect(randomAlgorithmAddress).to.equal(newRandomAlgorithm.address, 'Incorrect new `randomAlgorithm` address');

      const dominoManagerAddress = await randomAlgorithm.dominoManager();
      expect(dominoManagerAddress).to.equal(dominoManager.address, 'Incorrect `dominoManager` address');
    });

    it('2.3.2. Replace Random Algorithm unsuccessfully due to the caller is not `admin`', async () => {
      await expect(dominoManager.connect(user1).replaceRandomAlgorithm(user2.address)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.3.3. Replace Random Algorithm unsuccessfully due to the current round has not ended yet', async () => {
      await dominoManager.startNewRound(10000, 1, 1);
      await expect(dominoManager.replaceRandomAlgorithm(user1.address)).to.be.revertedWith(
        'DominoManager: The current round has not ended yet',
      );
    });

    it('2.3.4. Replace Random Algorithm unsuccessfully due to replacing with null address', async () => {
      await expect(dominoManager.replaceRandomAlgorithm(nullAddress)).to.be.revertedWith(
        'DominoManager: Prohibited null address',
      );
    });

    it('2.3.5. Replace Random Algorithm unsuccessfully due to replacing with the current `randomAlgorithm` address', async () => {
      await expect(dominoManager.replaceRandomAlgorithm(randomAlgorithm.address)).to.be.revertedWith(
        'DominoManager: The new Random Algorithm is identical to the current one',
      );
    });
  });

  describe('2.4. registerAuctionManager', async () => {
    it('2.4.1. Register Auction Manager contract successfully', async () => {
      await dominoManager.connect(user1).registerAuctionManager();
      const auctionManager = await dominoManager.auctionManager();
      expect(auctionManager).to.equal(user1.address, 'Incorrect `auctionManager` address');
    });

    it('2.4.2. Register Auction Manager contract unsuccessfully due to Auction Manager has already been registered', async () => {
      await dominoManager.connect(user1).registerAuctionManager();
      await expect(dominoManager.connect(user2).registerAuctionManager()).to.be.revertedWith(
        'DominoManager: Auction Manager has already been registered',
      );
    });
  });

  describe('2.5. startNewRound', async () => {
    it('2.5.1. Start a new round successfully', async () => {
      const duration = 1000;
      const dominoSize = 10;
      const drawPrice = 100;

      const response = await dominoManager.startNewRound(
        duration,
        dominoSize,
        drawPrice,
      );

      const roundNumber = await dominoManager.roundNumber();
      expect(roundNumber).to.equal(1, 'Incorrect `roundNumber` value');

      const round = await dominoManager.rounds(1);

      const startTimestamp = (await ethers.provider.getBlock(response.blockNumber)).timestamp;
      expect(round.startTimestamp).to.equal(startTimestamp, 'Incorrect `startTimestamp` value');

      const endTimestamp = startTimestamp + duration;
      expect(round.endTimestamp).to.equal(endTimestamp, 'Incorrect `endTimestamp` value');

      expect(round.dominoSize).to.equal(dominoSize, 'Incorrect `dominoSize` value');
      expect(round.drawPrice).to.equal(drawPrice, 'Incorrect `drawPrice` value');
    });

    it('2.5.2. Start a new round unsuccessfully due to the caller is not `admin`', async () => {
      await expect(dominoManager.connect(user1).startNewRound(0, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.5.3. Start a new round unsuccessfully due to the current round has not ended yet', async () => {
      await dominoManager.startNewRound(10000, 1, 1);
      await expect(dominoManager.connect(user1).startNewRound(0, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.5.4. Start a new round unsuccessfully due to the duration is 0', async () => {
      await expect(dominoManager.startNewRound(0, 0, 0)).to.be.revertedWith(
        'DominoManager: The duration must be greater than 0',
      );
    });

    it('2.5.5. Start a new round unsuccessfully due to the domino size is 0', async () => {
      await expect(dominoManager.startNewRound(10000, 0, 0)).to.be.revertedWith(
        'DominoManager: The domino size must be greater than 0',
      );
    });

    it('2.5.6. Start a new round unsuccessfully due to the draw price is 0', async () => {
      await expect(dominoManager.startNewRound(10000, 10, 0)).to.be.revertedWith(
        'DominoManager: The draw price must be greater than 0',
      );
    });
  });

  describe('2.6. currentRoundEndTimestamp', async () => {
    it('2.6.1. Return correct `endTimestamp` of the current round', async () => {
      await dominoManager.startNewRound(10000, 1, 1);

      const round = await dominoManager.rounds(1);
      let endTimestamp = await dominoManager.currentRoundEndTimestamp();
      expect(endTimestamp).to.equal(round.endTimestamp, 'Incorrect result');
    });

    it('2.6.2. Revert due to no round is available', async () => {
      await expect(dominoManager.currentRoundEndTimestamp()).revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.currentRoundEndTimestamp()).revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });
  });

  describe('2.7. drawDomino', async () => {
    beforeEach(async () => {
      await cash.mintFor(user1.address, 10);
      await cash.connect(user1).approve(dominoManager.address, maxUInt256);
    });

    it('2.7.1. Draw a domino successfully', async () => {
      await dominoManager.startNewRound(10000, 10, '2000000000000000000');

      await randomAlgorithm.setFirstValue(1);
      await randomAlgorithm.setSecondValue(2);

      await dominoManager.connect(user1).drawDomino();
      await dominoManager.connect(user1).drawDomino();

      const fee = await dominoManager.fee();
      expect(fee).to.equal('400000000000000000', 'Incorrect `fee` value');

      const totalReward = (await dominoManager.rounds(1)).totalReward;
      expect(totalReward).to.equal('3600000000000000000', 'Incorrect `totalReward` value');

      const dominoNumber = await dominoManager.currentRoundDominoNumber(user1.address, 1, 2);
      expect(dominoNumber).to.equal(2, 'Incorrect `dominoNumbers` values');

      await expectBalance(cash, user1.address, '6000000000000000000');
      await expectBalance(cash, dominoManager.address, '4000000000000000000');
    });

    it('2.7.2. Draw a domino unsuccessfully due to no round is available', async () => {
      await expect(dominoManager.connect(user1).drawDomino()).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.connect(user1).drawDomino()).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });

    it('2.7.3. Draw a domino unsuccessfully due to insufficient balance', async () => {
      await dominoManager.startNewRound(10000, 10, '20000000000000000000');

      await expect(dominoManager.connect(user1).drawDomino()).to.be.revertedWith(
        'ERC20: transfer amount exceeds balance',
      );
    });
  });

  describe('2.8. currentRoundDominoNumber', async () => {
    it('2.8.1. Return correct `dominoNumbers` of users in the current round', async () => {
      await dominoManager.replaceRandomAlgorithm((await RandomAlgorithm.deploy()).address);
      await dominoManager.startNewRound(10000, 5, 1);

      const c = {};
      const users = [user1, user2, user3];

      for (let i = 0; i < 3; ++i) {
        await cash.mintFor(users[i].address, 10);
        await cash.connect(users[i]).approve(dominoManager.address, maxUInt256);

        for (let x = 0; x < 5; ++x) {
          for (let y = 0; y < 5; ++y) {
            c[[i, x, y]] = 0;
          }
        }
      }

      for (let _ = 0; _ < 200; ++_) {
        for (let i = 0; i < 3; ++i) {
          const { firstNumber, secondNumber } = (await getEventValues(dominoManager.connect(users[i]).drawDomino()))[3];
          c[[i, firstNumber, secondNumber]]++;
        }
      }

      for (let i = 0; i < 3; ++i) {
        for (let x = 0; x < 5; ++x) {
          for (let y = 0; y < 5; ++y) {
            const dominoNumber = await dominoManager.currentRoundDominoNumber(users[i].address, x, y);
            expect(dominoNumber).to.equal(c[[i, x, y]], 'Incorrect result');
          }
        }
      }
    }).timeout(EXTENDED_TIMEOUT);

    it('2.8.2. Revert due to no round is available', async () => {
      await expect(dominoManager.currentRoundDominoNumber(user1.address, 0, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.currentRoundDominoNumber(user1.address, 0, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });
  });

  describe('2.9. lockDomino', async () => {
    beforeEach(async () => {
      await dominoManager.connect(user1).registerAuctionManager();
    });

    it('2.9.1. Lock a domino successfully', async () => {
      await dominoManager.startNewRound(10000, 5, 1);

      await cash.mintFor(user2.address, 10);
      await cash.connect(user2).approve(dominoManager.address, maxUInt256);

      await randomAlgorithm.setFirstValue(1);
      await randomAlgorithm.setSecondValue(2);

      await dominoManager.connect(user2).drawDomino();

      await dominoManager.connect(user1).lockDomino(user2.address, 1, 2);

      const auctionManagerDominoNumber = await dominoManager.currentRoundDominoNumber(user1.address, 1, 2);
      expect(auctionManagerDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` values');

      const userDominoNumber = await dominoManager.currentRoundDominoNumber(user2.address, 1, 2);
      expect(userDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` values');
    });

    it('2.9.2. Lock a domino unsuccessfully due to the caller is not `auctionManager`', async () => {
      await expect(dominoManager.connect(user2).lockDomino(user3.address, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.9.3. Lock a domino unsuccessfully due to no round is available', async () => {
      await expect(dominoManager.connect(user1).lockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.connect(user1).lockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });

    it('2.9.4. Lock a domino unsuccessfully due to the requested account does not have the requested domino', async () => {
      await dominoManager.startNewRound(10000, 1, 1);

      await expect(dominoManager.connect(user1).lockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'DominoManager: The requested account does not have any the requested domino',
      );
    });
  });

  describe('2.10. unlockDomino', async () => {
    beforeEach(async () => {
      await dominoManager.connect(user1).registerAuctionManager();
    });

    it('2.10.1. Unlock a domino successfully', async () => {
      await dominoManager.startNewRound(10000, 5, 1);

      await cash.mintFor(user2.address, 10);
      await cash.connect(user2).approve(dominoManager.address, maxUInt256);

      await randomAlgorithm.setFirstValue(1);
      await randomAlgorithm.setSecondValue(2);

      await dominoManager.connect(user2).drawDomino();

      await dominoManager.connect(user1).lockDomino(user2.address, 1, 2);
      await dominoManager.connect(user1).unlockDomino(user3.address, 1, 2);

      const auctionManagerDominoNumber = await dominoManager.currentRoundDominoNumber(user1.address, 1, 2);
      expect(auctionManagerDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` values');

      const lockingUserDominoNumber = await dominoManager.currentRoundDominoNumber(user2.address, 1, 2);
      expect(lockingUserDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` values');

      const unlockingUserDominoNumber = await dominoManager.currentRoundDominoNumber(user3.address, 1, 2);
      expect(unlockingUserDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` values');
    });

    it('2.10.2. Unlock a domino unsuccessfully due to the caller is not `auctionManager`', async () => {
      await expect(dominoManager.connect(user2).unlockDomino(user3.address, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.10.3. Unlock a domino unsuccessfully due to no round is available', async () => {
      await expect(dominoManager.connect(user1).unlockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.connect(user1).unlockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });

    it('2.10.4. Unlock a domino unsuccessfully due to the requested domino is not locked', async () => {
      await dominoManager.startNewRound(10000, 1, 1);

      await expect(dominoManager.connect(user1).unlockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'DominoManager: The requested domino is not locked',
      );
    });
  });

  describe('2.11. submitDominoChain', async () => {
    beforeEach(async () => {
      await cash.mintFor(user1.address, 10);
      await cash.mintFor(user2.address, 10);
      await cash.connect(user1).approve(dominoManager.address, maxUInt256);
      await cash.connect(user2).approve(dominoManager.address, maxUInt256);
    });

    it('2.11.1. Submit a domino chain successfully', async () => {
      await dominoManager.startNewRound(10000, 11, 1);

      await dominoManager.connect(user1).drawDomino();

      const chain = [0];
      for (let i = 1; i < 11; ++i) {
        chain.push(i);
        await randomAlgorithm.setFirstValue(i - 1);
        await randomAlgorithm.setSecondValue(i);
        await dominoManager.connect(user2).drawDomino();
        await dominoManager.connect(user2).drawDomino();
      }

      await dominoManager.connect(user1).submitDominoChain([0, 0]);
      await dominoManager.connect(user2).submitDominoChain(chain);

      const score1 = await dominoManager.currentRoundScore(user1.address);
      expect(score1).to.equal(1, 'Incorrect `scores` values');

      const score2 = await dominoManager.currentRoundScore(user2.address);
      expect(score2).to.equal(100, 'Incorrect `scores` values');

      const totalScore = (await dominoManager.rounds(1)).totalScore;
      expect(totalScore).to.equal(101, 'Incorrect `totalScore` value');

      let dominoNumber = await dominoManager.currentRoundDominoNumber(user1.address, 0, 0);
      expect(dominoNumber).to.equal(0, 'Incorrect `dominoNumbers` values');

      for (let i = 1; i < 11; ++i) {
        dominoNumber = await dominoManager.currentRoundDominoNumber(user2.address, i - 1, i);
        expect(dominoNumber).to.equal(1, 'Incorrect `dominoNumbers` values');
      }
    });

    it('2.11.2. Submit a domino chain unsuccessfully due to not round is available', async () => {
      await expect(dominoManager.connect(user1).submitDominoChain([])).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.connect(user1).submitDominoChain([])).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });

    it('2.11.3. Submit a domino chain unsuccessfully due to short number list', async () => {
      await dominoManager.startNewRound(10000, 1, 1);

      await expect(dominoManager.connect(user1).submitDominoChain([])).to.be.revertedWith(
        'DominoManager: Chain must contains at least 2 numbers',
      );

      await expect(dominoManager.connect(user1).submitDominoChain([0])).to.be.revertedWith(
        'DominoManager: Chain must contains at least 2 numbers',
      );
    });
  });

  describe('2.12. currentRoundScore', async () => {
    it('2.12.1. Return correct `scores` of users in the current round', async () => {
      const users = [user1, user2, user3];
      await dominoManager.startNewRound(10000, 16, 1);

      for (let i = 0; i < 3; ++i) {
        await cash.mintFor(users[i].address, 10);
        await cash.connect(users[i]).approve(dominoManager.address, maxUInt256);
      }

      const chain = [0];
      let s = 0;

      for (let l = 1; l < 16; ++l) {
        chain.push(l);
        s += l * l;

        for (let i = 1; i <= l; ++i) {
          await randomAlgorithm.setFirstValue(i - 1);
          await randomAlgorithm.setSecondValue(i);

          for (let j = 0; j < 3; ++j) {
            await dominoManager.connect(users[j]).drawDomino();
          }
        }

        for (let i = 0; i < 3; ++i) {
          await dominoManager.connect(users[i]).submitDominoChain(chain);
        }
      }

      for (let i = 0; i < 3; ++i) {
        let score = await dominoManager.currentRoundScore(users[i].address);
        expect(score).to.equal(s, 'Incorrect result');
      }
    });

    it('2.12.1. Revert due to not round is available', async () => {
      await expect(dominoManager.currentRoundScore(user1.address)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );

      await dominoManager.startNewRound(10000, 1, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.currentRoundScore(user1.address)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });
  });

  describe('2.13. withdrawReward', async () => {
    it('2.13.1. Withdraw reward successfully', async () => {
      await cash.mintFor(user1.address, 10);
      await cash.mintFor(user2.address, 10);
      await cash.mintFor(user3.address, 10);
      await cash.connect(user1).approve(dominoManager.address, maxUInt256);
      await cash.connect(user2).approve(dominoManager.address, maxUInt256);
      await cash.connect(user3).approve(dominoManager.address, maxUInt256);

      await dominoManager.startNewRound(10000, 10, '1000000000000000000');

      await drawAndSubmitDominoChain(user1, [3, 1, 6, 5, 8]);
      await drawAndSubmitDominoChain(user1, [7, 8, 2, 2]);
      await drawAndSubmitDominoChain(user2, [0, 9, 4, 3]);
      await drawAndSubmitDominoChain(user3, [1, 1, 1, 1, 1]);

      /*
                Submissions   Committed   Score   Reward    Last balance
        User 1  3-1-6-5-8     4e18        16      4032e15   93e17
                7-8-2-2       3e18        9       2268e15
        User 2  0-9-4-3       3e18        9       2268e15   9268e15
        User 3  1-1-1-1-1     4e18        16      4032e15   10032e15
        Total                 14e18       50      126e17    14e17
       */

      await expectBalance(cash, user1.address, '3000000000000000000');
      await expectBalance(cash, user2.address, '7000000000000000000');
      await expectBalance(cash, user3.address, '6000000000000000000');
      await expectBalance(cash, dominoManager.address, '14000000000000000000');

      let score1 = await dominoManager.currentRoundScore(user1.address);
      expect(score1).to.equal(25, 'Incorrect `scores` values');

      let score2 = await dominoManager.currentRoundScore(user2.address);
      expect(score2).to.equal(9, 'Incorrect `scores` values');

      let score3 = await dominoManager.currentRoundScore(user3.address);
      expect(score3).to.equal(16, 'Incorrect `scores` values');

      let totalScore = (await dominoManager.rounds(1)).totalScore;
      expect(totalScore).to.equal(50, 'Incorrect `totalScore` value');

      await increaseTime(ethers.provider, 10000);

      await dominoManager.connect(user1).withdrawReward(1);
      await dominoManager.connect(user2).withdrawReward(1);
      await dominoManager.startNewRound(10000, 10, 1);
      await dominoManager.connect(user3).withdrawReward(1);

      await expectBalance(cash, user1.address, '9300000000000000000');
      await expectBalance(cash, user2.address, '9268000000000000000');
      await expectBalance(cash, user3.address, '10032000000000000000');
      await expectBalance(cash, dominoManager.address, '1400000000000000000');

      await expect(dominoManager.connect(user1).withdrawReward(1)).to.be.revertedWith(
        'DominoManager: No reward in the requested round to withdraw',
      );

      await expect(dominoManager.connect(user2).withdrawReward(1)).to.be.revertedWith(
        'DominoManager: No reward in the requested round to withdraw',
      );

      await expect(dominoManager.connect(user3).withdrawReward(1)).to.be.revertedWith(
        'DominoManager: No reward in the requested round to withdraw',
      );
    });

    it('2.13.2. Withdraw reward unsuccessfully due to invalid round index', async () => {
      await expect(dominoManager.connect(user1).withdrawReward(100)).to.be.revertedWith(
        'DominoManager: Invalid round index',
      );
    });

    it('2.13.3. Withdraw reward unsuccessfully due to the current round has not ended yet', async () => {
      await dominoManager.startNewRound(10000, 10, 1);
      await expect(dominoManager.connect(user1).withdrawReward(1)).to.be.revertedWith(
        'DominoManager: The requested round has not ended yet',
      );
    });

    it('2.13.4. Withdraw reward unsuccessfully due to score is 0', async () => {
      await dominoManager.startNewRound(10000, 10, 1);

      await increaseTime(ethers.provider, 10000);

      await expect(dominoManager.connect(user1).withdrawReward(1)).to.be.revertedWith(
        'DominoManager: No reward in the requested round to withdraw',
      );
    });
  });

  describe('2.14. withdrawFee', async () => {
    it('2.14.1. Withdraw fee successfully', async () => {
      await cash.mintFor(user1.address, 10);
      await cash.mintFor(user2.address, 10);
      await cash.mintFor(user3.address, 10);
      await cash.connect(user1).approve(dominoManager.address, maxUInt256);
      await cash.connect(user2).approve(dominoManager.address, maxUInt256);
      await cash.connect(user3).approve(dominoManager.address, maxUInt256);

      await dominoManager.startNewRound(10000, 10, '1000000000000000000');

      await drawAndSubmitDominoChain(user1, [3, 1, 6, 5, 8]);
      await drawAndSubmitDominoChain(user1, [7, 8, 2, 2]);
      await drawAndSubmitDominoChain(user2, [0, 9, 4, 3]);
      await drawAndSubmitDominoChain(user3, [1, 1, 1, 1, 1]);

      /*
                Submissions   Committed   Score   Reward    Last balance
        User 1  3-1-6-5-8     4e18        16      4032e15   93e17
                7-8-2-2       3e18        9       2268e15
        User 2  0-9-4-3       3e18        9       2268e15   9268e15
        User 3  1-1-1-1-1     4e18        16      4032e15   10032e15
        Total                 14e18       50      126e17    14e17
       */

      await expectBalance(cash, admin.address, '0');
      await expectBalance(cash, dominoManager.address, '14000000000000000000');

      let fee = await dominoManager.fee();
      expect(fee).to.equal('1400000000000000000', 'Incorrect `fee` value');

      await increaseTime(ethers.provider, 10000);

      await dominoManager.withdrawFee();

      await expectBalance(cash, admin.address, '1400000000000000000')
      await expectBalance(cash, dominoManager.address, '12600000000000000000')

      fee = await dominoManager.fee();
      expect(fee).to.equal('0', 'Incorrect `fee` value');

      await expect(dominoManager.withdrawFee()).to.be.revertedWith(
        'DominoManager: No fee to withdraw',
      );
    });

    it('2.14.2. Withdraw fee unsuccessfully due to the caller is not `admin`', async () => {
      await expect(dominoManager.connect(user1).withdrawFee()).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.14.3. Withdraw fee unsuccessfully due to no fee left', async () => {
      await expect(dominoManager.withdrawFee()).to.be.revertedWith(
        'DominoManager: No fee to withdraw',
      );
    });
  });
});
