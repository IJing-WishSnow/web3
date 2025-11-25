// ignition/modules/study/IWSToken.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const IWSTokenModule = buildModule("IWSTokenModule", (m) => {
    const initialSupply = m.getParameter("initialSupply", "1000000000000000000000000");
    const tokenName = m.getParameter("tokenName", "IWS Token");
    const tokenSymbol = m.getParameter("tokenSymbol", "IWS");
    const decimals = m.getParameter("decimals", 18);

    // 部署逻辑合约
    const logic = m.contract("IWSToken", [], {
        id: "IWSTokenLogic"
    });

    // 编码初始化数据
    const initData = m.encodeFunctionCall(logic, "initialize", [
        tokenName,
        tokenSymbol,
        decimals,
        initialSupply,
        m.getAccount(0)
    ]);

    // 部署代理合约 - 使用完全限定名
    const proxy = m.contract("contracts/study/ERC1967Proxy.sol:ERC1967Proxy", [
        logic,
        initData
    ], {
        id: "IWSTokenProxy"
    });

    // 通过代理地址创建交互实例
    const iwsToken = m.contractAt("IWSToken", proxy);

    return { iwsToken, proxy, logic };
});

export default IWSTokenModule;