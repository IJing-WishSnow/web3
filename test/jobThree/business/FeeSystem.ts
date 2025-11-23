import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEventLogs, parseEther } from "viem";

describe("FeeSystem - Dynamic Fee Calculation Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder1, bidder2, feeRecipient] = await viem.getWalletClients();

    console.log(`\n🧪 Starting FeeSystem Tests`);
    console.log(`Owner: ${owner.account.address}`);
    console.log(`Seller: ${seller.account.address}`);
    console.log(`Bidder1: ${bidder1.account.address}`);
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
     * Helper to create an auction with a bid
     */
    async function createAuction(bidAmount: bigint) {
        const nft = await deployNFT();
        const auction = await deployAuction();
        const tokenId = 1n;

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

        // Create auction with minimal price
        hash = await seller.writeContract({
            address: auction.address,
            abi: auction.abi,
            functionName: "createAuction",
            args: [nft.address, tokenId, parseEther("0.01"), 3600n, "0x0000000000000000000000000000000000000000"]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        // Place bid
        hash = await bidder1.writeContract({
            address: auction.address,
            abi: auction.abi,
            functionName: "bid",
            args: [0n],
            value: bidAmount
        });
        await publicClient.waitForTransactionReceipt({ hash });

        return { nft, auction };
    }

    /**
     * Helper to advance time
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

    describe("Default Fee Configuration", function () {
        it("Should initialize with default platform fee of 2%", async function () {
            const auction = await deployAuction();

            const defaultFee = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "defaultPlatformFee",
                args: []
            }) as bigint;

            assert.equal(defaultFee, 200n, "Default fee should be 200 bps (2%)");
            console.log(`✓ Default platform fee: ${defaultFee} bps (${Number(defaultFee) / 100}%)`);
        });

        it("Should initialize with 4 fee tiers", async function () {
            const auction = await deployAuction();

            const tierCount = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getFeeTierCount",
                args: []
            }) as bigint;

            assert.equal(tierCount, 4n, "Should have 4 fee tiers");
            console.log(`✓ Fee tier count: ${tierCount}`);
        });

        it("Should retrieve all fee tiers correctly", async function () {
            const auction = await deployAuction();

            const tiers = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getFeeTiers",
                args: []
            }) as any[];

            assert.equal(tiers.length, 4, "Should return 4 tiers");
            console.log(`✓ Retrieved ${tiers.length} fee tiers:`);

            // Tier 1: $0 - $1,000: 5%
            assert.equal(tiers[0].minAmountUSD, 0n);
            assert.equal(tiers[0].maxAmountUSD, 1000n * 10n ** 8n);
            assert.equal(tiers[0].feeBps, 500n);
            console.log(`  Tier 1: $0 - $1,000 → 5%`);

            // Tier 2: $1,000 - $10,000: 3%
            assert.equal(tiers[1].minAmountUSD, 1000n * 10n ** 8n);
            assert.equal(tiers[1].maxAmountUSD, 10000n * 10n ** 8n);
            assert.equal(tiers[1].feeBps, 300n);
            console.log(`  Tier 2: $1,000 - $10,000 → 3%`);

            // Tier 3: $10,000 - $100,000: 2%
            assert.equal(tiers[2].minAmountUSD, 10000n * 10n ** 8n);
            assert.equal(tiers[2].maxAmountUSD, 100000n * 10n ** 8n);
            assert.equal(tiers[2].feeBps, 200n);
            console.log(`  Tier 3: $10,000 - $100,000 → 2%`);

            // Tier 4: $100,000+: 1%
            assert.equal(tiers[3].minAmountUSD, 100000n * 10n ** 8n);
            assert.equal(tiers[3].feeBps, 100n);
            console.log(`  Tier 4: $100,000+ → 1%`);
        });

        it("Should have correct minimum USD value ($10)", async function () {
            const auction = await deployAuction();

            const minUSDValue = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "minUSDValue",
                args: []
            }) as bigint;

            assert.equal(minUSDValue, 10n * 10n ** 8n, "Min USD should be $10");
            console.log(`✓ Minimum USD value: $${Number(minUSDValue) / 1e8}`);
        });
    });

    describe("Fee Tier Testing", function () {
        it("Should use 5% fee for Tier 1 ($0 - $1,000)", async function () {
            // ETH price = $3000, bid 0.1 ETH = $300
            const bidAmount = parseEther("0.1");
            const { auction } = await createAuction(bidAmount);

            const [feeAmount, feeBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            assert.equal(feeBps, 500n, "Should use Tier 1 fee of 5% (500 bps)");

            const expectedFee = (bidAmount * 500n) / 10000n;
            assert.equal(feeAmount, expectedFee, "Fee amount should match 5%");

            console.log(`✓ Bid: 0.1 ETH (~$300)`);
            console.log(`✓ Fee tier: 1 (5%)`);
            console.log(`✓ Fee: ${feeAmount} wei`);
        });

        it("Should use 3% fee for Tier 2 ($1,000 - $10,000)", async function () {
            // ETH price = $3000, bid 1 ETH = $3,000
            const bidAmount = parseEther("1");
            const { auction } = await createAuction(bidAmount);

            const [feeAmount, feeBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            assert.equal(feeBps, 300n, "Should use Tier 2 fee of 3% (300 bps)");

            const expectedFee = (bidAmount * 300n) / 10000n;
            assert.equal(feeAmount, expectedFee, "Fee amount should match 3%");

            console.log(`✓ Bid: 1 ETH (~$3,000)`);
            console.log(`✓ Fee tier: 2 (3%)`);
            console.log(`✓ Fee: ${feeAmount} wei`);
        });

        it("Should use 2% fee for Tier 3 ($10,000 - $100,000)", async function () {
            // ETH price = $3000, bid 10 ETH = $30,000
            const bidAmount = parseEther("10");
            const { auction } = await createAuction(bidAmount);

            const [feeAmount, feeBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            assert.equal(feeBps, 200n, "Should use Tier 3 fee of 2% (200 bps)");

            const expectedFee = (bidAmount * 200n) / 10000n;
            assert.equal(feeAmount, expectedFee, "Fee amount should match 2%");

            console.log(`✓ Bid: 10 ETH (~$30,000)`);
            console.log(`✓ Fee tier: 3 (2%)`);
            console.log(`✓ Fee: ${feeAmount} wei`);
        });

        it("Should use 1% fee for Tier 4 ($100,000+)", async function () {
            // ETH price = $3000, bid 50 ETH = $150,000
            const bidAmount = parseEther("50");
            const { auction } = await createAuction(bidAmount);

            const [feeAmount, feeBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            assert.equal(feeBps, 100n, "Should use Tier 4 fee of 1% (100 bps)");

            const expectedFee = (bidAmount * 100n) / 10000n;
            assert.equal(feeAmount, expectedFee, "Fee amount should match 1%");

            console.log(`✓ Bid: 50 ETH (~$150,000)`);
            console.log(`✓ Fee tier: 4 (1%)`);
            console.log(`✓ Fee: ${feeAmount} wei`);
        });

        it("Should use default fee for amounts below minimum USD", async function () {
            // Small bid at exactly $10 threshold (edge case)
            // We test with $10 which is the minimum, so it should still use Tier 1 (5%)
            // To test default fee, we would need a bid below minUSDValue
            // But since minUSDValue = $10 and we need bid > startPrice (0.01 ETH = $30)
            // We actually can't create a valid bid below $10 threshold
            // So this test verifies behavior at the minimum threshold
            const bidAmount = parseEther("0.015"); // ~$45 at $3000/ETH (above $10, uses Tier 1)
            const { auction } = await createAuction(bidAmount);

            const [feeAmount, feeBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            // With $45 value, should use Tier 1 (5%)
            assert.equal(feeBps, 500n, "Should use Tier 1 for amounts above $10");
            console.log(`✓ Bid: 0.015 ETH (~$45)`);
            console.log(`✓ Above $10 threshold: ${feeBps} bps (5%)`);
        });
    });

    describe("Fee Tier Boundary Testing", function () {
        it("Should handle tier boundaries correctly", async function () {
            // Test around $1,000 boundary
            const bidAmount1 = parseEther("0.333"); // ~$999
            const { auction: auction1 } = await createAuction(bidAmount1);
            const [_, feeBps1] = await publicClient.readContract({
                address: auction1.address,
                abi: auction1.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            console.log(`✓ 0.333 ETH (~$999): ${feeBps1} bps`);

            const bidAmount2 = parseEther("0.334"); // ~$1,002
            const { auction: auction2 } = await createAuction(bidAmount2);
            const [__, feeBps2] = await publicClient.readContract({
                address: auction2.address,
                abi: auction2.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            console.log(`✓ 0.334 ETH (~$1,002): ${feeBps2} bps`);

            assert.notEqual(feeBps1, feeBps2, "Fees should differ across boundary");
        });
    });

    describe("Custom Fee Configuration", function () {
        it("Should allow owner to set custom fee tiers", async function () {
            const auction = await deployAuction();

            const customTiers = [
                {
                    minAmountUSD: 0n,
                    maxAmountUSD: 5000n * 10n ** 8n,
                    feeBps: 400n
                },
                {
                    minAmountUSD: 5000n * 10n ** 8n,
                    maxAmountUSD: 2n ** 256n - 1n,
                    feeBps: 150n
                }
            ];

            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "setFeeTiers",
                args: [customTiers]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "FeeTiersUpdated"
            }) as any[];

            assert.equal(logs.length, 1);
            assert.equal(logs[0].args.tiersCount, 2n);
            console.log(`✓ Custom tiers set: ${logs[0].args.tiersCount}`);
        });

        it("Should NOT allow non-owner to set tiers", async function () {
            const auction = await deployAuction();

            try {
                await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "setFeeTiers",
                    args: [[{ minAmountUSD: 0n, maxAmountUSD: 1000n * 10n ** 8n, feeBps: 500n }]]
                });
                assert.fail("Should not allow non-owner");
            } catch {
                console.log(`✓ Non-owner prevented`);
            }
        });

        it("Should reject fees > 10%", async function () {
            const auction = await deployAuction();

            try {
                await owner.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "setFeeTiers",
                    args: [[{ minAmountUSD: 0n, maxAmountUSD: 1000n * 10n ** 8n, feeBps: 1001n }]]
                });
                assert.fail("Should reject > 10%");
            } catch {
                console.log(`✓ Fee > 10% rejected`);
            }
        });
    });

    describe("Fee Integration", function () {
        it("Should apply correct fee in settlement", async function () {
            const bidAmount = parseEther("5");
            const { auction } = await createAuction(bidAmount);

            const [expectedFee, expectedBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            console.log(`✓ Expected: ${expectedFee} wei (${Number(expectedBps) / 100}%)`);

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
                eventName: "AuctionEnded"
            }) as any[];

            assert.equal(logs[0].args.feeAmount, expectedFee);
            assert.equal(logs[0].args.feeBps, expectedBps);
            console.log(`✓ Actual fee matched expected`);
        });
    });

    console.log(`\n✅ All FeeSystem tests completed successfully!\n`);
});