// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {PriceConsumer} from "./PriceConsumer.sol";

contract NFTAuction is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // Auction structure
    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId; // NFT tokenId
        uint256 startTime;
        uint256 endTime;
        uint256 startPrice;
        address paymentToken; // Payment token address (address(0) represents ETH)
        address highestBidder;
        uint256 highestBid;
        bool ended;
    }

    // Fee tier structure for dynamic fee calculation
    struct FeeTier {
        uint256 minAmountUSD; // Minimum amount in USD (8 decimals)
        uint256 maxAmountUSD; // Maximum amount in USD (8 decimals)
        uint256 feeBps; // Fee in basis points (1 basis point = 0.01%)
    }

    // Mapping from auction ID to auction information
    mapping(uint256 => Auction) public auctions;

    // Fee tiers for dynamic fee calculation
    FeeTier[] public feeTiers;

    // Current auction ID counter (increments for each new auction)
    uint256 public auctionCount;

    // Default platform fee percentage in basis points (used as fallback)
    uint256 public defaultPlatformFee;

    // Platform fee recipient address
    address public feeRecipient;

    PriceConsumer public priceConsumer;

    // Minimum USD value for fee calculation (in price feed decimals, typically 8)
    uint256 public minUSDValue;

    // Add storage gaps to prevent storage conflicts
    uint256[50] private __gap;

    /**
     * @dev Emitted when fee tiers are updated
     * @param tiersCount Number of fee tiers
     */
    event FeeTiersUpdated(uint256 tiersCount);

    /**
     * @dev Emitted when a new auction is created
     * @param auctionId The unique identifier of the auction
     * @param seller The address of the NFT seller
     * @param nftContract The address of the NFT contract
     * @param tokenId The ID of the NFT being auctioned
     * @param startTime The timestamp when the auction starts
     * @param endTime The timestamp when the auction ends
     * @param startPrice The initial/starting price of the auction
     * @param paymentToken The token address used for payments (address(0) for ETH)
     */
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startTime,
        uint256 endTime,
        uint256 startPrice,
        address paymentToken
    );

    /**
     * @dev Emitted when a new bid is placed in an auction
     * @param auctionId The ID of the auction where the bid was placed
     * @param bidder The address of the bidder
     * @param amount The bid amount (in wei for ETH, or token smallest units for ERC20)
     * @param usdValue The USD value of the bid (in price feed decimals, typically 8)
     */
    event NewBid(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 usdValue
    );

    /**
     * @dev Emitted when an auction successfully ends with a winner
     * @param auctionId The ID of the completed auction
     * @param winner The address of the winning bidder
     * @param amount The final winning bid amount
     * @param usdValue The USD value of the winning bid (in price feed decimals)
     * @param feeAmount The platform fee charged
     * @param feeBps The fee rate in basis points that was applied
     */
    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount,
        uint256 usdValue,
        uint256 feeAmount,
        uint256 feeBps
    );

    /**
     * @dev Emitted when an auction is cancelled (no bids or emergency cancellation)
     * @param auctionId The ID of the cancelled auction
     */
    event AuctionCancelled(uint256 indexed auctionId);

    // Custom errors - more gas efficient than require statements with strings

    /**
     * @dev Thrown when attempting to create an auction with a start price of zero
     */
    error InvalidStartPrice();

    /**
     * @dev Thrown when auction duration is less than the minimum allowed (1 minute)
     */
    error DurationTooShort();

    /**
     * @dev Thrown when auction duration exceeds the maximum allowed (30 days)
     */
    error DurationTooLong();

    /**
     * @dev Thrown when attempting to bid on an auction that hasn't started yet
     */
    error AuctionNotStarted();

    /**
     * @dev Thrown when attempting to bid on an auction that has already ended
     */
    error AuctionHasEnded();

    /**
     * @dev Thrown when attempting to end an auction that has already been finalized
     */
    error AuctionAlreadyEnded();

    /**
     * @dev Thrown when a bid amount is not higher than the current highest bid
     */
    error BidTooLow();

    /**
     * @dev Thrown when a caller is not authorized to perform a specific action
     * (e.g., not the seller or contract owner trying to end an auction)
     */
    error NotAuthorized();

    /**
     * @dev Thrown when using incorrect payment token type for an auction
     * (e.g., sending ETH to an ERC20-only auction or vice versa)
     */
    error InvalidPaymentToken();

    /**
     * @dev Thrown when a token transfer (NFT or ERC20) fails
     */
    error TransferFailed();

    /**
     * @dev Thrown when refunding a previous bidder fails
     */
    error RefundFailed();

    /**
     * @dev Thrown when a zero address is provided where a valid address is required
     */
    error InvalidAddress();

    /**
     * @dev Thrown when attempting to set a platform fee higher than the maximum allowed (10%)
     */
    error FeeTooHigh();

    /**
     * @dev Thrown when attempting to perform an operation that requires a price feed,
     * but no price feed address has been configured for the specified token
     */
    error PriceFeedNotSet();

    /**
     * @dev Thrown when fee tiers are invalid (overlapping, not sorted, etc.)
     */
    error InvalidFeeTiers();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialization function replaces the constructor function
     */
    function initialize(
        address _feeRecipient,
        address _priceConsumer
    ) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init();
        __UUPSUpgradeable_init();

        feeRecipient = _feeRecipient;
        priceConsumer = PriceConsumer(_priceConsumer);
        defaultPlatformFee = 200; // 2% default
        minUSDValue = 10 * 10 ** 8; // $10 USD with 8 decimals

        // Initialize default fee tiers
        // Tier 1: $0 - $1,000: 5%
        feeTiers.push(
            FeeTier({
                minAmountUSD: 0,
                maxAmountUSD: 1000 * 10 ** 8,
                feeBps: 500
            })
        );
        // Tier 2: $1,000 - $10,000: 3%
        feeTiers.push(
            FeeTier({
                minAmountUSD: 1000 * 10 ** 8,
                maxAmountUSD: 10000 * 10 ** 8,
                feeBps: 300
            })
        );
        // Tier 3: $10,000 - $100,000: 2%
        feeTiers.push(
            FeeTier({
                minAmountUSD: 10000 * 10 ** 8,
                maxAmountUSD: 100000 * 10 ** 8,
                feeBps: 200
            })
        );
        // Tier 4: $100,000+: 1%
        feeTiers.push(
            FeeTier({
                minAmountUSD: 100000 * 10 ** 8,
                maxAmountUSD: type(uint256).max,
                feeBps: 100
            })
        );
    }

    /**
     * @dev UUPS Upgrade Authorization Function
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /**
     * @dev Calculate dynamic fee based on USD value
     * @param _usdValue USD value of the transaction (in price feed decimals)
     * @return feeBps Fee rate in basis points
     */
    function _calculateDynamicFee(
        uint256 _usdValue
    ) internal view returns (uint256 feeBps) {
        // Use default fee for very small amounts
        if (_usdValue < minUSDValue) {
            return defaultPlatformFee;
        }

        // Find appropriate fee tier
        for (uint256 i = 0; i < feeTiers.length; i++) {
            if (
                _usdValue >= feeTiers[i].minAmountUSD &&
                _usdValue < feeTiers[i].maxAmountUSD
            ) {
                return feeTiers[i].feeBps;
            }
        }

        // Fallback to default fee
        return defaultPlatformFee;
    }

    /**
     * @dev Calculate platform fee for a given auction
     * @param _auctionId ID of the auction
     * @return feeAmount The fee amount in payment token units
     * @return feeBps The fee rate in basis points that was applied
     */
    function calculatePlatformFee(
        uint256 _auctionId
    ) public view returns (uint256 feeAmount, uint256 feeBps) {
        Auction storage auction = auctions[_auctionId];
        if (auction.highestBidder == address(0)) {
            return (0, 0);
        }

        // Calculate USD value of the highest bid
        uint8 tokenDecimals = auction.paymentToken == address(0)
            ? 18
            : _getTokenDecimals(auction.paymentToken);
        uint256 usdValue = priceConsumer.calculateValue(
            auction.highestBid,
            auction.paymentToken,
            tokenDecimals
        );

        // Get dynamic fee rate
        feeBps = _calculateDynamicFee(usdValue);
        feeAmount = (auction.highestBid * feeBps) / 10000;

        return (feeAmount, feeBps);
    }

    /**
     * @dev Set dynamic fee tiers
     * @param _feeTiers Array of FeeTier structures
     *
     * Requirements:
     * - Caller must be contract owner
     * - Fee tiers must be valid (non-overlapping, properly sorted)
     */
    function setFeeTiers(FeeTier[] memory _feeTiers) external onlyOwner {
        // Clear existing tiers
        delete feeTiers;

        // Validate and set new tiers
        for (uint256 i = 0; i < _feeTiers.length; i++) {
            // Validate fee basis points
            if (_feeTiers[i].feeBps > 1000) revert FeeTooHigh(); // Max 10%

            // Validate tier order (min should be less than max)
            if (_feeTiers[i].minAmountUSD >= _feeTiers[i].maxAmountUSD) {
                revert InvalidFeeTiers();
            }

            // Validate no overlap with previous tier
            if (i > 0) {
                if (_feeTiers[i].minAmountUSD < _feeTiers[i - 1].maxAmountUSD) {
                    revert InvalidFeeTiers();
                }
            }

            feeTiers.push(_feeTiers[i]);
        }

        emit FeeTiersUpdated(_feeTiers.length);
    }

    /**
     * @dev Set minimum USD value for dynamic fee calculation
     * @param _minUSDValue Minimum USD value (in price feed decimals)
     */
    function setMinUSDValue(uint256 _minUSDValue) external onlyOwner {
        minUSDValue = _minUSDValue;
    }

    /**
     * @dev Get all fee tiers
     * @return Array of FeeTier structures
     */
    function getFeeTiers() external view returns (FeeTier[] memory) {
        return feeTiers;
    }

    /**
     * @dev Get fee tier count
     * @return Number of fee tiers
     */
    function getFeeTierCount() external view returns (uint256) {
        return feeTiers.length;
    }

    /**
     * @dev Create a new auction
     */
    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startPrice,
        uint256 _duration,
        address _paymentToken
    ) external nonReentrant returns (uint256) {
        // Parameter validation
        if (_startPrice == 0) revert InvalidStartPrice();
        if (_duration < 1 minutes) revert DurationTooShort();
        if (_duration > 30 days) revert DurationTooLong();
        if (_nftContract == address(0)) revert InvalidAddress();

        // Check if price feed is set
        if (!priceConsumer.isPriceFeedSet(_paymentToken)) {
            revert PriceFeedNotSet();
        }

        // Transfer NFT to this contract
        try
            IERC721Upgradeable(_nftContract).transferFrom(
                msg.sender,
                address(this),
                _tokenId
            )
        {
            // Continue with auction creation
        } catch {
            revert TransferFailed();
        }

        uint256 auctionId = auctionCount++;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: _nftContract,
            tokenId: _tokenId,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            startPrice: _startPrice,
            paymentToken: _paymentToken,
            highestBidder: address(0),
            highestBid: _startPrice,
            ended: false
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            _nftContract,
            _tokenId,
            block.timestamp,
            block.timestamp + _duration,
            _startPrice,
            _paymentToken
        );

        return auctionId;
    }

    /**
     * @dev Place a bid using ETH
     */
    function bid(uint256 _auctionId) external payable nonReentrant {
        Auction storage auction = auctions[_auctionId];

        if (auction.ended) revert AuctionHasEnded();
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp > auction.endTime) revert AuctionHasEnded();
        if (msg.value <= auction.highestBid) revert BidTooLow();
        if (auction.paymentToken != address(0)) revert InvalidPaymentToken();

        // Refund previous highest bidder
        if (auction.highestBidder != address(0)) {
            (bool success, ) = auction.highestBidder.call{
                value: auction.highestBid
            }("");
            if (!success) revert RefundFailed();
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;

        uint256 usdValue = priceConsumer.calculateValue(
            msg.value,
            address(0),
            18
        );
        emit NewBid(_auctionId, msg.sender, msg.value, usdValue);
    }

    /**
     * @dev Place a bid using ERC20 tokens
     */
    function bidWithERC20(
        uint256 _auctionId,
        uint256 _amount
    ) external nonReentrant {
        Auction storage auction = auctions[_auctionId];

        if (auction.ended) revert AuctionHasEnded();
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp > auction.endTime) revert AuctionHasEnded();
        if (_amount <= auction.highestBid) revert BidTooLow();
        if (auction.paymentToken == address(0)) revert InvalidPaymentToken();

        // Transfer tokens from bidder
        try
            IERC20Upgradeable(auction.paymentToken).transferFrom(
                msg.sender,
                address(this),
                _amount
            )
        {
            // Transfer successful
        } catch {
            revert TransferFailed();
        }

        // Refund previous highest bidder
        if (auction.highestBidder != address(0)) {
            try
                IERC20Upgradeable(auction.paymentToken).transfer(
                    auction.highestBidder,
                    auction.highestBid
                )
            {
                // Refund successful
            } catch {
                revert RefundFailed();
            }
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = _amount;

        uint8 tokenDecimals = _getTokenDecimals(auction.paymentToken);
        uint256 usdValue = priceConsumer.calculateValue(
            _amount,
            auction.paymentToken,
            tokenDecimals
        );
        emit NewBid(_auctionId, msg.sender, _amount, usdValue);
    }

    /**
     * @dev Finalize an auction
     */
    function endAuction(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];

        if (auction.ended) revert AuctionAlreadyEnded();
        if (block.timestamp <= auction.endTime) revert AuctionNotStarted();
        if (msg.sender != auction.seller && msg.sender != owner())
            revert NotAuthorized();

        auction.ended = true;

        if (auction.highestBidder != address(0)) {
            // Calculate dynamic platform fee
            (uint256 feeAmount, uint256 feeBps) = calculatePlatformFee(
                _auctionId
            );
            uint256 sellerAmount = auction.highestBid - feeAmount;

            // Transfer funds
            if (auction.paymentToken == address(0)) {
                // ETH transfer
                (bool success1, ) = auction.seller.call{value: sellerAmount}(
                    ""
                );
                (bool success2, ) = feeRecipient.call{value: feeAmount}("");
                if (!success1 || !success2) revert TransferFailed();
            } else {
                // ERC20 transfer
                try
                    IERC20Upgradeable(auction.paymentToken).transfer(
                        auction.seller,
                        sellerAmount
                    )
                {
                    // Transfer successful
                } catch {
                    revert TransferFailed();
                }

                try
                    IERC20Upgradeable(auction.paymentToken).transfer(
                        feeRecipient,
                        feeAmount
                    )
                {
                    // Transfer successful
                } catch {
                    revert TransferFailed();
                }
            }

            // Transfer NFT to winner
            try
                IERC721Upgradeable(auction.nftContract).safeTransferFrom(
                    address(this),
                    auction.highestBidder,
                    auction.tokenId
                )
            {
                // Transfer successful
            } catch {
                revert TransferFailed();
            }

            uint8 tokenDecimals = auction.paymentToken == address(0)
                ? 18
                : _getTokenDecimals(auction.paymentToken);
            uint256 usdValue = priceConsumer.calculateValue(
                auction.highestBid,
                auction.paymentToken,
                tokenDecimals
            );

            emit AuctionEnded(
                _auctionId,
                auction.highestBidder,
                auction.highestBid,
                usdValue,
                feeAmount,
                feeBps
            );
        } else {
            // No bids - return NFT to seller
            try
                IERC721Upgradeable(auction.nftContract).safeTransferFrom(
                    address(this),
                    auction.seller,
                    auction.tokenId
                )
            {
                // Transfer successful
            } catch {
                revert TransferFailed();
            }
            emit AuctionCancelled(_auctionId);
        }
    }

    /**
     * @dev Update default platform fee percentage (fallback)
     */
    function setDefaultPlatformFee(uint256 _newFee) external onlyOwner {
        if (_newFee > 1000) revert FeeTooHigh(); // Maximum 10%
        defaultPlatformFee = _newFee;
    }

    /**
     * @dev Update fee recipient address
     */
    function setFeeRecipient(address _newRecipient) external onlyOwner {
        if (_newRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _newRecipient;
    }

    // The following functions remain unchanged from your original code:
    // emergencyCancel, getAuction, getActiveAuctions, _getTokenDecimals, receive

    /**
     * @dev Emergency cancel an auction (owner only)
     */
    function emergencyCancel(uint256 _auctionId) external onlyOwner {
        Auction storage auction = auctions[_auctionId];
        if (auction.ended) revert AuctionAlreadyEnded();

        auction.ended = true;

        // Refund highest bidder if exists
        if (auction.highestBidder != address(0)) {
            if (auction.paymentToken == address(0)) {
                (bool success, ) = auction.highestBidder.call{
                    value: auction.highestBid
                }("");
                if (!success) revert RefundFailed();
            } else {
                try
                    IERC20Upgradeable(auction.paymentToken).transfer(
                        auction.highestBidder,
                        auction.highestBid
                    )
                {
                    // Refund successful
                } catch {
                    revert RefundFailed();
                }
            }
        }

        // Return NFT to seller
        try
            IERC721Upgradeable(auction.nftContract).safeTransferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            )
        {
            // Transfer successful
        } catch {
            revert TransferFailed();
        }

        emit AuctionCancelled(_auctionId);
    }

    /**
     * @dev Get auction details
     */
    function getAuction(
        uint256 _auctionId
    ) external view returns (Auction memory) {
        return auctions[_auctionId];
    }

    /**
     * @dev Get all active auctions
     */
    function getActiveAuctions() external view returns (uint256[] memory) {
        uint256 count = 0;

        // Count active auctions
        for (uint256 i = 0; i < auctionCount; i++) {
            if (!auctions[i].ended && block.timestamp <= auctions[i].endTime) {
                count++;
            }
        }

        // Populate array
        uint256[] memory activeAuctions = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < auctionCount; i++) {
            if (!auctions[i].ended && block.timestamp <= auctions[i].endTime) {
                activeAuctions[index] = i;
                index++;
            }
        }

        return activeAuctions;
    }

    /**
     * @dev The auxiliary function retrieves the decimal places of the token.
     */
    function _getTokenDecimals(address token) internal view returns (uint8) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint8));
        }
        return 18; // Default 18 decimal places
    }

    /**
     * @dev Fallback function to receive ETH
     */
    receive() external payable {}
}
