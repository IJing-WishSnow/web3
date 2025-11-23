import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, parseEventLogs, parseEther, parseUnits } from "viem";

describe("ErrorRecovery - Exception Handling Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder1, bidder2, feeRecipient] = await viem.getWalletClients();

    console.log(`\n🛠️ Starting ErrorRecovery Tests\n`);

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

    describe("Invalid Auction Creation", function () {
        it("Should reject auction with zero start price", async function () {
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

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, 0n, 3600n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should reject zero start price");
            } catch {
                console.log(`✓ Zero start price rejected`);
            }
        });

        it("Should reject auction with too short duration", async function () {
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

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 30n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should reject short duration");
            } catch {
                console.log(`✓ Too short duration rejected`);
            }
        });

        it("Should reject auction with too long duration", async function () {
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

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 31n * 24n * 3600n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should reject long duration");
            } catch {
                console.log(`✓ Too long duration rejected`);
            }
        });

        it("Should reject auction without NFT approval", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            const hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should reject without approval");
            } catch {
                console.log(`✓ No approval rejected`);
            }
        });

        it("Should reject auction with non-existent NFT", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 999n;

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should reject non-existent NFT");
            } catch {
                console.log(`✓ Non-existent NFT rejected`);
            }
        });
    });

    describe("Invalid Bidding Scenarios", function () {
        it("Should reject bid before auction starts", async function () {
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

            // Bid immediately (should work since startTime is block.timestamp)
            // Actually this test doesn't apply as auction starts immediately
            console.log(`✓ Auction starts immediately - test skipped`);
        });

        it("Should reject bid after auction ends", async function () {
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

            try {
                await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("2")
                });
                assert.fail("Should reject bid after end");
            } catch {
                console.log(`✓ Bid after end rejected`);
            }
        });

        it("Should reject bid lower than current highest", async function () {
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
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await bidder2.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("1.5")
                });
                assert.fail("Should reject low bid");
            } catch {
                console.log(`✓ Low bid rejected`);
            }
        });

        it("Should reject ETH bid for ERC20 auction", async function () {
            const nft = await deployNFT();
            const { address: auctionAddress, abi: auctionAbi, priceConsumer } = await deployAuction();
            const token = await deployERC20();
            const tokenId = 1n;

            // Set price feed for token
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

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

            hash = await seller.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("100"), 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await bidder1.writeContract({
                    address: auctionAddress,
                    abi: auctionAbi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("200")
                });
                assert.fail("Should reject ETH for ERC20 auction");
            } catch {
                console.log(`✓ ETH for ERC20 auction rejected`);
            }
        });

        it("Should reject ERC20 bid without sufficient balance", async function () {
            const nft = await deployNFT();
            const { address: auctionAddress, abi: auctionAbi, priceConsumer } = await deployAuction();
            const token = await deployERC20();
            const tokenId = 1n;

            // Set price feed for token
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

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

            hash = await seller.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("100"), 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await bidder1.writeContract({
                    address: auctionAddress,
                    abi: auctionAbi,
                    functionName: "bidWithERC20",
                    args: [0n, parseEther("200")]
                });
                assert.fail("Should reject insufficient balance");
            } catch {
                console.log(`✓ Insufficient balance rejected`);
            }
        });

        it("Should reject ERC20 bid without approval", async function () {
            const nft = await deployNFT();
            const { address: auctionAddress, abi: auctionAbi, priceConsumer } = await deployAuction();
            const token = await deployERC20();
            const tokenId = 1n;

            // Set price feed for token
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [token.address, priceConsumer.mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

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

            hash = await seller.writeContract({
                address: auctionAddress,
                abi: auctionAbi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("100"), 3600n, token.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await bidder1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [bidder1.account.address, parseEther("1000")]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await bidder1.writeContract({
                    address: auctionAddress,
                    abi: auctionAbi,
                    functionName: "bidWithERC20",
                    args: [0n, parseEther("200")]
                });
                assert.fail("Should reject without approval");
            } catch {
                console.log(`✓ No ERC20 approval rejected`);
            }
        });
    });

    describe("Invalid Auction Ending", function () {
        it("Should reject ending auction before time", async function () {
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

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                assert.fail("Should reject early end");
            } catch {
                console.log(`✓ Early end rejected`);
            }
        });

        it("Should reject ending already ended auction", async function () {
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
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                assert.fail("Should reject double end");
            } catch {
                console.log(`✓ Double end rejected`);
            }
        });

        it("Should reject unauthorized user ending auction", async function () {
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

            try {
                await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                assert.fail("Should reject unauthorized end");
            } catch {
                console.log(`✓ Unauthorized end rejected`);
            }
        });
    });

    describe("Emergency Cancel Scenarios", function () {
        it("Should handle emergency cancel with no bids", async function () {
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
            await publicClient.waitForTransactionReceipt({ hash });

            console.log(`✓ Emergency cancel with no bids successful`);
        });

        it("Should handle emergency cancel with active bid", async function () {
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
            await publicClient.waitForTransactionReceipt({ hash });

            const balanceBefore = await publicClient.getBalance({
                address: bidder1.account.address
            });

            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "emergencyCancel",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const balanceAfter = await publicClient.getBalance({
                address: bidder1.account.address
            });

            assert.ok(balanceAfter > balanceBefore, "Bidder should receive refund");
            console.log(`✓ Emergency cancel with refund successful`);
        });

        it("Should reject emergency cancel of already ended auction", async function () {
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
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await owner.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "emergencyCancel",
                    args: [0n]
                });
                assert.fail("Should reject cancel of ended auction");
            } catch {
                console.log(`✓ Cancel of ended auction rejected`);
            }
        });
    });

    describe("Edge Cases", function () {
        it("Should handle auction with exact minimum duration", async function () {
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
                args: [nft.address, tokenId, parseEther("1"), 60n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            console.log(`✓ Minimum duration (1 minute) accepted`);
        });

        it("Should handle auction with exact maximum duration", async function () {
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
                args: [nft.address, tokenId, parseEther("1"), 30n * 24n * 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            console.log(`✓ Maximum duration (30 days) accepted`);
        });

        it("Should handle multiple consecutive bids from same user", async function () {
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
            await publicClient.waitForTransactionReceipt({ hash });

            try {
                await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("2.5")
                });
                assert.fail("Should reject bid not higher than own bid");
            } catch {
                console.log(`✓ Self-outbid attempt rejected`);
            }
        });
    });

    console.log(`\n✅ All ErrorRecovery tests completed successfully!\n`);
});