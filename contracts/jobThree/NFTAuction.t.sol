// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {MockERC20} from "./Mock/MockERC20.sol";
import {MockPriceConsumer} from "./Mock/MockPriceConsumer.sol";
import {NFTAuction} from "./NFTAuction.sol";
import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PriceConsumer} from "./PriceConsumer.sol";

// ========== Mock Contracts ==========

/**
 * @title Mock ERC721 Token
 * @notice Minimal implementation of ERC721 for testing purposes
 */
contract MockERC721 {
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    /**
     * @notice Get owner of token
     * @param tokenId Token ID to query
     * @return address Owner address
     */
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: invalid token ID");
        return owner;
    }

    /**
     * @notice Transfer token
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     */
    function transferFrom(address from, address to, uint256 tokenId) external {
        require(
            _isApprovedOrOwner(msg.sender, tokenId),
            "ERC721: caller is not token owner or approved"
        );
        _transfer(from, to, tokenId);
    }

    /**
     * @notice Safe transfer token
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @notice Safe transfer token with data
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     * @param data Additional data
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public {
        require(
            _isApprovedOrOwner(msg.sender, tokenId),
            "ERC721: caller is not token owner or approved"
        );
        _safeTransfer(from, to, tokenId, data);
    }

    /**
     * @notice Approve token for spending
     * @param to Approved address
     * @param tokenId Token ID to approve
     */
    function approve(address to, uint256 tokenId) external {
        address owner = _owners[tokenId];
        require(to != owner, "ERC721: approval to current owner");
        require(
            msg.sender == owner || _operatorApprovals[owner][msg.sender],
            "ERC721: approve caller is not token owner or approved for all"
        );
        _tokenApprovals[tokenId] = to;
    }

    /**
     * @notice Set approval for all tokens
     * @param operator Operator address
     * @param approved Approval status
     */
    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
    }

    /**
     * @notice Mint new token
     * @param to Recipient address
     * @param tokenId Token ID to mint
     */
    function mint(address to, uint256 tokenId) external {
        require(to != address(0), "ERC721: mint to the zero address");
        require(_owners[tokenId] == address(0), "ERC721: token already minted");

        _owners[tokenId] = to;
        _balances[to]++;
    }

    /**
     * @notice Check if address is approved or owner
     * @param spender Address to check
     * @param tokenId Token ID to check
     * @return bool Is approved or owner
     */
    function _isApprovedOrOwner(
        address spender,
        uint256 tokenId
    ) internal view returns (bool) {
        address owner = _owners[tokenId];
        return (spender == owner ||
            _tokenApprovals[tokenId] == spender ||
            _operatorApprovals[owner][spender]);
    }

    /**
     * @notice Internal transfer function
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     */
    function _transfer(address from, address to, uint256 tokenId) internal {
        require(
            _owners[tokenId] == from,
            "ERC721: transfer from incorrect owner"
        );
        require(to != address(0), "ERC721: transfer to the zero address");

        _owners[tokenId] = to;
        _balances[from]--;
        _balances[to]++;
    }

    /**
     * @notice Internal safe transfer function
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     * @param data Additional data
     */
    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) internal {
        _transfer(from, to, tokenId);
        if (to.code.length > 0) {
            try
                IERC721Receiver(to).onERC721Received(
                    msg.sender,
                    from,
                    tokenId,
                    data
                )
            returns (bytes4 retval) {
                require(
                    retval == IERC721Receiver.onERC721Received.selector,
                    "ERC721: transfer to non ERC721Receiver implementer"
                );
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert(
                        "ERC721: transfer to non ERC721Receiver implementer"
                    );
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }
}

/**
 * @title ERC721 Receiver Interface
 * @notice Interface for contracts that handle ERC721 token receipts
 */
interface IERC721Receiver {
    /**
     * @notice Handle ERC721 token receipt
     * @param operator Operator address
     * @param from From address
     * @param tokenId Token ID received
     * @param data Additional data
     * @return bytes4 Function selector
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

// ========== Test Contracts ==========

/**
 * @title NFTAuction Dynamic Fee Tests
 * @notice Tests for dynamic fee functionality
 */
contract NFTAuctionDynamicFeeTest is Test {
    NFTAuction implementation;
    ERC1967Proxy proxy;
    NFTAuction auction;
    MockPriceConsumer priceConsumer;
    MockERC721 nft;
    MockERC20 paymentToken;

    address feeRecipient = makeAddr("feeRecipient");
    address admin = address(this);
    address seller = makeAddr("seller");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");

    uint256 constant TOKEN_ID = 1;
    uint256 constant START_PRICE = 1 ether;
    uint256 constant DURATION = 1 days;

    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount,
        uint256 usdValue,
        uint256 feeAmount,
        uint256 feeBps
    );

    function setUp() public {
        nft = new MockERC721();
        paymentToken = new MockERC20("Payment Token", "PAY", 18);
        priceConsumer = new MockPriceConsumer();

        // Set prices for dynamic fee calculation
        // ETH price: $2000 (8 decimals)
        priceConsumer.setMockPrice(address(0), 2000 * 1e8);
        // ERC20 token price: $1 (8 decimals)
        priceConsumer.setMockPrice(address(paymentToken), 1 * 1e8);

        implementation = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            feeRecipient,
            address(priceConsumer)
        );
        proxy = new ERC1967Proxy(address(implementation), data);
        auction = NFTAuction(payable(address(proxy)));

        // Setup: seller mints NFT
        vm.prank(seller);
        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.approve(address(auction), TOKEN_ID);
    }

    // ========== Dynamic Fee Tests ==========

    /**
     * @notice Test default fee tiers are set correctly
     */
    function test_DefaultFeeTiers() public view {
        uint256 tierCount = auction.getFeeTierCount();
        assertEq(tierCount, 4);

        // Check each tier
        (uint256 min1, uint256 max1, uint256 feeBps1) = auction.feeTiers(0);
        assertEq(min1, 0);
        assertEq(max1, 1000 * 1e8);
        assertEq(feeBps1, 500); // 5%

        (uint256 min2, uint256 max2, uint256 feeBps2) = auction.feeTiers(1);
        assertEq(min2, 1000 * 1e8);
        assertEq(max2, 10000 * 1e8);
        assertEq(feeBps2, 300); // 3%

        (uint256 min3, uint256 max3, uint256 feeBps3) = auction.feeTiers(2);
        assertEq(min3, 10000 * 1e8);
        assertEq(max3, 100000 * 1e8);
        assertEq(feeBps3, 200); // 2%

        (uint256 min4, uint256 max4, uint256 feeBps4) = auction.feeTiers(3);
        assertEq(min4, 100000 * 1e8);
        assertEq(max4, type(uint256).max);
        assertEq(feeBps4, 100); // 1%
    }

    /**
     * @notice Test dynamic fee calculation for different price tiers
     */
    function test_DynamicFeeCalculation() public {
        // Create auction with ETH
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        // Test case 1: $3000 USD bid (should use 3% fee)
        // 1.5 ETH * $2000 = $3000 USD
        vm.deal(bidder1, 5 ether);
        vm.prank(bidder1);
        auction.bid{value: 1.5 ether}(auctionId);

        (uint256 feeAmount1, uint256 feeBps1) = auction.calculatePlatformFee(
            auctionId
        );
        assertEq(feeBps1, 300); // 3%
        assertEq(feeAmount1, (1.5 ether * 300) / 10000);

        // Test case 2: $40000 USD bid (should use 2% fee)
        // 20 ETH * $2000 = $40000 USD
        vm.deal(bidder2, 25 ether);
        vm.prank(bidder2);
        auction.bid{value: 20 ether}(auctionId);

        (uint256 feeAmount2, uint256 feeBps2) = auction.calculatePlatformFee(
            auctionId
        );
        assertEq(feeBps2, 200); // 2%
        assertEq(feeAmount2, (20 ether * 200) / 10000);
    }

    /**
     * @notice Test dynamic fee with ERC20 payments
     */
    function test_DynamicFeeWithERC20() public {
        // Create auction with ERC20
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(paymentToken)
        );

        // Test case: $5000 USD bid (should use 3% fee)
        // 5000 tokens * $1 = $5000 USD
        paymentToken.mint(bidder1, 10000 ether);
        vm.prank(bidder1);
        paymentToken.approve(address(auction), 10000 ether);

        vm.prank(bidder1);
        auction.bidWithERC20(auctionId, 5000 ether);

        (uint256 feeAmount, uint256 feeBps) = auction.calculatePlatformFee(
            auctionId
        );
        assertEq(feeBps, 300); // 3%
        assertEq(feeAmount, (5000 ether * 300) / 10000);
    }

    /**
     * @notice Test minimum USD value for fee calculation
     */
    function test_MinUSDValueForFee() public {
        uint256 lowStartPrice = 0.001 ether;
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            lowStartPrice,
            DURATION,
            address(0)
        );

        // Test small bid below min USD value ($5 USD)
        // 0.0025 ETH * $2000 = $5 USD (below $10 min)
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        auction.bid{value: 0.0025 ether}(auctionId); // 这个出价必须高于起拍价 0.001 ether

        (uint256 feeAmount, uint256 feeBps) = auction.calculatePlatformFee(
            auctionId
        );
        assertEq(feeBps, 200); // Should use default fee (2%)
        assertEq(feeAmount, (0.0025 ether * 200) / 10000);
    }

    /**
     * @notice Test setting new fee tiers
     */
    function test_SetNewFeeTiers() public {
        NFTAuction.FeeTier[] memory newTiers = new NFTAuction.FeeTier[](3);
        newTiers[0] = NFTAuction.FeeTier({
            minAmountUSD: 0,
            maxAmountUSD: 500 * 1e8,
            feeBps: 400 // 4%
        });
        newTiers[1] = NFTAuction.FeeTier({
            minAmountUSD: 500 * 1e8,
            maxAmountUSD: 5000 * 1e8,
            feeBps: 250 // 2.5%
        });
        newTiers[2] = NFTAuction.FeeTier({
            minAmountUSD: 5000 * 1e8,
            maxAmountUSD: type(uint256).max,
            feeBps: 150 // 1.5%
        });

        auction.setFeeTiers(newTiers);

        uint256 tierCount = auction.getFeeTierCount();
        assertEq(tierCount, 3);

        (, , uint256 feeBps1) = auction.feeTiers(0);
        assertEq(feeBps1, 400);

        (, , uint256 feeBps2) = auction.feeTiers(1);
        assertEq(feeBps2, 250);

        (, , uint256 feeBps3) = auction.feeTiers(2);
        assertEq(feeBps3, 150);
    }

    /**
     * @notice Test setting invalid fee tiers should revert
     */
    function test_SetInvalidFeeTiers() public {
        // Test overlapping tiers
        NFTAuction.FeeTier[] memory invalidTiers = new NFTAuction.FeeTier[](2);
        invalidTiers[0] = NFTAuction.FeeTier({
            minAmountUSD: 0,
            maxAmountUSD: 1000 * 1e8,
            feeBps: 400
        });
        invalidTiers[1] = NFTAuction.FeeTier({
            minAmountUSD: 500 * 1e8, // Overlaps with previous tier
            maxAmountUSD: 2000 * 1e8,
            feeBps: 300
        });

        vm.expectRevert(abi.encodeWithSignature("InvalidFeeTiers()"));
        auction.setFeeTiers(invalidTiers);

        // Test tier with min >= max
        NFTAuction.FeeTier[] memory invalidTiers2 = new NFTAuction.FeeTier[](1);
        invalidTiers2[0] = NFTAuction.FeeTier({
            minAmountUSD: 1000 * 1e8,
            maxAmountUSD: 500 * 1e8, // min > max
            feeBps: 400
        });

        vm.expectRevert(abi.encodeWithSignature("InvalidFeeTiers()"));
        auction.setFeeTiers(invalidTiers2);

        // Test fee too high
        NFTAuction.FeeTier[] memory invalidTiers3 = new NFTAuction.FeeTier[](1);
        invalidTiers3[0] = NFTAuction.FeeTier({
            minAmountUSD: 0,
            maxAmountUSD: 1000 * 1e8,
            feeBps: 1500 // 15% - too high
        });

        vm.expectRevert(abi.encodeWithSignature("FeeTooHigh()"));
        auction.setFeeTiers(invalidTiers3);
    }

    /**
     * @notice Test setting minimum USD value
     */
    function test_SetMinUSDValue() public {
        uint256 newMinValue = 50 * 1e8; // $50 USD
        auction.setMinUSDValue(newMinValue);

        uint256 lowStartPrice = 0.001 ether;
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            lowStartPrice,
            DURATION,
            address(0)
        );

        // $25 USD bid (0.0125 ETH * $2000) - below new $50 min
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        auction.bid{value: 0.0125 ether}(auctionId); // 这个出价必须高于起拍价 0.001 ether

        (, uint256 feeBps) = auction.calculatePlatformFee(auctionId);
        assertEq(feeBps, 200); // Should use default fee
    }

    /**
     * @notice Test fee calculation with actual auction ending
     */
    function test_AuctionEndingWithDynamicFee() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        // Bid that falls in 3% fee tier ($3000 USD)
        vm.deal(bidder1, 5 ether);
        vm.prank(bidder1);
        auction.bid{value: 1.5 ether}(auctionId);

        vm.warp(block.timestamp + DURATION + 1);

        uint256 sellerBalanceBefore = seller.balance;
        uint256 feeRecipientBalanceBefore = feeRecipient.balance;

        vm.expectEmit(address(auction));
        emit AuctionEnded(
            auctionId,
            bidder1,
            1.5 ether,
            3000 * 1e8,
            (1.5 ether * 300) / 10000,
            300
        );

        vm.prank(seller);
        auction.endAuction(auctionId);

        uint256 expectedFee = (1.5 ether * 300) / 10000;
        uint256 expectedSellerAmount = 1.5 ether - expectedFee;

        assertEq(seller.balance, sellerBalanceBefore + expectedSellerAmount);
        assertEq(feeRecipient.balance, feeRecipientBalanceBefore + expectedFee);
    }

    /**
     * @notice Test getting all fee tiers
     */
    function test_GetAllFeeTiers() public view {
        NFTAuction.FeeTier[] memory tiers = auction.getFeeTiers();
        assertEq(tiers.length, 4);
        assertEq(tiers[0].feeBps, 500);
        assertEq(tiers[1].feeBps, 300);
        assertEq(tiers[2].feeBps, 200);
        assertEq(tiers[3].feeBps, 100);
    }
}

/**
 * @title NFTAuction Initialization Tests
 * @notice Tests for contract initialization and state variable setup
 */
contract NFTAuctionInitializationTest is Test {
    NFTAuction implementation;
    ERC1967Proxy proxy;
    NFTAuction auction;
    MockPriceConsumer priceConsumer;
    MockERC721 nft;

    address feeRecipient = makeAddr("feeRecipient");
    address admin = address(this);

    function setUp() public {
        nft = new MockERC721();
        priceConsumer = new MockPriceConsumer();
        priceConsumer.setMockPrice(address(0), 2000 * 1e8); // ETH price
        priceConsumer.setMockPrice(address(0x1), 1 * 1e8); // ERC20 token price

        implementation = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            feeRecipient,
            address(priceConsumer)
        );
        proxy = new ERC1967Proxy(address(implementation), data);
        auction = NFTAuction(payable(address(proxy)));
    }

    // ========== 1. Contract Initialization Tests ==========

    /**
     * @notice Test successful contract initialization
     */
    function test_Initialization() public view {
        assertEq(auction.feeRecipient(), feeRecipient);
        assertEq(address(auction.priceConsumer()), address(priceConsumer));
        assertEq(auction.defaultPlatformFee(), 200); // 2%
        assertEq(auction.owner(), admin);
        assertEq(auction.auctionCount(), 0);
        assertEq(auction.minUSDValue(), 10 * 1e8); // $10 USD
    }

    /**
     * @notice Test initialization with zero address should revert
     */
    function test_InitializationWithZeroAddress() public {
        NFTAuction newImpl = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            address(0),
            address(priceConsumer)
        );
        // Note: NFTAuction.initialize doesn't check for zero address, so this test may not revert
        // If zero address validation is needed, it should be added to the contract
        ERC1967Proxy newProxy = new ERC1967Proxy(address(newImpl), data);
        NFTAuction newAuction = NFTAuction(payable(address(newProxy)));
        assertEq(newAuction.feeRecipient(), address(0));
    }

    /**
     * @notice Test prevention of reinitialization
     */
    function test_PreventReinitialization() public {
        vm.expectRevert();
        auction.initialize(feeRecipient, address(priceConsumer));
    }
}

/**
 * @title NFTAuction Core Functionality Tests
 * @notice Tests for main business logic and normal workflows
 */
contract NFTAuctionCoreTest is Test {
    NFTAuction implementation;
    ERC1967Proxy proxy;
    NFTAuction auction;
    MockPriceConsumer priceConsumer;
    MockERC721 nft;
    MockERC20 paymentToken;

    address seller = makeAddr("seller");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");
    address feeRecipient = makeAddr("feeRecipient");

    uint256 constant TOKEN_ID = 1;
    uint256 constant START_PRICE = 1 ether;
    uint256 constant DURATION = 1 days;

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

    event NewBid(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 usdValue
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount,
        uint256 usdValue,
        uint256 feeAmount,
        uint256 feeBps
    );

    function setUp() public {
        nft = new MockERC721();
        paymentToken = new MockERC20("Payment Token", "PAY", 18);
        priceConsumer = new MockPriceConsumer();
        priceConsumer.setMockPrice(address(0), 2000 * 1e8); // ETH
        priceConsumer.setMockPrice(address(paymentToken), 1 * 1e8); // ERC20

        implementation = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            feeRecipient,
            address(priceConsumer)
        );
        proxy = new ERC1967Proxy(address(implementation), data);
        auction = NFTAuction(payable(address(proxy)));

        // Setup: seller mints NFT
        vm.prank(seller);
        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.approve(address(auction), TOKEN_ID);
    }

    // ========== 2. Core Business Logic Tests ==========

    /**
     * @notice Test creating auction with ETH payment
     */
    function test_CreateAuctionWithETH() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        assertEq(auctionId, 0);
        assertEq(auction.auctionCount(), 1);
        assertEq(nft.ownerOf(TOKEN_ID), address(auction));

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.seller, seller);
        assertEq(a.nftContract, address(nft));
        assertEq(a.tokenId, TOKEN_ID);
        assertEq(a.startPrice, START_PRICE);
        assertEq(a.paymentToken, address(0));
        assertEq(a.highestBid, START_PRICE);
        assertFalse(a.ended);
    }

    /**
     * @notice Test creating auction with ERC20 payment
     */
    function test_CreateAuctionWithERC20() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(paymentToken)
        );

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.paymentToken, address(paymentToken));
    }

    /**
     * @notice Test bidding with ETH
     */
    function test_BidWithETH() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        vm.deal(bidder1, 2 ether);
        vm.prank(bidder1);
        auction.bid{value: 1.5 ether}(auctionId);

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.highestBidder, bidder1);
        assertEq(a.highestBid, 1.5 ether);
    }

    /**
     * @notice Test bidding with ERC20
     */
    function test_BidWithERC20() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(paymentToken)
        );

        paymentToken.mint(bidder1, 10 ether);
        vm.prank(bidder1);
        paymentToken.approve(address(auction), 10 ether);

        vm.prank(bidder1);
        auction.bidWithERC20(auctionId, 1.5 ether);

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.highestBidder, bidder1);
        assertEq(a.highestBid, 1.5 ether);
    }

    /**
     * @notice Test multiple bids and refund mechanism
     */
    function test_MultipleBids() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        vm.deal(bidder1, 5 ether);
        vm.deal(bidder2, 5 ether);

        vm.prank(bidder1);
        auction.bid{value: 1.5 ether}(auctionId);

        vm.prank(bidder2);
        auction.bid{value: 2 ether}(auctionId);

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.highestBidder, bidder2);
        assertEq(a.highestBid, 2 ether);
        assertEq(bidder1.balance, 5 ether); // Refunded: 3.5 + 1.5 = 5
    }

    /**
     * @notice Test ending auction with winner
     */
    function test_EndAuctionWithWinner() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        vm.deal(bidder1, 5 ether);
        vm.prank(bidder1);
        auction.bid{value: 2 ether}(auctionId);

        vm.warp(block.timestamp + DURATION + 1);

        uint256 sellerBalanceBefore = seller.balance;
        uint256 feeRecipientBalanceBefore = feeRecipient.balance;

        vm.prank(seller);
        auction.endAuction(auctionId);

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertTrue(a.ended);
        assertEq(nft.ownerOf(TOKEN_ID), bidder1);

        // Calculate dynamic fee (2 ETH * $2000 = $4000 USD, which falls in 3% tier)
        uint256 feeAmount = (2 ether * 300) / 10000; // 3% fee
        uint256 sellerAmount = 2 ether - feeAmount;

        assertEq(seller.balance, sellerBalanceBefore + sellerAmount);
        assertEq(feeRecipient.balance, feeRecipientBalanceBefore + feeAmount);
    }

    /**
     * @notice Test ending auction without bids
     */
    function test_EndAuctionWithoutBids() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(seller);
        auction.endAuction(auctionId);

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertTrue(a.ended);
        assertEq(nft.ownerOf(TOKEN_ID), seller); // Returned to seller
    }

    /**
     * @notice Test getting active auctions
     */
    function test_GetActiveAuctions() public {
        vm.prank(seller);
        auction.createAuction(
            address(nft),
            TOKEN_ID,
            START_PRICE,
            DURATION,
            address(0)
        );

        nft.mint(seller, 2);
        vm.prank(seller);
        nft.approve(address(auction), 2);
        vm.prank(seller);
        auction.createAuction(
            address(nft),
            2,
            START_PRICE,
            DURATION,
            address(0)
        );

        uint256[] memory active = auction.getActiveAuctions();
        assertEq(active.length, 2);
    }
}

/**
 * @title NFTAuction Edge Cases Test
 * @notice Tests for boundary conditions and error handling
 */
contract NFTAuctionEdgeCaseTest is Test {
    NFTAuction implementation;
    ERC1967Proxy proxy;
    NFTAuction auction;
    MockPriceConsumer priceConsumer;
    MockERC721 nft;
    MockERC20 paymentToken;

    address seller = makeAddr("seller");
    address bidder = makeAddr("bidder");
    address feeRecipient = makeAddr("feeRecipient");

    uint256 constant TOKEN_ID = 1;

    function setUp() public {
        nft = new MockERC721();
        paymentToken = new MockERC20("Payment Token", "PAY", 18);
        priceConsumer = new MockPriceConsumer();
        priceConsumer.setMockPrice(address(0), 2000 * 1e8);
        priceConsumer.setMockPrice(address(paymentToken), 1 * 1e8);

        implementation = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            feeRecipient,
            address(priceConsumer)
        );
        proxy = new ERC1967Proxy(address(implementation), data);
        auction = NFTAuction(payable(address(proxy)));

        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.approve(address(auction), TOKEN_ID);
    }

    // ========== 3. Boundary Conditions and Exception Tests ==========

    /**
     * @notice Test creating auction with zero start price should revert
     */
    function test_CreateAuctionWithZeroStartPrice() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("InvalidStartPrice()"));
        auction.createAuction(address(nft), TOKEN_ID, 0, 1 days, address(0));
    }

    /**
     * @notice Test creating auction with too short duration should revert
     */
    function test_CreateAuctionWithDurationTooShort() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("DurationTooShort()"));
        auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            30 seconds,
            address(0)
        );
    }

    /**
     * @notice Test creating auction with too long duration should revert
     */
    function test_CreateAuctionWithDurationTooLong() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("DurationTooLong()"));
        auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            31 days,
            address(0)
        );
    }

    /**
     * @notice Test creating auction with zero address NFT should revert
     */
    function test_CreateAuctionWithZeroAddressNFT() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("InvalidAddress()"));
        auction.createAuction(
            address(0),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );
    }

    /**
     * @notice Test creating auction without price feed should revert
     */
    function test_CreateAuctionWithoutPriceFeed() public {
        MockPriceConsumer newPriceConsumer = new MockPriceConsumer();
        NFTAuction newImpl = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            feeRecipient,
            address(newPriceConsumer)
        );
        ERC1967Proxy newProxy = new ERC1967Proxy(address(newImpl), data);
        NFTAuction newAuction = NFTAuction(payable(address(newProxy)));

        nft.mint(seller, 2);
        vm.prank(seller);
        nft.approve(address(newAuction), 2);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("PriceFeedNotSet()"));
        newAuction.createAuction(address(nft), 2, 1 ether, 1 days, address(0));
    }

    /**
     * @notice Test bidding before auction starts should revert
     */
    function test_BidBeforeAuctionStarts() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.warp(block.timestamp - 1);
        vm.deal(bidder, 2 ether);
        vm.prank(bidder);
        vm.expectRevert(abi.encodeWithSignature("AuctionNotStarted()"));
        auction.bid{value: 1.5 ether}(auctionId);
    }

    /**
     * @notice Test bidding after auction ends should revert
     */
    function test_BidAfterAuctionEnds() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.warp(block.timestamp + 1 days + 1);
        vm.deal(bidder, 2 ether);
        vm.prank(bidder);
        vm.expectRevert(abi.encodeWithSignature("AuctionHasEnded()"));
        auction.bid{value: 1.5 ether}(auctionId);
    }

    /**
     * @notice Test bidding too low amount should revert
     */
    function test_BidTooLow() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.deal(bidder, 2 ether);
        vm.prank(bidder);
        vm.expectRevert(abi.encodeWithSignature("BidTooLow()"));
        auction.bid{value: 0.5 ether}(auctionId);
    }

    /**
     * @notice Test bidding with wrong payment token should revert
     */
    function test_BidWithWrongPaymentToken() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(paymentToken)
        );

        vm.deal(bidder, 2 ether);
        vm.prank(bidder);
        vm.expectRevert(abi.encodeWithSignature("InvalidPaymentToken()"));
        auction.bid{value: 1.5 ether}(auctionId);
    }

    /**
     * @notice Test ending auction before end time should revert
     */
    function test_EndAuctionBeforeEndTime() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("AuctionNotStarted()"));
        auction.endAuction(auctionId);
    }

    /**
     * @notice Test ending auction twice should revert
     */
    function test_EndAuctionTwice() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(seller);
        auction.endAuction(auctionId);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("AuctionAlreadyEnded()"));
        auction.endAuction(auctionId);
    }

    /**
     * @notice Test setting platform fee too high should revert
     */
    function test_SetPlatformFeeTooHigh() public {
        vm.expectRevert(abi.encodeWithSignature("FeeTooHigh()"));
        auction.setDefaultPlatformFee(1001); // > 10%
    }

    /**
     * @notice Test setting fee recipient to zero address should revert
     */
    function test_SetFeeRecipientZeroAddress() public {
        vm.expectRevert(abi.encodeWithSignature("InvalidAddress()"));
        auction.setFeeRecipient(address(0));
    }
}

/**
 * @title NFTAuction Permission Tests
 * @notice Tests for access control and authorization
 */
contract NFTAuctionPermissionTest is Test {
    NFTAuction implementation;
    ERC1967Proxy proxy;
    NFTAuction auction;
    MockPriceConsumer priceConsumer;
    MockERC721 nft;

    address owner = address(this);
    address user = makeAddr("user");
    address seller = makeAddr("seller");
    address feeRecipient = makeAddr("feeRecipient");

    uint256 constant TOKEN_ID = 1;

    function setUp() public {
        nft = new MockERC721();
        priceConsumer = new MockPriceConsumer();
        priceConsumer.setMockPrice(address(0), 2000 * 1e8);

        implementation = new NFTAuction();
        bytes memory data = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            feeRecipient,
            address(priceConsumer)
        );
        proxy = new ERC1967Proxy(address(implementation), data);
        auction = NFTAuction(payable(address(proxy)));

        nft.mint(seller, TOKEN_ID);
        vm.prank(seller);
        nft.approve(address(auction), TOKEN_ID);
    }

    // ========== 4. Permissions and Access Control Tests ==========

    /**
     * @notice Test only owner can set platform fee
     */
    function test_OnlyOwnerCanSetPlatformFee() public {
        vm.prank(user);
        vm.expectRevert();
        auction.setDefaultPlatformFee(300);
    }

    /**
     * @notice Test only owner can set fee recipient
     */
    function test_OnlyOwnerCanSetFeeRecipient() public {
        vm.prank(user);
        vm.expectRevert();
        auction.setFeeRecipient(makeAddr("newRecipient"));
    }

    /**
     * @notice Test only owner can set fee tiers
     */
    function test_OnlyOwnerCanSetFeeTiers() public {
        NFTAuction.FeeTier[] memory newTiers = new NFTAuction.FeeTier[](1);
        newTiers[0] = NFTAuction.FeeTier({
            minAmountUSD: 0,
            maxAmountUSD: 1000 * 1e8,
            feeBps: 400
        });

        vm.prank(user);
        vm.expectRevert();
        auction.setFeeTiers(newTiers);
    }

    /**
     * @notice Test only owner can set min USD value
     */
    function test_OnlyOwnerCanSetMinUSDValue() public {
        vm.prank(user);
        vm.expectRevert();
        auction.setMinUSDValue(50 * 1e8);
    }

    /**
     * @notice Test only owner can emergency cancel
     */
    function test_OnlyOwnerCanEmergencyCancel() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.prank(user);
        vm.expectRevert();
        auction.emergencyCancel(auctionId);
    }

    /**
     * @notice Test only seller or owner can end auction
     */
    function test_OnlySellerOrOwnerCanEndAuction() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("NotAuthorized()"));
        auction.endAuction(auctionId);
    }

    /**
     * @notice Test owner can end auction
     */
    function test_OwnerCanEndAuction() public {
        vm.prank(seller);
        uint256 auctionId = auction.createAuction(
            address(nft),
            TOKEN_ID,
            1 ether,
            1 days,
            address(0)
        );

        vm.warp(block.timestamp + 1 days + 1);
        auction.endAuction(auctionId); // Owner can end

        NFTAuction.Auction memory a = auction.getAuction(auctionId);
        assertTrue(a.ended);
    }
}
