import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, parseEventLogs, parseEther } from "viem";

describe("EventLog - Critical Event Emission Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder1, bidder2, feeRecipient] = await viem.getWalletClients();

    console.log(`\n📋 Starting EventLog Tests\n`);

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

    async function deployERC20() {
        const token = await viem.deployContract(
            "contracts/jobThree/Mock/MockERC20.sol:MockERC20" as any,
            ["Test Token", "TEST", 18]
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

    describe("NFT Events", function () {
        it("Should emit TokenMinted event on mint", async function () {
            const nft = await deployNFT();
            const tokenId = 1n;

            const hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, tokenId]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "TokenMinted"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.to?.toLowerCase(), seller.account.address.toLowerCase());
            assert.equal(log.args.tokenId, tokenId);
            console.log(`✓ TokenMinted event emitted correctly`);
        });

        it("Should emit Transfer event on mint", async function () {
            const nft = await deployNFT();
            const tokenId = 1n;

            const hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, tokenId]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "Transfer"
            });

            assert.ok(logs.length > 0);
            console.log(`✓ Transfer event emitted on mint`);
        });

        it("Should emit BaseURIUpdated event", async function () {
            const nft = await deployNFT();

            const hash = await owner.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "setBaseURI",
                args: ["ipfs://new-base/"]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "BaseURIUpdated"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.newBaseURI, "ipfs://new-base/");
            console.log(`✓ BaseURIUpdated event emitted`);
        });
    });

    describe("Auction Events", function () {
        it("Should emit AuctionCreated event", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionCreated"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.auctionId, 0n);
            assert.equal(log.args.seller?.toLowerCase(), seller.account.address.toLowerCase());
            assert.equal(log.args.nftContract?.toLowerCase(), nft.address.toLowerCase());
            assert.equal(log.args.tokenId, tokenId);
            assert.equal(log.args.startPrice, parseEther("1"));
            console.log(`✓ AuctionCreated event emitted with correct data`);
        });

        it("Should emit NewBid event on ETH bid", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "NewBid"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.auctionId, 0n);
            assert.equal(log.args.bidder?.toLowerCase(), bidder1.account.address.toLowerCase());
            assert.equal(log.args.amount, parseEther("2"));
            assert.ok(log.args.usdValue !== undefined);
            console.log(`✓ NewBid event emitted with USD value: ${log.args.usdValue}`);
        });

        it("Should emit NewBid event on ERC20 bid", async function () {
            const nft = await deployNFT();
            const { address: auctionAddress, abi: auctionAbi, priceConsumer } = await deployAuction();
            const token = await deployERC20();
            const tokenId = 1n;

            // Set price feed
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Mint NFT
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
                args: [auctionAddress, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Create auction
            hash = await seller.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("100"), 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Mint tokens and bid
            hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [bidder1.account.address, parseEther("1000")]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "approve",
                args: [auctionAddress, parseEther("500")]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "bidWithERC20",
                args: [0n, parseEther("500")]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: auctionAbi,
                logs: receipt.logs,
                eventName: "NewBid"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.amount, parseEther("500"));
            console.log(`✓ NewBid event emitted for ERC20 bid`);
        });

        it("Should emit AuctionEnded event with winner", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("5")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);

            hash = await seller.writeContract({
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
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.auctionId, 0n);
            assert.equal(log.args.winner?.toLowerCase(), bidder1.account.address.toLowerCase());
            assert.equal(log.args.amount, parseEther("5"));
            assert.ok(log.args.feeAmount !== undefined);
            assert.ok(log.args.feeBps !== undefined);
            console.log(`✓ AuctionEnded event: winner=${log.args.winner}, fee=${log.args.feeBps}bps`);
        });

        it("Should emit AuctionCancelled event for no bids", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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

            await advanceTime(3601);

            hash = await seller.writeContract({
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
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.auctionId, 0n);
            console.log(`✓ AuctionCancelled event emitted for no bids`);
        });

        it("Should emit AuctionCancelled on emergency cancel", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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

            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "emergencyCancel",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionCancelled"
            });

            assert.equal(logs.length, 1);
            console.log(`✓ AuctionCancelled event emitted on emergency`);
        });

        it("Should emit FeeTiersUpdated event", async function () {
            const auction = await deployAuction();

            const customTiers = [{
                minAmountUSD: 0n,
                maxAmountUSD: 5000n * 10n ** 8n,
                feeBps: 400n
            }];

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
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.tiersCount, 1n);
            console.log(`✓ FeeTiersUpdated event emitted`);
        });
    });

    describe("PriceConsumer Events", function () {
        it("Should emit PriceFeedUpdated event", async function () {
            const priceConsumer = await deployPriceConsumer();
            const token = await deployERC20();

            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceFeedUpdated"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.token?.toLowerCase(), token.address.toLowerCase());
            console.log(`✓ PriceFeedUpdated event emitted`);
        });

        it("Should emit PriceUpdated event on getLatestPrice", async function () {
            const priceConsumer = await deployPriceConsumer();

            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getLatestPrice",
                args: ["0x0000000000000000000000000000000000000000"]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceUpdated"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.ok(log.args.price !== undefined);
            console.log(`✓ PriceUpdated event emitted: ${log.args.price}`);
        });

        it("Should emit PriceFeedRequested event", async function () {
            const priceConsumer = await deployPriceConsumer();
            const token = await deployERC20();

            const hash = await seller.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "requestPriceFeed",
                args: [token.address, "TEST"]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceFeedRequested"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.token?.toLowerCase(), token.address.toLowerCase());
            assert.equal(log.args.tokenSymbol, "TEST");
            console.log(`✓ PriceFeedRequested event emitted`);
        });

        it("Should emit PriceFeedApproved event", async function () {
            const priceConsumer = await deployPriceConsumer();
            const token = await deployERC20();

            // Request first
            let hash = await seller.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "requestPriceFeed",
                args: [token.address, "TEST"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Approve
            hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "approvePriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceFeedApproved"
            });

            assert.equal(logs.length, 1);
            const log: any = logs[0];
            assert.equal(log.args.token?.toLowerCase(), token.address.toLowerCase());
            console.log(`✓ PriceFeedApproved event emitted`);
        });
    });

    describe("Multiple Events in Single Transaction", function () {
        it("Should emit multiple events on auction with bid", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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
            const createReceipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check both Transfer (NFT) and AuctionCreated events
            const transferLogs = parseEventLogs({
                abi: nft.abi,
                logs: createReceipt.logs,
                eventName: "Transfer"
            });

            const auctionLogs = parseEventLogs({
                abi: auction.abi,
                logs: createReceipt.logs,
                eventName: "AuctionCreated"
            });

            assert.ok(transferLogs.length > 0);
            assert.equal(auctionLogs.length, 1);
            console.log(`✓ Multiple events: ${transferLogs.length} Transfer + ${auctionLogs.length} AuctionCreated`);
        });

        it("Should emit multiple events on auction end", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

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

            hash = await bidder1.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("5")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            await advanceTime(3601);

            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Should have Transfer (NFT) and AuctionEnded events
            const transferLogs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "Transfer"
            });

            const endedLogs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionEnded"
            });

            assert.ok(transferLogs.length > 0);
            assert.equal(endedLogs.length, 1);
            console.log(`✓ Auction end events: ${transferLogs.length} Transfer + ${endedLogs.length} AuctionEnded`);
        });
    });

    console.log(`\n✅ All EventLog tests completed successfully!\n`);
});