# NFT Auction Market Project

合约访问地址：

  https://sepolia.etherscan.io/address/0x62F83bFF3fe9E6AdD0A7cc10A2Eb018DB277E3F6
  https://sepolia.etherscan.io/address/0xB5deBE39Cc222Cd9A956a8b7b87096d4af488E0B
  https://sepolia.etherscan.io/address/0x615A76FcAB18D936165070BfF1AA0CFcD897f23C

📖 项目概述

一个基于以太坊的去中心化NFT拍卖市场，支持多币种支付（ETH/ERC20）和动态手续费系统。项目采用可升级合约架构，集成Chainlink价格预言机，提供安全高效的NFT拍卖服务。

🏗️ 项目结构

contracts/
├── jobThree/                          # 主要合约目录
│   ├── NFTAuction.sol                # NFT拍卖主合约
│   ├── NFTERC721.sol                 # 可升级NFT合约
│   ├── PriceConsumer.sol             # 价格预言机消费者合约
│   ├── ViemBridge/
│   │   └── ERC1967Proxy.sol          # 代理合约实现
│   └── Mock/                         # 测试用Mock合约
│       ├── MockAggregatorV3.sol
│       ├── MockERC20.sol
│       └── MockPriceConsumer.sol
├── study/                            # 学习/示例合约
└── @openzeppelin/                    # 依赖库合约

ignition/
└── modules/
    └── jobThree/
        └── NFTAuctionMarket.ts       # 部署模块

test/
└── jobThree/
    ├── core/                         # 核心功能测试
    │   ├── Deployment.ts
    │   ├── AuctionCore.ts
    │   ├── NFTERC721.ts
    │   └── PriceConsumer.ts
    ├── business/                     # 业务逻辑测试
    │   ├── AuctionEth.ts
    │   ├── AuctionERC20.ts
    │   └── FeeSystem.ts
    ├── config/                       # 配置测试
    │   ├── Config.ts
    │   └── Utils.ts
    ├── IntegrationLoad/              # 集成和压力测试
    │   ├── Integration.ts
    │   ├── Compatibility.ts
    │   └── LoadStress.ts
    ├── safePerf/                     # 安全和性能测试
    │   ├── Security.ts
    │   ├── GasOptimization.ts
    │   ┣── ErrorRecovery.ts
    └── advanced/                     # 高级功能测试
        ├── Upgradeability.ts
        └── EventLog.ts

report/
└── jobThree/
    ├── all.txt                       # 完整测试覆盖率报告
    ├── solForge.txt                  # Solidity测试报告
    └── tsViem.txt                    # TypeScript测试报告

🎯 核心功能

1. NFTAuction (拍卖合约)
- 多币种支持: ETH和ERC20代币支付
- 动态手续费: 基于拍卖金额的阶梯费率
- 安全投标: 防重入攻击，自动退款机制
- 时间控制: 灵活的拍卖开始/结束时间
- 紧急取消: 管理员紧急停止功能
  
2. NFTERC721 (NFT合约)
- 可升级架构: UUPS代理模式
- 自定义元数据: 智能token URI生成
- 批量铸造: 支持批量NFT创建
- 权限管理: 基于角色的访问控制
  
3. PriceConsumer (价格预言机)
- 多价格源: 支持多个Chainlink价格源
- 价格标准化: 统一18位小数格式
- 动态添加: 运行时添加新的价格源
- 请求机制: 用户可请求添加新代币价格源
  
🛠️ 技术栈

- 区块链: Ethereum
- 开发框架: Hardhat
- 部署工具: Hardhat Ignition
- 代理模式: ERC1967 UUPS
- 价格预言机: Chainlink
- 测试框架: Hardhat Network
- 代码覆盖: Solidity Coverage
  
⚙️ 环境配置

使用 Hardhat Keystore 管理敏感信息
# 设置 Sepolia RPC URL
npx hardhat keystore set SEPOLIA_RPC_URL
# 输入: 你的 Sepolia RPC URL (如: https://eth-sepolia.g.alchemy.com/v2/your-key)

# 设置部署私钥
npx hardhat keystore set SEPOLIA_PRIVATE_KEY  
# 输入: 你的部署钱包私钥 (如: 0xabc123...)

# 设置 Etherscan API Key (用于合约验证)
npx hardhat keystore set ETHERSCAN_API_KEY
# 输入: 你的 Etherscan API Key

# 查看已存储的配置
npx hardhat keystore list

API Key 说明
- Etherscan API Key 不区分测试网和主网，同一个 API Key 可用于所有网络验证
- 在 Etherscan 官网创建的 API Key 适用于 Ethereum 主网、Sepolia、Goerli 等所有网络
  
获取 API Key
1. 访问 Etherscan
2. 注册/登录账户
3. 进入 API Keys 页面
4. 创建新的 API Key
  
📋 部署步骤

本地部署测试
# 编译合约
npx hardhat compile

# 启动本地节点
npx hardhat node

# 部署到本地网络（新终端）
npx hardhat ignition deploy ignition/modules/jobThree/NFTAuctionMarket.ts --network localhost

测试网部署
# 部署到Sepolia测试网
npx hardhat ignition deploy ignition/modules/jobThree/NFTAuctionMarket.ts --network sepolia

重新部署（如果代码有更改）
# 清理并重新编译
npx hardhat clean
npx hardhat compile

# 重新部署（会创建新合约）
npx hardhat ignition deploy ignition/modules/jobThree/NFTAuctionMarket.ts --network sepolia

当前部署地址 (Sepolia)
逻辑合约（Logic）：
NFTAuctionLogic: 0xaebA73f75392E5ab4061e73a5bCEe73344d62D86
NFTERC721Logic: 0xF6061B331877014cC1915d6f4f554A7e5AAd7dfb
PriceConsumerLogic: 0x86296964276EFcdB494a417b849E351B19475582
代理合约（Proxy）：
NFTAuctionProxy: 0x62F83bFF3fe9E6AdD0A7cc10A2Eb018DB277E3F6
NFTERC721Proxy: 0xB5deBE39Cc222Cd9A956a8b7b87096d4af488E0B
PriceConsumerProxy: 0x615A76FcAB18D936165070BfF1AA0CFcD897f23C

🔍 合约验证

重要说明
- 代码更改后必须重新部署，因为字节码会变化
- 验证需要使用完全限定合约名
- Etherscan API Key 适用于所有网络
  
验证逻辑合约
# NFTAuction 逻辑合约
npx hardhat verify --network sepolia 0xaebA73f75392E5ab4061e73a5bCEe73344d62D86 --contract contracts/jobThree/NFTAuction.sol:NFTAuction

# NFTERC721 逻辑合约
npx hardhat verify --network sepolia 0xF6061B331877014cC1915d6f4f554A7e5AAd7dfb --contract contracts/jobThree/NFTERC721.sol:NFTERC721

# PriceConsumer 逻辑合约
npx hardhat verify --network sepolia 0x86296964276EFcdB494a417b849E351B19475582 --contract contracts/jobThree/PriceConsumer.sol:PriceConsumer

验证代理合约
# NFTAuction 代理合约
npx hardhat verify --network sepolia 0x62F83bFF3fe9E6AdD0A7cc10A2Eb018DB277E3F6 --contract contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy

# NFTERC721 代理合约
npx hardhat verify --network sepolia 0xB5deBE39Cc222Cd9A956a8b7b87096d4af488E0B --contract contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy

# PriceConsumer 代理合约
npx hardhat verify --network sepolia 0x615A76FcAB18D936165070BfF1AA0CFcD897f23C --contract contracts/jobThree/ViemBridge/ERC1967Proxy.sol:ERC1967Proxy

链接代理关系
# 链接代理合约和逻辑合约
npx hardhat verify-proxy --network sepolia 0x62F83bFF3fe9E6AdD0A7cc10A2Eb018DB277E3F6
npx hardhat verify-proxy --network sepolia 0xB5deBE39Cc222Cd9A956a8b7b87096d4af488E0B
npx hardhat verify-proxy --network sepolia 0x615A76FcAB18D936165070BfF1AA0CFcD897f23C

验证问题解决
如果验证失败，检查：
1. 是否设置了正确的 ETHERSCAN_API_KEY
2. 代码是否有更改（需要重新部署）
3. 是否使用了完全限定合约名
  
🧪 测试流程

重要说明
Hardhat 测试命令需要**指定具体文件路径**，不支持直接按目录运行测试。

PowerShell 测试命令

运行所有测试（完整套件）
# 获取所有测试文件
$allFiles = ((Get-ChildItem -Path "contracts\jobThree" -Recurse -Filter "*.t.sol" | ForEach-Object { $_.FullName }) + (Get-ChildItem -Path "test\jobThree" -Recurse -Filter "*.ts" | ForEach-Object { $_.FullName })) -join " "; Write-Output $files

# 运行完整测试套件：必须手动复制 allFiles 在终端输出的值替代下面的 $allFiles
cmd /c "npx hardhat test $allFiles --coverage > report\jobThree\all.txt"

只运行 Solidity 测试文件
# 获取 Solidity 测试文件
$files = (Get-ChildItem -Path "contracts\jobThree" -Recurse -Filter "*.t.sol" | ForEach-Object { $_.FullName }) -join " "; Write-Output $files

# 运行 Solidity 测试：必须手动复制 files 在终端输出的值替代下面的 $files
cmd /c "npx hardhat test $files --coverage > report\jobThree\solForge.txt"

只运行 TypeScript 测试文件
# 获取 TypeScript 测试文件
$files = (Get-ChildItem -Path "test\jobThree" -Recurse -Filter "*.ts" | ForEach-Object { $_.FullName }) -join " "; Write-Output $files

# 运行 TypeScript 测试：必须手动复制 files 在终端输出的值替代下面的 $files
cmd /c "npx hardhat test $files --coverage > report\jobThree\tsViem.txt"

CMD 测试命令

运行完整测试套件
npx hardhat test T:\web3\contracts\jobThree\NFTAuction.t.sol T:\web3\contracts\jobThree\NFTERC721.t.sol T:\web3\contracts\jobThree\PriceConsumer.t.sol T:\web3\contracts\jobThree\PriceConsumerFuzz.t.sol T:\web3\test\jobThree\advanced\EventLog.ts T:\web3\test\jobThree\advanced\Upgradeability.ts T:\web3\test\jobThree\business\AuctionERC20.ts T:\web3\test\jobThree\business\AuctionEth.ts T:\web3\test\jobThree\business\FeeSystem.ts T:\web3\test\jobThree\config\Config.ts T:\web3\test\jobThree\config\Utils.ts T:\web3\test\jobThree\core\AuctionCore.ts T:\web3\test\jobThree\core\Deployment.ts T:\web3\test\jobThree\core\NFTERC721.ts T:\web3\test\jobThree\core\PriceConsumer.ts T:\web3\test\jobThree\IntegrationLoad\Compatibility.ts T:\web3\test\jobThree\IntegrationLoad\Integration.ts T:\web3\test\jobThree\IntegrationLoad\LoadStress.ts T:\web3\test\jobThree\safePerf\ErrorRecovery.ts T:\web3\test\jobThree\safePerf\GasOptimization.ts T:\web3\test\jobThree\safePerf\Security.ts --coverage > report\jobThree\all.txt

运行 Solidity 测试
npx hardhat test T:\web3\contracts\jobThree\NFTAuction.t.sol T:\web3\contracts\jobThree\NFTERC721.t.sol T:\web3\contracts\jobThree\PriceConsumer.t.sol T:\web3\contracts\jobThree\PriceConsumerFuzz.t.sol --coverage > report\jobThree\solForge.txt

运行 TypeScript 测试
npx hardhat test T:\web3\test\jobThree\advanced\EventLog.ts T:\web3\test\jobThree\advanced\Upgradeability.ts T:\web3\test\jobThree\business\AuctionERC20.ts T:\web3\test\jobThree\business\AuctionEth.ts T:\web3\test\jobThree\business\FeeSystem.ts T:\web3\test\jobThree\config\Config.ts T:\web3\test\jobThree\config\Utils.ts T:\web3\test\jobThree\core\AuctionCore.ts T:\web3\test\jobThree\core\Deployment.ts T:\web3\test\jobThree\core\NFTERC721.ts T:\web3\test\jobThree\core\PriceConsumer.ts T:\web3\test\jobThree\IntegrationLoad\Compatibility.ts T:\web3\test\jobThree\IntegrationLoad\Integration.ts T:\web3\test\jobThree\IntegrationLoad\LoadStress.ts T:\web3\test\jobThree\safePerf\ErrorRecovery.ts T:\web3\test\jobThree\safePerf\GasOptimization.ts T:\web3\test\jobThree\safePerf\Security.ts --coverage > report\jobThree\tsViem.txt

简单测试命令
# 运行所有测试（无覆盖率）
npx hardhat test

# 运行测试并生成报告
npx hardhat test > report/report.txt

# 运行测试并生成覆盖率报告
npx hardhat test --coverage > report/report.txt

查看测试覆盖率
# 查看详细报告
cat report/jobThree/all.txt
🔗 合约交互 (Viem 版本)

初始化设置

import { createPublicClient, createWalletClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import NFTAuctionABI from './artifacts/contracts/jobThree/NFTAuction.sol/NFTAuction.json'
import NFTERC721ABI from './artifacts/contracts/jobThree/NFTERC721.sol/NFTERC721.json'
import PriceConsumerABI from './artifacts/contracts/jobThree/PriceConsumer.sol/PriceConsumer.json'

// 创建客户端
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http()
})

const account = privateKeyToAccount('0x你的私钥')

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http()
})

// 合约地址
const AUCTION_ADDRESS = '0x62F83bFF3fe9E6AdD0A7cc10A2Eb018DB277E3F6'
const NFT_ADDRESS = '0xB5deBE39Cc222Cd9A956a8b7b87096d4af488E0B'
const PRICE_CONSUMER_ADDRESS = '0x615A76FcAB18D936165070BfF1AA0CFcD897f23C'

// 创建合约实例
const auctionContract = {
  address: AUCTION_ADDRESS,
  abi: NFTAuctionABI.abi
}

const nftContract = {
  address: NFT_ADDRESS,
  abi: NFTERC721ABI.abi
}

const priceConsumerContract = {
  address: PRICE_CONSUMER_ADDRESS,
  abi: PriceConsumerABI.abi
}

创建NFT拍卖

ETH支付的拍卖
import { parseEther, encodeFunctionData } from 'viem'

async function createEthAuction(
  nftAddress: `0x${string}`,
  tokenId: bigint,
  startPrice: string, // ETH 数量，如 "0.1"
  duration: number // 秒数
) {
  const hash = await walletClient.writeContract({
    ...auctionContract,
    functionName: 'createAuction',
    args: [
      nftAddress,
      tokenId,
      parseEther(startPrice),
      BigInt(duration),
      '0x0000000000000000000000000000000000000000' // ETH 使用零地址
    ]
  })
  
  return await publicClient.waitForTransactionReceipt({ hash })
}

ERC20支付的拍卖
async function createERC20Auction(
  nftAddress: `0x${string}`,
  tokenId: bigint,
  startPrice: bigint, // ERC20 代币的最小单位
  duration: number,
  erc20TokenAddress: `0x${string}`
) {
  const hash = await walletClient.writeContract({
    ...auctionContract,
    functionName: 'createAuction',
    args: [
      nftAddress,
      tokenId,
      startPrice,
      BigInt(duration),
      erc20TokenAddress
    ]
  })
  
  return await publicClient.waitForTransactionReceipt({ hash })
}

参与拍卖

ETH出价
async function bidWithEth(auctionId: bigint, bidAmount: string) {
  const hash = await walletClient.writeContract({
    ...auctionContract,
    functionName: 'bid',
    args: [auctionId],
    value: parseEther(bidAmount)
  })
  
  return await publicClient.waitForTransactionReceipt({ hash })
}

ERC20出价
async function bidWithERC20(auctionId: bigint, bidAmount: bigint) {
  const hash = await walletClient.writeContract({
    ...auctionContract,
    functionName: 'bidWithERC20',
    args: [auctionId, bidAmount]
  })
  
  return await publicClient.waitForTransactionReceipt({ hash })
}

NFT操作

铸造NFT
async function mintNFT(toAddress: `0x${string}`, tokenId: bigint) {
  const hash = await walletClient.writeContract({
    ...nftContract,
    functionName: 'mint',
    args: [toAddress, tokenId]
  })
  
  return await publicClient.waitForTransactionReceipt({ hash })
}

设置基础URI
async function setBaseURI(newBaseURI: string) {
  const hash = await walletClient.writeContract({
    ...nftContract,
    functionName: 'setBaseURI',
    args: [newBaseURI]
  })
  
  return await publicClient.waitForTransactionReceipt({ hash })
}

查询NFT信息
async function getNFTInfo(tokenId: bigint) {
  const [owner, tokenURI] = await Promise.all([
    publicClient.readContract({
      ...nftContract,
      functionName: 'ownerOf',
      args: [tokenId]
    }),
    publicClient.readContract({
      ...nftContract,
      functionName: 'tokenURI',
      args: [tokenId]
    })
  ])
  
  return { owner, tokenURI }
}

查询拍卖信息

// 获取拍卖详情
async function getAuction(auctionId: bigint) {
  return await publicClient.readContract({
    ...auctionContract,
    functionName: 'getAuction',
    args: [auctionId]
  })
}

// 获取活跃拍卖列表
async function getActiveAuctions() {
  return await publicClient.readContract({
    ...auctionContract,
    functionName: 'getActiveAuctions'
  })
}

// 计算平台手续费
async function calculatePlatformFee(auctionId: bigint) {
  return await publicClient.readContract({
    ...auctionContract,
    functionName: 'calculatePlatformFee',
    args: [auctionId]
  })
}

价格预言机查询

// 获取最新价格
async function getLatestPrice(tokenAddress: `0x${string}`) {
  return await publicClient.readContract({
    ...priceConsumerContract,
    functionName: 'getLatestPrice',
    args: [tokenAddress]
  })
}

// 获取标准化价格（18位小数）
async function getNormalizedPrice(tokenAddress: `0x${string}`) {
  return await publicClient.readContract({
    ...priceConsumerContract,
    functionName: 'getNormalizedPrice',
    args: [tokenAddress]
  })
}

// 计算代币价值
async function calculateTokenValue(
  tokenAmount: bigint,
  tokenAddress: `0x${string}`,
  tokenDecimals: number
) {
  return await publicClient.readContract({
    ...priceConsumerContract,
    functionName: 'calculateValue',
    args: [tokenAmount, tokenAddress, tokenDecimals]
  })
}

完整使用示例

// 完整的拍卖流程示例
async function completeAuctionFlow() {
  // 1. 铸造NFT
  console.log('铸造NFT...')
  await mintNFT(account.address, 1n)
  
  // 2. 创建拍卖（ETH支付）
  console.log('创建拍卖...')
  await createEthAuction(
    NFT_ADDRESS,
    1n,
    "0.1", // 0.1 ETH 起拍价
    86400   // 1天时长
  )
  
  // 3. 查询拍卖信息
  const auction = await getAuction(0n)
  console.log('拍卖信息:', auction)
  
  // 4. 参与竞拍
  console.log('参与竞拍...')
  await bidWithEth(0n, "0.15") // 出价 0.15 ETH
  
  // 5. 结束拍卖
  console.log('结束拍卖...')
  const hash = await walletClient.writeContract({
    ...auctionContract,
    functionName: 'endAuction',
    args: [0n]
  })
  await publicClient.waitForTransactionReceipt({ hash })
  
  console.log('拍卖完成!')
}

事件监听

// 监听拍卖创建事件
const unwatch = publicClient.watchContractEvent({
  ...auctionContract,
  eventName: 'AuctionCreated',
  onLogs: logs => {
    console.log('新的拍卖创建:', logs)
  }
})

// 停止监听
// unwatch()

错误处理

import { BaseError, ContractFunctionRevertedError } from 'viem'

async function safeBid(auctionId: bigint, bidAmount: string) {
  try {
    return await bidWithEth(auctionId, bidAmount)
  } catch (err) {
    if (err instanceof BaseError) {
      const revertError = err.walk(err => err instanceof ContractFunctionRevertedError)
      if (revertError instanceof ContractFunctionRevertedError) {
        const errorName = revertError.data?.errorName
        console.log(`竞拍失败: ${errorName}`)
        
        switch (errorName) {
          case 'BidTooLow':
            console.log('出价过低')
            break
          case 'AuctionHasEnded':
            console.log('拍卖已结束')
            break
          case 'AuctionNotStarted':
            console.log('拍卖未开始')
            break
          default:
            console.log('未知错误')
        }
      }
    }
    throw err
  }
}


---

⚙️ 配置参数

拍卖参数
- 最小拍卖时长: 1分钟 (60秒)
- 最大拍卖时长: 30天 (2,592,000秒)
- 最小起拍价: > 0
- 默认手续费: 2% (200 basis points)
  
动态手续费阶梯

拍卖金额范围 (USD)
手续费率
Basis Points
$0 - $1,000
5%
500 bps
$1,000 - $10,000
3%
300 bps
$10,000 - $100,000
2%
200 bps
$100,000+
1%
100 bps

价格源配置

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
} as const

// 使用示例
const ethPriceFeed = PRICE_FEEDS.sepolia.ETH_USD

Viem 配置说明

安装依赖
npm install viem

类型安全
建议为合约生成类型定义：
npx hardhat typechain

然后可以导入类型安全的 ABI：
import { NftAuction } from './typechain-types'

网络配置
支持所有 EVM 网络：
import { mainnet, polygon, arbitrum } from 'viem/chains'

// 多链配置
const clients = {
  sepolia: createPublicClient({ chain: sepolia, transport: http() }),
  mainnet: createPublicClient({ chain: mainnet, transport: http() }),
  polygon: createPublicClient({ chain: polygon, transport: http() })
}

这种 Viem 实现提供了更好的类型安全、更简洁的 API 和更好的错误处理机制。

🛡️ 安全特性

- 可升级合约: UUPS代理模式，支持合约升级
- 重入保护: 使用ReentrancyGuard防止重入攻击
- 输入验证: 全面的参数检查和错误处理
- 权限控制: 基于Ownable的权限管理
- 资金安全: 安全的资金托管和退款机制
  
🔄 代码更新和重新部署

代码更改后的处理
如果部署后修改了合约代码：

1. 必须重新部署，因为字节码会变化
2. 验证需要字节码完全匹配
3. 原有部署数据会丢失
  
重新部署步骤
# 1. 清理并重新编译
npx hardhat clean
npx hardhat compile

# 2. 重新部署到测试网
npx hardhat ignition deploy ignition/modules/jobThree/NFTAuctionMarket.ts --network sepolia

# 3. 获取新地址并验证
npx hardhat verify --network sepolia <新合约地址> --contract contracts/jobThree/NFTAuction.sol:NFTAuction

📞 故障排除

常见问题

1. 部署失败
  - 检查网络连接和RPC URL配置
  - 确认账户余额充足
  - 验证合约编译无错误
    
2. 验证失败
  - 确认设置了 ETHERSCAN_API_KEY（不区分网络）
  - 检查代码是否有更改（需要重新部署）
  - 使用完全限定合约名进行验证
  - 确保字节码匹配（代码未更改）
    
3. 测试失败
  - 检查测试文件路径是否正确
  - 确认使用正确的命令格式（PowerShell 或 CMD）
  - 查看详细错误日志
    
获取帮助
查看测试覆盖率报告或联系开发团队获取技术支持。

📄 许可证

本项目采用MIT许可证。详见LICENSE文件。


---

最后更新: 2025年11月24日