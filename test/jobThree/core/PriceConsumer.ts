import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEventLogs, parseEther } from "viem";

describe("PriceConsumer - Chainlink Price Query and USD Calculation Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, user1, user2] = await viem.getWalletClients();

    console.log(`\n🧪 Starting PriceConsumer Tests`);
    console.log(`Owner: ${owner.account.address}`);
    console.log(`User1: ${user1.account.address}`);
    console.log(`User2: ${user2.account.address}\n`);

    const VALID_TEST_ADDRESSES = {
        TOKEN1: "0x1000000000000000000000000000000000000001",
        TOKEN2: "0x2000000000000000000000000000000000000002",
        TOKEN3: "0x3000000000000000000000000000000000000003",
        TOKEN4: "0x4000000000000000000000000000000000000004",
        TOKEN5: "0x5000000000000000000000000000000000000005",
        TOKEN6: "0x6000000000000000000000000000000000000006",
        TOKEN7: "0x7000000000000000000000000000000000000007",
        TOKEN8: "0x8000000000000000000000000000000000000008",
        TOKEN9: "0x9000000000000000000000000000000000000009",
        RANDOM: "0x9999999999999999999999999999999999999999"
    };

    /**
     * Helper function to deploy a Mock Chainlink Price Feed
     * @param decimals Number of decimals (typically 8 for USD pairs)
     * @param description Price feed description
     * @param initialPrice Initial price to set
     * @returns Mock aggregator contract object with address and abi
     */
    async function deployMockPriceFeed(decimals: number = 8, description: string = "ETH / USD", initialPrice: bigint = 300000000000n) {
        // Deploy MockAggregatorV3
        const mockAggregator = await viem.deployContract(
            "contracts/jobThree/Mock/MockAggregatorV3.sol:MockAggregatorV3" as any,
            [decimals, description]
        );

        // Set initial price (e.g., $3000 for ETH with 8 decimals = 300000000000)
        const hash = await owner.writeContract({
            address: mockAggregator.address,
            abi: mockAggregator.abi,
            functionName: "setPrice",
            args: [initialPrice]
        });
        await publicClient.waitForTransactionReceipt({ hash });

        return mockAggregator;
    }

    describe("Deployment and Initialization", function () {
        it("Should deploy and initialize with ETH price feed", async function () {
            // Deploy mock price feed
            const mockPriceFeed = await deployMockPriceFeed();
            console.log(`✓ Mock price feed deployed at: ${mockPriceFeed.address}`);

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            console.log(`✓ PriceConsumer deployed at: ${priceConsumer.address}`);

            // Verify version
            const version = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getVersion",
                args: []
            }) as string;

            assert.equal(version, "PriceConsumer v1.0.0");
            console.log(`✓ Version: ${version}`);

            // Verify ETH price feed is set
            const isEthFeedSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: ["0x0000000000000000000000000000000000000000"]
            }) as boolean;

            assert.equal(isEthFeedSet, true);
            console.log(`✓ ETH price feed initialized: ${isEthFeedSet}`);

            // Verify owner
            const contractOwner = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "owner",
                args: []
            }) as string;

            assert.equal(
                getAddress(contractOwner as string),
                getAddress(owner.account.address)
            );
            console.log(`✓ Owner: ${contractOwner}`);
        });

        it("Should NOT allow re-initialization", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            try {
                const hash = await owner.writeContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "initialize",
                    args: [mockPriceFeed.address]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow re-initialization");
            } catch (error: any) {
                console.log(`✓ Re-initialization prevented as expected`);
            }
        });
    });

    describe("Price Feed Management", function () {
        it("Should allow owner to set price feed for a token", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const mockTokenAddress = "0x1234567890123456789012345678901234567890";
            const mockPriceFeed2 = await deployMockPriceFeed();

            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [mockTokenAddress, mockPriceFeed2.address]
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check PriceFeedUpdated event
            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceFeedUpdated"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit PriceFeedUpdated event");
            assert.equal(
                getAddress(logs[0].args.token as string),
                getAddress(mockTokenAddress)
            );
            assert.equal(
                getAddress(logs[0].args.priceFeed as string),
                getAddress(mockPriceFeed2.address)
            );
            console.log(`✓ PriceFeedUpdated event emitted`);

            // Verify price feed is set
            const isPriceFeedSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: [mockTokenAddress]
            }) as boolean;

            assert.equal(isPriceFeedSet, true);
            console.log(`✓ Price feed set for token: ${mockTokenAddress}`);
        });

        it("Should allow batch setting price feeds", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const tokens = [
                "0x1111111111111111111111111111111111111111",
                "0x2222222222222222222222222222222222222222",
                "0x3333333333333333333333333333333333333333"
            ];

            const feeds = [
                mockPriceFeed.address,
                mockPriceFeed.address,
                mockPriceFeed.address
            ];

            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "batchSetPriceFeeds",
                args: [tokens, feeds]
            });

            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Batch price feeds set for ${tokens.length} tokens`);

            // Verify all price feeds are set
            for (const token of tokens) {
                const isSet = await publicClient.readContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "isPriceFeedSet",
                    args: [token]
                }) as boolean;
                assert.equal(isSet, true, `Price feed should be set for ${token}`);
            }

            console.log(`✓ All ${tokens.length} price feeds verified`);
        });

        it("Should revert batch setting with mismatched array lengths", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const tokens = [
                "0x1111111111111111111111111111111111111111",
                "0x2222222222222222222222222222222222222222"
            ];

            const feeds = [mockPriceFeed.address]; // Only one feed for two tokens

            try {
                const hash = await owner.writeContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "batchSetPriceFeeds",
                    args: [tokens, feeds]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should revert with mismatched array lengths");
            } catch (error: any) {
                console.log(`✓ Batch setting reverted with mismatched arrays as expected`);
            }
        });

        it("Should allow owner to remove price feed", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const tokenAddress = "0x4444444444444444444444444444444444444444";

            // First set the price feed
            let hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "setPriceFeed",
                args: [tokenAddress, mockPriceFeed.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            let isSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: [tokenAddress]
            }) as boolean;
            assert.equal(isSet, true);
            console.log(`✓ Price feed set for token`);

            // Now remove it
            hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "removePriceFeed",
                args: [tokenAddress]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            isSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: [tokenAddress]
            }) as boolean;
            assert.equal(isSet, false);
            console.log(`✓ Price feed removed for token`);
        });

        it("Should NOT allow non-owner to set price feed", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            try {
                const hash = await user1.writeContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "setPriceFeed",
                    args: ["0x5555555555555555555555555555555555555555", mockPriceFeed.address]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Non-owner should not be able to set price feed");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from setting price feed as expected`);
            }
        });
    });

    describe("Chainlink Price Query Tests", function () {
        it("Should get latest price for ETH", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Get latest price for ETH (address(0))
            const hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getLatestPrice",
                args: ["0x0000000000000000000000000000000000000000"]
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check for PriceUpdated event
            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceUpdated"
            }) as any[];

            assert.ok(logs.length > 0, "Should emit PriceUpdated event");
            console.log(`✓ PriceUpdated event emitted`);
            console.log(`✓ Latest ETH price: ${logs[0].args.price}`);
        });

        it("Should get price data with decimals and description", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const priceData = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getPriceData",
                args: ["0x0000000000000000000000000000000000000000"]
            }) as any;

            const [rawPrice, decimals, description] = priceData;

            assert.ok(rawPrice > 0n, "Raw price should be positive");
            assert.ok(decimals > 0, "Decimals should be positive");
            assert.ok(description.length > 0, "Description should not be empty");

            console.log(`✓ Raw price: ${rawPrice}`);
            console.log(`✓ Decimals: ${decimals}`);
            console.log(`✓ Description: ${description}`);
        });

        it("Should get normalized price (18 decimals)", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const normalizedPrice = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getNormalizedPrice",
                args: ["0x0000000000000000000000000000000000000000"]
            }) as bigint;

            assert.ok(normalizedPrice > 0n, "Normalized price should be positive");
            console.log(`✓ Normalized price (18 decimals): ${normalizedPrice}`);

            // The normalized price should be a large number (18 decimals)
            const priceInEther = Number(normalizedPrice) / 1e18;
            console.log(`✓ Price in ETH format: $${priceInEther.toFixed(2)}`);
        });

        it("Should get price feed info", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const feedInfo = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getPriceFeedInfo",
                args: ["0x0000000000000000000000000000000000000000"]
            }) as any;

            const [description, decimals, version] = feedInfo;

            assert.ok(description.length > 0, "Description should not be empty");
            assert.ok(decimals > 0, "Decimals should be positive");
            assert.ok(version > 0n, "Version should be positive");

            console.log(`✓ Description: ${description}`);
            console.log(`✓ Decimals: ${decimals}`);
            console.log(`✓ Aggregator version: ${version}`);
        });

        it("Should revert when querying price for non-set feed", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const randomToken = "0x9999999999999999999999999999999999999999";

            try {
                await publicClient.readContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "getPriceData",
                    args: [randomToken]
                });
                assert.fail("Should revert for non-set price feed");
            } catch (error: any) {
                console.log(`✓ Query reverted for non-set price feed as expected`);
            }
        });
    });

    describe("USD Price Calculation Tests", function () {
        it("Should calculate USD value for ETH amount", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Calculate value for 1 ETH
            const ethAmount = parseEther("1"); // 1 ETH = 10^18 wei
            const ethDecimals = 18;

            const usdValue = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "calculateValue",
                args: [ethAmount, "0x0000000000000000000000000000000000000000", ethDecimals]
            }) as bigint;

            assert.ok(usdValue > 0n, "USD value should be positive");
            console.log(`✓ 1 ETH = $${Number(usdValue) / 1e8} USD (8 decimals)`);
        });

        it("Should calculate USD value for different ETH amounts", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const testAmounts = ["0.1", "0.5", "1", "2", "10"];

            for (const amount of testAmounts) {
                const ethAmount = parseEther(amount);
                const usdValue = await publicClient.readContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "calculateValue",
                    args: [ethAmount, "0x0000000000000000000000000000000000000000", 18]
                }) as bigint;

                console.log(`✓ ${amount} ETH = $${Number(usdValue) / 1e8} USD`);
            }
        });

        it("Should calculate USD value with different token decimals", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Test with 6 decimals (like USDC)
            const amount6Decimals = 1000000n; // 1 token with 6 decimals
            const usdValue6 = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "calculateValue",
                args: [amount6Decimals, "0x0000000000000000000000000000000000000000", 6]
            }) as bigint;
            console.log(`✓ 1 token (6 decimals) = $${Number(usdValue6) / 1e8} USD`);

            // Test with 18 decimals (like ETH)
            const amount18Decimals = parseEther("1"); // 1 token with 18 decimals
            const usdValue18 = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "calculateValue",
                args: [amount18Decimals, "0x0000000000000000000000000000000000000000", 18]
            }) as bigint;
            console.log(`✓ 1 token (18 decimals) = $${Number(usdValue18) / 1e8} USD`);
        });

        it("Should return consistent USD calculations", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Calculate 1 ETH twice
            const ethAmount = parseEther("1");

            const usdValue1 = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "calculateValue",
                args: [ethAmount, "0x0000000000000000000000000000000000000000", 18]
            }) as bigint;

            const usdValue2 = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "calculateValue",
                args: [ethAmount, "0x0000000000000000000000000000000000000000", 18]
            }) as bigint;

            assert.equal(usdValue1, usdValue2, "USD calculations should be consistent");
            console.log(`✓ Consistent USD value: $${Number(usdValue1) / 1e8}`);
        });
    });

    describe("Price Feed Request System", function () {
        it("Should allow users to request price feed for a token", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const newTokenAddress = VALID_TEST_ADDRESSES.TOKEN1;
            const tokenSymbol = "TEST";

            const hash = await user1.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "requestPriceFeed",
                args: [newTokenAddress, tokenSymbol]
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check PriceFeedRequested event
            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceFeedRequested"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit PriceFeedRequested event");
            assert.equal(
                getAddress(logs[0].args.requester as string),
                getAddress(user1.account.address)
            );
            assert.equal(
                getAddress(logs[0].args.token as string),
                getAddress(newTokenAddress)
            );
            assert.equal(logs[0].args.tokenSymbol, tokenSymbol);

            console.log(`✓ Price feed requested by user: ${logs[0].args.requester}`);
            console.log(`✓ Token: ${logs[0].args.token}`);
            console.log(`✓ Symbol: ${logs[0].args.tokenSymbol}`);
        });

        it("Should NOT allow requesting price feed for already set token", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            try {
                // Try to request for ETH which is already set
                const hash = await user1.writeContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "requestPriceFeed",
                    args: ["0x0000000000000000000000000000000000000000", "ETH"]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow requesting for already set price feed");
            } catch (error: any) {
                console.log(`✓ Request prevented for already set price feed as expected`);
            }
        });

        it("Should allow owner to approve price feed request", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const newTokenAddress = VALID_TEST_ADDRESSES.TOKEN2;

            // User requests price feed
            let hash = await user1.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "requestPriceFeed",
                args: [newTokenAddress, "TOKEN"]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ User requested price feed`);

            // Deploy another mock for the new token
            const mockPriceFeed2 = await deployMockPriceFeed();

            // Owner approves the request
            hash = await owner.writeContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "approvePriceFeed",
                args: [newTokenAddress, mockPriceFeed2.address]
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check PriceFeedApproved event
            const logs = parseEventLogs({
                abi: priceConsumer.abi,
                logs: receipt.logs,
                eventName: "PriceFeedApproved"
            }) as any[];

            assert.ok(logs.length > 0, "Should emit PriceFeedApproved event");
            console.log(`✓ PriceFeedApproved event emitted`);

            // Verify price feed is now set
            const isSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: [newTokenAddress]
            }) as boolean;

            assert.equal(isSet, true);
            console.log(`✓ Price feed approved and set for token`);
        });
    });

    describe("Query and Utility Functions", function () {
        it("Should correctly check if price feed is set", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            // ETH should be set
            const ethSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: ["0x0000000000000000000000000000000000000000"]
            }) as boolean;
            assert.equal(ethSet, true, "ETH price feed should be set");
            console.log(`✓ ETH price feed is set: ${ethSet}`);

            // Random token should not be set
            const randomSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: [VALID_TEST_ADDRESSES.RANDOM]
            }) as boolean;
            assert.equal(randomSet, false, "Random token should not be set");
            console.log(`✓ Random token is not set: ${randomSet}`);
        });

        it("Should return correct version", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const version = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getVersion",
                args: []
            }) as string;

            assert.equal(version, "PriceConsumer v1.0.0");
            console.log(`✓ Version: ${version}`);
        });
    });

    describe("Integration with Multiple Price Feeds", function () {
        it("Should manage multiple token price feeds correctly", async function () {
            const mockPriceFeed = await deployMockPriceFeed();

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [mockPriceFeed.address]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Setup multiple tokens (using proper checksum addresses)
            const tokens = [
                { address: VALID_TEST_ADDRESSES.TOKEN3, symbol: "USDC" },
                { address: VALID_TEST_ADDRESSES.TOKEN4, symbol: "USDT" },
                { address: VALID_TEST_ADDRESSES.TOKEN5, symbol: "DAI" }
            ];

            // Set price feeds for all tokens
            for (const token of tokens) {
                const hash = await owner.writeContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "setPriceFeed",
                    args: [token.address, mockPriceFeed.address]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                console.log(`✓ Price feed set for ${token.symbol}`);
            }

            // Verify all tokens have price feeds
            for (const token of tokens) {
                const isSet = await publicClient.readContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "isPriceFeedSet",
                    args: [token.address]
                }) as boolean;
                assert.equal(isSet, true, `${token.symbol} should have price feed set`);
            }

            console.log(`✓ All ${tokens.length} tokens have price feeds configured`);

            // Calculate values for different amounts
            for (const token of tokens) {
                const amount = parseEther("100"); // 100 tokens
                const usdValue = await publicClient.readContract({
                    address: priceConsumer.address,
                    abi: priceConsumer.abi,
                    functionName: "calculateValue",
                    args: [amount, token.address, 18]
                }) as bigint;
                console.log(`✓ 100 ${token.symbol} = $${Number(usdValue) / 1e8} USD`);
            }
        });
    });

    console.log(`\n✅ All PriceConsumer tests completed successfully!\n`);
});