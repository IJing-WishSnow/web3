// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title SimpleERC20
 * @author wishsnow
 * @dev 一个简单的 ERC20 代币实现，包含增发功能
 */

contract SimpleERC20 {
    // 代币基本信息
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    // 合约所有者
    address public owner;

    // 余额映射
    mapping(address => uint256) private _balances;

    // 授权映射 (owner => (spender => amount))
    mapping(address => mapping(address => uint256)) private _allowances;

    // 事件定义
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event Mint(address indexed to, uint256 value);

    // 修饰器：只有所有者可以调用
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /**
     * @dev 构造函数，初始化代币
     * @param _name 代币名称
     * @param _symbol 代币符号
     * @param _decimals 小数位数
     * @param _initialSupply 初始供应量
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;

        // 将初始供应量分配给合约部署者
        _mint(msg.sender, _initialSupply * (10 ** decimals));
    }

    /**
     * @dev 查询账户余额
     * @param account 要查询的账户地址
     * @return 账户余额
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev 转账函数
     * @param to 接收方地址
     * @param value 转账金额
     * @return 是否成功
     */
    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    /**
     * @dev 授权函数
     * @param spender 被授权方地址
     * @param value 授权金额
     * @return 是否成功
     */
    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    /**
     * @dev 查询授权额度
     * @param _owner 授权方地址
     * @param _spender 被授权方地址
     * @return 剩余授权额度
     */
    function allowance(
        address _owner,
        address _spender
    ) external view returns (uint256) {
        return _allowances[_owner][_spender];
    }

    /**
     * @dev 代扣转账函数
     * @param from 扣款方地址
     * @param to 接收方地址
     * @param value 转账金额
     * @return 是否成功
     */
    function transfrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(
            currentAllowance >= value,
            "ERC20: transfer amount exceeds allowance"
        );

        unchecked {
            _approve(from, msg.sender, currentAllowance - value);
        }

        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev 增发代币函数（仅所有者可调用）
     * @param to 接收增发代币的地址
     * @param value 增发金额
     */
    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }

    /**
     * @dev 内部转账函数
     */
    function _transfer(address from, address to, uint256 value) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(
            _balances[from] >= value,
            "ERC20: transfer amount exceeds balance"
        );

        unchecked {
            _balances[from] -= value;
            _balances[to] += value;
        }

        emit Transfer(from, to, value);
    }

    /**
     * @dev 内部授权函数
     */
    function _approve(address _owner, address spender, uint256 value) internal {
        require(_owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    /**
     * @dev 内部增发函数
     */
    function _mint(address to, uint256 value) internal {
        require(to != address(0), "ERC20: mint to the zero address");

        totalSupply += value;
        unchecked {
            _balances[to] += value;
        }

        emit Transfer(address(0), to, value);
        emit Mint(to, value);
    }

    /**
     * @dev 转移合约所有权
     * @param newOwner 新的所有者地址
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        owner = newOwner;
    }
}
