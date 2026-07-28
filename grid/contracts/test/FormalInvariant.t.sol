// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FormalInvariant {
    uint256 internal value;
    uint256 internal constant MAX_VALUE = 1e18;

    function setValue(uint256 newValue) public {
        if (newValue > MAX_VALUE) {
            newValue = MAX_VALUE;
        }
        value = newValue;
    }

    function increase(uint256 delta) public {
        delta = delta % (MAX_VALUE + 1);
        uint256 nextValue = value + delta;
        if (nextValue > MAX_VALUE) {
            nextValue = MAX_VALUE;
        }
        value = nextValue;
    }

    function decrease(uint256 delta) public {
        delta = delta % (MAX_VALUE + 1);
        if (delta >= value) {
            value = 0;
            return;
        }
        value -= delta;
    }

    function testFuzz_SetValueIsCapped(uint256 newValue) public {
        setValue(newValue);
        assert(value <= MAX_VALUE);
    }

    function testFuzz_IncreaseStaysBounded(uint256 base, uint256 delta) public {
        setValue(base);
        increase(delta);
        assert(value <= MAX_VALUE);
    }

    function invariant_ValueAlwaysWithinBounds() public view {
        assert(value <= MAX_VALUE);
    }
}
