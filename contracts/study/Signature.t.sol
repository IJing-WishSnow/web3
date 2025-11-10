// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SignatureNFT} from "./Signature.sol";

contract SignatureNFTTest is Test {
    SignatureNFT nft;
    address signer;
    address user;
    uint256 privateKey;

    string constant NAME = "TestNFT";
    string constant SYMBOL = "TNFT";
    uint256 constant TOKEN_ID = 1;

    function setUp() public {
        // 设置签名者私钥和地址
        privateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        signer = vm.addr(privateKey);
        user = address(0x123);

        // 部署NFT合约
        nft = new SignatureNFT(NAME, SYMBOL, signer);
    }

    // 在测试合约中重新实现 recoverSigner
    function recoverSigner(
        bytes32 _msgHash,
        bytes memory _signature
    ) public pure returns (address) {
        require(_signature.length == 65, "invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(_signature, 0x20))
            s := mload(add(_signature, 0x40))
            v := byte(0, mload(add(_signature, 0x60)))
        }
        return ecrecover(_msgHash, v, r, s);
    }

    function test_RecoverSigner() public view {
        // 准备消息哈希
        bytes32 messageHash = nft.getMessageHash(user, TOKEN_ID);
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // 使用私钥签名
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            ethSignedMessageHash
        );
        bytes memory signature = abi.encodePacked(r, s, v);

        // 测试recoverSigner功能 - 使用测试合约中的函数
        address recovered = this.recoverSigner(ethSignedMessageHash, signature);

        // 验证恢复的地址与签名者地址一致
        assertEq(
            recovered,
            signer,
            "Recovered signer should match original signer"
        );
    }

    function test_RecoverSigner_InvalidSignature() public view {
        bytes32 messageHash = nft.getMessageHash(user, TOKEN_ID);
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // 使用错误的私钥生成无效签名
        uint256 wrongPrivateKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            wrongPrivateKey,
            ethSignedMessageHash
        );
        bytes memory invalidSignature = abi.encodePacked(r, s, v);

        // 恢复的地址应该与原始签名者不同
        address recovered = this.recoverSigner(
            ethSignedMessageHash,
            invalidSignature
        );
        assertTrue(
            recovered != signer,
            "Recovered address should not match signer for invalid signature"
        );
    }

    function test_VerifyFunction() public view {
        // 准备签名
        bytes32 messageHash = nft.getMessageHash(user, TOKEN_ID);
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            ethSignedMessageHash
        );
        bytes memory signature = abi.encodePacked(r, s, v);

        // 测试verify函数 - 这个函数在SignatureNFT中是公开的
        bool isValid = nft.verify(ethSignedMessageHash, signature);
        assertTrue(isValid, "Signature should be valid");

        // 测试无效签名
        uint256 wrongPrivateKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        (v, r, s) = vm.sign(wrongPrivateKey, ethSignedMessageHash);
        bytes memory invalidSignature = abi.encodePacked(r, s, v);

        bool isInvalid = nft.verify(ethSignedMessageHash, invalidSignature);
        assertFalse(isInvalid, "Invalid signature should return false");
    }

    function test_MintWithValidSignature() public {
        // 准备签名
        bytes32 messageHash = nft.getMessageHash(user, TOKEN_ID);
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            ethSignedMessageHash
        );
        bytes memory signature = abi.encodePacked(r, s, v);

        // 用户mint
        vm.prank(user);
        nft.mint(user, TOKEN_ID, signature);

        // 验证mint成功
        assertEq(nft.ownerOf(TOKEN_ID), user, "Token should be minted to user");
        assertTrue(nft.mintedAddress(user), "User should be marked as minted");
    }

    function test_GetMessageHash() public view {
        // 测试消息哈希计算
        bytes32 hash = nft.getMessageHash(user, TOKEN_ID);
        bytes32 expected = keccak256(abi.encodePacked(user, TOKEN_ID));

        assertEq(hash, expected, "Message hash should match expected value");
    }
}
