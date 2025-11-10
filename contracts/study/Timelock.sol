// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Timelock {
    // 状态变量
    address public admin;
    uint public constant GRACE_PERIOD = 7 days;
    uint public delay;
    mapping(bytes32 => bool) public queuedTransactions; // txHash到bool，标记交易是否在等待执行期间

    // 事件
    // 交易取消事件
    event CancelTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint value,
        string signature,
        bytes data,
        uint executeTime
    );
    // 交易执行事件
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint value,
        string signature,
        bytes data,
        uint executeTime
    );
    // 交易创建并进入等待期的事件
    event QueueTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint value,
        string signature,
        bytes data,
        uint executeTime
    );
    // 修改管理员地址的事件
    event NewAdmin(address indexed newAdmin);

    // ============ 错误定义 ============
    error CallerNotAdmin();
    error CallerNotTimelock();
    error InsufficientDelay(uint256 executeTime, uint256 requiredTime);
    error TransactionNotQueued(bytes32 txHash);
    error TransactionNotReady(uint256 currentTime, uint256 executeTime);
    error TransactionStale(uint256 currentTime, uint256 expiryTime);
    error TransactionExecutionFailed();

    // onlyOwner modifier
    modifier onlyOwner() {
        if (msg.sender != admin) {
            revert CallerNotAdmin();
        }
        _;
    }

    // onlyTimelock modifier
    modifier onlyTimelock() {
        if (msg.sender != address(this)) {
            revert CallerNotTimelock();
        }
        _;
    }

    constructor(uint _delay) {
        delay = _delay;
        admin = msg.sender;
    }

    function changeAdmin(address newAdmin) public onlyTimelock {
        admin = newAdmin;
        emit NewAdmin(newAdmin);
    }

    /**
     * @dev 创建交易并标记等待执行
     * @param target: 目标地址
     * @param value: 发送 eth 数额
     * @param signature: 要调用的函数签名（function signature)
     * @param data: call data,里面是一些参数
     * @param executeTime: 交易执行的区块链时间戳
     *
     * 要求：executeTime 大于当前区块链时间戳+delay
     */
    function queueTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executeTime
    ) public onlyOwner returns (bytes32) {
        // 检查：交易执行时间晚于当前区块链时间
        if (executeTime < getBlockTimestamp() + delay) {
            revert InsufficientDelay(executeTime, getBlockTimestamp() + delay);
        }

        // 计算交易唯一识别符
        bytes32 txHash = getTxHash(target, value, signature, data, executeTime);
        // 标记交易等待执行
        queuedTransactions[txHash] = true;

        emit QueueTransaction(
            txHash,
            target,
            value,
            signature,
            data,
            executeTime
        );
        return txHash;
    }

    /**
     * @dev 取消特定交易。
     *
     * 要求：交易正等待执行
     */
    function cancelTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executeTime
    ) public onlyOwner {
        bytes32 txHash = getTxHash(target, value, signature, data, executeTime);
        if (!queuedTransactions[txHash]) {
            revert TransactionNotQueued(txHash);
        }
        // 标记交易不再等待执行
        queuedTransactions[txHash] = false;

        emit CancelTransaction(
            txHash,
            target,
            value,
            signature,
            data,
            executeTime
        );
    }

    /**
     * @dev 执行特定交易。
     *
     * 要求：
     * 1. 交易等待执行中
     * 2. 达到交易的执行时间
     * 3. 交易没过期
     */
    function executeTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executeTime
    ) public payable onlyOwner returns (bytes memory) {
        bytes32 txHash = getTxHash(target, value, signature, data, executeTime);
        // 检查：交易等待执行中
        if (!queuedTransactions[txHash]) {
            revert TransactionNotQueued(txHash);
        }
        // 检查：交易达到执行时间
        if (getBlockTimestamp() < executeTime) {
            revert TransactionNotReady(getBlockTimestamp(), executeTime);
        }

        if (getBlockTimestamp() > executeTime + GRACE_PERIOD) {
            revert TransactionStale(
                getBlockTimestamp(),
                executeTime + GRACE_PERIOD
            );
        }
        // 检查：交易没过期
        require(
            getBlockTimestamp() <= executeTime + GRACE_PERIOD,
            "Timelock::executeTransaction: Transaction is stale."
        );
        // 将交易移出队列
        queuedTransactions[txHash] = false;

        // 获取call data
        bytes memory callData;
        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            // 这里如果采用encodeWithSignature的编码方式来实现调用管理员的函数，请将参数data的类型改为address。不然会导致管理员的值变为类似"0x0000000000000000000000000000000000000020"的值。其中的0x20是代表字节数组长度的意思.
            callData = abi.encodePacked(
                bytes4(keccak256(bytes(signature))),
                data
            );
        }
        // 利用call执行交易
        (bool success, bytes memory returnData) = target.call{value: value}(
            callData
        );

        if (!success) {
            revert TransactionExecutionFailed();
        }

        emit ExecuteTransaction(
            txHash,
            target,
            value,
            signature,
            data,
            executeTime
        );

        return returnData;
    }

    /**
     * @dev 获取当前区块链时间戳
     */
    function getBlockTimestamp() public view returns (uint) {
        return block.timestamp;
    }

    /**
     * @dev 将一堆东西拼成交易的标识符
     */
    function getTxHash(
        address target,
        uint value,
        string memory signature,
        bytes memory data,
        uint executeTime
    ) public pure returns (bytes32) {
        return
            keccak256(abi.encode(target, value, signature, data, executeTime));
    }
}

// 情况2：没有函数签名 (signature 为空)
// 1. 简单的ETH转账到普通地址
// queueTransaction(
//     recipient,          // 目标地址
//     1 ether,            // 转账金额
//     "",                 // 空签名
//     "",                 // 空数据
//     executeTime
// );

// 2. 调用合约的receive()或fallback()函数
// queueTransaction(
//     contractAddress,    // 合约地址
//     1 ether,            // 转账金额
//     "",                 // 空签名
//     someData,           // 传给fallback函数的数据
//     executeTime
// );

// 3. 调用无参数的函数（但通常还是有签名更好）

// 情况2：有函数签名
// 1. 调用ERC20转账
// queueTransaction(
//     tokenAddress,                           // 代币合约
//     0,                                      // 不转ETH
//     "transfer(address,uint256)",            // 函数签名
//     abi.encode(recipient, amount),          // 参数编码
//     executeTime
// );

// 2. 调用治理合约投票
// queueTransaction(
//     governorAddress,                        // 治理合约
//     0,                                      // 不转ETH
//     "castVote(uint256,uint8)",              // 函数签名
//     abi.encode(proposalId, support),        // 参数编码
//     executeTime
// );

// 3. 升级合约实现
// queueTransaction(
//     proxyAdminAddress,                      // 代理管理合约
//     0,                                      // 不转ETH
//     "upgrade(address,address)",             // 函数签名
//     abi.encode(proxyAddress, newImpl),      // 参数编码
//     executeTime
// );

// 决策指南
// 使用空签名的场景：
// 简单ETH转账到EOA地址

// 触发fallback/receive函数

// 调用未知接口的合约

// 使用函数签名的场景：
// 调用具体命名函数

// 需要传递参数的操作

// 与标准合约交互（ERC20、ERC721等）

// 实际例子对比
