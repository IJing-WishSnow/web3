import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("ReentrancyAttack", async function () {
    const { viem } = await network.connect();

    it("should perform reentrancy attack successfully", async function () {
        // 获取测试账户
        const [deployer, attacker] = await viem.getWalletClients();

        // 部署 Bank 合约
        const bank = await viem.deployContract("Bank", []);
        console.log("Bank合约部署地址:", bank.address);

        // 通过 deposit() 函数向 Bank 合约存入 20 ETH
        const depositAmount = 20n * 10n ** 18n; // 20 ETH
        await bank.write.deposit({
            value: depositAmount,
        });


        // 验证 Bank 合约初始余额
        const initialBankBalance = await bank.read.getBalance();
        console.log("Bank合约初始余额:", initialBankBalance.toString(), "wei");
        assert.equal(initialBankBalance, depositAmount, "Bank合约初始余额应为20 ETH");

        // 部署 Attack 合约，传入 Bank 合约地址
        const attack = await viem.deployContract("Attack", [bank.address]);
        console.log("Attack合约部署地址:", attack.address);

        // 验证 Attack 合约初始余额
        const initialAttackBalance = await attack.read.getBalance();
        console.log("Attack合约初始余额:", initialAttackBalance.toString(), "wei");
        assert.equal(initialAttackBalance, 0n, "Attack合约初始余额应为0");

        // 执行攻击，转账 1 ETH
        const attackAmount = 1n * 10n ** 18n; // 1 ETH
        await attack.write.attack({
            value: attackAmount,
        });
        console.log("攻击完成，转账1 ETH调用attack()函数");

        // 验证 Bank 合约余额已被提空
        const finalBankBalance = await bank.read.getBalance();
        console.log("攻击后Bank合约余额:", finalBankBalance.toString(), "wei");
        assert.equal(finalBankBalance, 0n, "Bank合约余额应为0，已被提空");

        // 验证 Attack 合约余额变为 21 ETH
        const finalAttackBalance = await attack.read.getBalance();
        console.log("攻击后Attack合约余额:", finalAttackBalance.toString(), "wei");
        const expectedBalance = 21n * 10n ** 18n; // 21 ETH
        assert.equal(finalAttackBalance, expectedBalance, "Attack合约余额应为21 ETH");

        console.log("重入攻击成功完成!");
    });
});