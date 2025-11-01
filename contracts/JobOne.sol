// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract JobOne {
    address public owner;
    mapping(address => uint256) public votes;
    address[] public candidates;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    // 允许用户投票给某个候选人
    function vote(address candidate) public {
        // 如果是第一次给这个候选人投票，添加到候选人列表
        if (votes[candidate] == 0) {
            candidates.push(candidate);
        }
        votes[candidate] += 1;
    }

    // 返回某个候选人得票数
    function getCandidateVotes(address candidate) public view returns (uint256) {
        return votes[candidate];
    }

    // 重置所有候选人得票数
    function resetVotes() public onlyOwner {
        // 遍历所有候选人，逐个重置他们的票数
        for (uint i = 0; i < candidates.length; i++) {
            delete votes[candidates[i]];
        }
        // 清空候选人列表
        delete candidates;
    }
    
    // 获取候选人数量
    function getCandidateCount() public view returns (uint256) {
        return candidates.length;
    }

    // 反转一个字符串。输入 "abcde"，输出 "edcba"
    function reverseString(string memory _str) public pure returns (string memory) {
        bytes memory strBytes = bytes(_str);
        bytes memory reversed = new bytes(strBytes.length);
        
        for (uint i = 0; i < strBytes.length; i++) {
            reversed[i] = strBytes[strBytes.length - 1 - i];
        }
        
        return string(reversed);
    }
    // 整数转罗马数字
    function int2Roman(int256 num) public pure returns (string memory) {
        if (num == 0 || num >= 4000) {
            return ""; // 罗马数字不表示0和4000以上的数字（标准表示法）
        }

        string[4] memory thousands = ["", "M", "MM", "MMM"];
        string[10] memory hundreds = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"];
        string[10] memory tens = ["", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"];
        string[10] memory ones = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
        
        string memory thousandsStr = thousands[uint256(num) / 1000];
        string memory hundredsStr = hundreds[(uint256(num) % 1000) / 100];
        string memory tensStr = tens[(uint256(num) % 100) / 10];
        string memory onesStr = ones[uint256(num) % 10];

        return string(abi.encodePacked(thousandsStr, hundredsStr, tensStr, onesStr));
    }

    // 罗马数字转整数
    function roman2Int(string memory roman) public pure returns (int16 num) {
        bytes memory romanBytes = bytes(roman);
        uint16 total = 0;
        
        for (uint256 i = 0; i < romanBytes.length; i++) {
            uint16 current = getRomanValue(romanBytes[i]);
            uint16 next = (i + 1 < romanBytes.length) ? getRomanValue(romanBytes[i + 1]) : 0;
            
            // 如果当前字符小于下一个字符，表示减法规则
            if (current < next) {
                total += (next - current);
                i++; // 跳过下一个字符
            } else {
                total += current;
            }
        }
        
        return int16(total);
    }

    function getRomanValue(bytes1 romanChar) private pure returns (uint16) {
        if (romanChar == 'I') return 1;
        if (romanChar == 'V') return 5;
        if (romanChar == 'X') return 10;
        if (romanChar == 'L') return 50;
        if (romanChar == 'C') return 100;
        if (romanChar == 'D') return 500;
        if (romanChar == 'M') return 1000;
        return 0; // 无效字符
    }

    // 合并两个有序数组
    function mergeSortedArrays(uint256[] memory arr1, uint256[] memory arr2) public pure returns (uint256[] memory) {
        uint256 len1 = arr1.length;
        uint256 len2 = arr2.length;
        uint256[] memory result = new uint256[](len1 + len2);
        
        uint256 i = 0; // arr1 的指针
        uint256 j = 0; // arr2 的指针
        uint256 k = 0; // result 的指针
        
        // 同时遍历两个数组，比较元素并选择较小的放入结果
        while (i < len1 && j < len2) {
            if (arr1[i] <= arr2[j]) {
                result[k] = arr1[i];
                i++;
            } else {
                result[k] = arr2[j];
                j++;
            }
            k++;
        }
        
        // 如果 arr1 还有剩余元素，全部添加到结果
        while (i < len1) {
            result[k] = arr1[i];
            i++;
            k++;
        }
        
        // 如果 arr2 还有剩余元素，全部添加到结果
        while (j < len2) {
            result[k] = arr2[j];
            j++;
            k++;
        }
        
        return result;
    }

    // 二分查找
    function binarySearch(uint256[] memory arr, uint256 target) public pure returns (int256) {
        uint256 left = 0;
        uint256 right = arr.length;
        
        while (left < right) {
            uint256 mid = left + (right - left) / 2;
            
            if (arr[mid] == target) {
                return int256(mid); // 找到目标，返回索引
            } else if (arr[mid] < target) {
                left = mid + 1; // 目标在右半部分
            } else {
                right = mid; // 目标在左半部分
            }
        }
        
        return -1; // 未找到目标
    }
}