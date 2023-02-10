// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./libraries/MulDiv.sol";
import "./libraries/Constant.sol";

import "./utils/Permission.sol";

import "./RandomAlgorithm.sol";

contract DominoManager is Permission {
    struct Round {
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 dominoSize;
        uint256 drawPrice;
        uint256 totalScore;
        uint256 totalReward;

        mapping(address => mapping(uint256 => mapping(uint256 => uint256))) dominoNumbers;
        mapping(address => uint256) scores;
    }

    address public admin;

    IERC20 public immutable cash;
    IRandomAlgorithm public randomAlgorithm;

    address public auctionManager;

    uint256 public roundNumber;
    mapping(uint256 => Round) public rounds;

    uint256 public fee;

    event AdministrationTransfer(address indexed admin);
    event RandomAlgorithmReplacement(address indexed random);
    event AuctionManagerRegistration(address indexed auction);
    event NewRound(
        uint256 indexed roundId,
        uint256 indexed startTimestamp,
        uint256 indexed endTimestamp,
        uint256 dominoSize,
        uint256 drawPrice
    );
    event DominoDraw(address indexed account, uint256 indexed firstNumber, uint256 indexed secondNumber);
    event DominoLock(address indexed account, uint256 indexed firstNumber, uint256 indexed secondNumber);
    event DominoUnlock(address indexed account, uint256 indexed firstNumber, uint256 indexed secondNumber);
    event DominoChainSubmission(address indexed account, uint256 indexed length);
    event RewardWithdrawal(address indexed account, uint256 indexed roundId, uint256 value);
    event FeeWithdrawal(uint256 indexed value);

    constructor(IERC20 _cash, IRandomAlgorithm _random) {
        admin = msg.sender;

        cash = _cash;
        randomAlgorithm = _random;

        _random.registerDominoManager();
    }

    function transferAdministration(address _account) external permittedTo(admin) {
        require(_account != address(0), "DominoManager: Prohibited null address");
        require(_account != admin, "DominoManager: The new admin is identical to the current admin");

        admin = _account;

        emit AdministrationTransfer(_account);
    }

    function replaceRandomAlgorithm(address _random) external permittedTo(admin) {
        require(rounds[roundNumber].endTimestamp <= block.timestamp, "DominoManager: The current round has not ended yet");
        require(_random != address(0), "DominoManager: Prohibited null address");
        require(_random != address(randomAlgorithm), "DominoManager: The new Random Algorithm is identical to the current one");

        randomAlgorithm = RandomAlgorithm(_random);
        randomAlgorithm.registerDominoManager();

        emit RandomAlgorithmReplacement(_random);
    }

    function registerAuctionManager() external {
        require(auctionManager == address(0), "DominoManager: Auction Manager has already been registered");

        auctionManager = msg.sender;

        emit AuctionManagerRegistration(msg.sender);
    }

    function startNewRound(uint256 _duration, uint256 _dominoSize, uint256 _drawPrice) external permittedTo(admin) {
        require(rounds[roundNumber].endTimestamp <= block.timestamp, "DominoManager: The current round has not ended yet");
        require(_duration > 0, "DominoManager: The duration must be greater than 0");
        require(_dominoSize > 0, "DominoManager: The domino size must be greater than 0");
        require(_drawPrice > 0, "DominoManager: The draw price must be greater than 0");

        roundNumber++;
        rounds[roundNumber].startTimestamp = block.timestamp;
        rounds[roundNumber].endTimestamp = block.timestamp + _duration;
        rounds[roundNumber].dominoSize = _dominoSize;
        rounds[roundNumber].drawPrice = _drawPrice;

        emit NewRound(
            roundNumber,
            block.timestamp,
            block.timestamp + _duration,
            _dominoSize,
            _drawPrice
        );
    }

    function currentRoundEndTimestamp() external view returns (uint256) {
        require(rounds[roundNumber].endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");
        return rounds[roundNumber].endTimestamp;
    }

    function drawDomino() external {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");

        cash.transferFrom(msg.sender, address(this), round.drawPrice);

        uint256 additionalReward = MulDiv.mulDiv(round.drawPrice, Constant.REWARD_PERCENT, 100);
        uint256 additionalFee = round.drawPrice - additionalReward;

        round.totalReward += additionalReward;
        fee += additionalFee;

        uint256 firstNumber = randomAlgorithm.integer(round.dominoSize);
        uint256 secondNumber = randomAlgorithm.integer(round.dominoSize);

        round.dominoNumbers[msg.sender][firstNumber][secondNumber]++;

        emit DominoDraw(msg.sender, firstNumber, secondNumber);
    }

    function currentRoundDominoNumber(address _account, uint256 _firstNumber, uint256 _secondNumber) external view returns (uint256) {
        require(rounds[roundNumber].endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");
        return rounds[roundNumber].dominoNumbers[_account][_firstNumber][_secondNumber];
    }

    function lockDomino(address _account, uint256 _firstNumber, uint256 _secondNumber) external permittedTo(auctionManager) {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");

        require(round.dominoNumbers[_account][_firstNumber][_secondNumber] > 0, "DominoManager: The requested account does not have any the requested domino");

        round.dominoNumbers[_account][_firstNumber][_secondNumber]--;
        round.dominoNumbers[auctionManager][_firstNumber][_secondNumber]++;

        emit DominoLock(_account, _firstNumber, _secondNumber);
    }

    function unlockDomino(address _account, uint256 _firstNumber, uint256 _secondNumber) external permittedTo(auctionManager) {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");

        require(round.dominoNumbers[auctionManager][_firstNumber][_secondNumber] > 0, "DominoManager: The requested domino is not locked");

        round.dominoNumbers[auctionManager][_firstNumber][_secondNumber]--;
        round.dominoNumbers[_account][_firstNumber][_secondNumber]++;

        emit DominoUnlock(_account, _firstNumber, _secondNumber);
    }

    function submitDominoChain(uint256[] calldata _numbers) external {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");

        require(_numbers.length > 1, "DominoManager: Chain must contains at least 2 numbers");
        uint256 length = _numbers.length - 1;

        uint256 firstNumber = _numbers[0];

        for (uint256 i = 1; i <= length; i++) {
            uint256 secondNumber = _numbers[i];
            require(round.dominoNumbers[msg.sender][firstNumber][secondNumber] > 0, "DominoManager: Insufficient domino");
            round.dominoNumbers[msg.sender][firstNumber][secondNumber]--;
            firstNumber = secondNumber;
        }

        uint256 additionalScore = length * length;
        round.totalScore += additionalScore;
        round.scores[msg.sender] += additionalScore;

        emit DominoChainSubmission(msg.sender, length);
    }

    function currentRoundScore(address _account) external view returns (uint256) {
        require(rounds[roundNumber].endTimestamp > block.timestamp, "DominoManager: No round is available at the moment");
        return rounds[roundNumber].scores[_account];
    }

    function withdrawReward(uint256 _roundId) external {
        require(_roundId <= roundNumber, "DominoManager: Invalid round index");

        Round storage round = rounds[_roundId];
        require(round.endTimestamp <= block.timestamp, "DominoManager: The requested round has not ended yet");
        require(round.scores[msg.sender] > 0, "DominoManager: No reward in the requested round to withdraw");

        uint256 reward = MulDiv.mulDiv(round.totalReward, round.scores[msg.sender], round.totalScore);
        round.scores[msg.sender] = 0;
        cash.transfer(msg.sender, reward);

        emit RewardWithdrawal(msg.sender, _roundId, reward);
    }

    function withdrawFee() external permittedTo(admin) {
        require(fee > 0, "DominoManager: No fee to withdraw");

        uint256 value = fee;
        fee = 0;
        cash.transfer(admin, value);

        emit FeeWithdrawal(value);
    }
}
