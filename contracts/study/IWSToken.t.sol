// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IWSToken} from "./IWSToken.sol";
import {ERC1967Proxy} from "./ERC1967Proxy.sol"; // 使用你的重新导出版本

/// @title IWSToken合约测试
contract IWSTokenTest is Test {
    IWSToken public token;
    address public owner = makeAddr("owner");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    uint256 constant INITIAL_SUPPLY = 1000 ether;
    string constant TOKEN_NAME = "IWS Token";
    string constant TOKEN_SYMBOL = "IWS";
    uint8 constant DECIMALS = 18;

    function setUp() public {
        vm.startPrank(owner);

        // 部署逻辑合约
        IWSToken implementation = new IWSToken();

        // 编码初始化数据
        bytes memory initData = abi.encodeWithSelector(
            IWSToken.initialize.selector,
            TOKEN_NAME,
            TOKEN_SYMBOL,
            DECIMALS,
            INITIAL_SUPPLY,
            owner
        );

        // 部署代理合约
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );

        // 通过代理创建token实例
        token = IWSToken(payable(address(proxy)));

        vm.stopPrank();
    }

    function test_Initialization() public view {
        assertEq(token.name(), TOKEN_NAME);
        assertEq(token.symbol(), TOKEN_SYMBOL);
        assertEq(token.decimals(), DECIMALS);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY);
        assertEq(token.owner(), owner);
    }

    function test_Transfer() public {
        vm.prank(owner);
        token.transfer(user1, 100 ether);

        assertEq(token.balanceOf(user1), 100 ether);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - 100 ether);
    }

    function test_TransferRevertWhenPaused() public {
        vm.prank(owner);
        token.pause();

        vm.prank(owner);
        vm.expectRevert("Pausable: paused");
        token.transfer(user1, 100 ether);
    }

    function test_MintOnlyOwner() public {
        vm.prank(owner);
        token.mint(user1, 500 ether);

        assertEq(token.balanceOf(user1), 500 ether);

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        token.mint(user2, 100 ether);
    }

    function test_Burn() public {
        uint256 initialBalance = token.balanceOf(owner);
        uint256 burnAmount = 100 ether;

        vm.prank(owner);
        token.burn(burnAmount);

        assertEq(token.balanceOf(owner), initialBalance - burnAmount);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - burnAmount);
    }

    function test_BatchTransfer() public {
        address[] memory recipients = new address[](2);
        recipients[0] = user1;
        recipients[1] = user2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;

        vm.prank(owner);
        token.batchTransfer(recipients, amounts);

        assertEq(token.balanceOf(user1), 100 ether);
        assertEq(token.balanceOf(user2), 200 ether);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - 300 ether);
    }

    function test_Blacklist() public {
        vm.prank(owner);
        token.addToBlacklist(user1);

        assertTrue(token.isBlacklisted(user1));

        vm.prank(owner);
        token.removeFromBlacklist(user1);

        assertFalse(token.isBlacklisted(user1));
    }

    function test_TransferRevertWhenBlacklisted() public {
        vm.prank(owner);
        token.addToBlacklist(user1);

        vm.prank(owner);
        vm.expectRevert("Blacklisted address");
        token.transfer(user1, 100 ether);

        vm.prank(user1);
        vm.expectRevert("Blacklisted address");
        token.transfer(user2, 50 ether);
    }

    function test_PauseUnpauseOnlyOwner() public {
        vm.prank(owner);
        token.pause();

        vm.prank(owner);
        vm.expectRevert("Pausable: paused");
        token.transfer(user1, 100 ether);

        vm.prank(owner);
        token.unpause();

        vm.prank(owner);
        token.transfer(user1, 100 ether);

        vm.prank(user1);
        vm.expectRevert("Ownable: caller is not the owner");
        token.pause();
    }

    function test_WithdrawETH() public {
        vm.deal(address(token), 1 ether);

        uint256 initialOwnerBalance = owner.balance;

        vm.prank(owner);
        token.withdrawETH(payable(owner));

        assertEq(owner.balance, initialOwnerBalance + 1 ether);
        assertEq(address(token).balance, 0);
    }
}
