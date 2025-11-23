import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress } from "viem";

describe("VividNFT", async function () {
    // const { viem } = await network.connect();
    const { viem } = await network.connect("sepolia");
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();
    // 打印部署者钱包地址
    console.log(`Using deployer: ${owner.account.address}`);

    it("Should successfully mint an NFT", async function () {
        const contractAddress = "0x680C94e8620731941dF7dE78507c1d9B93618917";
        const vividNFT = await viem.getContractAt("VividNFT", contractAddress);

        // 使用动态URI避免重复
        const testURI = `https://copper-central-kangaroo-407.mypinata.cloud/ipfs/bafkreidhdfbprv2bqs24qkloa3malixqayn6uq56raisgod3uh6vtc37rq?timestamp=${Date.now()}`;
        const to = owner.account.address;

        const hash = await vividNFT.write.safeMint([to, testURI]);
        console.log(`Transaction hash: ${hash}`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        assert.equal(receipt.status, "success");

        // 从事件中获取tokenId
        const events = await vividNFT.getEvents.TokenMinted();
        const mintEvents = events.filter(event => event.transactionHash === hash);
        assert.ok(mintEvents.length > 0, "TokenMinted event should be emitted");

        const mintEvent = mintEvents[0];
        if (mintEvent && mintEvent.args) {
            const tokenId = mintEvent.args.tokenId!; // 从这里获取tokenId

            // 使用获取到的tokenId进行验证
            const ownerOfToken = await vividNFT.read.ownerOf([tokenId]);
            assert.equal(ownerOfToken, getAddress(to));

            const tokenURI = await vividNFT.read.tokenURI([tokenId]);
            assert.equal(tokenURI, testURI);

            assert.equal(mintEvent.args.to!.toLowerCase(), to.toLowerCase());
            assert.equal(mintEvent.args.tokenURI!, testURI);
        } else {
            assert.fail("Event args should not be undefined");
        }

        console.log("✅ NFT minted successfully!");
    });
});


// npx hardhat keystore set SEPOLIA_RPC_URL --dev
// npx hardhat keystore set SEPOLIA_PRIVATE_KEY --dev

// npx hardhat keystore set SEPOLIA_RPC_URL
// npx hardhat keystore set SEPOLIA_PRIVATE_KEY