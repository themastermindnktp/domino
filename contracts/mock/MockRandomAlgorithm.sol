// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../utils/Permission.sol";

import "../RandomAlgorithm.sol";

contract MockRandomAlgorithm is IRandomAlgorithm, Permission {
    address public dominoManager;

    uint256 private state;
    uint256 private firstValue;
    uint256 private secondValue;

    event DominoManagerRegistration(address domino);
    event RandomInteger(uint256 indexed value);

    function registerDominoManager() external {
        require(dominoManager == address(0), "RandomAlgorithm: Domino Manager has already been registered");

        dominoManager = msg.sender;

        emit DominoManagerRegistration(dominoManager);
    }

    function setFirstValue(uint256 value) external {
        firstValue = value;
    }

    function setSecondValue(uint256 value) external {
        secondValue = value;
    }

    function integer(uint256 bound) external permittedTo(dominoManager) returns (uint256 result) {
        require(bound > firstValue && bound > secondValue, "MockRandom: Integer bound exceeded");
        result = state == 0 ? firstValue : secondValue;

        state = 1 - state;

        emit RandomInteger(result);
    }
}
