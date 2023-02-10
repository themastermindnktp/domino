const { ethers } = require('hardhat');
const { expect } = require('chai');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

const { nullAddress, maxUInt256, increaseTime, expectBalance } = require('./helper');

describe('3. AuctionManager', async () => {
  before(async () => {
    RandomAlgorithm = await ethers.getContractFactory('RandomAlgorithm');
    DominoManager = await ethers.getContractFactory('DominoManager');
    AuctionManager = await ethers.getContractFactory('AuctionManager');

    MockRandomAlgorithm = await ethers.getContractFactory('MockRandomAlgorithm');
    MockCash = await ethers.getContractFactory('MockCash');

    [admin, seller, user1, user2] = await ethers.getSigners();
  });

  beforeEach(async () => {
    randomAlgorithm = await MockRandomAlgorithm.deploy();
    cash = await MockCash.deploy();
    dominoManager = await DominoManager.deploy(cash.address, randomAlgorithm.address);
    auctionManager = await AuctionManager.deploy(cash.address, dominoManager.address);

    await cash.mintFor(seller.address, 10);
    await cash.mintFor(user1.address, 10);
    await cash.mintFor(user2.address, 10);

    await cash.connect(seller).approve(dominoManager.address, maxUInt256);
    await cash.connect(user1).approve(dominoManager.address, maxUInt256);
    await cash.connect(user2).approve(dominoManager.address, maxUInt256);

    await cash.connect(seller).approve(auctionManager.address, maxUInt256);
    await cash.connect(user1).approve(auctionManager.address, maxUInt256);
    await cash.connect(user2).approve(auctionManager.address, maxUInt256);

    await dominoManager.startNewRound(10000, 10, 1);

    await randomAlgorithm.setFirstValue(1);
    await randomAlgorithm.setSecondValue(2);

    await dominoManager.connect(seller).drawDomino();

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

  describe('3.2. transferAdministration', async () => {
    it('3.2.1. Transfer administration successfully', async () => {
      await auctionManager.transferAdministration(seller.address);
      const adminAddress = await auctionManager.admin();
      expect(adminAddress).to.equal(seller.address, 'Incorrect `admin` address');
    });

    it('3.2.2. Transfer administration unsuccessfully due to the caller is not `admin`', async () => {
      await expect(auctionManager.connect(seller).transferAdministration(user1.address)).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('3.2.3. Transfer administration unsuccessfully due to transferring to null address', async () => {
      await expect(auctionManager.transferAdministration(nullAddress)).to.be.revertedWith(
        'AuctionManager: Prohibited null address',
      );
    });

    it('3.2.4. Transfer administration unsuccessfully due to transferring to the current `admin` address', async () => {
      await expect(auctionManager.transferAdministration(admin.address)).to.be.revertedWith(
        'AuctionManager: The new admin is identical to the current admin',
      );
    });
  });

  describe('3.3. startNewAuction', async () => {
    it('3.3.1. Start a new auction successfully', async () => {
      const firstNumber = 1;
      const secondNumber = 2;
      const duration = 1000;
      const initialPrice = 1000000;

      const response = await auctionManager.connect(seller).startNewAuction(
        firstNumber,
        secondNumber,
        duration,
        initialPrice,
      );

      const auctionNumber = await auctionManager.auctionNumber();
      expect(auctionNumber).to.equal(1, 'Incorrect `auctionNumber` value');

      const auction = await auctionManager.auctions(1);

      const startTimestamp = (await ethers.provider.getBlock(response.blockNumber)).timestamp;
      expect(auction.startTimestamp).to.equal(startTimestamp, 'Incorrect `startTimestamp` value');

      const endTimestamp = startTimestamp + duration;
      expect(auction.endTimestamp).to.equal(endTimestamp, 'Incorrect `endTimestamp` value');

      expect(auction.seller).to.equal(seller.address, 'Incorrect `seller` address');
      expect(auction.firstNumber).to.equal(firstNumber, 'Incorrect `firstNumber` value');
      expect(auction.secondNumber).to.equal(secondNumber, 'Incorrect `secondNumber` value');
      expect(auction.highestBidder).to.equal(nullAddress, 'Incorrect `highestBidder` address');
      expect(auction.highestBid).to.equal(initialPrice, 'Incorrect `highestBid` value');
      expect(auction.dominoRetrieved).to.equal(false, 'Incorrect `dominoRetrieved` value');
      expect(auction.bidWithdrawn).to.equal(false, 'Incorrect `bidWithdrawn` value');

      const userDominoNumber = await dominoManager.currentRoundDominoNumber(seller.address, firstNumber, secondNumber);
      expect(userDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` value');

      const auctionManagerDominoNumber = await dominoManager.currentRoundDominoNumber(auctionManager.address, firstNumber, secondNumber);
      expect(auctionManagerDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` value');
    });

    it('3.3.2. Start a new auction unsuccessfully due to the duration is 0', async () => {
      await expect(auctionManager.startNewAuction(0, 0, 0, 0)).to.be.revertedWith(
        'AuctionManager: The duration must be greater than 0',
      );
    });

    it('3.3.3. Start a new auction unsuccessfully due to no round is available', async () => {
      await increaseTime(ethers.provider, 10000);

      await expect(auctionManager.startNewAuction(0, 0, 1000, 0)).to.be.revertedWith(
        'DominoManager: No round is available at the moment',
      );
    });

    it('3.3.4. Start a new auction unsuccessfully due to the requested auction ends later than the current round', async () => {
      await expect(auctionManager.startNewAuction(0, 0, 20000, 0)).to.be.revertedWith(
        'AuctionManager: Auction must end before the current round does',
      );
    });

    it('3.3.5. Start a new auction unsuccessfully due to the caller does not have the request domino', async () => {
      await expect(auctionManager.startNewAuction(0, 0, 1000, 0)).to.be.revertedWith(
        'DominoManager: The requested account does not have any the requested domino',
      );
    });
  });

  describe('3.4. cancelAuction', async () => {
    beforeEach(async () => {
      await auctionManager.connect(seller).startNewAuction(1, 2, 1000, 0);
    });

    it('3.4.1. Cancel auction successfully', async () => {
      await auctionManager.connect(seller).cancelAuction(1);

      const auction = await auctionManager.auctions(1);

      expect(auction.startTimestamp).to.equal(0, 'Storage has not been deleted');
      expect(auction.endTimestamp).to.equal(0, 'Storage has not been deleted');
      expect(auction.seller).to.equal(nullAddress, 'Storage has not been deleted');
      expect(auction.firstNumber).to.equal(0, 'Storage has not been deleted');
      expect(auction.secondNumber).to.equal(0, 'Storage has not been deleted');
      expect(auction.highestBidder).to.equal(nullAddress, 'Storage has not been deleted');
      expect(auction.highestBid).to.equal(0, 'Storage has not been deleted');
      expect(auction.dominoRetrieved).to.equal(false, 'Storage has not been deleted');
      expect(auction.bidWithdrawn).to.equal(false, 'Storage has not been deleted');

      const userDominoNumber = await dominoManager.currentRoundDominoNumber(seller.address, 1, 2);
      expect(userDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` value');

      const auctionManagerDominoNumber = await dominoManager.currentRoundDominoNumber(auctionManager.address, 1, 2);
      expect(auctionManagerDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` value');
    });

    it('3.4.2. Cancel auction unsuccessfully due to invalid auction index', async () => {
      await expect(auctionManager.cancelAuction(2)).to.be.revertedWith(
        'AuctionManager: Invalid auction index',
      );
    });

    it('3.4.3. Cancel auction unsuccessfully due to the requested auction has already been cancelled', async () => {
      await auctionManager.connect(seller).cancelAuction(1);

      await expect(auctionManager.connect(seller).cancelAuction(1)).to.be.revertedWith(
        'AuctionManager: The requested auction has been cancelled',
      );
    });

    it('3.4.4. Cancel auction unsuccessfully due to the caller is not the seller', async () => {
      await expect(auctionManager.cancelAuction(1)).to.be.revertedWith(
        'AuctionManager: Unauthorized',
      );
    });

    it('3.4.5. Cancel auction unsuccessfully due to the auction has already ended', async () => {
      await increaseTime(ethers.provider, 10000);

      await expect(auctionManager.connect(seller).cancelAuction(1)).to.be.revertedWith(
        'AuctionManager: The request auction has already ended',
      );
    });

    it('3.4.6. Cancel auction unsuccessfully due to there was bidding', async () => {
      await auctionManager.connect(user1).bid(1, 100);

      await expect(auctionManager.connect(seller).cancelAuction(1)).to.be.revertedWith(
        'AuctionManager: Can no longer cancel since there was bidding',
      );
    });
  });

  describe('3.5. bid', async () => {
    beforeEach(async () => {
      await auctionManager.connect(seller).startNewAuction(1, 2, 1000, 100);
    });

    it('3.5.1. Bid successfully', async () => {
      await expectBalance(cash, seller.address, '9999999999999999999');

      // user1
      await auctionManager.connect(user1).bid(1, 200);
      await expectBalance(cash, user1.address, '9999999999999999800');
      await expectBalance(cash, auctionManager.address, '200');

      let auction = await auctionManager.auctions(1);
      expect(auction.highestBidder).to.equal(user1.address, 'Incorrect `highestBidder` address');
      expect(auction.highestBid).to.equal(200, 'Incorrect `highestBid` value');

      // seller = Seller
      await auctionManager.connect(seller).bid(1, 300);
      await expectBalance(cash, seller.address, '9999999999999999699');
      await expectBalance(cash, user1.address, '10000000000000000000');
      await expectBalance(cash, auctionManager.address, '300');

      auction = await auctionManager.auctions(1);
      expect(auction.highestBidder).to.equal(seller.address, 'Incorrect `highestBidder` address');
      expect(auction.highestBid).to.equal(300, 'Incorrect `highestBid` value');

      // user2
      await auctionManager.connect(user2).bid(1, 400);
      await expectBalance(cash, user2.address, '9999999999999999600');
      await expectBalance(cash, seller.address, '9999999999999999999');
      await expectBalance(cash, auctionManager.address, '400');

      auction = await auctionManager.auctions(1);
      expect(auction.highestBidder).to.equal(user2.address, 'Incorrect `highestBidder` address');
      expect(auction.highestBid).to.equal(400, 'Incorrect `highestBid` value');

      // user2 bids higher
      await auctionManager.connect(user2).bid(1, 500);
      await expectBalance(cash, user2.address, '9999999999999999500');
      await expectBalance(cash, auctionManager.address, '500');

      auction = await auctionManager.auctions(1);
      expect(auction.highestBidder).to.equal(user2.address, 'Incorrect `highestBidder` address');
      expect(auction.highestBid).to.equal(500, 'Incorrect `highestBid` value');
    });

    it('3.5.2. Bid unsuccessfully due to invalid auction index', async () => {
      await expect(auctionManager.bid(2, 0)).to.be.revertedWith(
        'AuctionManager: Invalid auction index',
      );
    });

    it('3.5.3. Bid unsuccessfully due to the auction has been cancelled', async () => {
      await auctionManager.connect(seller).cancelAuction(1);

      await expect(auctionManager.bid(1, 0)).to.be.revertedWith(
        'AuctionManager: The requested auction has been cancelled',
      );
    });

    it('3.5.4. Bid unsuccessfully due to the auction has ended', async () => {
      await increaseTime(ethers.provider, 10000);

      await expect(auctionManager.bid(1, 0)).to.be.revertedWith(
        'AuctionManager: The requested auction has ended',
      );
    });

    it('3.5.5. Bid unsuccessfully due to bidding lower than highest bid', async () => {
      await expect(auctionManager.bid(1, 50)).to.be.revertedWith(
        'AuctionManager: Must bid higher than the current highest one',
      );

      await auctionManager.connect(user1).bid(1, 200);

      await expect(auctionManager.bid(1, 150)).to.be.revertedWith(
        'AuctionManager: Must bid higher than the current highest one',
      );
    });
  });

  describe('3.6. retrieveDomino', async () => {
    beforeEach(async () => {
      await auctionManager.connect(seller).startNewAuction(1, 2, 1000, 100);
    });

    it('3.6.1. Retrieve domino successfully by the seller when no one bid', async () => {
      await increaseTime(ethers.provider, 1000);

      await auctionManager.connect(seller).retrieveDomino(1);

      const auction = await auctionManager.auctions(1);
      expect(auction.dominoRetrieved).to.equal(true, 'Incorrect `dominoRetrieved` value');

      const sellerDominoNumber = await dominoManager.currentRoundDominoNumber(seller.address, 1, 2);
      expect(sellerDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` value');

      const auctionManagerDominoNumber = await dominoManager.currentRoundDominoNumber(auctionManager.address, 1, 2);
      expect(auctionManagerDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` value');
    });

    it('3.6.2. Retrieve domino successfully by the highest bidder', async () => {
      await auctionManager.connect(user1).bid(1, 200);

      await increaseTime(ethers.provider, 1000);

      await auctionManager.connect(user1).retrieveDomino(1);

      const auction = await auctionManager.auctions(1);
      expect(auction.dominoRetrieved).to.equal(true, 'Incorrect `dominoRetrieved` value');

      const highestBidderDominoNumber = await dominoManager.currentRoundDominoNumber(user1.address, 1, 2);
      expect(highestBidderDominoNumber).to.equal(1, 'Incorrect `dominoNumbers` value');

      const auctionManagerDominoNumber = await dominoManager.currentRoundDominoNumber(auctionManager.address, 1, 2);
      expect(auctionManagerDominoNumber).to.equal(0, 'Incorrect `dominoNumbers` value');
    });

    it('3.6.3. Retrieve domino unsuccessfully due to invalid auction index', async () => {
      await expect(auctionManager.retrieveDomino(2)).to.be.revertedWith(
        'AuctionManager: Invalid auction index',
      );
    });

    it('3.6.4. Retrieve domino unsuccessfully due to the auction has been cancelled', async () => {
      await auctionManager.connect(seller).cancelAuction(1);

      await expect(auctionManager.retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: The requested auction has been cancelled',
      );
    });

    it('3.6.5. Retrieve domino unsuccessfully due to the caller is not the highest bidder', async () => {
      await auctionManager.connect(user1).bid(1, 200);

      await increaseTime(ethers.provider, 1000);

      await expect(auctionManager.connect(seller).retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: Unauthorized',
      );

      await expect(auctionManager.connect(user2).retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: Unauthorized',
      );
    });

    it('3.6.6. Retrieve domino unsuccessfully due to the auction has not ended yet', async () => {
      await expect(auctionManager.connect(seller).retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: This auction has not ended yet',
      );

      await auctionManager.connect(user1).bid(1, 200);

      await expect(auctionManager.connect(user1).retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: This auction has not ended yet',
      );
    });

    it('3.6.7. Retrieve domino unsuccessfully due to the domino has already been retrieved', async () => {
      await auctionManager.connect(user1).bid(1, 200);

      await increaseTime(ethers.provider, 1000);

      await auctionManager.connect(user1).retrieveDomino(1);

      await expect(auctionManager.connect(user1).retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: The domino has already been retrieved',
      );
    });
  });

  describe('3.7. withdrawBid', async () => {
    beforeEach(async () => {
      await auctionManager.connect(seller).startNewAuction(1, 2, 1000, 100);
    });

    it('3.7.1. Withdraw bid successfully', async () => {
      /*
        bid = 2e18
        fee = 2e16
        bidAfterFee = 198e16
        sellerBalance (before withdrawal) = 1e19 - 1
        sellerBalance (after withdrawal) = 1198e19 - 1
        auctionManager (after withdrawal) = 2e16
       */

      await auctionManager.connect(user1).bid(1, '2000000000000000000');

      await increaseTime(ethers.provider, 1000);

      await expectBalance(cash, seller.address, '9999999999999999999');
      await expectBalance(cash, auctionManager.address, '2000000000000000000');

      await auctionManager.connect(seller).withdrawBid(1);

      await expectBalance(cash, seller.address, '11979999999999999999');
      await expectBalance(cash, auctionManager.address, '20000000000000000');

      const auction = await auctionManager.auctions(1);
      expect(auction.bidWithdrawn).to.equal(true, 'Incorrect `dominoRetrieved` value');

      const fee = await auctionManager.fee();
      expect(fee).to.equal('20000000000000000', 'Incorrect `fee` value');
    });

    it('3.7.2. Withdraw bid unsuccessfully due to invalid auction index', async () => {
      await expect(auctionManager.withdrawBid(2)).to.be.revertedWith(
        'AuctionManager: Invalid auction index',
      );
    });

    it('3.7.3. Withdraw bid unsuccessfully due to the auction has been cancelled', async () => {
      await auctionManager.connect(seller).cancelAuction(1);

      await expect(auctionManager.withdrawBid(1)).to.be.revertedWith(
        'AuctionManager: The requested auction has been cancelled',
      );
    });

    it('3.7.4. Withdraw bid unsuccessfully due to the caller is not the seller', async () => {
      await auctionManager.connect(user1).bid(1, 200);

      await increaseTime(ethers.provider, 1000);

      await expect(auctionManager.retrieveDomino(1)).to.be.revertedWith(
        'AuctionManager: Unauthorized',
      );
    });

    it('3.7.5. Withdraw bid unsuccessfully due to the auction has not ended yet', async () => {
      await expect(auctionManager.connect(seller).withdrawBid(1)).to.be.revertedWith(
        'AuctionManager: This auction has not ended yet',
      );
    });

    it('3.7.6. Withdraw bid unsuccessfully due to no one bid', async () => {
      await increaseTime(ethers.provider, 1000);

      await expect(auctionManager.connect(seller).withdrawBid(1)).to.be.revertedWith(
        'AuctionManager: No one bid',
      );
    });

    it('3.7.7. Retrieve domino unsuccessfully due to the bid has already been withdrawn', async () => {
      await auctionManager.connect(user1).bid(1, 200);

      await increaseTime(ethers.provider, 1000);

      await auctionManager.connect(seller).withdrawBid(1);

      await expect(auctionManager.connect(seller).withdrawBid(1)).to.be.revertedWith(
        'AuctionManager: The bid has already been withdrawn',
      );
    });
  });

  describe('3.8. withdrawFee', async () => {
    beforeEach(async () => {
      await auctionManager.connect(seller).startNewAuction(1, 2, 1000, 100);
    });

    it('3.8.1. Withdraw fee successfully', async () => {
      await auctionManager.connect(user1).bid(1, '2000000000000000000');

      await increaseTime(ethers.provider, 1000);

      await auctionManager.connect(seller).withdrawBid(1);

      let fee = await auctionManager.fee();
      expect(fee).to.equal('20000000000000000', 'Incorrect `fee` value');

      await expectBalance(cash, auctionManager.address, '20000000000000000');
      await expectBalance(cash, admin.address, '0');

      await auctionManager.withdrawFee();

      await expectBalance(cash, auctionManager.address, '0');
      await expectBalance(cash, admin.address, '20000000000000000');

      fee = await auctionManager.fee();
      expect(fee).to.equal('0', 'Incorrect `fee` value');
    });

    it('3.8.2. Withdraw fee unsuccessfully due to the caller is not `admin`', async () => {
      await expect(auctionManager.connect(user1).withdrawFee()).to.be.revertedWith(
        'Permission: Unauthorized',
      );
    });

    it('3.8.3. Withdraw fee unsuccessfully due to no fee left', async () => {
      await expect(auctionManager.withdrawFee()).to.be.revertedWith(
        'AuctionManager: No fee to withdraw',
      );
    });
  });
});
