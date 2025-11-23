import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BankModule", (m) => {
    const bank = m.contract("Bank");
    const deployer = m.getAccount(0);
    // 部署后存入 20 ETH
    // 向 Bank 合约存入 20 ETH
    m.call(bank, "deposit", [], {
        value: 20000000000000000000n
    });

    return { bank };
});
