import assert from "node:assert/strict"; // 导入严格断言库
import { describe, it } from "node:test"; // 导入测试框架

import { network } from "hardhat"; // 导入Hardhat网络模块

describe("Counter", async function () { // 描述Counter合约测试套件
  const { viem } = await network.connect(); // 连接网络获取viem实例
  const publicClient = await viem.getPublicClient(); // 获取公共客户端用于读取链上数据

  it("调用inc()函数时应发出Increment事件", async function () { // 测试用例：检查事件发射
    const counter = await viem.deployContract("Counter"); // 部署Counter合约

    await viem.assertions.emitWithArgs( // 断言函数调用会发出特定事件
      counter.write.inc(), // 调用inc函数
      counter, // 目标合约
      "Increment", // 期望的事件名
      [1n], // 期望的事件参数
    );
  });

  it("Increment事件总和应匹配当前值", async function () { // 测试用例：检查事件聚合
    const counter = await viem.deployContract("Counter"); // 部署Counter合约
    const deploymentBlockNumber = await publicClient.getBlockNumber(); // 获取部署时的区块号

    // 执行一系列增量操作
    for (let i = 1n; i <= 10n; i++) { // 循环1到10
      await counter.write.incBy([i]); // 调用incBy函数并传入当前值
    }

    const events = await publicClient.getContractEvents({ // 获取合约事件
      address: counter.address, // 合约地址
      abi: counter.abi, // 合约ABI
      eventName: "Increment", // 事件名称
      fromBlock: deploymentBlockNumber, // 从部署区块开始
      strict: true, // 严格模式
    });

    // 检查聚合事件是否匹配当前值
    let total = 0n; // 初始化总和
    for (const event of events) { // 遍历所有事件
      total += event.args.by; // 累加事件参数值
    }

    assert.equal(total, await counter.read.x()); // 断言总和等于合约当前值
  });
});