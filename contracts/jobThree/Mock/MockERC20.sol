// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @notice Mock ERC20 token for testing purposes
 * @dev Enhanced version that combines simple implementation with OpenZeppelin standard
 */
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    // 不需要重新声明 balanceOf 和 allowance，因为父合约中已经存在
    // 我们通过重写函数来提供兼容性

    /**
     * @notice Constructor to initialize the mock token
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals_ Number of decimals (e.g., 6 for USDC, 8 for WBTC, 18 for standard)
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    /**
     * @notice Override decimals function to return custom decimals
     * @return Number of decimals for this token
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint tokens to an address
     * @dev No access control - anyone can mint in tests
     * @param to Address to receive tokens
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from an address
     * @dev No access control - anyone can burn in tests
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }

    /**
     * @notice 兼容性函数：提供类似前者的 balanceOf 映射访问
     * @dev 重写 balanceOf 函数来提供映射式访问
     * @param account 账户地址
     * @return 账户余额
     */
    function balanceOf(
        address account
    ) public view virtual override returns (uint256) {
        return super.balanceOf(account);
    }

    /**
     * @notice 兼容性函数：提供类似前者的 allowance 映射访问
     * @dev 重写 allowance 函数来提供映射式访问
     * @param owner 所有者地址
     * @param spender 授权者地址
     * @return 授权额度
     */
    function allowance(
        address owner,
        address spender
    ) public view virtual override returns (uint256) {
        return super.allowance(owner, spender);
    }

    /**
     * @notice 直接设置余额（用于特殊测试场景）
     * @dev 这个函数允许直接修改余额，仅用于测试特殊情况
     * @param account 账户地址
     * @param amount 新的余额数量
     */
    function setBalance(address account, uint256 amount) external {
        // 为了直接设置余额，我们需要先清空当前余额，然后铸造新的余额
        uint256 currentBalance = balanceOf(account);
        if (currentBalance > amount) {
            _burn(account, currentBalance - amount);
        } else if (amount > currentBalance) {
            _mint(account, amount - currentBalance);
        }
    }

    /**
     * @notice 直接设置授权额度（用于特殊测试场景）
     * @dev 这个函数允许直接设置授权，仅用于测试特殊情况
     * @param owner 所有者地址
     * @param spender 授权者地址
     * @param amount 授权额度
     */
    function setAllowance(
        address owner,
        address spender,
        uint256 amount
    ) external {
        _approve(owner, spender, amount);
    }
}
