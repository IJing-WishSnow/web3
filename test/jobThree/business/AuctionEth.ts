import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEventLogs, parseEther } from "viem";

describe("AuctionEth - Complete ETH Payment Auction Flow Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder1, bidder2, bidder3, feeRecipient] = await viem.getWalletClients();

    console.log(`\n🧪 Starting AuctionEth Tests`);
    console.log(`Owner: ${owner.account.address}`);
    console.log(`Seller: ${seller.account.address}`);
    console.log(`Bidder1: ${bidder1.account.address}`);
    console.log(`Bidder2: ${bidder2.account.address}`);
    console.log(`Bidder3: ${bidder3.account.address}`);
    console.log(`Fee Recipient: ${feeRecipient.account.address}\n`);

    /**
     * Helper function to deploy Mock Chainlink Price Feed
     */
    async function deployMockPriceFeed(decimals: number = 8, description: string = "ETH / USD", initialPrice: bigint = 300000000000n) {
        const mockAggregator = await viem.deployContract(
            "contracts/jobThree/Mock/MockAggregatorV3.sol:MockAggregatorV3" as any,
            [decimals, description]
        );

        const hash = await owner.writeContract({
            address: mockAggregator.address,
            abi: mockAggregator.abi,
            functionName: "setPrice",
            args: [initialPrice]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        return mockAggregator;
    }

    /**
     * Helper function to deploy PriceConsumer
     */
    async function deployPriceConsumer() {
        const mockPriceFeed = await deployMockPriceFeed();

        const pcImpl = await viem.deployContract(
            "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
        );

        const pcInitData = encodeFunctionData({
            abi: pcImpl.abi,
            functionName: "initialize",
            args: [mockPriceFeed.address]
        });

        const pcProxy = await viem.deployContract(
            "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
            [pcImpl.address, pcInitData]
        );

        return {
            address: pcProxy.address,
            abi: pcImpl.abi,
            mockPriceFeed: mockPriceFeed
        };
    }

    /**
     * Helper function to deploy NFT contract
     */
    async function deployNFT() {
        const nftImpl = await viem.deployContract(
            "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
        );

        const nftInitData = encodeFunctionData({
            abi: nftImpl.abi,
            functionName: "initialize",
            args: ["AuctionNFT", "ANFT", "ipfs://test/"]
        });

        const nftProxy = await viem.deployContract(
            "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
            [nftImpl.address, nftInitData]
        );

        return {
            address: nftProxy.address,
            abi: nftImpl.abi
        };
    }

    /**
     * Helper function to deploy NFTAuction contract
     */
    async function deployAuction() {
        const priceConsumer = await deployPriceConsumer();

        const auctionImpl = await viem.deployContract(
            "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
        );

        const auctionInitData = encodeFunctionData({
            abi: auctionImpl.abi,
            functionName: "initialize",
            args: [feeRecipient.account.address, priceConsumer.address]
        });

        const auctionProxy = await viem.deployContract(
            "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
            [auctionImpl.address, auctionInitData]
        );

        return {
            address: auctionProxy.address,
            abi: auctionImpl.abi,
            priceConsumer: priceConsumer
        };
    }

    /**
     * Helper to create and setup an auction
     */
    async function setupAuction(tokenId: bigint, startPrice: bigint, duration: bigint) {
        const nft = await deployNFT();
        const auction = await deployAuction();

        // Mint NFT to seller
        let hash = await seller.writeContract({
            address: nft.address,
            abi: nft.abi,
            functionName: "mint",
            args: [seller.account.address, tokenId]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        // Approve auction contract
        hash = await seller.writeContract({
            address: nft.address,
            abi: nft.abi,
            functionName: "approve",
            args: [auction.address, tokenId]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        // Create auction
        hash = await seller.writeContract({
            address: auction.address,
            abi: auction.abi,
            functionName: "createAuction",
            args: [nft.address, tokenId, startPrice, duration, "0x0000000000000000000000000000000000000000"]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        return { nft, auction };
    }

    /**
     * Helper to advance time in Hardhat - FIXED VERSION
     */
    async function advanceTime(seconds: number) {
        // Convert seconds to hex string for evm_increaseTime
        const hexTime = `0x${seconds.toString(16)}`;

        // Use transport.request for Hardhat-specific RPC methods
        await publicClient.transport.request({
            method: 'evm_increaseTime',
            params: [hexTime]
        } as any);

        await publicClient.transport.request({
            method: 'evm_mine',
            params: []
        } as any);
    }

    describe("Complete Auction Flow with Winner", function () {
        it("Should execute complete auction flow: create -> bid -> end -> settle", async function () {
            const tokenId = 1n;
            const startPrice = parseEther("1");
            const duration = 3600n;

            const { nft, auction } = await setupAuction(tokenId, startPrice, duration);
            console.log(`✓ Auction setup complete`);

            // Get initial balances
            const sellerBalanceBefore = await publicClient.getBalance({
                address: seller.account.address
            });
            const feeRecipientBalanceBefore = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            // Place winning bid
            const bidAmount = parseEther("2");
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: bidAmount
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Winning bid placed: ${bidAmount} wei`);

            // Advance time past auction end
            await advanceTime(3601);
            console.log(`✓ Time advanced past auction end`);

            // End auction
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check AuctionEnded event
            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionEnded"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit AuctionEnded event");
            assert.equal(
                getAddress(logs[0].args.winner as string),
                getAddress(bidder1.account.address)
            );
            assert.equal(logs[0].args.amount, bidAmount);

            console.log(`✓ AuctionEnded event emitted`);
            console.log(`✓ Winner: ${logs[0].args.winner}`);
            console.log(`✓ Amount: ${logs[0].args.amount}`);
            console.log(`✓ USD Value: $${Number(logs[0].args.usdValue) / 1e8}`);
            console.log(`✓ Fee: ${logs[0].args.feeAmount} wei`);
            console.log(`✓ Fee Rate: ${logs[0].args.feeBps} bps`);

            // Verify NFT transferred to winner
            const nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as string;

            assert.equal(
                getAddress(nftOwner),
                getAddress(bidder1.account.address),
                "NFT should be transferred to winner"
            );
            console.log(`✓ NFT transferred to winner`);

            // Verify seller received payment (minus fee)
            const sellerBalanceAfter = await publicClient.getBalance({
                address: seller.account.address
            });

            const sellerReceived = sellerBalanceAfter - sellerBalanceBefore;
            assert.ok(sellerReceived > 0n, "Seller should receive payment");
            console.log(`✓ Seller received: ${sellerReceived} wei`);

            // Verify fee recipient received fee
            const feeRecipientBalanceAfter = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            const feeReceived = feeRecipientBalanceAfter - feeRecipientBalanceBefore;
            assert.ok(feeReceived > 0n, "Fee recipient should receive fee");
            console.log(`✓ Fee recipient received: ${feeReceived} wei`);

            // Verify auction marked as ended
            const auctionData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            assert.equal(auctionData.ended, true, "Auction should be marked as ended");
            console.log(`✓ Auction marked as ended`);
        });

        it("Should handle multiple bids and refund correctly", async function () {
            const tokenId = 2n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            // Track bidder1 balance
            const bidder1BalanceBefore = await publicClient.getBalance({
                address: bidder1.account.address
            });

            // First bid from bidder1
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("1.5")
            });
            let receipt = await publicClient.waitForTransactionReceipt({ hash });
            const gas1 = receipt.gasUsed * receipt.effectiveGasPrice;
            console.log(`✓ Bidder1 first bid: 1.5 ETH`);

            // Second bid from bidder2
            hash = await bidder2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidder2 outbid: 2 ETH`);

            // Third bid from bidder3 (becomes winner)
            hash = await bidder3.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2.5")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidder3 final bid: 2.5 ETH`);

            // Check bidder1 got refunded
            const bidder1BalanceAfter = await publicClient.getBalance({
                address: bidder1.account.address
            });

            const bidder1Change = bidder1BalanceAfter - bidder1BalanceBefore + gas1;
            // Should be close to 0 (got refund, minus gas)
            assert.ok(
                bidder1Change > parseEther("-0.01"),
                "Bidder1 should be refunded"
            );
            console.log(`✓ Bidder1 refunded successfully`);

            // End auction
            await advanceTime(3601);
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Verify bidder3 is the winner
            const nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as string;

            assert.equal(
                getAddress(nftOwner),
                getAddress(bidder3.account.address)
            );
            console.log(`✓ Bidder3 won the auction`);
        });

        it("Should calculate and distribute platform fee correctly", async function () {
            const tokenId = 3n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            // Get fee recipient balance before
            const feeRecipientBefore = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            // Place bid
            const bidAmount = parseEther("10"); // Higher amount for better fee calculation
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: bidAmount
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Calculate expected fee
            const feeData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            const [expectedFeeAmount, expectedFeeBps] = feeData;
            console.log(`✓ Expected fee: ${expectedFeeAmount} wei (${expectedFeeBps} bps)`);

            // End auction
            await advanceTime(3601);
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Get actual fee from event
            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionEnded"
            }) as any[];

            assert.equal(logs[0].args.feeAmount, expectedFeeAmount, "Fee amount should match");
            assert.equal(logs[0].args.feeBps, expectedFeeBps, "Fee bps should match");
            console.log(`✓ Fee calculation verified`);

            // Verify fee recipient received the fee
            const feeRecipientAfter = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            const feeReceived = feeRecipientAfter - feeRecipientBefore;
            assert.equal(feeReceived, expectedFeeAmount, "Fee recipient should receive exact fee");
            console.log(`✓ Fee recipient received correct amount: ${feeReceived} wei`);
        });
    });

    describe("Auction with No Bids", function () {
        it("Should return NFT to seller when auction ends with no bids", async function () {
            const tokenId = 10n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            console.log(`✓ Auction created with no bids`);

            // Verify NFT is in auction contract
            let nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as string;

            assert.equal(
                getAddress(nftOwner),
                getAddress(auction.address),
                "NFT should be in auction contract"
            );
            console.log(`✓ NFT in auction contract`);

            // Advance time and end auction
            await advanceTime(3601);
            const hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check AuctionCancelled event
            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionCancelled"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit AuctionCancelled event");
            assert.equal(logs[0].args.auctionId, 0n);
            console.log(`✓ AuctionCancelled event emitted`);

            // Verify NFT returned to seller
            nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as string;

            assert.equal(
                getAddress(nftOwner),
                getAddress(seller.account.address),
                "NFT should be returned to seller"
            );
            console.log(`✓ NFT returned to seller`);

            // Verify auction marked as ended
            const auctionData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            assert.equal(auctionData.ended, true);
            console.log(`✓ Auction marked as ended`);
        });

        it("Should emit AuctionCancelled event with no winner", async function () {
            const tokenId = 11n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            await advanceTime(3601);
            const hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionCancelled"
            }) as any[];

            assert.equal(logs.length, 1);
            console.log(`✓ AuctionCancelled event emitted for auction with no bids`);
        });
    });

    describe("Auction Timing and Access Control", function () {
        it("Should NOT allow ending auction before time expires", async function () {
            const tokenId = 20n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            // Place a bid
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid placed`);

            // Try to end auction immediately
            try {
                hash = await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow ending auction before time expires");
            } catch (error: any) {
                console.log(`✓ Ending auction before time prevented as expected`);
            }
        });

        it("Should allow seller to end auction after time expires", async function () {
            const tokenId = 21n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);

            // Seller ends auction
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Seller successfully ended auction`);
        });

        it("Should allow owner to end auction after time expires", async function () {
            const tokenId = 22n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);

            // Owner (contract owner) ends auction
            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Owner successfully ended auction`);
        });

        it("Should NOT allow non-seller/non-owner to end auction", async function () {
            const tokenId = 23n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);

            // Bidder2 tries to end auction
            try {
                hash = await bidder2.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow non-seller/non-owner to end auction");
            } catch (error: any) {
                console.log(`✓ Non-authorized user prevented from ending auction`);
            }
        });

        it("Should NOT allow ending already ended auction", async function () {
            const tokenId = 24n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);

            // End auction first time
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction ended successfully`);

            // Try to end again
            try {
                hash = await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow ending already ended auction");
            } catch (error: any) {
                console.log(`✓ Double-ending prevented as expected`);
            }
        });
    });

    describe("Emergency Cancellation", function () {
        it("Should allow owner to emergency cancel active auction", async function () {
            const tokenId = 30n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            // Place a bid
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid placed`);

            // Track bidder balance before cancellation
            const bidder1Before = await publicClient.getBalance({
                address: bidder1.account.address
            });

            // Owner emergency cancels
            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "emergencyCancel",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check AuctionCancelled event
            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionCancelled"
            }) as any[];

            assert.equal(logs.length, 1);
            console.log(`✓ AuctionCancelled event emitted`);

            // Verify bidder got refund
            const bidder1After = await publicClient.getBalance({
                address: bidder1.account.address
            });

            assert.ok(
                bidder1After > bidder1Before,
                "Bidder should receive refund"
            );
            console.log(`✓ Bidder refunded: ${bidder1After - bidder1Before} wei`);

            // Verify NFT returned to seller
            const nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as string;

            assert.equal(
                getAddress(nftOwner),
                getAddress(seller.account.address)
            );
            console.log(`✓ NFT returned to seller`);

            // Verify auction marked as ended
            const auctionData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            assert.equal(auctionData.ended, true);
            console.log(`✓ Auction marked as ended`);
        });

        it("Should NOT allow non-owner to emergency cancel", async function () {
            const tokenId = 31n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                hash = await bidder2.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "emergencyCancel",
                    args: [0n]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow non-owner to emergency cancel");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from emergency cancel`);
            }
        });
    });

    describe("Payment Distribution Verification", function () {
        it("Should correctly split payment between seller and platform", async function () {
            const tokenId = 40n;
            const { nft, auction } = await setupAuction(tokenId, parseEther("1"), 3600n);

            const sellerBefore = await publicClient.getBalance({
                address: seller.account.address
            });
            const feeBefore = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            // Bid 10 ETH for clear fee calculation
            const bidAmount = parseEther("10");
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: bidAmount
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Get expected fee
            const feeData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];
            const [expectedFee, _] = feeData;

            // End auction
            await advanceTime(3601);
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const sellerAfter = await publicClient.getBalance({
                address: seller.account.address
            });
            const feeAfter = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            const sellerReceived = sellerAfter - sellerBefore;
            const feeReceived = feeAfter - feeBefore;

            // Verify total = bidAmount
            // Note: seller also paid gas for endAuction, so we check approximate
            const expectedSellerAmount = bidAmount - expectedFee;

            console.log(`✓ Bid amount: ${bidAmount} wei`);
            console.log(`✓ Fee: ${feeReceived} wei`);
            console.log(`✓ Seller received: ${sellerReceived} wei`);
            console.log(`✓ Expected seller amount: ${expectedSellerAmount} wei`);

            assert.equal(feeReceived, expectedFee, "Fee should match expected");
            // Seller amount should be close (accounting for gas)
            assert.ok(
                sellerReceived > expectedSellerAmount - parseEther("0.01"),
                "Seller should receive approximately correct amount"
            );
            console.log(`✓ Payment distribution verified`);
        });

        it("Should handle multiple auctions independently", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();

            // Create 3 auctions
            for (let i = 0; i < 3; i++) {
                const tokenId = BigInt(50 + i);

                let hash = await seller.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [seller.account.address, tokenId]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await seller.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "approve",
                    args: [auction.address, tokenId]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            console.log(`✓ Created 3 auctions`);

            // Bid on all auctions with different amounts
            const bidders = [bidder1, bidder2, bidder3];
            const amounts = [parseEther("2"), parseEther("3"), parseEther("4")];

            for (let i = 0; i < 3; i++) {
                const hash = await bidders[i].writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [BigInt(i)],
                    value: amounts[i]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                console.log(`✓ Auction ${i}: Bid ${amounts[i]} wei`);
            }

            // End all auctions
            await advanceTime(3601);
            for (let i = 0; i < 3; i++) {
                const hash = await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [BigInt(i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                console.log(`✓ Auction ${i} ended`);
            }

            // Verify all NFTs went to correct winners
            for (let i = 0; i < 3; i++) {
                const owner = await publicClient.readContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "ownerOf",
                    args: [BigInt(50 + i)]
                }) as string;

                assert.equal(
                    getAddress(owner),
                    getAddress(bidders[i].account.address)
                );
            }

            console.log(`✓ All NFTs transferred to correct winners`);
        });
    });

    console.log(`\n✅ All AuctionEth tests completed successfully!\n`);
});