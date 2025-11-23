// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {PriceConsumer} from "./PriceConsumer.sol";
import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Mock Chainlink Aggregator for testing (包含在文件中)
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

/**
 * @title PriceConsumer Fuzz Tests
 * @notice Comprehensive fuzz testing for edge cases and unexpected inputs
 * @dev Tests robustness against random inputs and boundary conditions
 */
contract PriceConsumerFuzzTest is Test {
    PriceConsumer priceConsumer;
    MockAggregatorV3 ethPriceFeed;

    address admin = makeAddr("admin");
    address constant ETH_TOKEN = address(0);

    function setUp() public {
        ethPriceFeed = new MockAggregatorV3(8, "ETH / USD");
        ethPriceFeed.setPrice(2000 * 1e8);

        PriceConsumer implementation = new PriceConsumer();
        bytes memory data = abi.encodeWithSelector(
            PriceConsumer.initialize.selector,
            address(ethPriceFeed)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), data);
        priceConsumer = PriceConsumer(address(proxy));
    }

    // ========== FUZZ TESTS FOR INPUT VALIDATION ==========

    /// @dev Fuzz test for price feed setting with random addresses
    function testFuzz_SetPriceFeed(
        address token,
        address priceFeedAddr
    ) public {
        vm.assume(priceFeedAddr != address(0)); // Avoid zero address revert

        // Create mock price feed for the address
        MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
        mockFeed.setPrice(int256(100 * 1e8)); // 修复：显式转换为 int256

        // Use the actual mock address instead of fuzzed address
        priceConsumer.setPriceFeed(token, address(mockFeed));

        assertTrue(priceConsumer.isPriceFeedSet(token));
    }

    /// @dev Fuzz test for batch operations with various array sizes
    function testFuzz_BatchSetPriceFeeds(uint8 arraySize) public {
        vm.assume(arraySize > 0 && arraySize <= 10); // Reasonable bounds

        address[] memory tokens = new address[](arraySize);
        address[] memory feeds = new address[](arraySize);

        for (uint256 i = 0; i < arraySize; i++) {
            tokens[i] = address(uint160(i + 100)); // Avoid reserved addresses
            MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
            mockFeed.setPrice(int256((100 + i) * 1e8)); // 修复：显式转换为 int256
            feeds[i] = address(mockFeed);
        }

        priceConsumer.batchSetPriceFeeds(tokens, feeds);

        for (uint256 i = 0; i < arraySize; i++) {
            assertTrue(priceConsumer.isPriceFeedSet(tokens[i]));
        }
    }

    /// @dev Fuzz test for normalized price calculation with various decimals
    function testFuzz_GetNormalizedPriceWithDifferentDecimals(
        uint8 decimals
    ) public {
        vm.assume(decimals <= 18); // Within reasonable range

        MockAggregatorV3 mockFeed = new MockAggregatorV3(
            decimals,
            "TEST / USD"
        );
        mockFeed.setPrice(int256(100 * 10 ** decimals)); // 修复：显式转换为 int256

        address testToken = address(0x123);
        priceConsumer.setPriceFeed(testToken, address(mockFeed));

        uint256 normalizedPrice = priceConsumer.getNormalizedPrice(testToken);

        // Should normalize to 18 decimals
        assertEq(normalizedPrice, 100 * 1e18);
    }

    /// @dev Fuzz test for value calculation with various inputs
    function testFuzz_CalculateValue(
        uint256 tokenAmount,
        uint8 tokenDecimals,
        int256 price
    ) public {
        vm.assume(price > 0);
        vm.assume(tokenDecimals <= 18);
        vm.assume(tokenAmount > 0);
        vm.assume(uint256(price) < type(uint256).max / 1e18);
        vm.assume(tokenAmount < type(uint256).max / uint256(price));

        MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
        mockFeed.setPrice(price);

        address testToken = address(0x456);
        priceConsumer.setPriceFeed(testToken, address(mockFeed));

        uint256 value = priceConsumer.calculateValue(
            tokenAmount,
            testToken,
            tokenDecimals
        );

        // Basic validation that calculation is reasonable
        uint256 expectedValue = (uint256(price) * tokenAmount) /
            (10 ** tokenDecimals);
        assertEq(value, expectedValue);
    }

    /// @dev Fuzz test for price feed requests with various tokens
    function testFuzz_RequestPriceFeed(
        address token,
        string memory symbol
    ) public {
        vm.assume(token != ETH_TOKEN); // Don't test with ETH token
        vm.assume(bytes(symbol).length > 0 && bytes(symbol).length <= 32);

        // Ensure no price feed is set initially
        vm.assume(!priceConsumer.isPriceFeedSet(token));

        priceConsumer.requestPriceFeed(token, symbol);

        assertTrue(priceConsumer.pendingPriceFeedRequests(token));
    }

    // ========== BOUNDARY VALUE TESTS ==========

    /// @dev Test extreme price values
    function test_ExtremePriceValues() public {
        address testToken = address(0x789);

        // Test very low price
        MockAggregatorV3 lowPriceFeed = new MockAggregatorV3(8, "LOW / USD");
        lowPriceFeed.setPrice(1); // $0.00000001
        priceConsumer.setPriceFeed(testToken, address(lowPriceFeed));

        int256 lowPrice = priceConsumer.getLatestPrice(testToken);
        assertEq(lowPrice, 1);

        // Test very high price (避免溢出)
        MockAggregatorV3 highPriceFeed = new MockAggregatorV3(8, "HIGH / USD");
        highPriceFeed.setPrice(int256(type(int256).max / 1e10)); // 修复：显式转换为 int256
        priceConsumer.setPriceFeed(address(0x987), address(highPriceFeed));

        int256 highPrice = priceConsumer.getLatestPrice(address(0x987));
        assertTrue(highPrice > 0);
    }

    /// @dev Test zero and near-zero amounts in value calculation
    function test_ZeroAndNearZeroAmounts() public {
        address testToken = address(0x555);
        MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
        mockFeed.setPrice(int256(100 * 1e8)); // 修复：显式转换为 int256
        priceConsumer.setPriceFeed(testToken, address(mockFeed));

        // Test zero amount
        uint256 zeroValue = priceConsumer.calculateValue(0, testToken, 18);
        assertEq(zeroValue, 0);

        // Test very small amount
        uint256 smallAmount = 1e10;
        uint256 smallValue = priceConsumer.calculateValue(
            smallAmount,
            testToken,
            18
        );
        uint256 expectedValue = (uint256(100 * 1e8) * smallAmount) / (10 ** 18);
        assertEq(smallValue, expectedValue);
    }

    /// @dev Test maximum array sizes for batch operations
    function test_MaxArraySizeBatchOperations() public {
        uint256 maxSize = 50; // Reasonable upper limit

        address[] memory tokens = new address[](maxSize);
        address[] memory feeds = new address[](maxSize);

        for (uint256 i = 0; i < maxSize; i++) {
            tokens[i] = address(uint160(i + 1000));
            MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
            mockFeed.setPrice(int256((100 + i) * 1e8)); // 修复：显式转换为 int256
            feeds[i] = address(mockFeed);
        }

        priceConsumer.batchSetPriceFeeds(tokens, feeds);

        // Verify all were set
        for (uint256 i = 0; i < maxSize; i++) {
            assertTrue(priceConsumer.isPriceFeedSet(tokens[i]));
        }
    }

    // ========== INVARIANT TESTS ==========

    /// @dev Test that price normalization maintains value proportionality
    function testFuzz_NormalizedPriceProportionality(uint256 basePrice) public {
        vm.assume(basePrice > 0 && basePrice < type(uint256).max / 1e18);

        address testToken = address(0x666);

        // Test with 8 decimals (like most Chainlink feeds)
        MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
        mockFeed.setPrice(int256(basePrice)); // 修复：显式转换为 int256
        priceConsumer.setPriceFeed(testToken, address(mockFeed));

        uint256 normalizedPrice = priceConsumer.getNormalizedPrice(testToken);

        // Price should be scaled up by 10^10 when going from 8 to 18 decimals
        assertEq(normalizedPrice, basePrice * 1e10);
    }

    /// @dev Test that calculateValue maintains mathematical consistency
    function testFuzz_CalculateValueConsistency(
        uint256 amount,
        uint8 decimals
    ) public {
        vm.assume(amount > 0 && amount < type(uint256).max / 1e10);
        vm.assume(decimals <= 18);

        int256 fixedPrice = int256(100 * 1e8); // $100, 修复：显式转换为 int256
        address testToken = address(0x777);

        MockAggregatorV3 mockFeed = new MockAggregatorV3(8, "TEST / USD");
        mockFeed.setPrice(fixedPrice);
        priceConsumer.setPriceFeed(testToken, address(mockFeed));

        uint256 value = priceConsumer.calculateValue(
            amount,
            testToken,
            decimals
        );

        // value = (price * amount) / (10 ** decimals)
        uint256 expectedValue = (uint256(fixedPrice) * amount) /
            (10 ** decimals);
        assertEq(value, expectedValue);
    }
}
