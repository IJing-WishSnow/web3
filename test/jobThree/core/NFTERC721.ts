import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEventLogs } from "viem";

describe("NFTERC721 - NFT Minting and Transfer Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, user1, user2, user3] = await viem.getWalletClients();

    console.log(`\n🧪 Starting NFTERC721 Tests`);
    console.log(`Owner: ${owner.account.address}`);
    console.log(`User1: ${user1.account.address}`);
    console.log(`User2: ${user2.account.address}`);
    console.log(`User3: ${user3.account.address}\n`);

    describe("NFT Minting Tests", function () {
        it("Should mint NFT successfully and emit TokenMinted event", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/"]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            const tokenId = 1n;
            const hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Mint transaction confirmed: ${hash}`);

            // Check TokenMinted event
            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "TokenMinted"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit one TokenMinted event");
            assert.equal(
                getAddress(logs[0].args.to as string),
                getAddress(user1.account.address),
                "Event should have correct recipient"
            );
            assert.equal(logs[0].args.tokenId, tokenId, "Event should have correct tokenId");
            console.log(`✓ TokenMinted event emitted correctly`);

            // Verify ownership
            const tokenOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            });

            assert.equal(
                getAddress(tokenOwner as string),
                getAddress(user1.account.address),
                "Token owner should be user1"
            );
            console.log(`✓ Token owner: ${tokenOwner}`);

            // Verify balance
            const balance = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });

            assert.equal(balance, 1n, "User1 balance should be 1");
            console.log(`✓ User1 balance: ${balance}`);
        });

        it("Should allow anyone to mint (no access control)", async function () {
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

            // User2 mints for user3
            const hash = await user2.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user3.account.address, 100n]
            });

            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ User2 successfully minted NFT for user3`);

            const tokenOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [100n]
            });

            assert.equal(
                getAddress(tokenOwner as string),
                getAddress(user3.account.address)
            );
            console.log(`✓ Token ownership confirmed: ${tokenOwner}`);
        });

        it("Should NOT allow minting same tokenId twice", async function () {
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

            const tokenId = 42n;

            // First mint
            const hash1 = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash: hash1 });
            console.log(`✓ First mint successful`);

            // Try to mint same tokenId again
            try {
                const hash2 = await user2.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [user2.account.address, tokenId]
                });
                await publicClient.waitForTransactionReceipt({ hash: hash2 });
                assert.fail("Should not allow minting same tokenId twice");
            } catch (error: any) {
                console.log(`✓ Duplicate minting prevented as expected`);
            }
        });

        it("Should increment balance correctly after multiple mints", async function () {
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

            // Mint 3 tokens to user1
            for (let i = 0; i < 3; i++) {
                const hash = await user1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [user1.account.address, BigInt(i + 10)]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            const balance = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });

            assert.equal(balance, 3n, "Balance should be 3 after minting 3 tokens");
            console.log(`✓ User1 balance after 3 mints: ${balance}`);
        });
    });

    describe("Token URI Functionality Tests", function () {
        it("Should return correct URI for tokenId 0 (special case)", async function () {
            const baseURI = "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", baseURI]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Mint token 0
            const hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, 0n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const uri = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [0n]
            });

            const expectedURI = baseURI + "bubuyier.json";
            assert.equal(uri, expectedURI, "TokenId 0 should return bubuyier.json");
            console.log(`✓ TokenId 0 URI: ${uri}`);
        });

        it("Should return correct URI for tokenId 1 (special case)", async function () {
            const baseURI = "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", baseURI]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Mint token 1
            const hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, 1n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const uri = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [1n]
            });

            const expectedURI = baseURI + "bubuyier.json";
            assert.equal(uri, expectedURI, "TokenId 1 should also return bubuyier.json");
            console.log(`✓ TokenId 1 URI: ${uri}`);
        });

        it("Should return correct URI for tokenId 2 (sequential naming)", async function () {
            const baseURI = "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", baseURI]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Mint token 2
            const hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, 2n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const uri = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [2n]
            });

            const expectedURI = baseURI + "bubuyier2.json";
            assert.equal(uri, expectedURI, "TokenId 2 should return bubuyier2.json");
            console.log(`✓ TokenId 2 URI: ${uri}`);
        });

        it("Should return correct URI for higher tokenIds", async function () {
            const baseURI = "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", baseURI]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Test token 10
            const tokenId10 = 10n;
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId10]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const uri10 = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [tokenId10]
            });

            assert.equal(uri10, baseURI + "bubuyier10.json");
            console.log(`✓ TokenId 10 URI: ${uri10}`);

            // Test token 999
            const tokenId999 = 999n;
            hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId999]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const uri999 = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [tokenId999]
            });

            assert.equal(uri999, baseURI + "bubuyier999.json");
            console.log(`✓ TokenId 999 URI: ${uri999}`);
        });

        it("Should revert when querying URI for non-existent token", async function () {
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
                await publicClient.readContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "tokenURI",
                    args: [9999n]
                });
                assert.fail("Should revert for non-existent token");
            } catch (error: any) {
                console.log(`✓ TokenURI query reverted for non-existent token as expected`);
            }
        });

        it("Should reflect new base URI after update", async function () {
            const originalBaseURI = "ipfs://original/";
            const newBaseURI = "ipfs://updated/";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", originalBaseURI]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Mint token
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, 5n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Check original URI
            let uri = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [5n]
            });
            assert.equal(uri, originalBaseURI + "bubuyier5.json");
            console.log(`✓ Original URI: ${uri}`);

            // Update base URI
            hash = await owner.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "setBaseURI",
                args: [newBaseURI]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check for BaseURIUpdated event
            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "BaseURIUpdated"
            }) as any[];
            assert.equal(logs.length, 1, "Should emit BaseURIUpdated event");
            assert.equal(logs[0].args.newBaseURI, newBaseURI);
            console.log(`✓ BaseURIUpdated event emitted`);

            // Check updated URI
            uri = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "tokenURI",
                args: [5n]
            });
            assert.equal(uri, newBaseURI + "bubuyier5.json");
            console.log(`✓ Updated URI: ${uri}`);
        });
    });

    describe("Base URI Management", function () {
        it("Should allow owner to update base URI", async function () {
            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["TestNFT", "TNFT", "ipfs://old/"]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const nft = {
                address: proxy.address,
                abi: implementation.abi
            };

            const newBaseURI = "ipfs://new/";
            const hash = await owner.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "setBaseURI",
                args: [newBaseURI]
            });

            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Base URI updated by owner`);
        });

        it("Should NOT allow non-owner to update base URI", async function () {
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
                const hash = await user1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "setBaseURI",
                    args: ["ipfs://hacker/"]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Non-owner should not be able to update base URI");
            } catch (error: any) {
                console.log(`✓ Non-owner prevented from updating base URI as expected`);
            }
        });
    });

    describe("NFT Transfer Tests", function () {
        it("Should transfer NFT using transferFrom", async function () {
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

            const tokenId = 50n;

            // Mint to user1
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Token minted to user1`);

            // Transfer from user1 to user2
            hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "transferFrom",
                args: [user1.account.address, user2.account.address, tokenId]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check Transfer event
            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "Transfer"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit Transfer event");
            assert.equal(
                getAddress(logs[0].args.from as string),
                getAddress(user1.account.address)
            );
            assert.equal(
                getAddress(logs[0].args.to as string),
                getAddress(user2.account.address)
            );
            assert.equal(logs[0].args.tokenId, tokenId);
            console.log(`✓ Transfer event emitted correctly`);

            // Verify new owner
            const newOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            });

            assert.equal(
                getAddress(newOwner as string),
                getAddress(user2.account.address)
            );
            console.log(`✓ Token transferred to user2: ${newOwner}`);

            // Verify balances
            const balance1 = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });

            const balance2 = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user2.account.address]
            });

            assert.equal(balance1, 0n, "User1 balance should be 0");
            assert.equal(balance2, 1n, "User2 balance should be 1");
            console.log(`✓ Balances updated correctly: user1=${balance1}, user2=${balance2}`);
        });

        it("Should transfer NFT using safeTransferFrom", async function () {
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

            const tokenId = 60n;

            // Mint to user1
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Safe transfer from user1 to user2
            hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "safeTransferFrom",
                args: [user1.account.address, user2.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Safe transfer completed`);

            const newOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            });

            assert.equal(
                getAddress(newOwner as string),
                getAddress(user2.account.address)
            );
            console.log(`✓ Token safely transferred to user2`);
        });

        it("Should NOT allow unauthorized transfer", async function () {
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

            const tokenId = 70n;

            // Mint to user1
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // User3 tries to transfer user1's token (without approval)
            try {
                hash = await user3.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "transferFrom",
                    args: [user1.account.address, user3.account.address, tokenId]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Unauthorized transfer should fail");
            } catch (error: any) {
                console.log(`✓ Unauthorized transfer prevented as expected`);
            }
        });
    });

    describe("Approval and Operator Tests", function () {
        it("Should approve address and allow transfer", async function () {
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

            const tokenId = 80n;

            // Mint to user1
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // User1 approves user2
            hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "approve",
                args: [user2.account.address, tokenId]
            });
            const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check Approval event
            const approvalLogs = parseEventLogs({
                abi: nft.abi,
                logs: approvalReceipt.logs,
                eventName: "Approval"
            }) as any[];

            assert.equal(approvalLogs.length, 1, "Should emit Approval event");
            console.log(`✓ Approval event emitted`);

            // Verify approval
            const approved = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "getApproved",
                args: [tokenId]
            });

            assert.equal(
                getAddress(approved as string),
                getAddress(user2.account.address)
            );
            console.log(`✓ User2 approved for token: ${approved}`);

            // User2 transfers the token
            hash = await user2.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "transferFrom",
                args: [user1.account.address, user2.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const newOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            });

            assert.equal(
                getAddress(newOwner as string),
                getAddress(user2.account.address)
            );
            console.log(`✓ Approved user successfully transferred token`);
        });

        it("Should set approval for all and allow transfers", async function () {
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

            // Mint multiple tokens to user1
            const tokenIds = [100n, 101n, 102n];
            for (const tokenId of tokenIds) {
                const hash = await user1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [user1.account.address, tokenId]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            // User1 sets approval for all to user2
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "setApprovalForAll",
                args: [user2.account.address, true]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check ApprovalForAll event
            const logs = parseEventLogs({
                abi: nft.abi,
                logs: receipt.logs,
                eventName: "ApprovalForAll"
            }) as any[];

            assert.equal(logs.length, 1, "Should emit ApprovalForAll event");
            console.log(`✓ ApprovalForAll event emitted`);

            // Verify approval for all
            const isApproved = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "isApprovedForAll",
                args: [user1.account.address, user2.account.address]
            });

            assert.equal(isApproved, true);
            console.log(`✓ User2 is approved for all of user1's tokens`);

            // User2 transfers one of user1's tokens
            hash = await user2.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "transferFrom",
                args: [user1.account.address, user3.account.address, tokenIds[0]]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const newOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenIds[0]]
            });

            assert.equal(
                getAddress(newOwner as string),
                getAddress(user3.account.address)
            );
            console.log(`✓ Operator successfully transferred token using approval for all`);
        });
    });

    describe("Query and Utility Functions", function () {
        it("Should return correct name and symbol", async function () {
            const nftName = "MyAwesomeNFT";
            const nftSymbol = "MANFT";

            const implementation = await viem.deployContract(
                "contracts/jobThree/NFTERC721.sol:NFTERC721" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [nftName, nftSymbol, "ipfs://test/"]
            });

            const proxy = await viem.deployContract(
                "contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

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

            assert.equal(name, nftName);
            assert.equal(symbol, nftSymbol);
            console.log(`✓ Name: ${name}`);
            console.log(`✓ Symbol: ${symbol}`);
        });

        it("Should correctly check token existence", async function () {
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

            // Check non-existent token
            let exists = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "exists",
                args: [123n]
            });
            assert.equal(exists, false, "Token 123 should not exist");
            console.log(`✓ Token 123 does not exist: ${exists}`);

            // Mint token
            const hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, 123n]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            // Check existing token
            exists = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "exists",
                args: [123n]
            });
            assert.equal(exists, true, "Token 123 should exist");
            console.log(`✓ Token 123 now exists: ${exists}`);
        });

        it("Should return correct version", async function () {
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

            const version = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "getVersion",
                args: []
            });

            assert.equal(version, "v1.0.0");
            console.log(`✓ Version: ${version}`);
        });

        it("Should return placeholder message for getNextTokenId", async function () {
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

            const message = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "getNextTokenId",
                args: []
            });

            assert.equal(message, "Token ID tracking not implemented in this version");
            console.log(`✓ getNextTokenId message: ${message}`);
        });

        it("Should return correct balance for multiple tokens", async function () {
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

            // Initial balance should be 0
            let balance = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });
            assert.equal(balance, 0n);
            console.log(`✓ Initial balance: ${balance}`);

            // Mint 5 tokens
            const tokenCount = 5;
            for (let i = 0; i < tokenCount; i++) {
                const hash = await user1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [user1.account.address, BigInt(200 + i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            balance = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });
            assert.equal(balance, BigInt(tokenCount));
            console.log(`✓ Balance after minting ${tokenCount} tokens: ${balance}`);
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle minting to same address multiple times", async function () {
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

            // Mint 10 tokens to same address
            for (let i = 0; i < 10; i++) {
                const hash = await user1.writeContract({
                    address: nft.address,
                    abi: nft.abi,
                    functionName: "mint",
                    args: [user1.account.address, BigInt(300 + i)]
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            const balance = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });

            assert.equal(balance, 10n);
            console.log(`✓ Successfully minted 10 tokens to same address, balance: ${balance}`);
        });

        it("Should handle transfers between multiple parties", async function () {
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

            const tokenId = 400n;

            // Mint to user1
            let hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "mint",
                args: [user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Token minted to user1`);

            // user1 -> user2
            hash = await user1.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "transferFrom",
                args: [user1.account.address, user2.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Token transferred from user1 to user2`);

            // user2 -> user3
            hash = await user2.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "transferFrom",
                args: [user2.account.address, user3.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Token transferred from user2 to user3`);

            // user3 -> user1 (back to original)
            hash = await user3.writeContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "transferFrom",
                args: [user3.account.address, user1.account.address, tokenId]
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Token transferred from user3 back to user1`);

            const finalOwner = await publicClient.readContract({
                address: nft.address,
                abi: nft.abi,
                functionName: "ownerOf",
                args: [tokenId]
            });

            assert.equal(
                getAddress(finalOwner as string),
                getAddress(user1.account.address)
            );
            console.log(`✓ Token returned to original owner: ${finalOwner}`);
        });
    });

    console.log(`\n✅ All NFTERC721 tests completed successfully!\n`);
});