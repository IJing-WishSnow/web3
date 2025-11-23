// ignition/modules/jobThree/NFTAuctionMarket.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// 测试网价格喂价地址
const PRICE_FEEDS = {
    sepolia: {
        ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    },
    goerli: {
        ETH_USD: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    },
    mumbai: {
        ETH_USD: "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
    }
} as const;

// 网络类型定义
type NetworkName = keyof typeof PRICE_FEEDS;

const NFTAuctionMarketModule = buildModule("NFTAuctionMarketModule", (m) => {
    // 配置参数 - 使用具体的网络名称而不是动态参数
    const networkName = "sepolia" as NetworkName; // 硬编码或根据环境变量设置
    const priceFeeds = PRICE_FEEDS[networkName];

    const feeRecipient = m.getParameter("feeRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    const nftName = m.getParameter("nftName", "AuctionNFT");
    const nftSymbol = m.getParameter("nftSymbol", "ANFT");
    const nftBaseURI = m.getParameter("nftBaseURI", "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/");
    const ethPriceFeed = m.getParameter("ethPriceFeed", priceFeeds.ETH_USD);

    // ========== 1. 部署 PriceConsumer ==========
    const priceConsumer = m.contract("contracts/jobThree/PriceConsumer.sol:PriceConsumer", [], {
        id: "PriceConsumerLogic"
    });

    const priceConsumerProxy = m.contract("ERC1967Proxy", [
        priceConsumer,
        m.encodeFunctionCall(priceConsumer, "initialize", [ethPriceFeed])
    ], {
        id: "PriceConsumerProxy"
    });

    const priceConsumerInstance = m.contractAt("contracts/jobThree/PriceConsumer.sol:PriceConsumer", priceConsumerProxy);

    // ========== 2. 部署 NFTAuction ==========
    const auction = m.contract("contracts/jobThree/NFTAuction.sol:NFTAuction", [], {
        id: "NFTAuctionLogic"
    });

    const auctionProxy = m.contract("ERC1967Proxy", [
        auction,
        m.encodeFunctionCall(auction, "initialize", [
            feeRecipient,
            priceConsumerProxy
        ])
    ], {
        id: "NFTAuctionProxy"
    });

    const auctionInstance = m.contractAt("contracts/jobThree/NFTAuction.sol:NFTAuction", auctionProxy);

    // ========== 3. 部署 NFTERC721 ==========
    const nft = m.contract("contracts/jobThree/NFTERC721.sol:NFTERC721", [], {
        id: "NFTERC721Logic"
    });

    const nftProxy = m.contract("ERC1967Proxy", [
        nft,
        m.encodeFunctionCall(nft, "initialize", [
            nftName,
            nftSymbol,
            nftBaseURI
        ])
    ], {
        id: "NFTERC721Proxy"
    });

    const nftInstance = m.contractAt("contracts/jobThree/NFTERC721.sol:NFTERC721", nftProxy);

    return {
        priceConsumer: priceConsumerInstance,
        auction: auctionInstance,
        nft: nftInstance,
        priceConsumerProxy,
        auctionProxy,
        nftProxy
    };
});

export default NFTAuctionMarketModule;