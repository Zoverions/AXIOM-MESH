// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract MockFeeBurnChannel {
    uint256 public feeBurnBpsOfTax;

    function setFeeBurnBpsOfTax(uint256 _feeBurnBpsOfTax) external {
        feeBurnBpsOfTax = _feeBurnBpsOfTax;
    }
}

contract BurnableMockERC20 is ERC20, ERC20Burnable {
    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RevertingWeightOracle {
    function addPoERBonus(address, uint256) external pure {
        revert("oracle down");
    }

    function slashPoERBonus(address) external pure {
        revert("oracle down");
    }
}
