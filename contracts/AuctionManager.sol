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
    mapping(uint256 => Auction) auctions;

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
    event AuctionCancel(uint256 indexed auctionId);
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
        dominoManager.lockDomino(msg.sender, _firstNumber, _secondNumber);

        require(
            block.timestamp + _duration < dominoManager.currentRoundEndTimestamp(),
            "AuctionManager: Auction must end before the current round does"
        );

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
        Auction memory auctionData = auctions[_auctionId];
        require(auctionData.seller == msg.sender, "AuctionManager: Unauthorized");
        require(auctionData.endTimestamp > block.timestamp, "AuctionManager: The request auction has already ended");
        require(auctionData.highestBidder == address(0), "AuctionManager: Can no longer cancel since there were bidders");

        dominoManager.unlockDomino(msg.sender, auctionData.firstNumber, auctionData.secondNumber);

        delete auctions[_auctionId];

        emit AuctionCancel(_auctionId);
    }

    function bid(uint256 _auctionId, uint256 _value) external {
        Auction storage auctionData = auctions[_auctionId];
        require(auctionData.endTimestamp > block.timestamp, "AuctionManager: The request auction has already ended");
        require(auctionData.seller != msg.sender, "AuctionManager: Seller cannot bid");
        require(auctionData.highestBid < _value, "AuctionManager: Must bid higher than the current highest one");

        cash.transferFrom(msg.sender, address(this), _value);
        if (auctionData.highestBidder != address(0)) {
            cash.transfer(auctionData.highestBidder, auctionData.highestBid);
        }

        auctionData.highestBidder = msg.sender;
        auctionData.highestBid = _value;

        emit Bid(_auctionId, msg.sender, _value);
    }

    function retrieveDomino(uint256 _auctionId) external {
        Auction storage auctionData = auctions[_auctionId];
        require(
            auctionData.highestBidder == address(0) || auctionData.highestBidder == msg.sender,
            "AuctionManager: Unauthorized"
        );
        require(auctionData.endTimestamp <= block.timestamp, "AuctionManager: This auction has not ended yet");
        require(!auctionData.dominoRetrieved, "AuctionManager: The domino has already been retrieved once");

        auctionData.dominoRetrieved = true;
        dominoManager.unlockDomino(msg.sender, auctionData.firstNumber, auctionData.secondNumber);

        emit DominoRetrieval(_auctionId);
    }

    function withdrawBid(uint256 _auctionId) external {
        Auction storage auctionData = auctions[_auctionId];
        require(auctionData.seller == msg.sender, "AuctionManager: Unauthorized");
        require(auctionData.endTimestamp <= block.timestamp, "AuctionManager: This auction has not ended yet");
        require(auctionData.highestBidder != address(0), "AuctionManager: None tried to buy this domino");
        require(!auctionData.bidWithdrawn, "AuctionManager: The bid has already been withdrawn once");

        auctionData.bidWithdrawn = true;

        uint256 additionalFee = MulDiv.mulDiv(auctionData.highestBid, Constant.AUCTION_FEE_PERCENT, 100);
        uint256 valueAfterFee = auctionData.highestBid - additionalFee;
        fee += additionalFee;
        cash.transfer(msg.sender, valueAfterFee);

        emit BidWithdrawal(_auctionId, valueAfterFee, additionalFee);
    }

    function withdrawFee() external permittedTo(admin) {
        require(fee > 0, "AuctionManager: No fee to withdraw");

        uint256 value = fee;
        fee = 0;
        cash.transfer(admin, value);

        emit FeeWithdrawal(value);
    }
}
