// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Airdrop {
    mapping(address => uint) failTransferList;

    error AddressesAmountsMismatch();
    error InsufficientAllowance();
    error IncorrectEtherValue();

    error NotInFailedList();
    error WithdrawFailed();

    function multiTransferToken(
        address _token,
        address[] calldata _addresses,
        uint256[] calldata _amounts
    ) external {
        if (_addresses.length != _amounts.length) {
            revert AddressesAmountsMismatch();
        }
        IERC20 token = IERC20(_token);
        uint _amountSum = getSum(_amounts);

        if (token.allowance(msg.sender, address(this)) <= _amountSum) {
            revert InsufficientAllowance();
        }

        for (uint256 i; i < _addresses.length; i++) {
            token.transferFrom(msg.sender, _addresses[i], _amounts[i]);
        }
    }

    function mutilTransferEth(
        address payable[] calldata _addresses,
        uint256[] calldata _amounts
    ) public payable {
        if (_addresses.length != _amounts.length) {
            revert AddressesAmountsMismatch();
        }

        uint _amountSum = getSum(_amounts);
        if (msg.value != _amountSum) {
            revert IncorrectEtherValue();
        }

        for (uint256 i = 0; i < _addresses.length; i++) {
            (bool success, ) = _addresses[i].call{value: _amounts[i]}("");
            if (!success) {
                failTransferList[_addresses[i]] = _amounts[i];
            }
        }
    }

    // 给空投失败提供主动操作机会
    function withdrawFromFailList(address _to) public {
        uint failAmount = failTransferList[msg.sender];
        if (failAmount <= 0) {
            revert NotInFailedList();
        }

        failTransferList[msg.sender] = 0;
        if (failAmount <= 0) {
            revert NotInFailedList();
        }
        (bool success, ) = _to.call{value: failAmount}("");
        if (!success) revert WithdrawFailed();
    }

    function getSum(uint256[] calldata _arr) public pure returns (uint sum) {
        for (uint i = 0; i < _arr.length; i++) sum = sum + _arr[i];
    }
}
