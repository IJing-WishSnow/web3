// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "./JobOne.sol";

contract JobOneTest is Test {
    JobOne public jobOne;
    address public owner = address(0x123);
    address public user1 = address(0x456);
    address public user2 = address(0x789);
    address public candidate1 = address(0x111);
    address public candidate2 = address(0x222);
    address public candidate3 = address(0x333);

    function setUp() public {
        vm.prank(owner);
        jobOne = new JobOne();
    }

    // 测试构造函数
    function testConstructor() public {
        assertEq(jobOne.owner(), owner);
    }

    // 测试投票功能
    function testVote() public {
        vm.prank(user1);
        jobOne.vote(candidate1);

        assertEq(jobOne.getCandidateVotes(candidate1), 1);
        assertEq(jobOne.getCandidateCount(), 1);
    }

    // 测试多次投票给同一个候选人
    function testMultipleVotes() public {
        vm.prank(user1);
        jobOne.vote(candidate1);

        vm.prank(user2);
        jobOne.vote(candidate1);

        assertEq(jobOne.getCandidateVotes(candidate1), 2);
        assertEq(jobOne.getCandidateCount(), 1);
    }

    // 测试投票给多个候选人
    function testVoteMultipleCandidates() public {
        vm.prank(user1);
        jobOne.vote(candidate1);

        vm.prank(user1);
        jobOne.vote(candidate2);

        assertEq(jobOne.getCandidateVotes(candidate1), 1);
        assertEq(jobOne.getCandidateVotes(candidate2), 1);
        assertEq(jobOne.getCandidateCount(), 2);
    }

    // 测试重置投票 - 只有owner可以调用
    function testResetVotes() public {
        // 先投一些票
        vm.prank(user1);
        jobOne.vote(candidate1);

        vm.prank(user2);
        jobOne.vote(candidate2);

        // 确认投票存在
        assertEq(jobOne.getCandidateCount(), 2);

        // 只有owner可以重置
        vm.prank(owner);
        jobOne.resetVotes();

        // 确认投票被重置
        assertEq(jobOne.getCandidateCount(), 0);
        assertEq(jobOne.getCandidateVotes(candidate1), 0);
        assertEq(jobOne.getCandidateVotes(candidate2), 0);
    }

    // 测试非owner不能重置投票
    function testResetVotesNotOwner() public {
        vm.prank(user1);
        jobOne.vote(candidate1);

        // 非owner尝试重置应该失败
        vm.prank(user1);
        vm.expectRevert("Only owner can call this function");
        jobOne.resetVotes();
    }

    // 测试字符串反转
    function testReverseString() public {
        string memory result = jobOne.reverseString("abcde");
        assertEq(result, "edcba");

        result = jobOne.reverseString("hello");
        assertEq(result, "olleh");

        result = jobOne.reverseString("");
        assertEq(result, "");

        result = jobOne.reverseString("a");
        assertEq(result, "a");
    }

    // 测试整数转罗马数字
    function testInt2Roman() public {
        // 测试基本数字
        assertEq(jobOne.int2Roman(1), "I");
        assertEq(jobOne.int2Roman(4), "IV");
        assertEq(jobOne.int2Roman(9), "IX");
        assertEq(jobOne.int2Roman(58), "LVIII");
        assertEq(jobOne.int2Roman(1994), "MCMXCIV");

        // 测试边界情况
        assertEq(jobOne.int2Roman(0), "");
        assertEq(jobOne.int2Roman(4000), "");
    }

    // 测试罗马数字转整数
    function testRoman2Int() public {
        // 测试基本数字
        assertEq(jobOne.roman2Int("I"), 1);
        assertEq(jobOne.roman2Int("IV"), 4);
        assertEq(jobOne.roman2Int("IX"), 9);
        assertEq(jobOne.roman2Int("LVIII"), 58);
        assertEq(jobOne.roman2Int("MCMXCIV"), 1994);

        // 测试减法规则
        assertEq(jobOne.roman2Int("CM"), 900);
        assertEq(jobOne.roman2Int("CD"), 400);
        assertEq(jobOne.roman2Int("XC"), 90);
        assertEq(jobOne.roman2Int("XL"), 40);
    }

    // 测试罗马数字和整数的双向转换
    function testRomanIntRoundTrip() public {
        // 测试一些数字的双向转换
        int16[] memory testNumbers = new int16[](6);
        testNumbers[0] = 1;
        testNumbers[1] = 4;
        testNumbers[2] = 9;
        testNumbers[3] = 49;
        testNumbers[4] = 99;
        testNumbers[5] = 499;

        for (uint i = 0; i < testNumbers.length; i++) {
            string memory roman = jobOne.int2Roman(testNumbers[i]);
            int16 convertedBack = jobOne.roman2Int(roman);
            assertEq(convertedBack, testNumbers[i]);
        }
    }

    // 测试合并有序数组
    function testMergeSortedArrays() public {
        uint256[] memory arr1 = new uint256[](3);
        arr1[0] = 1;
        arr1[1] = 3;
        arr1[2] = 5;

        uint256[] memory arr2 = new uint256[](3);
        arr2[0] = 2;
        arr2[1] = 4;
        arr2[2] = 6;

        uint256[] memory result = jobOne.mergeSortedArrays(arr1, arr2);

        uint256[] memory expected = new uint256[](6);
        expected[0] = 1;
        expected[1] = 2;
        expected[2] = 3;
        expected[3] = 4;
        expected[4] = 5;
        expected[5] = 6;

        for (uint i = 0; i < expected.length; i++) {
            assertEq(result[i], expected[i]);
        }
    }

    // 测试合并空数组
    function testMergeEmptyArrays() public {
        uint256[] memory empty = new uint256[](0);
        uint256[] memory arr = new uint256[](2);
        arr[0] = 1;
        arr[1] = 2;

        uint256[] memory result1 = jobOne.mergeSortedArrays(empty, arr);
        assertEq(result1.length, 2);
        assertEq(result1[0], 1);
        assertEq(result1[1], 2);

        uint256[] memory result2 = jobOne.mergeSortedArrays(arr, empty);
        assertEq(result2.length, 2);
        assertEq(result2[0], 1);
        assertEq(result2[1], 2);

        uint256[] memory result3 = jobOne.mergeSortedArrays(empty, empty);
        assertEq(result3.length, 0);
    }

    // 测试二分查找
    function testBinarySearch() public {
        uint256[] memory arr = new uint256[](5);
        arr[0] = 1;
        arr[1] = 3;
        arr[2] = 5;
        arr[3] = 7;
        arr[4] = 9;

        // 测试找到的情况
        assertEq(jobOne.binarySearch(arr, 1), 0);
        assertEq(jobOne.binarySearch(arr, 5), 2);
        assertEq(jobOne.binarySearch(arr, 9), 4);

        // 测试找不到的情况
        assertEq(jobOne.binarySearch(arr, 0), -1);
        assertEq(jobOne.binarySearch(arr, 4), -1);
        assertEq(jobOne.binarySearch(arr, 10), -1);
    }

    // 测试二分查找空数组
    function testBinarySearchEmptyArray() public {
        uint256[] memory empty = new uint256[](0);
        assertEq(jobOne.binarySearch(empty, 1), -1);
    }

    // 测试候选人列表管理
    function testCandidateListManagement() public {
        // 投票给三个候选人
        vm.prank(user1);
        jobOne.vote(candidate1);

        vm.prank(user2);
        jobOne.vote(candidate2);

        vm.prank(user1);
        jobOne.vote(candidate3);

        // 验证候选人数量
        assertEq(jobOne.getCandidateCount(), 3);

        // 验证每个候选人的票数
        assertEq(jobOne.getCandidateVotes(candidate1), 1);
        assertEq(jobOne.getCandidateVotes(candidate2), 1);
        assertEq(jobOne.getCandidateVotes(candidate3), 1);
    }
}
