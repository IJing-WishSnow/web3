// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/**
 * @title PriceConsumer
 * @notice A multi-price feed aggregator that consumes price data from Chainlink Data Feeds
 * @dev This contract manages multiple price feeds for different tokens and provides price data in standardized formats
 */
contract PriceConsumer is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // Mapping from token address to Chainlink price feed
    mapping(address => AggregatorV3Interface) public priceFeeds;
    mapping(address => bool) public pendingPriceFeedRequests;

    uint256[50] private __gap;

    // Events
    event PriceFeedUpdated(address indexed token, address indexed priceFeed);
    event PriceUpdated(address indexed token, int256 price);
    event PriceFeedRequested(
        address indexed requester,
        address indexed token,
        string tokenSymbol
    );
    event PriceFeedApproved(address indexed token, address indexed priceFeed); // 添加缺失的事件

    // Custom errors
    error InvalidAddress();
    error PriceFeedNotSet();
    error InvalidPrice();
    error RoundNotComplete();
    error StalePrice();
    error PriceFeedAlreadySet();
    error PriceFeedRequestPending();
    error ArrayLengthMismatch();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract with an ETH price feed
     * @param _ethPriceFeed Address of the Chainlink ETH/USD price feed
     */
    function initialize(address _ethPriceFeed) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        // Set ETH price feed for address(0)
        priceFeeds[address(0)] = AggregatorV3Interface(_ethPriceFeed);
    }

    /**
     * @dev UUPS升级授权函数
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /**
     * @dev Set or update price feed for a specific token
     * @param token Token address (address(0) for ETH)
     * @param priceFeed Address of the Chainlink price feed for this token
     */
    function setPriceFeed(address token, address priceFeed) public onlyOwner {
        // 改为 public
        if (priceFeed == address(0)) revert InvalidAddress();
        priceFeeds[token] = AggregatorV3Interface(priceFeed);
        emit PriceFeedUpdated(token, priceFeed);
    }

    /**
     * @notice Batch set price feeds for multiple tokens
     * @dev Adds a function to set multiple price feeds at once, useful for initializing after upgrades
     * @param tokens Array of token addresses
     * @param feeds Array of corresponding price feed addresses
     * @custom:requirements Both arrays must have the same length
     * @custom:requirements Caller must be contract owner
     */
    function batchSetPriceFeeds(
        address[] calldata tokens,
        address[] calldata feeds
    ) external onlyOwner {
        if (tokens.length != feeds.length) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < tokens.length; i++) {
            setPriceFeed(tokens[i], feeds[i]); // 直接使用现有的 setPriceFeed 函数
        }
    }

    /**
     * @dev Remove price feed for a token
     * @param token Token address to remove price feed for
     */
    function removePriceFeed(address token) external onlyOwner {
        delete priceFeeds[token];
        emit PriceFeedUpdated(token, address(0));
    }

    /**
     * @dev Internal function to get price data for a specific token
     * @param token Token address (address(0) for ETH)
     * @return price The latest price from Chainlink
     * @return decimals The number of decimal places for the price
     */
    function _getPriceData(
        address token
    ) internal view returns (int256 price, uint8 decimals) {
        AggregatorV3Interface priceFeed = priceFeeds[token];
        if (address(priceFeed) == address(0)) revert PriceFeedNotSet();

        (, price, , , ) = priceFeed.latestRoundData();
        decimals = priceFeed.decimals();
        return (price, decimals);
    }

    /**
     * @dev Get the latest price for a token with integrity checks
     * @param token Token address (address(0) for ETH)
     * @return price The latest price with integrity validation
     */
    function getLatestPrice(
        address token
    ) public nonReentrant returns (int256) {
        AggregatorV3Interface priceFeed = priceFeeds[token];
        if (address(priceFeed) == address(0)) revert PriceFeedNotSet();

        (
            uint80 roundID,
            int256 price,
            ,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        if (price <= 0) revert InvalidPrice();
        if (timeStamp == 0) revert RoundNotComplete();
        if (answeredInRound < roundID) revert StalePrice();

        emit PriceUpdated(token, price);
        return price;
    }

    /**
     * @dev Get price data for frontend formatting
     * @param token Token address (address(0) for ETH)
     * @return rawPrice The raw price value
     * @return decimals Number of decimal places
     * @return description Price feed description
     */
    function getPriceData(
        address token
    )
        public
        view
        returns (int256 rawPrice, uint8 decimals, string memory description)
    {
        (rawPrice, decimals) = _getPriceData(token);
        description = priceFeeds[token].description();
        return (rawPrice, decimals, description);
    }

    /**
     * @dev Get price normalized to 18 decimals (Ethereum standard)
     * @param token Token address (address(0) for ETH)
     * @return normalizedPrice Price in 18 decimal format
     */
    function getNormalizedPrice(address token) public view returns (uint256) {
        (int256 price, uint8 decimals) = _getPriceData(token);

        if (decimals < 18) {
            return uint256(price) * (10 ** (18 - decimals));
        } else {
            return uint256(price) / (10 ** (decimals - 18));
        }
    }

    /**
     * @dev Calculate USD value of token amount using the correct price feed
     * @param tokenAmount Amount of tokens
     * @param token Token address (address(0) for ETH)
     * @param tokenDecimals Decimals of the token
     * @return value USD value in price feed decimals (typically 8)
     */
    function calculateValue(
        uint256 tokenAmount,
        address token,
        uint8 tokenDecimals
    ) public view returns (uint256) {
        (int256 price, ) = _getPriceData(token);
        if (price <= 0) revert InvalidPrice();

        return (uint256(price) * tokenAmount) / (10 ** tokenDecimals);
    }

    /**
     * @dev Get complete price feed information for a token
     * @param token Token address (address(0) for ETH)
     * @return description Price feed description
     * @return decimals Number of decimal places
     * @return version Aggregator version
     */
    function getPriceFeedInfo(
        address token
    )
        public
        view
        returns (string memory description, uint8 decimals, uint256 version)
    {
        AggregatorV3Interface priceFeed = priceFeeds[token];
        if (address(priceFeed) == address(0)) revert PriceFeedNotSet();

        return (
            priceFeed.description(),
            priceFeed.decimals(),
            priceFeed.version()
        );
    }

    /**
     * @dev Check if price feed is set for a token
     * @param token Token address to check
     * @return True if price feed is set, false otherwise
     */
    function isPriceFeedSet(address token) public view virtual returns (bool) {
        return address(priceFeeds[token]) != address(0);
    }

    /**
     * @dev Get all tokens with price feeds set
     * @return tokens Array of token addresses that have price feeds set
     * @notice This is a view function but may be gas intensive for large numbers of tokens
     */
    function getAllTokensWithPriceFeeds()
        public
        view
        returns (address[] memory tokens)
    {
        // This is a simplified implementation
        // In production, you might want to maintain a separate array of tokens
        // This function is mainly for convenience and may not be suitable for large datasets

        uint256 count = 0;

        // Count tokens with price feeds (excluding address(0) which is always set)
        for (uint256 i = 0; i < type(uint160).max; i++) {
            address token = address(uint160(i));
            if (isPriceFeedSet(token)) {
                count++;
            }
            // In practice, you'd want to limit this loop or use a different approach
            if (count >= 1000) break; // Safety limit
        }

        tokens = new address[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < type(uint160).max; i++) {
            address token = address(uint160(i));
            if (isPriceFeedSet(token)) {
                tokens[index] = token;
                index++;
            }
            if (index >= count) break;
        }

        return tokens;
    }

    /**
     * @notice Request a new price feed for a token
     * @dev Users can request price feed setup for unsupported tokens
     * @param token Token address to request price feed for
     * @param tokenSymbol Token symbol for identification
     */
    function requestPriceFeed(
        address token,
        string memory tokenSymbol
    ) external {
        // Check if price feed already exists
        if (isPriceFeedSet(token)) {
            revert PriceFeedAlreadySet();
        }

        // Check if request is already pending
        if (pendingPriceFeedRequests[token]) {
            revert PriceFeedRequestPending();
        }

        // Mark request as pending
        pendingPriceFeedRequests[token] = true;

        // Emit event for off-chain monitoring
        emit PriceFeedRequested(msg.sender, token, tokenSymbol);
    }

    /**
     * @notice Approve a price feed request
     * @dev Only owner can approve price feed requests after verification
     * @param token Token address to set price feed for
     * @param priceFeed Price feed contract address
     */
    function approvePriceFeed(
        address token,
        address priceFeed
    ) external onlyOwner {
        // Reset pending status
        pendingPriceFeedRequests[token] = false;

        // Set the price feed
        setPriceFeed(token, priceFeed);

        // Emit approval event
        emit PriceFeedApproved(token, priceFeed);
    }

    /**
     * @dev Obtain the contract version information
     */
    function getVersion() public pure returns (string memory) {
        return "PriceConsumer v1.0.0";
    }
}
