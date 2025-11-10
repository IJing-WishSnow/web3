// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import "./ABIEncode.sol";

contract ABIEncodeTest is Test {
    // 预期的编码值
    uint expectedX;
    address expectedAddr;
    string expectedName;
    uint[2] expectedArray;
    ABIEncode encodeContract;

    /**
     * @dev 测试前置设置
     */
    function setUp() public {
        expectedX = 10;
        expectedAddr = 0x7A58c0Be72BE218B41C608b7Fe7C5bB630736C71;
        expectedName = "0xAA";
        expectedArray = [uint(5), 6];

        encodeContract = new ABIEncode();
    }

    function test_encode() public view {
        // 调用 encode 方法
        bytes memory result = encodeContract.encode();

        // 检查编码结果不为空
        assertGt(result.length, 0, "Encoded result should not be empty");

        bytes memory expected = abi.encode(
            expectedX,
            expectedAddr,
            expectedName,
            expectedArray
        );

        // 比较编码结果哈希
        assertEq(result, expected, "Encoded result does not match expected");

        // 解码并验证各个字段
        (
            uint decodedX,
            address decodedAddr,
            string memory decodedName,
            uint[2] memory decodedArray
        ) = abi.decode(result, (uint, address, string, uint[2]));

        assertEq(decodedX, expectedX, "Decoded X does not match");
        assertEq(decodedAddr, expectedAddr, "Decoded address does not match");
        assertEq(decodedName, expectedName, "Decoded name does not match");

        // 逐个比较数组元素
        assertEq(
            decodedArray[0],
            expectedArray[0],
            "Decoded array[0] does not match"
        );
        assertEq(
            decodedArray[1],
            expectedArray[1],
            "Decoded array[1] does not match"
        );
    }

    function test_encodePacked() public view {
        // 调用 encodePacked 方法
        bytes memory result = encodeContract.encodePacked();

        // 检查编码结果不为空
        assertGt(result.length, 0, "Encoded result should not be empty");

        // 计算预期的 encodePacked 结果
        bytes memory expected = abi.encodePacked(
            expectedX,
            expectedAddr,
            expectedName,
            expectedArray
        );

        // 比较编码结果
        assertEq(
            result,
            expected,
            "Encoded packed result does not match expected"
        );

        // 注意：encodePacked 的结果不能直接解码，所以不能有解码验证部分
        // 如果需要验证各个字段，需要手动解析字节序列
    }

    function test_encodeWithSignature() public view {
        // 调用 encodeWithSignature 方法
        bytes memory result = encodeContract.encodeWithSignature();

        string memory signature = "foo(uint256,address,string,uint256[2])";

        // 计算预期的 encodePacked 结果
        bytes memory expected = abi.encodeWithSignature(
            signature,
            expectedX,
            expectedAddr,
            expectedName,
            expectedArray
        );
        assertEq(
            result,
            expected,
            "Encoded with signature result does not match expected"
        );
    }

    function test_encodeWithSelector() public view {
        // 调用 encodeWithSelector 方法
        bytes memory result = encodeContract.encodeWithSelector();
        bytes4 selector = bytes4(
            keccak256("foo(uint256,address,string,uint256[2])")
        );

        // 计算预期的 encodePacked 结果
        bytes memory expected = abi.encodeWithSelector(
            selector,
            expectedX,
            expectedAddr,
            expectedName,
            expectedArray
        );
        assertEq(
            result,
            expected,
            "Encoded with signature result does not match expected"
        );
    }
}
