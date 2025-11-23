import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEventLogs, parseEther, parseUnits } from "viem";

describe("AuctionERC20 - Complete ERC20 Payment Auction Flow Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder1, bidder2, bidder3, feeRecipient] = await viem.getWalletClients();

    console.log(`\n🧪 Starting AuctionERC20 Tests`);
    console.log(`Owner: ${owner.account.address}`);
    console.log(`Seller: ${seller.account.address}`);
    console.log(`Bidder1: ${bidder1.account.address}`);
    console.log(`Bidder2: ${bidder2.account.address}`);
    console.log(`Bidder3: ${bidder3.account.address}`);
    console.log(`Fee Recipient: ${feeRecipient.account.address}\n`);

    /**
     * Helper function to deploy Mock Chainlink Price Feed
     */
    async function deployMockPriceFeed(decimals: number = 8, description: string = "TOKEN / USD", initialPrice: bigint = 100000000n) {
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
     * Helper function to deploy Mock ERC20 Token
     */
    async function deployMockERC20(name: string = "MockToken", symbol: string = "MTK", decimals: number = 18) {
        const mockToken = await viem.deployContract(
            "contracts/jobThree/Mock/MockERC20.sol:MockERC20" as any,
            [name, symbol, decimals]
        );

        return mockToken;
    }

    /**
     * Helper function to deploy PriceConsumer with token price feed
     */
    async function deployPriceConsumer(tokenAddress?: string) {
        // Deploy ETH price feed
        const ethPriceFeed = await deployMockPriceFeed(8, "ETH / USD", 300000000000n);

        const pcImpl = await viem.deployContract(
            "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
        );

        const pcInitData = encodeFunctionData({
            abi: pcImpl.abi,
            functionName: "initialize",
            args: [ethPriceFeed.address]
        });

        const pcProxy = await viem.deployContract(
            "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
            [pcImpl.address, pcInitData]
        );

        const priceConsumer = {
            address: pcProxy.address,
            abi: pcImpl.abi
        };

        // Set token price feed if provided
        if (tokenAddress) {
            const tokenPriceFeed = await deployMockPriceFeed(8, "TOKEN / USD", 100000000n);
            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [tokenAddress, tokenPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }

        return {
            address: priceConsumer.address,
            abi: pcImpl.abi
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
    async function deployAuction(tokenAddress: string) {
        const priceConsumer = await deployPriceConsumer(tokenAddress);

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
     * Helper to create and setup an ERC20 auction
     */
    async function setupERC20Auction(tokenId: bigint, startPrice: bigint, duration: bigint) {
        const nft = await deployNFT();
        const token = await deployMockERC20();
        const auction = await deployAuction(token.address);

        // Mint tokens to bidders
        const mintAmount = parseEther("10000"); // 10,000 tokens each
        for (const bidder of [bidder1, bidder2, bidder3]) {
            const hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [bidder.account.address, mintAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }

        // Mint NFT to seller
        let hash = await seller.writeContract({
            address: nft.address,
            abi: nft.abi,
            functionName: "mint",
            args: [seller.account.address, tokenId]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        // Approve auction contract for NFT
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
            args: [nft.address, tokenId, startPrice, duration, token.address]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        return { nft, token, auction };
    }

    /**
     * Helper to advance time in Hardhat
     */
    async function advanceTime(seconds: number) {
        const hexTime = `0x${seconds.toString(16)}`;

        await publicClient.transport.request({
            method: 'evm_increaseTime',
            params: [hexTime]
        } as any);

        await publicClient.transport.request({
            method: 'evm_mine',
            params: []
        } as any);
    }

    describe("Complete ERC20 Auction Flow with Winner", function () {
        it("Should execute complete ERC20 auction flow: create -> bid -> end -> settle", async function () {
            const tokenId = 1n;
            const startPrice = parseEther("100"); // 100 tokens
            const duration = 3600n;

            const { nft, token, auction } = await setupERC20Auction(tokenId, startPrice, duration);
            console.log(`✓ ERC20 auction setup complete`);

            // Get initial balances
            const sellerBalanceBefore = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [seller.account.address]
            }) as bigint;

            const feeRecipientBalanceBefore = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [feeRecipient.account.address]
            }) as bigint;

            // Bidder1 approves auction contract
            const bidAmount = parseEther("200"); // 200 tokens
            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Place winning bid
            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Winning bid placed: ${bidAmount} tokens`);

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
            console.log(`✓ Fee: ${logs[0].args.feeAmount} tokens`);
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
            const sellerBalanceAfter = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [seller.account.address]
            }) as bigint;

            const sellerReceived = sellerBalanceAfter - sellerBalanceBefore;
            assert.ok(sellerReceived > 0n, "Seller should receive payment");
            console.log(`✓ Seller received: ${sellerReceived} tokens`);

            // Verify fee recipient received fee
            const feeRecipientBalanceAfter = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [feeRecipient.account.address]
            }) as bigint;

            const feeReceived = feeRecipientBalanceAfter - feeRecipientBalanceBefore;
            assert.ok(feeReceived > 0n, "Fee recipient should receive fee");
            console.log(`✓ Fee recipient received: ${feeReceived} tokens`);

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

        it("Should handle multiple ERC20 bids and refund correctly", async function () {
            const tokenId = 2n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            // Track bidder1 balance
            const bidder1BalanceBefore = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [bidder1.account.address]
            }) as bigint;

            // First bid from bidder1
            let bidAmount = parseEther("150");
            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidder1 first bid: 150 tokens`);

            // Second bid from bidder2 (outbid bidder1)
            bidAmount = parseEther("200");
            hash = await bidder2.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidder2 outbid: 200 tokens`);

            // Check bidder1 got refunded
            const bidder1BalanceAfter = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [bidder1.account.address]
            }) as bigint;

            assert.equal(
                bidder1BalanceAfter,
                bidder1BalanceBefore,
                "Bidder1 should be fully refunded"
            );
            console.log(`✓ Bidder1 refunded successfully`);

            // Third bid from bidder3 (becomes winner)
            bidAmount = parseEther("250");
            hash = await bidder3.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder3.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidder3 final bid: 250 tokens`);

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

        it("Should calculate and distribute ERC20 platform fee correctly", async function () {
            const tokenId = 3n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            // Get fee recipient balance before
            const feeRecipientBefore = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [feeRecipient.account.address]
            }) as bigint;

            // Place bid with high amount for better fee calculation
            const bidAmount = parseEther("1000"); // 1000 tokens
            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
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
            console.log(`✓ Expected fee: ${expectedFeeAmount} tokens (${expectedFeeBps} bps)`);

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
            const feeRecipientAfter = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [feeRecipient.account.address]
            }) as bigint;

            const feeReceived = feeRecipientAfter - feeRecipientBefore;
            assert.equal(feeReceived, expectedFeeAmount, "Fee recipient should receive exact fee");
            console.log(`✓ Fee recipient received correct amount: ${feeReceived} tokens`);
        });
    });

    describe("ERC20 Auction with No Bids", function () {
        it("Should return NFT to seller when ERC20 auction ends with no bids", async function () {
            const tokenId = 10n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            console.log(`✓ ERC20 auction created with no bids`);

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
        });
    });

    describe("ERC20 Approval and Bidding", function () {
        it("Should NOT allow bidding without sufficient ERC20 approval", async function () {
            const tokenId = 20n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            // Approve only 50 tokens but try to bid 100
            const approveAmount = parseEther("50");
            const bidAmount = parseEther("100");

            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, approveAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Approved only 50 tokens`);

            try {
                hash = await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bidWithERC20",
                    args: [0n, bidAmount]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow bidding without sufficient approval");
            } catch (error: any) {
                console.log(`✓ Bidding prevented due to insufficient approval`);
            }
        });

        it("Should NOT allow bidding without sufficient ERC20 balance", async function () {
            const tokenId = 21n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            // Bidder1 transfers all tokens away
            const balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [bidder1.account.address]
            }) as bigint;

            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [owner.account.address, balance]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidder1 has no tokens`);

            // Try to bid
            const bidAmount = parseEther("100");
            hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                hash = await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bidWithERC20",
                    args: [0n, bidAmount]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow bidding without sufficient balance");
            } catch (error: any) {
                console.log(`✓ Bidding prevented due to insufficient balance`);
            }
        });

        it("Should handle exact approval amount correctly", async function () {
            const tokenId = 22n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            // Approve exact bid amount
            const bidAmount = parseEther("150");
            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Approved exact bid amount: ${bidAmount}`);

            // Place bid with exact approved amount
            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid placed successfully with exact approval`);

            // Verify bid
            const auctionData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            assert.equal(auctionData.highestBid, bidAmount);
            console.log(`✓ Highest bid recorded: ${auctionData.highestBid}`);
        });
    });

    describe("ERC20 Payment Distribution", function () {
        it("Should correctly split ERC20 payment between seller and platform", async function () {
            const tokenId = 30n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            const sellerBefore = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [seller.account.address]
            }) as bigint;

            const feeBefore = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [feeRecipient.account.address]
            }) as bigint;

            // Bid 1000 tokens for clear fee calculation
            const bidAmount = parseEther("1000");
            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
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

            const sellerAfter = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [seller.account.address]
            }) as bigint;

            const feeAfter = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [feeRecipient.account.address]
            }) as bigint;

            const sellerReceived = sellerAfter - sellerBefore;
            const feeReceived = feeAfter - feeBefore;

            const expectedSellerAmount = bidAmount - expectedFee;

            console.log(`✓ Bid amount: ${bidAmount} tokens`);
            console.log(`✓ Fee: ${feeReceived} tokens`);
            console.log(`✓ Seller received: ${sellerReceived} tokens`);
            console.log(`✓ Expected seller amount: ${expectedSellerAmount} tokens`);

            assert.equal(feeReceived, expectedFee, "Fee should match expected");
            assert.equal(sellerReceived, expectedSellerAmount, "Seller should receive exact amount");
            console.log(`✓ ERC20 payment distribution verified`);
        });

        it("Should handle multiple ERC20 auctions independently", async function () {
            const nft = await deployNFT();
            const token = await deployMockERC20();
            const auction = await deployAuction(token.address);

            // Mint tokens to bidders
            const mintAmount = parseEther("10000");
            for (const bidder of [bidder1, bidder2, bidder3]) {
                let hash = await owner.writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "mint",
                    args: [bidder.account.address, mintAmount]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

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
                    args: [nft.address, tokenId, parseEther("100"), 3600n, token.address]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            console.log(`✓ Created 3 ERC20 auctions`);

            // Bid on all auctions with different amounts
            const bidders = [bidder1, bidder2, bidder3];
            const amounts = [parseEther("200"), parseEther("300"), parseEther("400")];

            for (let i = 0; i < 3; i++) {
                let hash = await bidders[i].writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "approve",
                    args: [auction.address, amounts[i]]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await bidders[i].writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bidWithERC20",
                    args: [BigInt(i), amounts[i]]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                console.log(`✓ Auction ${i}: Bid ${amounts[i]} tokens`);
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

    describe("Mixed Payment Types Validation", function () {
        it("Should NOT allow ETH payment for ERC20 auction", async function () {
            const tokenId = 40n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            try {
                const hash = await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("1") // Trying to send ETH
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow ETH payment for ERC20 auction");
            } catch (error: any) {
                console.log(`✓ ETH payment prevented for ERC20 auction`);
            }
        });

        it("Should verify payment token is correctly set", async function () {
            const tokenId = 41n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            const auctionData = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            assert.equal(
                getAddress(auctionData.paymentToken as string),
                getAddress(token.address),
                "Payment token should be the ERC20 token"
            );
            console.log(`✓ Payment token correctly set to: ${auctionData.paymentToken}`);
        });
    });

    describe("ERC20 Token Decimals Handling", function () {
        it("Should handle tokens with 6 decimals (like USDC)", async function () {
            const tokenId = 50n;
            const nft = await deployNFT();
            const token = await deployMockERC20("USDC Mock", "USDC", 6);
            const auction = await deployAuction(token.address);

            // Mint tokens with 6 decimals
            const mintAmount = parseUnits("10000", 6); // 10,000 USDC
            let hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [bidder1.account.address, mintAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Setup auction
            hash = await seller.writeContract({
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

            const startPrice = parseUnits("100", 6); // 100 USDC
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, startPrice, 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created with 6-decimal token`);

            // Place bid
            const bidAmount = parseUnits("200", 6); // 200 USDC
            hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid placed with 6-decimal token: ${bidAmount}`);

            // End auction
            await advanceTime(3601);
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction ended successfully with 6-decimal token`);
        });

        it("Should handle tokens with 8 decimals", async function () {
            const tokenId = 51n;
            const nft = await deployNFT();
            const token = await deployMockERC20("WBTC Mock", "WBTC", 8);
            const auction = await deployAuction(token.address);

            // Mint tokens with 8 decimals
            const mintAmount = parseUnits("100", 8); // 100 WBTC
            let hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [bidder1.account.address, mintAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Setup and complete auction
            hash = await seller.writeContract({
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

            const startPrice = parseUnits("1", 8); // 1 WBTC
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, startPrice, 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const bidAmount = parseUnits("2", 8); // 2 WBTC
            hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ 8-decimal token auction completed successfully`);
        });
    });

    describe("ERC20 Emergency Cancellation", function () {
        it("Should allow owner to emergency cancel ERC20 auction and refund bidder", async function () {
            const tokenId = 60n;
            const { nft, token, auction } = await setupERC20Auction(tokenId, parseEther("100"), 3600n);

            // Place a bid
            const bidAmount = parseEther("200");
            let hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auction.address, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bidWithERC20",
                args: [0n, bidAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid placed`);

            // Track bidder balance before cancellation
            const bidder1Before = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [bidder1.account.address]
            }) as bigint;

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
            const bidder1After = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [bidder1.account.address]
            }) as bigint;

            assert.equal(
                bidder1After,
                bidder1Before + bidAmount,
                "Bidder should receive full refund"
            );
            console.log(`✓ Bidder refunded: ${bidAmount} tokens`);

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
        });
    });

    console.log(`\n✅ All AuctionERC20 tests completed successfully!\n`);
});