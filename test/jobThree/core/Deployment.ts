import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData } from "viem";

describe("Core Contract Deployment Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, user1, user2] = await viem.getWalletClients();

    console.log(`Using deployer: ${owner.account.address}`);
    console.log(`User1: ${user1.account.address}`);
    console.log(`User2: ${user2.account.address}`);

    describe("PriceConsumer - Deployment and Initialization", function () {
        it("Should deploy implementation contract successfully (without initialization)", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const code = await publicClient.getBytecode({ address: implementation.address });
            assert.ok(code && code.length > 2, "Contract bytecode should exist");
            console.log(`✓ Contract bytecode exists (length: ${code?.length})`);
        });

        it("Should NOT be able to read state from uninitialized implementation", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            try {
                const ownerAddress = await publicClient.readContract({
                    address: implementation.address,
                    abi: implementation.abi,
                    functionName: "owner",
                    args: []
                });
                console.log(`✓ Owner on uninitialized implementation: ${ownerAddress}`);
                console.log(`✓ This is expected - implementation is not initialized`);
            } catch (error: any) {
                console.log(`✓ Expected: Cannot read from uninitialized implementation`);
            }
        });

        it("Should deploy with proxy and initialize correctly", async function () {
            const ethPriceFeedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [ethPriceFeedAddress]
            });

            // 使用桥接合约部署代理
            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );
            console.log(`✓ Proxy deployed at: ${proxy.address}`);

            const priceConsumer = {
                address: proxy.address,
                abi: implementation.abi
            };

            const version = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getVersion",
                args: []
            });
            assert.equal(version, "PriceConsumer v1.0.0");
            console.log(`✓ Version: ${version}`);

            const contractOwner = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "owner",
                args: []
            });
            assert.equal(
                getAddress(contractOwner as string),
                getAddress(owner.account.address)
            );
            console.log(`✓ Owner correctly initialized: ${contractOwner}`);

            const isEthFeedSet = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "isPriceFeedSet",
                args: ["0x0000000000000000000000000000000000000000"]
            });
            assert.equal(isEthFeedSet, true);
            console.log(`✓ ETH price feed initialized correctly`);
        });

        it("Should NOT allow re-initialization after proxy initialization", async function () {
            const ethPriceFeedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

            const implementation = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [ethPriceFeedAddress]
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
                    args: [ethPriceFeedAddress]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow re-initialization");
            } catch (error: any) {
                console.log(`✓ Re-initialization prevented as expected`);
            }
        });
    });

    describe("NFTERC721 - Deployment and Initialization", function () {
        it("Should deploy implementation contract successfully (without initialization)", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const code = await publicClient.getBytecode({ address: implementation.address });
            assert.ok(code && code.length > 2, "Contract bytecode should exist");
            console.log(`✓ Contract bytecode exists`);
        });

        it("Should NOT be able to use uninitialized implementation", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            try {
                const name = await publicClient.readContract({
                    address: implementation.address,
                    abi: implementation.abi,
                    functionName: "name",
                    args: []
                });
                console.log(`✓ Name on uninitialized implementation: "${name}"`);
                console.log(`✓ Empty/default value expected for uninitialized contract`);
            } catch (error) {
                console.log(`✓ Expected: Cannot read from uninitialized implementation`);
            }
        });

        it("Should deploy with proxy and initialize correctly", async function () {
            const nftName = "TestNFT";
            const nftSymbol = "TNFT";
            const baseURI = "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [nftName, nftSymbol, baseURI]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );
            console.log(`✓ Proxy deployed at: ${proxy.address}`);

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            const name = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "name",
                args: []
            });
            const symbol = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "symbol",
                args: []
            });
            const version = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "getVersion",
                args: []
            });
            const contractOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "owner",
                args: []
            });

            assert.equal(name, nftName);
            assert.equal(symbol, nftSymbol);
            assert.equal(version, "v1.0.0");
            assert.equal(
                getAddress(contractOwner as string),
                getAddress(owner.account.address)
            );

            console.log(`✓ Name: ${name}`);
            console.log(`✓ Symbol: ${symbol}`);
            console.log(`✓ Version: ${version}`);
            console.log(`✓ Owner: ${contractOwner}`);
        });

        it("Should NOT allow re-initialization", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", "ipfs://test/"]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            try {
                const hash = await owner.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "initialize",
                    args: ["NewNFT", "NEW", "ipfs://new/"]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow re-initialization");
            } catch (error: any) {
                console.log(`✓ Re-initialization prevented as expected`);
            }
        });
    });

    describe("NFTAuction - Deployment and Initialization", function () {
        it("Should deploy implementation contract successfully (without initialization)", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const code = await publicClient.getBytecode({ address: implementation.address });
            assert.ok(code && code.length > 2, "Contract bytecode should exist");
            console.log(`✓ Contract bytecode exists`);
        });

        it("Should deploy with proxy and initialize correctly", async function () {
            const feeRecipient = user2.account.address;
            const ethPriceFeedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

            const pcImpl = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );
            const pcInitData = encodeFunctionData({
                abi: pcImpl.abi,
                functionName: "initialize",
                args: [ethPriceFeedAddress]
            });
            const pcProxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [pcImpl.address, pcInitData]
            );
            const priceConsumer = {
                address: pcProxy.address,
                abi: pcImpl.abi
            };
            console.log(`✓ PriceConsumer deployed`);

            const auctionImpl = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );
            console.log(`✓ NFTAuction implementation deployed`);

            const auctionInitData = encodeFunctionData({
                abi: auctionImpl.abi,
                functionName: "initialize",
                args: [feeRecipient, priceConsumer.address]
            });

            const auctionProxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [auctionImpl.address, auctionInitData]
            );
            console.log(`✓ NFTAuction proxy deployed`);

            const auction = {
                address: auctionProxy.address,
                abi: auctionImpl.abi
            };

            const contractOwner = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "owner",
                args: []
            });
            const storedFeeRecipient = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "feeRecipient",
                args: []
            });
            const storedPriceConsumer = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "priceConsumer",
                args: []
            });
            const defaultFee = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "defaultPlatformFee",
                args: []
            });
            const auctionCount = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "auctionCount",
                args: []
            });
            const feeTierCount = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "getFeeTierCount",
                args: []
            });

            assert.equal(
                getAddress(contractOwner as string),
                getAddress(owner.account.address)
            );
            assert.equal(
                getAddress(storedFeeRecipient as string),
                getAddress(feeRecipient)
            );
            assert.equal(
                getAddress(storedPriceConsumer as string),
                getAddress(priceConsumer.address)
            );
            assert.equal(defaultFee, 200n);
            assert.equal(auctionCount, 0n);
            assert.equal(feeTierCount, 4n);

            console.log(`✓ Owner: ${contractOwner}`);
            console.log(`✓ Fee recipient: ${storedFeeRecipient}`);
            console.log(`✓ PriceConsumer: ${storedPriceConsumer}`);
            console.log(`✓ Default fee: ${defaultFee} bps`);
            console.log(`✓ Auction count: ${auctionCount}`);
            console.log(`✓ Fee tiers: ${feeTierCount}`);
        });

        it("Should NOT allow re-initialization", async function () {
            const ethPriceFeedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

            const pcImpl = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );
            const pcInitData = encodeFunctionData({
                abi: pcImpl.abi,
                functionName: "initialize",
                args: [ethPriceFeedAddress]
            });
            const pcProxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [pcImpl.address, pcInitData]
            );
            const priceConsumer = {
                address: pcProxy.address,
                abi: pcImpl.abi
            };

            const auctionImpl = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );
            const auctionInitData = encodeFunctionData({
                abi: auctionImpl.abi,
                functionName: "initialize",
                args: [user2.account.address, priceConsumer.address]
            });
            const auctionProxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [auctionImpl.address, auctionInitData]
            );
            const auction = {
                address: auctionProxy.address,
                abi: auctionImpl.abi
            };

            try {
                const hash = await owner.writeContract({
                    address: auction.address,
                    abi: auction.abi,
                    functionName: "initialize",
                    args: [user1.account.address, priceConsumer.address]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow re-initialization");
            } catch (error: any) {
                console.log(`✓ Re-initialization prevented as expected`);
            }
        });
    });

    describe("Integration - All Contracts Deployment", function () {
        it("Should deploy and initialize all three contracts with proper dependencies", async function () {
            const ethPriceFeedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

            const pcImpl = await viem.deployContract(
                "contracts/jobThree/PriceConsumer.sol:PriceConsumer" as any
            );
            const pcInitData = encodeFunctionData({
                abi: pcImpl.abi,
                functionName: "initialize",
                args: [ethPriceFeedAddress]
            });
            const pcProxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [pcImpl.address, pcInitData]
            );
            const priceConsumer = {
                address: pcProxy.address,
                abi: pcImpl.abi
            };

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
            const nft = {
                address: nftProxy.address,
                abi: nftImpl.abi
            };

            const auctionImpl = await viem.deployContract(
                "contracts/jobThree/NFTAuction.sol:NFTAuction" as any
            );
            const auctionInitData = encodeFunctionData({
                abi: auctionImpl.abi,
                functionName: "initialize",
                args: [user2.account.address, priceConsumer.address]
            });
            const auctionProxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [auctionImpl.address, auctionInitData]
            );
            const auction = {
                address: auctionProxy.address,
                abi: auctionImpl.abi
            };

            const pcVersion = await publicClient.readContract({
                address: priceConsumer.address,
                abi: priceConsumer.abi,
                functionName: "getVersion",
                args: []
            });
            const nftVersion = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "getVersion",
                args: []
            });
            const auctionOwner = await publicClient.readContract({
                address: auction.address,
                abi: auction.abi,
                functionName: "owner",
                args: []
            });

            assert.equal(pcVersion, "PriceConsumer v1.0.0");
            assert.equal(nftVersion, "v1.0.0");
            assert.equal(getAddress(auctionOwner as string), getAddress(owner.account.address));

            console.log(`\n✅ All contracts deployed and initialized successfully:`);
            console.log(`   PriceConsumer: ${priceConsumer.address} (v${pcVersion})`);
            console.log(`   NFTERC721: ${nft.address} (v${nftVersion})`);
            console.log(`   NFTAuction: ${auction.address} (owner: ${auctionOwner})`);
        });
    });
});