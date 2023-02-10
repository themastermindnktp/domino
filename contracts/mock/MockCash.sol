// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice This is use for development testing on local private chain only
/// @notice For public chain deployment, need to use a ready deployed address
contract MockCash is ERC20, Ownable {

    constructor() ERC20("TestCash", "CASH") { }

    function mintFor(address _account, uint256 _amount) external onlyOwner {
        _mint(_account, _amount * 10**18);
    }
}
