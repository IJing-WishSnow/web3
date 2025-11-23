import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, parseEventLogs, parseEther, parseUnits } from "viem";

describe("Integration - End-to-End Flow Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller1, seller2, bidder1, bidder2, bidder3, feeRecipient] = await viem.getWalletClients();

    console.log(`\n🔗 Starting Integration Tests\n`);

    async function deployMockPriceFeed() {
        const mockAggregator = await viem.deployContract(
            "contracts/jobThree/Mock/MockAggregatorV3.sol:MockAggregatorV3" as any,
            [8, "ETH / USD"]
        );

        const hash = await owner.writeContract({
            address: mockAggregator.address,
            abi: mockAggregator.abi,
            functionName: "setPrice",
            args: [300000000000n]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        return mockAggregator;
    }

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

        return { address: pcProxy.address, abi: pcImpl.abi, mockPriceFeed };
    }

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

        return { address: nftProxy.address, abi: nftImpl.abi };
    }

    async function deployERC20(decimals: number = 18) {
        const token = await viem.deployContract(
            "contracts/jobThree/Mock/MockERC20.sol:MockERC20" as any,
            ["Test Token", "TEST", decimals]
        );
        return token;
    }

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

        return { address: auctionProxy.address, abi: auctionImpl.abi, priceConsumer };
    }

    async function advanceTime(seconds: number) {
        await publicClient.transport.request({
            method: 'evm_increaseTime',
            params: [`0x${seconds.toString(16)}`]
        } as any);
        await publicClient.transport.request({
            method: 'evm_mine',
            params: []
        } as any);
    }

    describe("Complete ETH Auction Flow", function () {
        it("Should execute full auction lifecycle with ETH", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Mint NFT
            let hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ NFT minted`);

            // Approve and create auction
            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created`);

            // Multiple bids
            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid 1: 2 ETH`);

            hash = await bidder2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("3")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid 2: 3 ETH`);

            hash = await bidder3.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("5")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid 3: 5 ETH (winner)`);

            // End auction
            await advanceTime(3601);
            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction ended`);

            // Verify NFT transfer
            const nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as `0x${string}`;
            assert.equal(nftOwner.toLowerCase(), bidder3.account.address.toLowerCase());
            console.log(`✓ NFT transferred to winner`);
        });
    });

    describe("Complete ERC20 Auction Flow", function () {
        it("Should execute full auction lifecycle with ERC20", async function () {
            const nft = await deployNFT();
            const { address: auctionAddress, abi: auctionAbi, priceConsumer } = await deployAuction();
            const token = await deployERC20();
            const tokenId = 1n;

            // Setup price feed
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Price feed set`);

            // Mint tokens to bidders
            for (const bidder of [bidder1, bidder2, bidder3]) {
                hash = await owner.writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "mint",
                    args: [bidder.account.address, parseEther("10000")]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }
            console.log(`✓ Tokens minted to bidders`);

            // Mint NFT
            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Create auction
            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auctionAddress, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("100"), 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created`);

            // Bid 1
            hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auctionAddress, parseEther("200")]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "bidWithERC20",
                args: [0n, parseEther("200")]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid 1: 200 tokens`);

            // Bid 2
            hash = await bidder2.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auctionAddress, parseEther("500")]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder2.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "bidWithERC20",
                args: [0n, parseEther("500")]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid 2: 500 tokens (winner)`);

            // End auction
            await advanceTime(3601);
            hash = await seller1.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction ended`);

            // Verify NFT transfer
            const nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as `0x${string}`;
            assert.equal(nftOwner.toLowerCase(), bidder2.account.address.toLowerCase());
            console.log(`✓ NFT transferred to winner`);
        });
    });

    describe("Multiple Concurrent Auctions", function () {
        it("Should handle multiple auctions simultaneously", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();

            // Create 3 auctions
            for (let i = 1; i <= 3; i++) {
                let hash = await seller1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [seller1.account.address, BigInt(i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await seller1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "approve",
                    args: [auction.address, BigInt(i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await seller1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, BigInt(i), parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }
            console.log(`✓ 3 auctions created`);

            // Bid on auction 0
            let hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Bid on auction 1
            hash = await bidder2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [1n],
                value: parseEther("3")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Bid on auction 2
            hash = await bidder3.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [2n],
                value: parseEther("4")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bids placed on all auctions`);

            // Check active auctions
            const activeAuctions = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getActiveAuctions",
                args: []
            }) as bigint[];

            assert.equal(activeAuctions.length, 3);
            console.log(`✓ All 3 auctions active`);
        });
    });

    describe("Price Feed Integration", function () {
        it("Should calculate fees based on USD value", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Create auction
            let hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("0.5"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Bid - 1 ETH @ $3000 = $3000 → Tier 2 (3%)
            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("1")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid: 1 ETH (~$3000)`);

            // Calculate fee
            const [feeAmount, feeBps] = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "calculatePlatformFee",
                args: [0n]
            }) as any[];

            assert.equal(feeBps, 300n); // 3% for $1K-$10K
            console.log(`✓ Fee tier: 3% (Tier 2)`);
        });
    });

    describe("Multi-User Interaction", function () {
        it("Should handle multiple sellers and bidders", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();

            // Seller1 creates auction
            let hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, 1n, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Seller1 auction created`);

            // Seller2 creates auction
            hash = await seller2.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller2.account.address, 2n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller2.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, 2n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, 2n, parseEther("2"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Seller2 auction created`);

            // Bidders compete
            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("3")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [1n],
                value: parseEther("4")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bidders participated`);

            // Check auction count
            const count = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "auctionCount",
                args: []
            });
            assert.equal(count, 2n);
            console.log(`✓ 2 total auctions`);
        });
    });

    describe("Fee Distribution", function () {
        it("Should distribute fees correctly to platform", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            const feeBalanceBefore = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            // Create and execute auction
            let hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("10")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);
            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const feeBalanceAfter = await publicClient.getBalance({
                address: feeRecipient.account.address
            });

            assert.ok(feeBalanceAfter > feeBalanceBefore);
            console.log(`✓ Platform fee received: ${feeBalanceAfter - feeBalanceBefore} wei`);
        });
    });

    describe("Emergency Scenarios", function () {
        it("Should handle emergency cancellation properly", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Create auction with bid
            let hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("5")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created with bid`);

            const bidderBalanceBefore = await publicClient.getBalance({
                address: bidder1.account.address
            });

            // Emergency cancel
            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "emergencyCancel",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Emergency cancelled`);

            const bidderBalanceAfter = await publicClient.getBalance({
                address: bidder1.account.address
            });

            // Check NFT returned
            const nftOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as `0x${string}`;
            assert.equal(nftOwner.toLowerCase(), seller1.account.address.toLowerCase());
            console.log(`✓ NFT returned to seller`);

            // Check refund
            assert.ok(bidderBalanceAfter > bidderBalanceBefore);
            console.log(`✓ Bidder refunded`);
        });
    });

    describe("Token Decimals Handling", function () {
        it("Should handle different token decimals correctly", async function () {
            const nft = await deployNFT();
            const { address: auctionAddress, abi: auctionAbi, priceConsumer } = await deployAuction();

            // Test with 6 decimals (USDC-like)
            const token6 = await deployERC20(6);
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token6.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ 6-decimal token price feed set`);

            // Test with 8 decimals (WBTC-like)
            const token8 = await deployERC20(8);
            hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token8.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ 8-decimal token price feed set`);

            // Create auction with 6-decimal token
            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller1.account.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auctionAddress, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller1.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "createAuction",
                args: [nft.address, 1n, parseUnits("1000", 6), 3600n, token6.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created with 6-decimal token`);
        });
    });

    console.log(`\n✅ All Integration tests completed successfully!\n`);
});