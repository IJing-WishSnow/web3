// scripts/IWSTokenGetInitData.ts
import { encodeFunctionData, parseEther } from "viem";
import { hardhat } from "viem/chains";
import { createPublicClient, http } from "viem";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 使用绝对路径读取 ABI
const artifactPath = resolve(__dirname, "../artifacts/contracts/study/IWSToken.sol/IWSToken.json");
const IWSTokenArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));

async function main() {
    const initData = encodeFunctionData({
        abi: IWSTokenArtifact.abi,
        functionName: "initialize",
        args: [
            "IWS Token",           // name
            "IWS",                 // symbol  
            18,                    // decimals
            parseEther("1000000"), // initialSupply
            "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" // initialHolder
        ]
    });

    console.log("Logic Address:", "0xcb4F9D56F45aD4e89bcE0Ba7b781095DD6138e55");
    console.log("Init Data:", initData);
    console.log("\n完整的验证命令:");
    console.log(`npx hardhat verify --network sepolia 0xE5aFC41736bBE96cCB912Cb2d2e6BB503979b657 0xcb4F9D56F45aD4e89bcE0Ba7b781095DD6138e55 "${initData}" --contract contracts/study/ERC1967Proxy.sol:ERC1967Proxy`);
}

main().catch(console.error);