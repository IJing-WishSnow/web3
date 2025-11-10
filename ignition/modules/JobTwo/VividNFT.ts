// ignition/modules/jobTwo/VividNFT.ts

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VividNFTModule", (m) => {
    // 定义构造参数
    const tokenName = m.getParameter("name", "VividNFT");
    const tokenSymbol = m.getParameter("symbol", "VNFT");

    // 部署 VividNFT 合约，并传入参数
    const vividNFT = m.contract("VividNFT", [tokenName, tokenSymbol]);

    // 返回部署的合约，以便在其他模块中使用或脚本中获取
    return { vividNFT };
});