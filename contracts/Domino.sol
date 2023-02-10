// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./libraries/MulDiv.sol";
import "./libraries/Constant.sol";

import "./utils/Permission.sol";

import "./Random.sol";

contract Domino is Permission {
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
    IRandom public random;

    address public auction;

    uint256 public roundNumber;
    mapping(uint256 => Round) public rounds;

    uint256 public fee;

    event AdministrationTransfer(address indexed admin);
    event RandomAlgorithmReplacement(address indexed random);
    event AuctionRegistration(address indexed auction);
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

    constructor(IERC20 _cash, Random _random) {
        admin = msg.sender;

        cash = _cash;
        random = _random;

        _random.registerDomino();
    }

    function transferAdministration(address _account) external permittedTo(admin) {
        require(_account != address(0), "Domino: Prohibited null address");
        require(_account != admin, "Domino: The new admin is identical to the current admin");

        admin = _account;

        emit AdministrationTransfer(_account);
    }

    function replaceRandomAlgorithm(address _random) external permittedTo(admin) {
        require(rounds[roundNumber].endTimestamp <= block.timestamp, "Domino: The current round has not ended yet");
        require(_random != address(0), "Domino: Prohibited null address");
        require(_random != address(random), "Domino: The new random contract is identical to the current one");

        random = Random(_random);
        random.registerDomino();

        emit RandomAlgorithmReplacement(_random);
    }

    function registerAuction() external {
        require(auction == address(0), "Domino: Auction has already been registered");

        auction = msg.sender;

        emit AuctionRegistration(msg.sender);
    }

    function startNewRound(uint256 _duration, uint256 _dominoSize, uint256 _drawPrice) external permittedTo(admin) {
        require(rounds[roundNumber].endTimestamp <= block.timestamp, "Domino: The current round has not ended yet");
        require(_duration > 0, "Domino: The duration must be greater than 0");
        require(_dominoSize > 0, "Domino: The domino size must be greater than 0");
        require(_drawPrice > 0, "Domino: The draw price must be greater than 0");

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
        require(rounds[roundNumber].endTimestamp > block.timestamp, "Domino: No round is available at the moment");
        return rounds[roundNumber].endTimestamp;
    }

    function drawDomino() external {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "Domino: No round is available at the moment");

        cash.transferFrom(msg.sender, address(this), round.drawPrice);

        uint256 additionalReward = MulDiv.mulDiv(round.drawPrice, Constant.REWARD_PERCENT, 100);
        uint256 additionalFee = round.drawPrice - additionalReward;

        round.totalReward += additionalReward;
        fee += additionalFee;

        uint256 firstNumber = random.integer(round.dominoSize);
        uint256 secondNumber = random.integer(round.dominoSize);

        round.dominoNumbers[msg.sender][firstNumber][secondNumber]++;

        emit DominoDraw(msg.sender, firstNumber, secondNumber);
    }

    function currentRoundDominoNumber(address _account, uint256 _firstNumber, uint256 _secondNumber) external view returns (uint256) {
        require(rounds[roundNumber].endTimestamp > block.timestamp, "Domino: No round is available at the moment");
        return rounds[roundNumber].dominoNumbers[_account][_firstNumber][_secondNumber];
    }

    function lockDomino(address _account, uint256 _firstNumber, uint256 _secondNumber) external permittedTo(auction) {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "Domino: No round is available at the moment");

        require(round.dominoNumbers[_account][_firstNumber][_secondNumber] > 0, "Domino: The requested account does not have any the requested domino");

        round.dominoNumbers[_account][_firstNumber][_secondNumber]--;
        round.dominoNumbers[auction][_firstNumber][_secondNumber]++;

        emit DominoLock(_account, _firstNumber, _secondNumber);
    }

    function unlockDomino(address _account, uint256 _firstNumber, uint256 _secondNumber) external permittedTo(auction) {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "Domino: No round is available at the moment");

        require(round.dominoNumbers[auction][_firstNumber][_secondNumber] > 0, "Domino: The requested domino is not locked");

        round.dominoNumbers[auction][_firstNumber][_secondNumber]--;
        round.dominoNumbers[_account][_firstNumber][_secondNumber]++;

        emit DominoUnlock(_account, _firstNumber, _secondNumber);
    }

    function submitDominoChain(uint256[] calldata _numbers) external {
        Round storage round = rounds[roundNumber];
        require(round.endTimestamp > block.timestamp, "Domino: No round is available at the moment");

        require(_numbers.length > 1, "Domino: Chain must contains at least 2 numbers");
        uint256 length = _numbers.length - 1;

        uint256 firstNumber = _numbers[0];

        for (uint256 i = 1; i <= length; i++) {
            uint256 secondNumber = _numbers[i];
            require(round.dominoNumbers[msg.sender][firstNumber][secondNumber] > 0, "Domino: Insufficient domino");
            round.dominoNumbers[msg.sender][firstNumber][secondNumber]--;
            firstNumber = secondNumber;
        }

        uint256 additionalScore = length * length;
        round.totalScore += additionalScore;
        round.scores[msg.sender] += additionalScore;

        emit DominoChainSubmission(msg.sender, length);
    }

    function currentRoundScore(address _account) external view returns (uint256) {
        require(rounds[roundNumber].endTimestamp > block.timestamp, "Domino: No round is available at the moment");
        return rounds[roundNumber].scores[_account];
    }

    function withdrawReward(uint256 _roundId) external {
        require(_roundId <= roundNumber, "Domino: Invalid round index");

        Round storage round = rounds[_roundId];
        require(round.endTimestamp <= block.timestamp, "Domino: The requested round has not ended yet");
        require(round.scores[msg.sender] > 0, "Domino: No reward in the requested round to withdraw");

        uint256 reward = MulDiv.mulDiv(round.totalReward, round.scores[msg.sender], round.totalScore);
        round.scores[msg.sender] = 0;
        cash.transfer(msg.sender, reward);

        emit RewardWithdrawal(msg.sender, _roundId, reward);
    }

    function withdrawFee() external permittedTo(admin) {
        require(fee > 0, "Domino: No fee to withdraw");

        uint256 value = fee;
        fee = 0;
        cash.transfer(admin, value);

        emit FeeWithdrawal(value);
    }
}
