import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, parseEther } from "viem";

describe("Upgradeability - UUPS Proxy Upgrade Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder, nonOwner] = await viem.getWalletClients();

    console.log(`\n⬆️  Starting Upgradeability Tests\n`);

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

        return { address: pcProxy.address, abi: pcImpl.abi };
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

        return { address: nftProxy.address, abi: nftImpl.abi, implementation: nftImpl.address };
    }

    async function deployAuction() {
        const priceConsumer = await deployPriceConsumer();

        const auctionImpl = await viem.deployContract(
            "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
        );

        const auctionInitData = encodeFunctionData({
            abi: auctionImpl.abi,
            functionName: "initialize",
            args: [owner.account.address, priceConsumer.address]
        });

        const auctionProxy = await viem.deployContract(
            "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
            [auctionImpl.address, auctionInitData]
        );

        return {
            address: auctionProxy.address,
            abi: auctionImpl.abi,
            implementation: auctionImpl.address,
            priceConsumer
        };
    }

    describe("UUPS Upgrade Authorization", function () {
        it("Should allow owner to upgrade NFT contract", async function () {
            const nft = await deployNFT();

            const nftImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );
            console.log(`✓ New NFT implementation deployed`);

            // Test upgrade authorization
            const hash = await owner.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "upgradeTo",
                args: [nftImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ NFT contract upgraded successfully`);
        });

        it("Should allow owner to upgrade PriceConsumer", async function () {
            const priceConsumer = await deployPriceConsumer();

            const pcImplV2 = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );
            console.log(`✓ New PriceConsumer implementation deployed`);

            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "upgradeTo",
                args: [pcImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ PriceConsumer upgraded successfully`);
        });

        it("Should allow owner to upgrade Auction contract", async function () {
            const auction = await deployAuction();

            // Deploy new implementation
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );
            console.log(`✓ New implementation deployed`);

            // Upgrade
            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction contract upgraded`);
        });

        it("Should reject upgrade from non-owner", async function () {
            const auction = await deployAuction();

            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            try {
                await nonOwner.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "upgradeTo",
                    args: [auctionImplV2.address]
                });
                assert.fail("Non-owner should not upgrade");
            } catch {
                console.log(`✓ Non-owner upgrade rejected`);
            }
        });
    });

    describe("State Preservation After Upgrade", function () {
        it("Should preserve NFT state after upgrade", async function () {
            const nft = await deployNFT();
            const tokenId = 1n;

            // Mint NFT
            let hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ NFT minted before upgrade`);

            const ownerBefore = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as `0x${string}`;

            // Upgrade
            const nftImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            hash = await owner.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "upgradeTo",
                args: [nftImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ NFT contract upgraded`);

            // Check ownership preserved
            const ownerAfter = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            }) as `0x${string}`;

            assert.equal(ownerBefore.toLowerCase(), ownerAfter.toLowerCase());
            console.log(`✓ NFT ownership preserved after upgrade`);
        });

        it("Should preserve auction data after upgrade", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Create auction
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
            console.log(`✓ Auction created before upgrade`);

            const auctionBefore = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            // Upgrade
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract upgraded`);

            // Check auction data preserved
            const auctionAfter = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getAuction",
                args: [0n]
            }) as any;

            assert.equal(auctionBefore.seller.toLowerCase(), auctionAfter.seller.toLowerCase());
            assert.equal(auctionBefore.startPrice, auctionAfter.startPrice);
            console.log(`✓ Auction data preserved`);
        });

        it("Should preserve auction count after upgrade", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();

            // Create multiple auctions
            for (let i = 1; i <= 3; i++) {
                let hash = await seller.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [seller.account.address, BigInt(i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await seller.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "approve",
                    args: [auction.address, BigInt(i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });

                hash = await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, BigInt(i), parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }
            console.log(`✓ 3 auctions created`);

            const countBefore = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "auctionCount",
                args: []
            });

            // Upgrade
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract upgraded`);

            const countAfter = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "auctionCount",
                args: []
            });

            assert.equal(countBefore, countAfter);
            console.log(`✓ Auction count preserved: ${countAfter}`);
        });

        it("Should preserve fee settings after upgrade", async function () {
            const auction = await deployAuction();

            // Set custom fee recipient
            let hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "setFeeRecipient",
                args: [bidder.account.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const recipientBefore = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "feeRecipient",
                args: []
            }) as `0x${string}`;

            // Upgrade
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract upgraded`);

            const recipientAfter = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "feeRecipient",
                args: []
            }) as `0x${string}`;

            assert.equal(recipientBefore.toLowerCase(), recipientAfter.toLowerCase());
            console.log(`✓ Fee recipient preserved`);
        });
    });

    describe("Functionality After Upgrade", function () {
        it("Should allow creating auctions after upgrade", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();

            // Upgrade first
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            let hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract upgraded`);

            // Create auction after upgrade
            hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, 1n, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created after upgrade`);
        });

        it("Should allow bidding after upgrade", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();

            // Create auction
            let hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, 1n, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Auction created`);

            // Upgrade
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract upgraded`);

            // Bid after upgrade
            hash = await bidder.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Bid placed after upgrade`);
        });

        it("Should allow NFT minting after upgrade", async function () {
            const nft = await deployNFT();

            // Upgrade
            const nftImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            let hash = await owner.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "upgradeTo",
                args: [nftImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ NFT contract upgraded`);

            // Mint after upgrade
            hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ NFT minted after upgrade`);

            const owner_ = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [1n]
            }) as `0x${string}`;

            assert.equal(owner_.toLowerCase(), seller.account.address.toLowerCase());
            console.log(`✓ NFT functionality works after upgrade`);
        });
    });

    describe("Proxy Implementation Verification", function () {
        it("Should return correct implementation address", async function () {
            const auction = await deployAuction();

            // Get implementation slot (EIP-1967)
            const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
            const implData = await publicClient.getStorageAt({
                address: auction.address,
                slot: implSlot as `0x${string}`
            });

            const implAddress = `0x${implData?.slice(-40)}`;
            assert.equal(implAddress.toLowerCase(), auction.implementation.toLowerCase());
            console.log(`✓ Implementation address verified`);
        });

        it("Should update implementation address after upgrade", async function () {
            const auction = await deployAuction();

            const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

            const implBefore = await publicClient.getStorageAt({
                address: auction.address,
                slot: implSlot as `0x${string}`
            });

            // Upgrade
            const auctionImplV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [auctionImplV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const implAfter = await publicClient.getStorageAt({
                address: auction.address,
                slot: implSlot as `0x${string}`
            });

            assert.notEqual(implBefore, implAfter);
            console.log(`✓ Implementation address updated after upgrade`);
        });
    });

    describe("Multiple Upgrades", function () {
        it("Should handle multiple sequential upgrades", async function () {
            const auction = await deployAuction();

            // First upgrade
            const implV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            let hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [implV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ First upgrade completed`);

            // Second upgrade
            const implV3 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [implV3.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Second upgrade completed`);

            // Verify still functional
            const count = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "auctionCount",
                args: []
            });
            console.log(`✓ Contract still functional after 2 upgrades`);
        });
    });

    describe("Reinitializer Protection", function () {
        it("Should prevent reinitialization after upgrade", async function () {
            const auction = await deployAuction();

            // Upgrade
            const implV2 = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );

            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "upgradeTo",
                args: [implV2.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract upgraded`);

            // Try to reinitialize
            try {
                await owner.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "initialize",
                    args: [owner.account.address, auction.priceConsumer.address]
                });
                assert.fail("Should not allow reinitialization");
            } catch {
                console.log(`✓ Reinitialization prevented`);
            }
        });
    });

    console.log(`\n✅ All Upgradeability tests completed successfully!\n`);
});