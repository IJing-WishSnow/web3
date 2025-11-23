import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AttackModule", (m) => {
    const bankAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    const attack = m.contract("Attack", [bankAddress]);

    return { attack };
});