const { ethers } = require('hardhat');
const { expect } = require('chai');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const { nullAddress, maxUInt256 } = require('./helper');
const { getEventValues } = require('../common/transaction');
const { EXTENDED_TIMEOUT } = require('./config');

describe('2. Domino', () => {
  async function drawAndSubmitDominoChain(user, chain) {
    for (let i = 1; i < chain.length; ++i) {
      await random.setFirstValue(chain[i - 1]);
      await random.setSecondValue(chain[i]);

      await domino.connect(user).drawDomino();
    }

    await domino.connect(user).submitDominoChain(chain);
  }

  before(async () => {
    Random = await ethers.getContractFactory('Random');
    Domino = await ethers.getContractFactory('Domino');

    MockRandom = await ethers.getContractFactory('MockRandom');
    MockCash = await ethers.getContractFactory('MockCash');

    [admin, user1, user2, user3] = await ethers.getSigners();
  });

  beforeEach(async () => {
    random = await MockRandom.deploy();
    cash = await MockCash.deploy();
    domino = await Domino.deploy(cash.address, random.address);

    await mine(5);
  });

  describe('2.1.constructor', async () => {
    it('2.1.1. Correct `admin` address', async () => {
      const admin = await domino.admin();
      expect(admin).to.equal(admin, 'Incorrect `admin` address');
    });

    it('2.1.2. Correct `cash` address', async () => {
      const cashAddress = await domino.cash();
      expect(cashAddress).to.equal(cash.address, 'Incorrect `cash` address');
    });

    it('2.1.3. Correct `random` address', async () => {
      const randomAddress = await domino.random();
      expect(randomAddress).to.equal(random.address, 'Incorrect `random` address');
    });

    it('2.1.4. Registered in `domino`', async () => {
      const dominoAddress = await random.domino();
      expect(dominoAddress).to.equal(domino.address, 'Incorrect `domino` address in the `Random` contract');
    });

    it('2.1.5. Unregistered `auction` address', async () => {
      const auction = await domino.auction();
      expect(auction).to.equal(nullAddress, 'Initial `auction` address is not null address');
    });

    it('2.1.6. Variables are initially default values', async () => {
      const roundNumber = await domino.roundNumber();
      expect(roundNumber).to.equal(0, 'Initial `roundNumber` is not 0');

      const fee = await domino.fee();
      expect(fee).to.equal(0, 'Initial `fee` is not 0');
    });
  });

  describe('2.2. transferAdministration', async () => {
    it('2.2.1. Transfer administration successfully', async () => {
      await domino.transferAdministration(user1.address);
      const adminAddress = await domino.admin();
      expect(adminAddress).to.equal(user1.address, 'Incorrect `admin` address');
    });

    it('2.2.2. Transfer administration unsuccessfully due to the caller is not `admin`', async () => {
      await expect(domino.connect(user1).transferAdministration(user2.address)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.2.3. Transfer administration unsuccessfully due to transferring to null address', async () => {
      await expect(domino.transferAdministration(nullAddress)).to.be.revertedWith(
        'Domino: Prohibited null address',
      );
    });

    it('2.2.4. Transfer administration unsuccessfully due to transferring to the current `admin` address', async () => {
      await expect(domino.transferAdministration(admin.address)).to.be.revertedWith(
        'Domino: The new admin is identical to the current admin',
      );
    });
  });

  describe('2.3. replaceRandomAlgorithm', async () => {
    it('2.3.1. Replace `Random` algorithm successfully', async () => {
      const newRandom = await Random.deploy();
      await domino.replaceRandomAlgorithm(newRandom.address);

      const randomAddress = await domino.random();
      expect(randomAddress).to.equal(newRandom.address, 'Incorrect new `random` address');

      const dominoAddress = await random.domino();
      expect(dominoAddress).to.equal(domino.address, 'Incorrect `domino` address');
    });

    it('2.3.2. Replace Random algorithm unsuccessfully due to the caller is not `admin`', async () => {
      await expect(domino.connect(user1).replaceRandomAlgorithm(user2.address)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.3.3. Replace Random algorithm unsuccessfully due to the current round has not ended yet', async () => {
      await domino.startNewRound(10000, 1, 1);
      await expect(domino.replaceRandomAlgorithm(user1.address)).to.be.revertedWith(
        'Domino: The current round has not ended yet',
      );
    });

    it('2.3.4. Replace Random algorithm unsuccessfully due to replacing with null address', async () => {
      await expect(domino.replaceRandomAlgorithm(nullAddress)).to.be.revertedWith(
        'Domino: Prohibited null address',
      );
    });

    it('2.3.5. Replace Random algorithm unsuccessfully due to replacing with the current `random` address', async () => {
      await expect(domino.replaceRandomAlgorithm(random.address)).to.be.revertedWith(
        'Domino: The new random contract is identical to the current one',
      );
    });
  });

  describe('2.4. registerAuction', async () => {
    it('2.4.1. Register `Auction` contract successfully', async () => {
      await domino.connect(user1).registerAuction();
      const auction = await domino.auction();
      expect(auction).to.equal(user1.address, 'Incorrect `auction` address');
    });

    it('2.4.2. Register `Auction` contract only once', async () => {
      await domino.connect(user1).registerAuction();
      await expect(domino.connect(user2).registerAuction()).to.be.revertedWith(
        'Domino: Auction has already been registered',
      );
    });
  });

  describe('2.5. startNewRound', async () => {
    it('2.5.1. Start a new round successfully', async () => {
      const duration = 1000;
      const dominoSize = 10;
      const drawPrice = 100;

      const response = await domino.startNewRound(
        duration,
        dominoSize,
        drawPrice,
      );

      const roundNumber = await domino.roundNumber();
      expect(roundNumber).to.equal(1, 'Incorrect `roundNumber` value');

      const round = await domino.rounds(1);

      const startTimestamp = (await ethers.provider.getBlock(response.blockNumber)).timestamp;
      expect(round.startTimestamp).to.equal(startTimestamp, 'Incorrect `startTimestamp` value');

      const endTimestamp = startTimestamp + duration;
      expect(round.endTimestamp).to.equal(endTimestamp, 'Incorrect `endTimestamp` value');

      expect(round.dominoSize).to.equal(dominoSize, 'Incorrect `dominoSize` value');
      expect(round.drawPrice).to.equal(drawPrice, 'Incorrect `drawPrice` value');
    });

    it('2.5.2. Start a new round unsuccessfully due to the caller is not `admin`', async () => {
      await expect(domino.connect(user1).startNewRound(0, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.5.3. Start a new round unsuccessfully due to the current round has not ended yet', async () => {
      await domino.startNewRound(10000, 1, 1);
      await expect(domino.connect(user1).startNewRound(0, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.5.4. Start a new round unsuccessfully due to the duration is 0', async () => {
      await expect(domino.startNewRound(0, 0, 0)).to.be.revertedWith(
        'Domino: The duration must be greater than 0',
      );
    });

    it('2.5.5. Start a new round unsuccessfully due to the domino size is 0', async () => {
      await expect(domino.startNewRound(10000, 0, 0)).to.be.revertedWith(
        'Domino: The domino size must be greater than 0',
      );
    });

    it('2.5.6. Start a new round unsuccessfully due to the draw price is 0', async () => {
      await expect(domino.startNewRound(10000, 10, 0)).to.be.revertedWith(
        'Domino: The draw price must be greater than 0',
      );
    });
  });

  describe('2.6. currentRoundEndTimestamp', async () => {
    it('2.6.1. Return correct `endTimestamp` of the current round', async () => {
      await domino.startNewRound(10000, 1, 1);

      const round = await domino.rounds(1);
      let endTimestamp = await domino.currentRoundEndTimestamp();
      expect(endTimestamp).to.equal(round.endTimestamp, 'Incorrect result');
    });

    it('2.6.2. Revert due to no round is available', async () => {
      await expect(domino.currentRoundEndTimestamp()).revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.currentRoundEndTimestamp()).revertedWith(
        'Domino: No round is available at the moment',
      );
    });
  });

  describe('2.7. drawDomino', async () => {
    beforeEach(async () => {
      await cash.mintFor(user1.address, 10);
      await cash.connect(user1).approve(domino.address, maxUInt256);
    });

    it('2.7.1. Draw a domino successfully', async () => {
      await domino.startNewRound(10000, 10, '2000000000000000000');

      await random.setFirstValue(1);
      await random.setSecondValue(2);

      await domino.connect(user1).drawDomino();
      await domino.connect(user1).drawDomino();

      const fee = await domino.fee();
      expect(fee).to.equal('400000000000000000', 'Incorrect `fee` value');

      const totalReward = (await domino.rounds(1)).totalReward;
      expect(totalReward).to.equal('3600000000000000000', 'Incorrect `totalReward` value');

      const dominoNumber = await domino.currentRoundDominoNumber(user1.address, 1, 2);
      expect(dominoNumber).to.equal(2, 'Incorrect `dominoNumbers`');

      const userBalance = await cash.balanceOf(user1.address);
      expect(userBalance).to.equal('6000000000000000000', 'Incorrect balance');

      const contractBalance = await cash.balanceOf(domino.address);
      expect(contractBalance).to.equal('4000000000000000000', 'Incorrect balance');
    });

    it('2.7.2. Draw a domino unsuccessfully due to no round is available', async () => {
      await expect(domino.connect(user1).drawDomino()).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.connect(user1).drawDomino()).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );
    });

    it('2.7.3. Draw a domino unsuccessfully due to insufficient balance', async () => {
      await domino.startNewRound(10000, 10, '20000000000000000000');

      await expect(domino.connect(user1).drawDomino()).to.be.revertedWith(
        'ERC20: transfer amount exceeds balance',
      );
    });
  });

  describe('2.8. currentRoundDominoNumber', async () => {
    it('2.8.1. Return correct `dominoNumbers` of users in the current round', async () => {
      await domino.replaceRandomAlgorithm((await Random.deploy()).address);
      await domino.startNewRound(10000, 5, 1);

      const c = {};
      const users = [user1, user2, user3];

      for (let i = 0; i < 3; ++i) {
        await cash.mintFor(users[i].address, 10);
        await cash.connect(users[i]).approve(domino.address, maxUInt256);

        for (let x = 0; x < 5; ++x) {
          for (let y = 0; y < 5; ++y) {
            c[[i, x, y]] = 0;
          }
        }
      }

      for (let _ = 0; _ < 200; ++_) {
        for (let i = 0; i < 3; ++i) {
          const { firstNumber, secondNumber } = (await getEventValues(domino.connect(users[i]).drawDomino()))[3];
          c[[i, firstNumber, secondNumber]]++;
        }
      }

      for (let i = 0; i < 3; ++i) {
        for (let x = 0; x < 5; ++x) {
          for (let y = 0; y < 5; ++y) {
            const dominoNumber = await domino.currentRoundDominoNumber(users[i].address, x, y);
            expect(dominoNumber).to.equal(c[[i, x, y]], 'Incorrect result');
          }
        }
      }
    }).timeout(EXTENDED_TIMEOUT);

    it('2.8.2. Revert due to no round is available', async () => {
      await expect(domino.currentRoundDominoNumber(user1.address, 0, 0)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.currentRoundDominoNumber(user1.address, 0, 0)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );
    });
  });

  describe('2.9. lockDomino', async () => {
    beforeEach(async () => {
      await domino.connect(user1).registerAuction();
    });

    it('2.9.1. Lock a domino successfully', async () => {
      await domino.startNewRound(10000, 5, 1);

      await cash.mintFor(user2.address, 10);
      await cash.connect(user2).approve(domino.address, maxUInt256);

      await random.setFirstValue(1);
      await random.setSecondValue(2);

      await domino.connect(user2).drawDomino();

      await domino.connect(user1).lockDomino(user2.address, 1, 2);

      const auctionDominoNumber = await domino.currentRoundDominoNumber(user1.address, 1, 2);
      expect(auctionDominoNumber).to.equal(1, 'Incorrect `dominoNumbers`');

      const userDominoNumber = await domino.currentRoundDominoNumber(user2.address, 1, 2);
      expect(userDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` of the user');
    });

    it('2.9.2. Lock a domino unsuccessfully due to the caller is not `auction`', async () => {
      await expect(domino.connect(user2).lockDomino(user3.address, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.9.3. Lock a domino unsuccessfully due to no round is available', async () => {
      await expect(domino.connect(user1).lockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.connect(user1).lockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );
    });

    it('2.9.4. Lock a domino unsuccessfully due to the requested account does not have the requested domino', async () => {
      await domino.startNewRound(10000, 1, 1);

      await expect(domino.connect(user1).lockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'Domino: The requested account does not have any the requested domino',
      );
    });
  });

  describe('2.10. unlockDomino', async () => {
    beforeEach(async () => {
      await domino.connect(user1).registerAuction();
    });

    it('2.10.1. Unlock a domino successfully', async () => {
      await domino.startNewRound(10000, 5, 1);

      await cash.mintFor(user2.address, 10);
      await cash.connect(user2).approve(domino.address, maxUInt256);

      await random.setFirstValue(1);
      await random.setSecondValue(2);

      await domino.connect(user2).drawDomino();

      await domino.connect(user1).lockDomino(user2.address, 1, 2);
      await domino.connect(user1).unlockDomino(user3.address, 1, 2);

      const auctionDominoNumber = await domino.currentRoundDominoNumber(user1.address, 1, 2);
      expect(auctionDominoNumber).to.equal(0, 'Incorrect `dominoNumbers`');

      const lockingUserDominoNumber = await domino.currentRoundDominoNumber(user2.address, 1, 2);
      expect(lockingUserDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` of the user');

      const unlockingUserDominoNumber = await domino.currentRoundDominoNumber(user3.address, 1, 2);
      expect(unlockingUserDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` of the user');
    });

    it('2.10.2. Unlock a domino unsuccessfully due to the caller is not `auction`', async () => {
      await expect(domino.connect(user2).unlockDomino(user3.address, 0, 0)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.10.3. Unlock a domino unsuccessfully due to no round is available', async () => {
      await expect(domino.connect(user1).unlockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.connect(user1).unlockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );
    });

    it('2.10.4. Unlock a domino unsuccessfully due to the requested domino is not locked', async () => {
      await domino.startNewRound(10000, 1, 1);

      await expect(domino.connect(user1).unlockDomino(user2.address, 0, 0)).to.be.revertedWith(
        'Domino: The requested domino is not locked',
      );
    });
  });

  describe('2.11. submitDominoChain', async () => {
    beforeEach(async () => {
      await cash.mintFor(user1.address, 10);
      await cash.mintFor(user2.address, 10);
      await cash.connect(user1).approve(domino.address, maxUInt256);
      await cash.connect(user2).approve(domino.address, maxUInt256);
    });

    it('2.11.1. Submit a domino chain successfully', async () => {
      await domino.startNewRound(10000, 11, 1);

      await domino.connect(user1).drawDomino();

      const chain = [0];
      for (let i = 1; i < 11; ++i) {
        chain.push(i);
        await random.setFirstValue(i - 1);
        await random.setSecondValue(i);
        await domino.connect(user2).drawDomino();
        await domino.connect(user2).drawDomino();
      }

      await domino.connect(user1).submitDominoChain([0, 0]);
      await domino.connect(user2).submitDominoChain(chain);

      const score1 = await domino.currentRoundScore(user1.address);
      expect(score1).to.equal(1, 'Incorrect `scores`');

      const score2 = await domino.currentRoundScore(user2.address);
      expect(score2).to.equal(100, 'Incorrect `scores`');

      const totalScore = (await domino.rounds(1)).totalScore;
      expect(totalScore).to.equal(101, 'Incorrect `totalScore`');

      let dominoNumber = await domino.currentRoundDominoNumber(user1.address, 0, 0);
      expect(dominoNumber).to.equal(0, 'Incorrect `dominoNumbers`');

      for (let i = 1; i < 11; ++i) {
        dominoNumber = await domino.currentRoundDominoNumber(user2.address, i - 1, i);
        expect(dominoNumber).to.equal(1, 'Incorrect `dominoNumbers`');
      }
    });

    it('2.11.2. Submit a domino chain unsuccessfully due to not round is available', async () => {
      await expect(domino.connect(user1).submitDominoChain([])).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.connect(user1).submitDominoChain([])).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );
    });

    it('2.11.3. Submit a domino chain unsuccessfully due to short number list', async () => {
      await domino.startNewRound(10000, 1, 1);

      await expect(domino.connect(user1).submitDominoChain([])).to.be.revertedWith(
        'Domino: Chain must contains at least 2 numbers',
      );

      await expect(domino.connect(user1).submitDominoChain([0])).to.be.revertedWith(
        'Domino: Chain must contains at least 2 numbers',
      );
    });
  });

  describe('2.12. currentRoundScore', async () => {
    it('2.12.1. Return correct `scores` of users in the current round', async () => {
      const users = [user1, user2, user3];
      await domino.startNewRound(10000, 16, 1);

      for (let i = 0; i < 3; ++i) {
        await cash.mintFor(users[i].address, 10);
        await cash.connect(users[i]).approve(domino.address, maxUInt256);
      }

      const chain = [0];
      let s = 0;

      for (let l = 1; l < 16; ++l) {
        chain.push(l);
        s += l * l;

        for (let i = 1; i <= l; ++i) {
          await random.setFirstValue(i - 1);
          await random.setSecondValue(i);

          for (let j = 0; j < 3; ++j) {
            await domino.connect(users[j]).drawDomino();
          }
        }

        for (let i = 0; i < 3; ++i) {
          await domino.connect(users[i]).submitDominoChain(chain);
        }
      }

      for (let i = 0; i < 3; ++i) {
        let score = await domino.currentRoundScore(users[i].address);
        expect(score).to.equal(s, 'Incorrect result');
      }
    });

    it('2.12.1. Revert due to not round is available', async () => {
      await expect(domino.currentRoundScore(user1.address)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );

      await domino.startNewRound(10000, 1, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.currentRoundScore(user1.address)).to.be.revertedWith(
        'Domino: No round is available at the moment',
      );
    });
  });

  describe('2.13. withdrawReward', async () => {
    it('2.13.1. withdraw reward successfully', async () => {
      await cash.mintFor(user1.address, 10);
      await cash.mintFor(user2.address, 10);
      await cash.mintFor(user3.address, 10);
      await cash.connect(user1).approve(domino.address, maxUInt256);
      await cash.connect(user2).approve(domino.address, maxUInt256);
      await cash.connect(user3).approve(domino.address, maxUInt256);

      await domino.startNewRound(10000, 10, '1000000000000000000');

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

      let balance1 = await cash.balanceOf(user1.address);
      expect(balance1).to.equal('3000000000000000000', 'Incorrect balance');

      let balance2 = await cash.balanceOf(user2.address);
      expect(balance2).to.equal('7000000000000000000', 'Incorrect balance');

      let balance3 = await cash.balanceOf(user3.address);
      expect(balance3).to.equal('6000000000000000000', 'Incorrect balance');

      let contractBalance = await cash.balanceOf(domino.address);
      expect(contractBalance).to.equal('14000000000000000000', 'Incorrect balance');

      let score1 = await domino.currentRoundScore(user1.address);
      expect(score1).to.equal(25, 'Incorrect `scores`');

      let score2 = await domino.currentRoundScore(user2.address);
      expect(score2).to.equal(9, 'Incorrect `scores`');

      let score3 = await domino.currentRoundScore(user3.address);
      expect(score3).to.equal(16, 'Incorrect `scores`');

      let totalScore = (await domino.rounds(1)).totalScore;
      expect(totalScore).to.equal(50, 'Incorrect `totalScore`');

      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await domino.connect(user1).withdrawReward(1);
      await domino.connect(user2).withdrawReward(1);
      await domino.startNewRound(10000, 10, 1);
      await domino.connect(user3).withdrawReward(1);

      balance1 = await cash.balanceOf(user1.address);
      expect(balance1).to.equal('9300000000000000000', 'Incorrect balance');

      balance2 = await cash.balanceOf(user2.address);
      expect(balance2).to.equal('9268000000000000000', 'Incorrect balance');

      balance3 = await cash.balanceOf(user3.address);
      expect(balance3).to.equal('10032000000000000000', 'Incorrect balance');

      contractBalance = await cash.balanceOf(domino.address);
      expect(contractBalance).to.equal('1400000000000000000', 'Incorrect balance');

      await expect(domino.connect(user1).withdrawReward(1)).to.be.revertedWith(
        'Domino: No reward in the requested round to withdraw',
      );

      await expect(domino.connect(user2).withdrawReward(1)).to.be.revertedWith(
        'Domino: No reward in the requested round to withdraw',
      );

      await expect(domino.connect(user3).withdrawReward(1)).to.be.revertedWith(
        'Domino: No reward in the requested round to withdraw',
      );
    });

    it('2.13.2. Withdraw reward unsuccessfully due to invalid round index', async () => {
      await expect(domino.connect(user1).withdrawReward(100)).to.be.revertedWith(
        'Domino: Invalid round index',
      );
    });

    it('2.13.3. Withdraw reward unsuccessfully due to the current round has not ended yet', async () => {
      await domino.startNewRound(10000, 10, 1);
      await expect(domino.connect(user1).withdrawReward(1)).to.be.revertedWith(
        'Domino: The requested round has not ended yet',
      );
    });

    it('2.13.4. Withdraw reward unsuccessfully due to score is 0', async () => {
      await domino.startNewRound(10000, 10, 1);
      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await expect(domino.connect(user1).withdrawReward(1)).to.be.revertedWith(
        'Domino: No reward in the requested round to withdraw',
      );
    });
  });

  describe('2.14. withdrawFee', async () => {
    it('2.14.1. withdraw fee successfully', async () => {
      await cash.mintFor(user1.address, 10);
      await cash.mintFor(user2.address, 10);
      await cash.mintFor(user3.address, 10);
      await cash.connect(user1).approve(domino.address, maxUInt256);
      await cash.connect(user2).approve(domino.address, maxUInt256);
      await cash.connect(user3).approve(domino.address, maxUInt256);

      await domino.startNewRound(10000, 10, '1000000000000000000');

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

      let adminBalance = await cash.balanceOf(admin.address);
      expect(adminBalance).to.equal('0', 'Incorrect balance');

      let contractBalance = await cash.balanceOf(domino.address);
      expect(contractBalance).to.equal('14000000000000000000', 'Incorrect balance');

      let fee = await domino.fee();
      expect(fee).to.equal('1400000000000000000', 'Incorrect `fee`');

      await ethers.provider.send('evm_increaseTime', [20000]);
      await mine(10);

      await domino.withdrawFee();

      adminBalance = await cash.balanceOf(admin.address);
      expect(adminBalance).to.equal('1400000000000000000', 'Incorrect balance');

      contractBalance = await cash.balanceOf(domino.address);
      expect(contractBalance).to.equal('12600000000000000000', 'Incorrect balance');

      fee = await domino.fee();
      expect(fee).to.equal('0', 'Incorrect `fee`');

      await expect(domino.withdrawFee()).to.be.revertedWith(
        'Domino: No fee to withdraw',
      );
    });

    it('2.14.2. withdraw fee unsuccessfully due to the caller is not `admin`', async () => {
      await expect(domino.connect(user1).withdrawFee()).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('2.14.3. withdraw fee unsuccessfully due to no fee left', async () => {
      await expect(domino.withdrawFee()).to.be.revertedWith(
        'Domino: No fee to withdraw',
      );
    });
  });
});
