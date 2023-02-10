// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

abstract contract Permission {
    modifier permittedTo(address _account) {
        require(msg.sender == _account, "Permission: Unauthorized");
        _;
    }
}
