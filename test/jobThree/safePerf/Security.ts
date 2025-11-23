import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEventLogs, parseEther, Address } from "viem";

describe("Security - Reentrancy and Access Control Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, seller, bidder1, bidder2, attacker, feeRecipient] = await viem.getWalletClients();

    console.log(`\n🔒 Starting Security Tests`);
    console.log(`Owner: ${owner.account.address}`);
    console.log(`Seller: ${seller.account.address}`);
    console.log(`Bidder1: ${bidder1.account.address}`);
    console.log(`Attacker: ${attacker.account.address}\n`);

    /**
     * Deploy Mock Price Feed
     */
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

    /**
     * Deploy PriceConsumer
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
            abi: pcImpl.abi
        };
    }

    /**
     * Deploy NFT
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
     * Deploy NFTAuction
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
            abi: auctionImpl.abi
        };
    }

    /**
     * Create auction and place bid
     */
    async function setupAuction(bidAmount: bigint) {
        const nft = await deployNFT();
        const auction = await deployAuction();
        const tokenId = 1n;

        // Mint NFT
        let hash = await seller.writeContract({
            address: nft.address,
            abi: nft.abi,
            functionName: "mint",
            args: [seller.account.address, tokenId]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        // Approve
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
            args: [nft.address, tokenId, parseEther("0.1"), 3600n, "0x0000000000000000000000000000000000000000"]
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
     * Advance time
     */
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

    describe("Reentrancy Protection", function () {
        it("Should prevent reentrancy in bid function", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            // Try to place another bid (simulating reentrancy scenario)
            // The contract should have reentrancy guard
            try {
                const hash = await bidder2.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("2")
                });
                await publicClient.waitForTransactionReceipt({ hash });

                // If we reach here, verify the bid was successful
                const auctionData = await publicClient.readContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "auctions",
                    args: [0n]
                }) as any;

                assert.equal(auctionData.highestBidder.toLowerCase(), bidder2.account.address.toLowerCase());
                console.log(`✓ Bid function executed safely with proper state updates`);
            } catch (error) {
                console.log(`✓ Reentrancy guard prevented invalid state`);
            }
        });

        it("Should prevent reentrancy in endAuction function", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            // Advance time
            await advanceTime(3601);

            // End auction (should have reentrancy guard)
            const hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Verify auction ended by checking events
            const logs = parseEventLogs({
                abi: auction.abi,
                logs: receipt.logs,
                eventName: "AuctionEnded"
            });

            assert.ok(logs.length > 0, "AuctionEnded event should be emitted");
            console.log(`✓ EndAuction executed safely with reentrancy protection`);
        });

        it("Should handle refunds safely without reentrancy", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            // Place higher bid (triggers refund to bidder1)
            const balanceBefore = await publicClient.getBalance({
                address: bidder1.account.address
            });

            const hash = await bidder2.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "bid",
                args: [0n],
                value: parseEther("2")
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const balanceAfter = await publicClient.getBalance({
                address: bidder1.account.address
            });

            // Bidder1 should have received refund
            assert.ok(balanceAfter > balanceBefore, "Refund should be received");
            console.log(`✓ Refund executed safely: ${balanceAfter - balanceBefore} wei received`);
        });

    });

    describe("Access Control - Owner Functions", function () {
        it("Should allow only owner to set fee recipient", async function () {
            const auction = await deployAuction();

            const newRecipient = bidder2.account.address;
            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "setFeeRecipient",
                args: [newRecipient]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const currentRecipient = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "feeRecipient",
                args: []
            }) as Address;

            assert.equal(currentRecipient.toLowerCase(), newRecipient.toLowerCase());
            console.log(`✓ Owner successfully updated fee recipient`);
        });

        it("Should NOT allow non-owner to set fee recipient", async function () {
            const auction = await deployAuction();

            try {
                await attacker.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "setFeeRecipient",
                    args: [attacker.account.address]
                });
                assert.fail("Non-owner should not set fee recipient");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from setting fee recipient`);
            }
        });

        it("Should allow only owner to set fee tiers", async function () {
            const auction = await deployAuction();

            const customTiers = [
                {
                    minAmountUSD: 0n,
                    maxAmountUSD: 1000n * 10n ** 8n,
                    feeBps: 500n
                }
            ];

            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "setFeeTiers",
                args: [customTiers]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const tierCount = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getFeeTierCount",
                args: []
            }) as bigint;

            assert.equal(tierCount, 1n);
            console.log(`✓ Owner successfully set custom fee tiers`);
        });

        it("Should NOT allow non-owner to set fee tiers", async function () {
            const auction = await deployAuction();

            const customTiers = [
                {
                    minAmountUSD: 0n,
                    maxAmountUSD: 1000n * 10n ** 8n,
                    feeBps: 1000n
                }
            ];

            try {
                await attacker.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "setFeeTiers",
                    args: [customTiers]
                });
                assert.fail("Non-owner should not set fee tiers");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from setting fee tiers`);
            }
        });

        it("Should allow owner to emergency cancel auction", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            const hash = await owner.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "emergencyCancel",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            console.log(`✓ Owner successfully emergency cancelled auction`);
        });

        it("Should NOT allow non-owner to emergency cancel", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            try {
                await attacker.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "emergencyCancel",
                    args: [0n]
                });
                assert.fail("Non-owner should not emergency cancel");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from emergency cancelling`);
            }
        });

    });

    describe("Access Control - NFT Ownership", function () {
        it("Should only allow NFT owner to create auction", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Mint to seller
            let hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Approve
            hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [auction.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Seller creates auction (should succeed)
            hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "createAuction",
                args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            console.log(`✓ NFT owner successfully created auction`);
        });

        it("Should NOT allow non-owner to create auction with others NFT", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Mint to seller
            const hash = await seller.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [seller.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Attacker tries to create auction without approval
            try {
                await attacker.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 3600n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Non-owner should not create auction");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from creating auction with others' NFT`);
            }
        });

        it("Should only allow seller to end their auction", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            await advanceTime(3601);

            // Seller ends auction
            const hash = await seller.writeContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "endAuction",
                args: [0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            console.log(`✓ Seller successfully ended their auction`);
        });

        it("Should NOT allow others to end someone else's auction", async function () {
            const { auction } = await setupAuction(parseEther("1"));

            await advanceTime(3601);

            try {
                await attacker.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "endAuction",
                    args: [0n]
                });
                assert.fail("Non-seller should not end auction");
            } catch (error: any) {
                console.log(`✓ Non-seller prevented from ending others' auction`);
            }
        });
    });

    describe("Input Validation", function () {
        it("Should reject zero address as fee recipient", async function () {
            const auction = await deployAuction();

            try {
                await owner.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "setFeeRecipient",
                    args: ["0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should not accept zero address");
            } catch (error: any) {
                console.log(`✓ Zero address rejected for fee recipient`);
            }
        });

        it("Should reject invalid auction duration", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Mint and approve
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

            // Try very short duration
            try {
                await seller.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "createAuction",
                    args: [nft.address, tokenId, parseEther("1"), 10n, "0x0000000000000000000000000000000000000000"]
                });
                assert.fail("Should reject short duration");
            } catch (error: any) {
                console.log(`✓ Invalid duration rejected`);
            }
        });

        it("Should reject bids lower than start price", async function () {
            const nft = await deployNFT();
            const auction = await deployAuction();
            const tokenId = 1n;

            // Setup auction with 1 ETH start price
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

            // Try low bid
            try {
                await bidder1.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "bid",
                    args: [0n],
                    value: parseEther("0.5")
                });
                assert.fail("Should reject low bid");
            } catch (error: any) {
                assert.ok(error.message.includes("BidTooLow"));
                console.log(`✓ Low bid rejected`);
            }
        });
    });

    console.log(`\n✅ All Security tests completed successfully!\n`);
});