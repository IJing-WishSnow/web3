// ignition/modules/jobTwo/SimpleERC20.ts

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SimpleERC20Module", (m) => {
    // 定义构造参数
    const tokenName = m.getParameter("name", "SimpleERC20");
    const tokenSymbol = m.getParameter("symbol", "SERC20");
    const tokenDecimals = m.getParameter("decimals", 18);
    const initialSupply = m.getParameter("initialSupply", 1000000);

    // 部署 SimpleERC20 合约，并传入所有必要参数
    const simpleERC20 = m.contract("SimpleERC20", [
        tokenName,
        tokenSymbol,
        tokenDecimals,
        initialSupply
    ]);

    // 返回部署的合约
    return { simpleERC20 };
});
