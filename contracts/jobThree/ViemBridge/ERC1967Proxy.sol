// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy as OZProxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// 重新导出代理合约，这样 Hardhat 会生成 artifact
contract ERC1967Proxy is OZProxy {
    constructor(address _logic, bytes memory _data) OZProxy(_logic, _data) {}
}
