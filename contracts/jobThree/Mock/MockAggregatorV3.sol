// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Mock Chainlink Aggregator for testing
contract MockAggregatorV3 {
    uint8 public decimals;
    string public description;
    uint256 public version;

    int256 public price;
    uint80 public roundId;
    uint256 public timestamp;
    uint80 public answeredInRound;

    constructor(uint8 _decimals, string memory _desc) {
        decimals = _decimals;
        description = _desc;
        version = 4;
        roundId = 1;
        timestamp = block.timestamp;
        answeredInRound = 1;
    }

    function setPrice(int256 _price) external {
        price = _price;
        roundId++;
        timestamp = block.timestamp;
        answeredInRound = roundId;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, price, 0, timestamp, answeredInRound);
    }
}
