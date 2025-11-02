// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VividNFT} from "./VividNFT.sol";

/// @notice 测试辅助合约，提供 burn 功能用于测试
/// @dev 继承自 VividNFT 并添加公开的 burn 函数
contract VividNFTBurnableTest is VividNFT {
    constructor(
        string memory name_,
        string memory symbol_
    ) VividNFT(name_, symbol_) {}

    /// @notice 销毁指定的 token
    /// @dev 用于测试目的，允许销毁 token 以验证 URI 清理功能
    /// @param tokenId 要销毁的 token ID
    function burn(uint256 tokenId) public {
        _update(address(0), tokenId, msg.sender);
    }
}

/// @title VividNFT 单元测试套件
/// @notice 使用 Forge 标准库对 VividNFT 合约进行全面的单元测试
/// @dev 继承自 forge-std/Test.sol 以使用测试工具和作弊码
contract VividNFTTest is Test {
    /// @notice 测试合约实例
    VividNFTBurnableTest public nft;

    /// @notice 合约所有者地址
    address public owner;

    /// @notice 普通用户地址
    address public user;

    /// @notice 接收者地址
    address public recipient;

    /// @notice 测试用的 NFT 名称
    string public constant NFT_NAME = "VividNFT";

    /// @notice 测试用的 NFT 符号
    string public constant NFT_SYMBOL = "VNFT";

    /// @notice 测试用的 token URI
    string public constant TEST_URI = "https://example.com/metadata/1.json";

    /// @notice 另一个测试用的 token URI
    string public constant TEST_URI_2 = "https://example.com/metadata/2.json";

    /// @notice 设置测试环境，在每个测试函数之前运行
    function setUp() public {
        owner = address(this);
        user = makeAddr("user");
        recipient = makeAddr("recipient");

        // 部署合约（使用可销毁的测试版本）
        nft = new VividNFTBurnableTest(NFT_NAME, NFT_SYMBOL);
    }

    /// @notice 测试构造函数是否正确初始化合约
    /// @dev 验证合约名称、符号和所有者设置
    function testConstructor() public view {
        assertEq(nft.name(), NFT_NAME);
        assertEq(nft.symbol(), NFT_SYMBOL);
        assertEq(nft.owner(), owner);
        assertEq(nft.getCurrentTokenId(), 0);
        assertEq(nft.totalSupply(), 0);
    }

    /// @notice 测试安全铸造单个 NFT 的基本功能
    /// @dev 验证铸造后 token ID、所有者和 URI 是否正确
    function testSafeMint() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);

        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(tokenId), recipient);
        assertEq(nft.tokenURI(tokenId), TEST_URI);
        assertEq(nft.balanceOf(recipient), 1);
        assertEq(nft.getCurrentTokenId(), 1);
        assertEq(nft.totalSupply(), 1);
        assertTrue(nft.exists(tokenId));
        assertTrue(nft.isURIUsed(TEST_URI));
    }

    /// @notice 测试安全铸造 NFT 时触发的事件
    /// @dev 验证 TokenMinted 事件是否正确发出
    function testSafeMintEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit VividNFT.TokenMinted(recipient, 0, TEST_URI);

        nft.safeMint(recipient, TEST_URI);
    }

    /// @notice 测试非所有者无法调用 safeMint
    /// @dev 验证 onlyOwner 修饰符正确工作
    function testSafeMintOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        nft.safeMint(recipient, TEST_URI);
    }

    /// @notice 测试使用空 URI 铸造 NFT 应该失败
    /// @dev 验证空 URI 检查是否正确
    function testSafeMintEmptyURI() public {
        vm.expectRevert("VividNFT: tokenURI cannot be empty");
        nft.safeMint(recipient, "");
    }

    /// @notice 测试使用已使用的 URI 铸造 NFT 应该失败
    /// @dev 验证 URI 重复检查是否正确
    function testSafeMintDuplicateURI() public {
        nft.safeMint(recipient, TEST_URI);

        vm.expectRevert("VividNFT: tokenURI already used");
        nft.safeMint(user, TEST_URI);
    }

    /// @notice 测试连续铸造多个 NFT
    /// @dev 验证 token ID 正确递增
    function testSafeMintMultiple() public {
        uint256 tokenId1 = nft.safeMint(recipient, TEST_URI);
        uint256 tokenId2 = nft.safeMint(recipient, TEST_URI_2);

        assertEq(tokenId1, 0);
        assertEq(tokenId2, 1);
        assertEq(nft.balanceOf(recipient), 2);
        assertEq(nft.getCurrentTokenId(), 2);
        assertEq(nft.totalSupply(), 2);
    }

    /// @notice 测试批量铸造 NFT 的基本功能
    /// @dev 验证批量铸造后所有 NFT 都正确创建
    function testBatchMint() public {
        address[] memory recipients = new address[](3);
        recipients[0] = recipient;
        recipients[1] = user;
        recipients[2] = recipient;

        string[] memory tokenURIs = new string[](3);
        tokenURIs[0] = TEST_URI;
        tokenURIs[1] = TEST_URI_2;
        tokenURIs[2] = "https://example.com/metadata/3.json";

        nft.batchMint(recipients, tokenURIs);

        assertEq(nft.ownerOf(0), recipient);
        assertEq(nft.ownerOf(1), user);
        assertEq(nft.ownerOf(2), recipient);
        assertEq(nft.balanceOf(recipient), 2);
        assertEq(nft.balanceOf(user), 1);
        assertEq(nft.totalSupply(), 3);
        assertEq(nft.getCurrentTokenId(), 3);
    }

    /// @notice 测试批量铸造时触发的事件
    /// @dev 验证每个铸造操作都触发相应的事件
    function testBatchMintEmitsEvents() public {
        address[] memory recipients = new address[](2);
        recipients[0] = recipient;
        recipients[1] = user;

        string[] memory tokenURIs = new string[](2);
        tokenURIs[0] = TEST_URI;
        tokenURIs[1] = TEST_URI_2;

        vm.expectEmit(true, true, false, true);
        emit VividNFT.TokenMinted(recipient, 0, TEST_URI);

        vm.expectEmit(true, true, false, true);
        emit VividNFT.TokenMinted(user, 1, TEST_URI_2);

        nft.batchMint(recipients, tokenURIs);
    }

    /// @notice 测试非所有者无法调用 batchMint
    /// @dev 验证 onlyOwner 修饰符正确工作
    function testBatchMintOnlyOwner() public {
        address[] memory recipients = new address[](1);
        recipients[0] = recipient;

        string[] memory tokenURIs = new string[](1);
        tokenURIs[0] = TEST_URI;

        vm.prank(user);
        vm.expectRevert();
        nft.batchMint(recipients, tokenURIs);
    }

    /// @notice 测试批量铸造时数组长度不匹配应该失败
    /// @dev 验证数组长度检查是否正确
    function testBatchMintArrayLengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = recipient;
        recipients[1] = user;

        string[] memory tokenURIs = new string[](1);
        tokenURIs[0] = TEST_URI;

        vm.expectRevert("VividNFT: arrays length mismatch");
        nft.batchMint(recipients, tokenURIs);
    }

    /// @notice 测试批量铸造时使用空数组应该失败
    /// @dev 验证空数组检查是否正确
    function testBatchMintEmptyArrays() public {
        address[] memory recipients = new address[](0);
        string[] memory tokenURIs = new string[](0);

        vm.expectRevert("VividNFT: empty arrays");
        nft.batchMint(recipients, tokenURIs);
    }

    /// @notice 测试批量铸造时超过最大批次大小应该失败
    /// @dev 验证批次大小限制是否正确
    function testBatchMintTooLarge() public {
        address[] memory recipients = new address[](51);
        string[] memory tokenURIs = new string[](51);

        for (uint256 i = 0; i < 51; i++) {
            recipients[i] = recipient;
            tokenURIs[i] = string.concat(
                "https://example.com/metadata/",
                vm.toString(i),
                ".json"
            );
        }

        vm.expectRevert("VividNFT: batch too large");
        nft.batchMint(recipients, tokenURIs);
    }

    /// @notice 测试批量铸造时使用重复 URI 应该失败
    /// @dev 验证 URI 重复检查在批量铸造中是否正确工作
    function testBatchMintDuplicateURI() public {
        address[] memory recipients = new address[](2);
        recipients[0] = recipient;
        recipients[1] = user;

        string[] memory tokenURIs = new string[](2);
        tokenURIs[0] = TEST_URI;
        tokenURIs[1] = TEST_URI; // 重复的 URI

        vm.expectRevert("VividNFT: tokenURI already used");
        nft.batchMint(recipients, tokenURIs);
    }

    /// @notice 测试更新 token URI 的基本功能
    /// @dev 验证 URI 更新后 token 的 URI 是否正确改变
    function testUpdateTokenURI() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);
        assertEq(nft.tokenURI(tokenId), TEST_URI);
        assertTrue(nft.isURIUsed(TEST_URI));
        assertFalse(nft.isURIUsed(TEST_URI_2));

        nft.updateTokenURI(tokenId, TEST_URI_2);

        assertEq(nft.tokenURI(tokenId), TEST_URI_2);
        assertFalse(nft.isURIUsed(TEST_URI));
        assertTrue(nft.isURIUsed(TEST_URI_2));
    }

    /// @notice 测试更新 token URI 时触发的事件
    /// @dev 验证 TokenURIUpdated 事件是否正确发出
    function testUpdateTokenURIEmitsEvent() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);

        vm.expectEmit(true, false, false, true);
        emit VividNFT.TokenURIUpdated(tokenId, TEST_URI_2);

        nft.updateTokenURI(tokenId, TEST_URI_2);
    }

    /// @notice 测试非所有者无法调用 updateTokenURI
    /// @dev 验证 onlyOwner 修饰符正确工作
    function testUpdateTokenURIOnlyOwner() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);

        vm.prank(user);
        vm.expectRevert();
        nft.updateTokenURI(tokenId, TEST_URI_2);
    }

    /// @notice 测试更新不存在的 token URI 应该失败
    /// @dev 验证 token 存在性检查是否正确
    function testUpdateTokenURINonexistentToken() public {
        vm.expectRevert("VividNFT: token does not exist");
        nft.updateTokenURI(999, TEST_URI);
    }

    /// @notice 测试更新 token URI 时使用空 URI 应该失败
    /// @dev 验证空 URI 检查是否正确
    function testUpdateTokenURIEmptyURI() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);

        vm.expectRevert("VividNFT: tokenURI cannot be empty");
        nft.updateTokenURI(tokenId, "");
    }

    /// @notice 测试更新 token URI 时使用已使用的 URI 应该失败
    /// @dev 验证 URI 重复检查是否正确
    function testUpdateTokenURIDuplicateURI() public {
        uint256 tokenId1 = nft.safeMint(recipient, TEST_URI);
        nft.safeMint(recipient, TEST_URI_2);

        vm.expectRevert("VividNFT: tokenURI already used");
        nft.updateTokenURI(tokenId1, TEST_URI_2);
    }

    /// @notice 测试 isURIUsed 函数
    /// @dev 验证 URI 使用状态检查是否正确
    function testIsURIUsed() public {
        assertFalse(nft.isURIUsed(TEST_URI));
        assertFalse(nft.isURIUsed(TEST_URI_2));

        nft.safeMint(recipient, TEST_URI);

        assertTrue(nft.isURIUsed(TEST_URI));
        assertFalse(nft.isURIUsed(TEST_URI_2));
    }

    /// @notice 测试 getCurrentTokenId 函数
    /// @dev 验证 token ID 计数器是否正确递增
    function testGetCurrentTokenId() public {
        assertEq(nft.getCurrentTokenId(), 0);

        nft.safeMint(recipient, TEST_URI);
        assertEq(nft.getCurrentTokenId(), 1);

        nft.safeMint(user, TEST_URI_2);
        assertEq(nft.getCurrentTokenId(), 2);
    }

    /// @notice 测试 totalSupply 函数
    /// @dev 验证总供应量是否正确计算
    function testTotalSupply() public {
        assertEq(nft.totalSupply(), 0);

        nft.safeMint(recipient, TEST_URI);
        assertEq(nft.totalSupply(), 1);

        nft.safeMint(user, TEST_URI_2);
        assertEq(nft.totalSupply(), 2);

        address[] memory recipients = new address[](3);
        recipients[0] = recipient;
        recipients[1] = user;
        recipients[2] = makeAddr("recipient2");

        string[] memory tokenURIs = new string[](3);
        tokenURIs[0] = "https://example.com/metadata/3.json";
        tokenURIs[1] = "https://example.com/metadata/4.json";
        tokenURIs[2] = "https://example.com/metadata/5.json";

        nft.batchMint(recipients, tokenURIs);
        assertEq(nft.totalSupply(), 5);
    }

    /// @notice 测试 exists 函数
    /// @dev 验证 token 存在性检查是否正确
    function testExists() public {
        assertFalse(nft.exists(0));

        uint256 tokenId = nft.safeMint(recipient, TEST_URI);
        assertTrue(nft.exists(tokenId));
        assertFalse(nft.exists(999));
    }

    /// @notice 测试销毁 token 时 URI 使用标记被清理
    /// @dev 验证 _update 函数在销毁时正确清理 URI
    function testBurnClearsURI() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);
        assertTrue(nft.isURIUsed(TEST_URI));

        vm.prank(recipient);
        nft.burn(tokenId);

        assertFalse(nft.isURIUsed(TEST_URI));
        assertFalse(nft.exists(tokenId));
        vm.expectRevert();
        nft.ownerOf(tokenId);
    }

    /// @notice 测试销毁后 URI 可以重新使用
    /// @dev 验证 URI 在 token 销毁后可以被重新分配
    function testBurnAllowsReuseURI() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);
        assertTrue(nft.isURIUsed(TEST_URI));

        vm.prank(recipient);
        nft.burn(tokenId);

        // 现在可以使用相同的 URI 重新铸造
        uint256 newTokenId = nft.safeMint(user, TEST_URI);
        assertEq(newTokenId, 1);
        assertEq(nft.ownerOf(newTokenId), user);
        assertTrue(nft.isURIUsed(TEST_URI));
    }

    /// @notice 测试支持 ERC721 接口
    /// @dev 验证 supportsInterface 函数正确返回接口支持情况
    function testSupportsInterface() public view {
        // ERC165 接口 ID
        assertTrue(nft.supportsInterface(0x01ffc9a7));
        // ERC721 接口 ID
        assertTrue(nft.supportsInterface(0x80ac58cd));
        // ERC721Metadata 接口 ID
        assertTrue(nft.supportsInterface(0x5b5e139f));
        // 不支持的接口
        assertFalse(nft.supportsInterface(0x12345678));
    }

    /// @notice 测试转移 token 后 URI 保持不变
    /// @dev 验证转移操作不影响 token URI
    function testTransferPreservesURI() public {
        uint256 tokenId = nft.safeMint(recipient, TEST_URI);
        assertEq(nft.tokenURI(tokenId), TEST_URI);
        assertEq(nft.ownerOf(tokenId), recipient);

        vm.prank(recipient);
        nft.transferFrom(recipient, user, tokenId);

        assertEq(nft.tokenURI(tokenId), TEST_URI);
        assertEq(nft.ownerOf(tokenId), user);
        assertTrue(nft.isURIUsed(TEST_URI));
    }

    /// @notice 测试批量铸造的最大批次大小边界
    /// @dev 验证正好 50 个 token 的批量铸造可以成功
    function testBatchMintMaxSize() public {
        address[] memory recipients = new address[](50);
        string[] memory tokenURIs = new string[](50);

        for (uint256 i = 0; i < 50; i++) {
            recipients[i] = recipient;
            tokenURIs[i] = string.concat(
                "https://example.com/metadata/",
                vm.toString(i),
                ".json"
            );
        }

        nft.batchMint(recipients, tokenURIs);

        assertEq(nft.totalSupply(), 50);
        assertEq(nft.balanceOf(recipient), 50);
    }

    /// @notice 测试批量铸造后 token ID 连续递增
    /// @dev 验证批量铸造的 token ID 分配是否正确
    function testBatchMintTokenIdSequence() public {
        address[] memory recipients = new address[](5);
        recipients[0] = recipient;
        recipients[1] = user;
        recipients[2] = recipient;
        recipients[3] = user;
        recipients[4] = recipient;

        string[] memory tokenURIs = new string[](5);
        tokenURIs[0] = "https://example.com/metadata/1.json";
        tokenURIs[1] = "https://example.com/metadata/2.json";
        tokenURIs[2] = "https://example.com/metadata/3.json";
        tokenURIs[3] = "https://example.com/metadata/4.json";
        tokenURIs[4] = "https://example.com/metadata/5.json";

        nft.batchMint(recipients, tokenURIs);

        for (uint256 i = 0; i < 5; i++) {
            assertTrue(nft.exists(i));
        }

        assertEq(nft.getCurrentTokenId(), 5);
    }
}
