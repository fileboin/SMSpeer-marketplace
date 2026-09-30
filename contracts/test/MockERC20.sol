// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint16 public feeBps;

    constructor(string memory name_, string memory symbol_, uint16 feeBps_)
        ERC20(name_, symbol_)
    {
        require(feeBps_ <= 10_000, "fee too high");
        feeBps = feeBps_;
    }

    function setFeeBps(uint16 feeBps_) external {
        require(feeBps_ <= 10_000, "fee too high");
        feeBps = feeBps_;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        uint256 fee = from != address(0) && to != address(0)
            ? (value * feeBps) / 10_000
            : 0;
        super._update(from, to, value - fee);
        if (fee != 0) super._update(from, address(0), fee);
    }
}
