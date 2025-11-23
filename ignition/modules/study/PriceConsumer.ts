import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PriceConsumerModule", (m) => {
    // 提供 Chainlink 数据喂价合约地址
    // 例如 Sepolia 测试网的 ETH/USD 价格喂价地址
    const aggregatorAddress = m.getParameter(
        "aggregatorAddress",
        "0x694AA1769357215DE4FAC081bf1f309aDC325306" // Sepolia ETH/USD
    );

    const priceConsumer = m.contract("PriceConsumer", [aggregatorAddress]);

    return { priceConsumer };
});