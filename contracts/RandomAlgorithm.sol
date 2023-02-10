// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./utils/Permission.sol";

interface IRandomAlgorithm {
    function registerDominoManager() external;

    function integer(uint256 bound) external returns (uint256 result);
}

contract RandomAlgorithm is IRandomAlgorithm, Permission {
    address public dominoManager;

    uint256 private nonce;

    event DominoManagerRegistration(address domino);
    event RandomInteger(uint256 indexed value);

    function registerDominoManager() external {
        require(dominoManager == address(0), "RandomAlgorithm: Domino Manager has already been registered");

        dominoManager = msg.sender;

        emit DominoManagerRegistration(dominoManager);
    }

    function integer(uint256 bound) external permittedTo(dominoManager) returns (uint256 result) {
        unchecked {
            nonce += block.timestamp;
        }

        uint256 blockNumber = block.number;

        result = uint256(keccak256(abi.encodePacked(
            tx.origin,
            blockhash(blockNumber - 1),
            blockhash(blockNumber - 2),
            blockhash(blockNumber - 3),
            blockhash(blockNumber - 4),
            block.timestamp,
            nonce
        ))) % bound;

        emit RandomInteger(result);
    }
}
