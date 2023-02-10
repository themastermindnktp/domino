// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./libraries/Constant.sol";
import "./libraries/MulDiv.sol";

import "./DominoManager.sol";

contract AuctionManager is Permission {
    struct Auction {
        address seller;
        uint256 firstNumber;
        uint256 secondNumber;
        uint256 startTimestamp;
        uint256 endTimestamp;

        address highestBidder;
        uint256 highestBid;

        bool dominoRetrieved;
        bool bidWithdrawn;
    }

    address public admin;

    IERC20 public immutable cash;
    DominoManager public immutable dominoManager;

    uint256 public auctionNumber;
    mapping(uint256 => Auction) public auctions;

    uint256 public fee;

    event AdministrationTransfer(address indexed admin);
    event NewAuction(
        address indexed auctionId,
        uint256 indexed seller,
        uint256 firstNumber,
        uint256 secondNumber,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 indexed initialPrice
    );
    event AuctionCancellation(uint256 indexed auctionId);
    event Bid(uint256 indexed auctionId, address indexed account, uint256 indexed value);
    event DominoRetrieval(uint256 indexed auctionId);
    event BidWithdrawal(uint256 indexed auctionId, uint256 indexed value, uint256 indexed fee);
    event FeeWithdrawal(uint256 indexed value);

    constructor(IERC20 _cash, DominoManager _domino) {
        admin = msg.sender;

        cash = _cash;
        dominoManager = _domino;

        _domino.registerAuctionManager();
    }

    function transferAdministration(address _account) external permittedTo(admin) {
        require(_account != address(0), "AuctionManager: Prohibited null address");
        require(_account != admin, "AuctionManager: The new admin is identical to the current admin");

        admin = _account;

        emit AdministrationTransfer(_account);
    }

    function startNewAuction(
        uint256 _firstNumber,
        uint256 _secondNumber,
        uint256 _duration,
        uint256 _initialPrice
    ) external {
        require(_duration > 0, "AuctionManager: The duration must be greater than 0");
        require(
            block.timestamp + _duration < dominoManager.currentRoundEndTimestamp(),
            "AuctionManager: Auction must end before the current round does"
        );

        dominoManager.lockDomino(msg.sender, _firstNumber, _secondNumber);

        auctionNumber++;
        auctions[auctionNumber] = Auction(
            msg.sender,
            _firstNumber,
            _secondNumber,
            block.timestamp,
            block.timestamp + _duration,
            address(0),
            _initialPrice,
            false,
            false
        );

        emit NewAuction(
            msg.sender,
            auctionNumber,
            _firstNumber,
            _secondNumber,
            block.timestamp,
            block.timestamp + _duration,
            _initialPrice
        );
    }

    function cancelAuction(uint256 _auctionId) external {
        require(_auctionId <= auctionNumber, "AuctionManager: Invalid auction index");

        Auction memory auction = auctions[_auctionId];
        require(auction.seller != address(0), "AuctionManager: The requested auction has been cancelled");
        require(auction.seller == msg.sender, "AuctionManager: Unauthorized");
        require(auction.endTimestamp > block.timestamp, "AuctionManager: The request auction has already ended");
        require(auction.highestBidder == address(0), "AuctionManager: Can no longer cancel since there was bidding");

        dominoManager.unlockDomino(msg.sender, auction.firstNumber, auction.secondNumber);

        delete auctions[_auctionId];

        emit AuctionCancellation(_auctionId);
    }

    function bid(uint256 _auctionId, uint256 _value) external {
        require(_auctionId <= auctionNumber, "AuctionManager: Invalid auction index");

        Auction storage auction = auctions[_auctionId];
        require(auction.seller != address(0), "AuctionManager: The requested auction has been cancelled");
        require(auction.endTimestamp > block.timestamp, "AuctionManager: The requested auction has ended");
        require(auction.highestBid < _value, "AuctionManager: Must bid higher than the current highest one");

        if (msg.sender == auction.highestBidder) {
            cash.transferFrom(msg.sender, address(this), _value - auction.highestBid);
        } else {
            cash.transferFrom(msg.sender, address(this), _value);
            if (auction.highestBidder != address(0)) {
                cash.transfer(auction.highestBidder, auction.highestBid);
            }
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = _value;

        emit Bid(_auctionId, msg.sender, _value);
    }

    function retrieveDomino(uint256 _auctionId) external {
        require(_auctionId <= auctionNumber, "AuctionManager: Invalid auction index");

        Auction storage auction = auctions[_auctionId];
        require(auction.seller != address(0), "AuctionManager: The requested auction has been cancelled");
        require(
            (auction.highestBidder == address(0) && msg.sender == auction.seller) || auction.highestBidder == msg.sender,
            "AuctionManager: Unauthorized"
        );
        require(auction.endTimestamp <= block.timestamp, "AuctionManager: This auction has not ended yet");
        require(!auction.dominoRetrieved, "AuctionManager: The domino has already been retrieved");

        auction.dominoRetrieved = true;
        dominoManager.unlockDomino(msg.sender, auction.firstNumber, auction.secondNumber);

        emit DominoRetrieval(_auctionId);
    }

    function withdrawBid(uint256 _auctionId) external {
        require(_auctionId <= auctionNumber, "AuctionManager: Invalid auction index");

        Auction storage auction = auctions[_auctionId];
        require(auction.seller != address(0), "AuctionManager: The requested auction has been cancelled");
        require(auction.seller == msg.sender, "AuctionManager: Unauthorized");
        require(auction.endTimestamp <= block.timestamp, "AuctionManager: This auction has not ended yet");
        require(auction.highestBidder != address(0), "AuctionManager: No one bid");
        require(!auction.bidWithdrawn, "AuctionManager: The bid has already been withdrawn");

        auction.bidWithdrawn = true;

        uint256 additionalFee = MulDiv.mulDiv(auction.highestBid, Constant.AUCTION_FEE_PERCENT, 100);
        uint256 bidAfterFee = auction.highestBid - additionalFee;
        fee += additionalFee;
        cash.transfer(msg.sender, bidAfterFee);

        emit BidWithdrawal(_auctionId, bidAfterFee, additionalFee);
    }

    function withdrawFee() external permittedTo(admin) {
        require(fee > 0, "AuctionManager: No fee to withdraw");

        uint256 value = fee;
        fee = 0;
        cash.transfer(admin, value);

        emit FeeWithdrawal(value);
    }
}
