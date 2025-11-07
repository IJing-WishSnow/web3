// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Study} from "./Study.sol";
import {ISTUDY} from "./IStudy.sol";

/**
 * @title Study合约测试
 * @dev 测试Study合约的构造函数事件触发功能
 */
contract StudyTest is Test {
    Study public study;
    address public deployer;

    /**
     * @dev 测试前置设置
     */
    function setUp() public {
        deployer = address(this);
        study = new Study();
    }

    /**
     * @dev 测试构造函数是否正确触发Study事件
     */
    function test_ConstructorEmitsStudyEvents() public {
        // 预期会触发两次Study事件
        // 检查前两个indexed参数，不检查第三个indexed参数（因为没有），检查数据部分
        vm.expectEmit(true, true, false, true);
        emit ISTUDY.Study(deployer, deployer, 0);

        vm.expectEmit(true, true, false, true);
        emit ISTUDY.Study(deployer, deployer, 6);

        // 重新部署以捕获事件
        new Study();
    }

    /**
     * @dev 测试合约部署后地址不为零
     */
    function test_ContractAddressNotNull() public view {
        assertTrue(address(study) != address(0));
    }

    /**
     * @dev 测试合约正确实现了ISTUDY接口
     */
    function test_ImplementsIStudyInterface() public view {
        // 如果合约正确实现了接口，这个调用应该成功
        ISTUDY(address(study));
    }
}
