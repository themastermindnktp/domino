// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./libraries/Constant.sol";
import "./libraries/MulDiv.sol";

import "./Domino.sol";

contract Auction is Permission {
    struct AuctionData {
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
    Domino public immutable domino;

    uint256 auctionNumber;
    mapping(uint256 => AuctionData) auctions;

    uint256 public fee;

    event AuctionConduction(
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

    constructor(IERC20 _cash, Domino _domino) {
        admin = msg.sender;

        cash = _cash;
        domino = _domino;

        _domino.registerAuction();
    }

    function conductAuction(
        uint256 _firstNumber,
        uint256 _secondNumber,
        uint256 _duration,
        uint256 _initialPrice
    ) external returns (uint256) {
        domino.lockDomino(msg.sender, _firstNumber, _secondNumber);

        require(
            block.timestamp + _duration < domino.currentRoundEndTimestamp(),
            "Auction: Auction must end before the current round does"
        );

        auctionNumber++;
        auctions[auctionNumber] = AuctionData(
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

        emit AuctionConduction(
            msg.sender,
            auctionNumber,
            _firstNumber,
            _secondNumber,
            block.timestamp,
            block.timestamp + _duration,
            _initialPrice
        );

        return auctionNumber;
    }

    function cancelAuction(uint256 _auctionId) external {
        AuctionData memory auctionData = auctions[_auctionId];
        require(auctionData.seller == msg.sender, "Auction: Unauthorized");
        require(auctionData.endTimestamp > block.timestamp, "Auction: The request auction has already ended");
        require(auctionData.highestBidder == address(0), "Auction: Can no longer cancel since there were bidders");

        domino.unlockDomino(msg.sender, auctionData.firstNumber, auctionData.secondNumber);

        delete auctions[_auctionId];

        emit AuctionCancel(_auctionId);
    }

    function bid(uint256 _auctionId, uint256 _value) external {
        AuctionData storage auctionData = auctions[_auctionId];
        require(auctionData.endTimestamp > block.timestamp, "Auction: The request auction has already ended");
        require(auctionData.seller != msg.sender, "Auction: Seller cannot bid");
        require(auctionData.highestBid < _value, "Auction: Must bid higher than the current highest one");

        cash.transferFrom(msg.sender, address(this), _value);
        if (auctionData.highestBidder != address(0)) {
            cash.transfer(auctionData.highestBidder, auctionData.highestBid);
        }

        auctionData.highestBidder = msg.sender;
        auctionData.highestBid = _value;

        emit Bid(_auctionId, msg.sender, _value);
    }

    function retrieveDomino(uint256 _auctionId) external {
        AuctionData storage auctionData = auctions[_auctionId];
        require(
            auctionData.highestBidder == address(0) || auctionData.highestBidder == msg.sender,
            "Auction: Unauthorized"
        );
        require(auctionData.endTimestamp <= block.timestamp, "Auction: This auction has not ended yet");
        require(!auctionData.dominoRetrieved, "Auction: The domino has already been retrieved once");

        auctionData.dominoRetrieved = true;
        domino.unlockDomino(msg.sender, auctionData.firstNumber, auctionData.secondNumber);

        emit DominoRetrieval(_auctionId);
    }

    function withdrawBid(uint256 _auctionId) external {
        AuctionData storage auctionData = auctions[_auctionId];
        require(auctionData.seller == msg.sender, "Auction: Unauthorized");
        require(auctionData.endTimestamp <= block.timestamp, "Auction: This auction has not ended yet");
        require(auctionData.highestBidder != address(0), "Auction: None tried to buy this domino");
        require(!auctionData.bidWithdrawn, "Auction: The bid has already been withdrawn once");

        auctionData.bidWithdrawn = true;

        uint256 additionalFee = MulDiv.mulDiv(auctionData.highestBid, Constant.AUCTION_FEE_PERCENT, 100);
        uint256 valueAfterFee = auctionData.highestBid - additionalFee;
        fee += additionalFee;
        cash.transfer(msg.sender, valueAfterFee);

        emit BidWithdrawal(_auctionId, valueAfterFee, additionalFee);
    }

    function withdrawFee() external permittedTo(admin) {
        require(fee > 0, "Auction: No fee to withdraw");

        uint256 value = fee;
        fee = 0;
        cash.transfer(admin, value);

        emit FeeWithdrawal(value);
    }
}
