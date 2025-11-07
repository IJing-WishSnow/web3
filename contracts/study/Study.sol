// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISTUDY} from "./IStudy.sol";

contract Study is ISTUDY {
    constructor() {
        emit Study(msg.sender, msg.sender, 0);
        emit Study(msg.sender, msg.sender, 6);
    }
}
