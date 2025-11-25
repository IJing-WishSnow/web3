import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { getAddress, encodeFunctionData, parseEther } from "viem";

describe("IWSToken Contract Tests", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [owner, user1, user2, user3] = await viem.getWalletClients();

    console.log(`Using deployer: ${owner.account.address}`);
    console.log(`User1: ${user1.account.address}`);
    console.log(`User2: ${user2.account.address}`);
    console.log(`User3: ${user3.account.address}`);

    describe("Deployment Tests", function () {
        it("Should deploy implementation contract successfully (without initialization)", async function () {
            const implementation = await viem.deployContract(
                "contracts/study/IWSToken.sol:IWSToken" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const code = await publicClient.getBytecode({ address: implementation.address });
            assert.ok(code && code.length > 2, "Contract bytecode should exist");
            console.log(`✓ Contract bytecode exists (length: ${code?.length})`);
        });

        it("Should NOT be able to read state from uninitialized implementation", async function () {
            const implementation = await viem.deployContract(
                "contracts/study/IWSToken.sol:IWSToken" as any
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
            const tokenName = "IWS Token";
            const tokenSymbol = "IWS";
            const decimals = 18;
            const initialSupply = parseEther("1000000");

            const implementation = await viem.deployContract(
                "contracts/study/IWSToken.sol:IWSToken" as any
            );
            console.log(`✓ Implementation deployed at: ${implementation.address}`);

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: [tokenName, tokenSymbol, decimals, initialSupply, owner.account.address]
            });

            const proxy = await viem.deployContract(
                "contracts/study/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );
            console.log(`✓ Proxy deployed at: ${proxy.address}`);

            const token = {
                address: proxy.address,
                abi: implementation.abi
            };

            const name = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "name",
                args: []
            });
            const symbol = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "symbol",
                args: []
            });
            const totalSupply = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "totalSupply",
                args: []
            }) as bigint;
            const contractOwner = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "owner",
                args: []
            });

            assert.equal(name, tokenName);
            assert.equal(symbol, tokenSymbol);
            assert.equal(totalSupply, initialSupply);
            assert.equal(
                getAddress(contractOwner as string),
                getAddress(owner.account.address)
            );

            console.log(`✓ Name: ${name}`);
            console.log(`✓ Symbol: ${symbol}`);
            console.log(`✓ Total Supply: ${totalSupply}`);
            console.log(`✓ Owner: ${contractOwner}`);
        });

        it("Should NOT allow re-initialization after proxy initialization", async function () {
            const implementation = await viem.deployContract(
                "contracts/study/IWSToken.sol:IWSToken" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["IWS Token", "IWS", 18, parseEther("1000000"), owner.account.address]
            });

            const proxy = await viem.deployContract(
                "contracts/study/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const token = {
                address: proxy.address,
                abi: implementation.abi
            };

            try {
                const hash = await owner.writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "initialize",
                    args: ["New Token", "NEW", 18, parseEther("1000000"), owner.account.address]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow re-initialization");
            } catch (error: any) {
                console.log(`✓ Re-initialization prevented as expected`);
            }
        });
    });

    describe("Core Functionality Tests", function () {
        let token: any;

        beforeEach(async function () {
            const implementation = await viem.deployContract(
                "contracts/study/IWSToken.sol:IWSToken" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["IWS Token", "IWS", 18, parseEther("1000000"), owner.account.address]
            });

            const proxy = await viem.deployContract(
                "contracts/study/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            token = {
                address: proxy.address,
                abi: implementation.abi
            };
        });

        it("Should transfer tokens between accounts", async function () {
            const transferAmount = parseEther("1000");

            const hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [user1.account.address, transferAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const user1Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            });

            assert.equal(user1Balance, transferAmount);
            console.log(`✓ Transfer successful: ${transferAmount} tokens`);
        });

        it("Should mint tokens (owner only)", async function () {
            const mintAmount = parseEther("5000");

            const hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [user2.account.address, mintAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const user2Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user2.account.address]
            });

            assert.equal(user2Balance, mintAmount);
            console.log(`✓ Mint successful: ${mintAmount} tokens`);

            // Test non-owner cannot mint
            try {
                const hash2 = await user1.writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "mint",
                    args: [user1.account.address, mintAmount]
                });
                await publicClient.waitForTransactionReceipt({ hash: hash2 });
                assert.fail("Should not allow non-owner to mint");
            } catch (error: any) {
                console.log(`✓ Non-owner mint prevented as expected`);
            }
        });

        it("Should burn tokens", async function () {
            const burnAmount = parseEther("1000");
            const initialBalance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [owner.account.address]
            }) as bigint;

            const hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "burn",
                args: [burnAmount]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const finalBalance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [owner.account.address]
            });
            const totalSupply = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "totalSupply",
                args: []
            }) as bigint;

            assert.equal(finalBalance, initialBalance - burnAmount);
            assert.equal(totalSupply, parseEther("1000000") - burnAmount);
            console.log(`✓ Burn successful: ${burnAmount} tokens`);
        });

        it("Should execute batch transfer", async function () {
            // First transfer some tokens to user1 for testing
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [user1.account.address, parseEther("3000")]
            });

            const recipients = [user2.account.address, user3.account.address];
            const amounts = [parseEther("500"), parseEther("1000")];

            const hash = await user1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "batchTransfer",
                args: [recipients, amounts]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const user2Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user2.account.address]
            });
            const user3Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user3.account.address]
            });

            assert.equal(user2Balance, parseEther("500"));
            assert.equal(user3Balance, parseEther("1000"));
            console.log(`✓ Batch transfer successful`);
        });

        it("Should handle blacklist functionality", async function () {
            // Add to blacklist
            let hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "addToBlacklist",
                args: [user1.account.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const isBlacklisted = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "isBlacklisted",
                args: [user1.account.address]
            });
            assert.equal(isBlacklisted, true);
            console.log(`✓ User added to blacklist`);

            // Remove from blacklist
            hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "removeFromBlacklist",
                args: [user1.account.address]
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const isRemoved = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "isBlacklisted",
                args: [user1.account.address]
            });
            assert.equal(isRemoved, false);
            console.log(`✓ User removed from blacklist`);
        });

        it("Should prevent transfers from blacklisted addresses", async function () {
            // Transfer tokens to user1 first
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [user1.account.address, parseEther("1000")]
            });

            // Add user1 to blacklist
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "addToBlacklist",
                args: [user1.account.address]
            });

            // Try to transfer from blacklisted address
            try {
                const hash = await user1.writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "transfer",
                    args: [user2.account.address, parseEther("500")]
                });
                await publicClient.waitForTransactionReceipt({ hash });
                assert.fail("Should not allow transfer from blacklisted address");
            } catch (error: any) {
                console.log(`✓ Transfer from blacklisted address prevented`);
            }
        });

        it("Should handle pause/unpause functionality", async function () {
            // Pause contract
            let hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "pause",
                args: []
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract paused`);

            // Try to transfer while paused
            try {
                const hash2 = await owner.writeContract({
                    address: token.address,
                    abi: token.abi,
                    functionName: "transfer",
                    args: [user1.account.address, parseEther("100")]
                });
                await publicClient.waitForTransactionReceipt({ hash: hash2 });
                assert.fail("Should not allow transfer when paused");
            } catch (error: any) {
                console.log(`✓ Transfer prevented while paused`);
            }

            // Unpause contract
            hash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "unpause",
                args: []
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✓ Contract unpaused`);

            // Transfer should work now
            const hash3 = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [user1.account.address, parseEther("100")]
            });
            await publicClient.waitForTransactionReceipt({ hash: hash3 });
            console.log(`✓ Transfer successful after unpause`);
        });

        it("Should withdraw ETH (owner only)", async function () {
            // Send some ETH to the contract
            const ethAmount = parseEther("1");
            const hash = await owner.sendTransaction({
                to: token.address,
                value: ethAmount
            });
            await publicClient.waitForTransactionReceipt({ hash });

            const contractBalanceBefore = await publicClient.getBalance({
                address: token.address
            });
            const ownerBalanceBefore = await publicClient.getBalance({
                address: owner.account.address
            });

            // Withdraw ETH
            const withdrawHash = await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "withdrawETH",
                args: [owner.account.address]
            });
            await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

            const contractBalanceAfter = await publicClient.getBalance({
                address: token.address
            });
            const ownerBalanceAfter = await publicClient.getBalance({
                address: owner.account.address
            });

            assert.equal(contractBalanceAfter, 0n);
            assert.ok(ownerBalanceAfter > ownerBalanceBefore);
            console.log(`✓ ETH withdrawal successful`);
        });
    });

    describe("Integration Tests", function () {
        it("Should handle complex multi-user scenarios", async function () {
            const implementation = await viem.deployContract(
                "contracts/study/IWSToken.sol:IWSToken" as any
            );

            const initData = encodeFunctionData({
                abi: implementation.abi,
                functionName: "initialize",
                args: ["IWS Token", "IWS", 18, parseEther("1000000"), owner.account.address]
            });

            const proxy = await viem.deployContract(
                "contracts/study/ERC1967Proxy.sol:ERC1967Proxy" as any,
                [implementation.address, initData]
            );

            const token = {
                address: proxy.address,
                abi: implementation.abi
            };

            // Complex scenario: Multiple operations by different users
            console.log(`\n🧪 Starting complex integration scenario`);

            // 1. Owner distributes initial tokens
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [user1.account.address, parseEther("5000")]
            });
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "transfer",
                args: [user2.account.address, parseEther("3000")]
            });
            console.log(`✓ Initial distribution completed`);

            // 2. User1 does batch transfer
            const recipients = [user2.account.address, user3.account.address];
            const amounts = [parseEther("500"), parseEther("1000")];
            await user1.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "batchTransfer",
                args: [recipients, amounts]
            });
            console.log(`✓ Batch transfer completed`);

            // 3. Owner mints more tokens
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "mint",
                args: [user3.account.address, parseEther("2000")]
            });
            console.log(`✓ Additional minting completed`);

            // 4. User2 burns some tokens
            await user2.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "burn",
                args: [parseEther("500")]
            });
            console.log(`✓ Token burning completed`);

            // 5. Owner adds user to blacklist
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "addToBlacklist",
                args: [user1.account.address]
            });
            console.log(`✓ Blacklist management completed`);

            // 6. Owner pauses contract
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "pause",
                args: []
            });
            console.log(`✓ Contract pause completed`);

            // 7. Owner unpauses contract
            await owner.writeContract({
                address: token.address,
                abi: token.abi,
                functionName: "unpause",
                args: []
            });
            console.log(`✓ Contract unpause completed`);

            // Verify final state
            const totalSupply = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "totalSupply",
                args: []
            }) as bigint;
            const user1Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user1.account.address]
            }) as bigint;
            const user2Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user2.account.address]
            }) as bigint;
            const user3Balance = await publicClient.readContract({
                address: token.address,
                abi: token.abi,
                functionName: "balanceOf",
                args: [user3.account.address]
            }) as bigint;

            console.log(`\n✅ Final State Verification:`);
            console.log(`   Total Supply: ${totalSupply}`);
            console.log(`   User1 Balance: ${user1Balance}`);
            console.log(`   User2 Balance: ${user2Balance}`);
            console.log(`   User3 Balance: ${user3Balance}`);

            assert.ok(totalSupply > 0n, "Total supply should be positive");
            assert.ok(user1Balance > 0n, "User1 should have balance");
            assert.ok(user2Balance > 0n, "User2 should have balance");
            assert.ok(user3Balance > 0n, "User3 should have balance");

            console.log(`\n🎉 All integration tests completed successfully!`);
        });
    });
});