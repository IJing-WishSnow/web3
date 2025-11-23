// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import {PriceConsumer} from "./PriceConsumer.sol";

contract NFTAuction is ReentrancyGuard, Ownable {
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

    // Mapping from auction ID to auction information
    mapping(uint256 => Auction) public auctions;

    // Current auction ID counter (increments for each new auction)
    uint256 public auctionCount;

    // Platform fee percentage in basis points (1 basis point = 0.01%)
    // Example: 200 = 2% (200/10000 = 0.02)
    uint256 public platformFee = 200;

    // Platform fee recipient address
    address public feeRecipient;

    PriceConsumer public priceConsumer;

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
     */
    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount,
        uint256 usdValue
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
    error AuctionHasEnded(); // 重命名：避免与事件冲突

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

    constructor(
        address _feeRecipient,
        address _priceConsumer
    ) Ownable(msg.sender) {
        feeRecipient = _feeRecipient;
        priceConsumer = PriceConsumer(_priceConsumer);
    }

    /**
     * @dev Create a new auction
     * @notice List an NFT for auction with specified parameters
     * @param _nftContract Address of the NFT contract
     * @param _tokenId ID of the NFT to auction
     * @param _startPrice Starting bid price (in wei or token smallest unit)
     * @param _duration Auction duration in seconds
     * @param _paymentToken Payment token address (address(0) for ETH)
     * @return auctionId ID of the newly created auction
     *
     * Requirements:
     * - Start price must be greater than 0
     * - Duration must be between 1 minute and 30 days
     * - Caller must be the owner of the NFT
     * - NFT must be successfully transferred to this contract
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
            IERC721(_nftContract).transferFrom(
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
     * @notice Bid on an auction using ETH. Bid must be higher than current highest bid.
     * @param _auctionId ID of the auction to bid on
     *
     * Requirements:
     * - Auction must be active (started and not ended)
     * - Bid amount must exceed current highest bid
     * - Auction must accept ETH payments
     * - Sent ETH value must equal bid amount
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
     * @notice Bid on an auction using ERC20 tokens. Bid must be higher than current highest bid.
     * @param _auctionId ID of the auction to bid on
     * @param _amount Bid amount in token smallest units
     *
     * Requirements:
     * - Auction must be active (started and not ended)
     * - Bid amount must exceed current highest bid
     * - Auction must accept ERC20 token payments
     * - Caller must have approved sufficient tokens to this contract
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
            IERC20(auction.paymentToken).transferFrom(
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
                IERC20(auction.paymentToken).transfer(
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
     * @notice End an auction, transfer NFT to highest bidder and funds to seller
     * @param _auctionId ID of the auction to end
     *
     * Requirements:
     * - Auction must have ended (current time > end time)
     * - Caller must be the seller or contract owner
     * - Auction must not already be ended
     */
    function endAuction(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];

        if (auction.ended) revert AuctionAlreadyEnded();
        if (block.timestamp <= auction.endTime) revert AuctionNotStarted();
        if (msg.sender != auction.seller && msg.sender != owner())
            revert NotAuthorized();

        auction.ended = true;

        if (auction.highestBidder != address(0)) {
            // Calculate platform fee and seller proceeds
            uint256 feeAmount = (auction.highestBid * platformFee) / 10000;
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
                    IERC20(auction.paymentToken).transfer(
                        auction.seller,
                        sellerAmount
                    )
                {
                    // Transfer successful
                } catch {
                    revert TransferFailed();
                }

                try
                    IERC20(auction.paymentToken).transfer(
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
                IERC721(auction.nftContract).safeTransferFrom(
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
                usdValue
            );
        } else {
            // No bids - return NFT to seller
            try
                IERC721(auction.nftContract).safeTransferFrom(
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
     * @dev Emergency cancel an auction (owner only)
     * @notice Contract owner can cancel an auction in emergency situations
     * @param _auctionId ID of the auction to cancel
     *
     * Requirements:
     * - Caller must be contract owner
     * - Auction must not already be ended
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
                    IERC20(auction.paymentToken).transfer(
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
            IERC721(auction.nftContract).safeTransferFrom(
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
     * @dev Update platform fee percentage
     * @notice Owner can update the platform fee percentage
     * @param _newFee New platform fee in basis points (e.g., 200 = 2%)
     *
     * Requirements:
     * - Caller must be contract owner
     * - New fee cannot exceed 10% (1000 basis points)
     */
    function setPlatformFee(uint256 _newFee) external onlyOwner {
        if (_newFee > 1000) revert FeeTooHigh(); // Maximum 10%
        platformFee = _newFee;
    }

    /**
     * @dev Update fee recipient address
     * @notice Owner can update the address that receives platform fees
     * @param _newRecipient New fee recipient address
     *
     * Requirements:
     * - Caller must be contract owner
     * - New address cannot be zero address
     */
    function setFeeRecipient(address _newRecipient) external onlyOwner {
        if (_newRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _newRecipient;
    }

    /**
     * @dev Get auction details
     * @param _auctionId ID of the auction to query
     * @return Auction structure containing auction details
     */
    function getAuction(
        uint256 _auctionId
    ) external view returns (Auction memory) {
        return auctions[_auctionId];
    }

    /**
     * @dev Get all active auctions
     * @notice Returns array of auction IDs that are currently active
     * @return Array of active auction IDs
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

    // 辅助函数获取代币小数位
    function _getTokenDecimals(address token) internal view returns (uint8) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint8));
        }
        return 18; // 默认18位小数
    }

    /**
     * @dev Fallback function to receive ETH
     */
    receive() external payable {}
}
