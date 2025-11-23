// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title Mock Price Consumer
 * @notice Mock implementation of price feed for testing
 */
contract MockPriceConsumer {
    mapping(address => int256) public mockPrices;
    mapping(address => bool) public priceFeedSet;

    /**
     * @notice Set mock price for token
     * @param token Token address
     * @param price Price value
     */
    function setMockPrice(address token, int256 price) external {
        mockPrices[token] = price;
        priceFeedSet[token] = true;
    }

    /**
     * @notice Check if price feed is set for token
     * @param token Token address
     * @return bool Is price feed set
     */
    function isPriceFeedSet(address token) public view returns (bool) {
        return priceFeedSet[token];
    }

    /**
     * @notice Calculate USD value of token amount
     * @param amount Token amount
     * @param token Token address
     * @param decimals Token decimals
     * @return uint256 USD value
     */
    function calculateValue(
        uint256 amount,
        address token,
        uint8 decimals
    ) public view returns (uint256) {
        require(priceFeedSet[token], "PriceFeedNotSet");
        int256 price = mockPrices[token];
        require(price > 0, "InvalidPrice");
        return (uint256(price) * amount) / (10 ** decimals);
    }
}
