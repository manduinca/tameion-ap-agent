// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Local-test-only ERC-20 substitute. Never deployed to Arc.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    bool public failTransfer;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function setFailTransfer(bool value) external { failTransfer = value; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        if (failTransfer) return false;
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}
