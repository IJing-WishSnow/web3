// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Faucet} from "./Faucet.sol";
import {SimpleERC20} from "../jobTwo/SimpleERC20.sol";

/// @title Faucet合约测试
contract FaucetTest is Test {
    Faucet public faucet;
    SimpleERC20 public token; // 改为公共变量

    address public user1 = address(0x1);
    address public user2 = address(0x2);
    address public user3 = address(0x3);

    /// @dev  代币常量
    uint256 constant INITIAL_SUPPLY = 10000000;
    uint8 constant DECIMALS = 18;
    string constant NAME = "Test Token";
    string constant SYMBOL = "TEST";

    function setUp() public {
        // 在测试中动态部署SimpleERC20合约
        token = new SimpleERC20(NAME, SYMBOL, DECIMALS, INITIAL_SUPPLY);

        // 使用新部署的token地址创建Faucet
        faucet = new Faucet(address(token));

        // 给Faucet合约铸造代币
        token.mint(address(faucet), 100000);
    }

    /// @dev 测试构造函数初始化
    function test_ConstructorInitialization() public view {
        assertEq(
            faucet.tokenContract(),
            address(token), // 使用动态部署的token地址
            "tokenContract should be set correctly"
        );
        assertEq(faucet.amountAllowed(), 100, "amountAllowed should be 100");
    }

    /// @dev 测试首次请求代币成功
    function test_FirstRequestSuccess() public {
        uint256 initialBalance = token.balanceOf(user1);

        vm.expectEmit(true, true, false, true);
        emit Faucet.SendToken(user1, 100);

        vm.prank(user1);
        faucet.requestTokens();

        assertTrue(
            faucet.requestedAddress(user1),
            "User should be marked as requested"
        );
        assertEq(
            token.balanceOf(user1),
            initialBalance + 100,
            "User should receive 100 tokens"
        );
    }

    /// @dev 测试重复请求失败
    function test_SecondRequestShouldFail() public {
        vm.prank(user1);
        faucet.requestTokens();

        vm.prank(user1);
        vm.expectRevert("Can't  Request Multiple Times!");
        faucet.requestTokens();
    }

    /// @dev 测试水龙头空置时请求失败
    function test_RequestWhenEmptyShouldFail() public {
        address faucetAddress = address(faucet);
        uint256 faucetBalance = token.balanceOf(faucetAddress);

        vm.prank(faucetAddress);
        token.transfer(address(0xdead), faucetBalance);

        vm.prank(user1);
        vm.expectRevert("Faucet Empty!");
        faucet.requestTokens();
    }

    /// @dev 测试边界情况 - 余额刚好为100
    function test_ExactBalance() public {
        address faucetAddress = address(faucet);
        uint256 currentBalance = token.balanceOf(faucetAddress);

        if (currentBalance > 100) {
            vm.prank(faucetAddress);
            token.transfer(address(0xdead), currentBalance - 100);
        }

        assertEq(
            token.balanceOf(faucetAddress),
            100,
            "Faucet should have exactly 100 tokens"
        );

        vm.prank(user1);
        faucet.requestTokens();

        assertTrue(
            faucet.requestedAddress(user1),
            "User should be marked as requested"
        );
    }

    /// @dev 测试边界情况 - 余额刚好为99
    function test_Balance99ShouldFail() public {
        address faucetAddress = address(faucet);
        uint256 currentBalance = token.balanceOf(faucetAddress);

        if (currentBalance > 99) {
            vm.prank(faucetAddress);
            token.transfer(address(0xdead), currentBalance - 99);
        }

        assertEq(
            token.balanceOf(faucetAddress),
            99,
            "Faucet should have exactly 99 tokens"
        );

        vm.prank(user1);
        vm.expectRevert("Faucet Empty!");
        faucet.requestTokens();
    }

    /// @dev 测试边界情况 - 余额为101
    function test_Balance101ShouldSuccess() public {
        address faucetAddress = address(faucet);
        uint256 currentBalance = token.balanceOf(faucetAddress);

        // 如果当前余额大于101，则转出多余的代币
        if (currentBalance > 101) {
            vm.prank(faucetAddress);
            token.transfer(address(0xdead), currentBalance - 101);
        } else if (currentBalance < 101) {
            // 如果当前余额小于101，则铸造不足的代币
            token.mint(faucetAddress, 101 - currentBalance);
        }

        assertEq(
            token.balanceOf(faucetAddress),
            101,
            "Faucet should have exactly 101 tokens"
        );

        vm.prank(user1);
        faucet.requestTokens();

        assertTrue(
            faucet.requestedAddress(user1),
            "User should be marked as requested"
        );
    }

    /// @dev 测试多个用户可分别请求
    function test_MultipleUsersCanRequest() public {
        vm.prank(user1);
        faucet.requestTokens();

        vm.prank(user2);
        faucet.requestTokens();

        vm.prank(user3);
        faucet.requestTokens();

        assertTrue(
            faucet.requestedAddress(user1),
            "User1 should be marked as requested"
        );
        assertTrue(
            faucet.requestedAddress(user2),
            "User2 should be marked as requested"
        );
        assertTrue(
            faucet.requestedAddress(user3),
            "User3 should be marked as requested"
        );
    }
}
