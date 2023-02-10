// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./utils/Permission.sol";

interface IRandom {
    function registerDomino() external;

    function integer(uint256 bound) external returns (uint256 result);
}

contract Random is IRandom, Permission {
    address public domino;

    uint256 private nonce;

    event DominoRegistration(address domino);
    event RandomInteger(uint256 indexed value);

    function registerDomino() external {
        require(domino == address(0), "Random: Domino has already been registered");

        domino = msg.sender;

        emit DominoRegistration(domino);
    }

    function integer(uint256 bound) external permittedTo(domino) returns (uint256 result) {
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
