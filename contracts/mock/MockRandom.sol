// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../utils/Permission.sol";

import "../Random.sol";

contract MockRandom is IRandom, Permission {
    address public domino;

    uint256 private state;
    uint256 private firstValue;
    uint256 private secondValue;

    event DominoRegistration(address domino);
    event RandomInteger(uint256 indexed value);

    function registerDomino() external {
        require(domino == address(0), "Random: Domino has already been registered");

        domino = msg.sender;

        emit DominoRegistration(domino);
    }

    function setFirstValue(uint256 value) external {
        firstValue = value;
    }

    function setSecondValue(uint256 value) external {
        secondValue = value;
    }

    function integer(uint256 bound) external permittedTo(domino) returns (uint256 result) {
        require(bound > firstValue && bound > secondValue, "TestRandom: Integer bound exceeded");
        result = state == 0 ? firstValue : secondValue;

        state = 1 - state;

        emit RandomInteger(result);
    }
}
