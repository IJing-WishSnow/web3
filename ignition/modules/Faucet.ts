import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FaucetModule", (m) => {
    const faucet = m.contract("Faucet");

    return { faucet };
});
