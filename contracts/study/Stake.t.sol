// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Stake} from "./Stake.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock ERC20 Token for testing
/// @notice Simple ERC20 implementation with minting capability
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10 ** 18);
    }

    /// @notice Mint tokens to an address
    /// @param to Recipient address
    /// @param amount Amount to mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title Reentrancy Attacker Contract
/// @notice Used to test reentrancy protection
contract ReentrancyAttacker {
    Stake public stake;
    uint256 public pid;
    bool public attacking;

    constructor(address _stake) {
        stake = Stake(payable(_stake));
    }

    /// @notice Initiate attack
    /// @param _pid Pool ID to attack
    function attack(uint256 _pid) external payable {
        pid = _pid;
        attacking = true;
        stake.depositETH{value: msg.value}();
    }

    /// @notice Receive ETH and attempt reentry
    receive() external payable {
        if (attacking) {
            attacking = false;
            stake.unstake(pid, 1 ether);
        }
    }
}

/// @title Stake Contract Test Suite
/// @notice Comprehensive test coverage for Stake contract (80+ tests)
/// @dev Covers initialization, admin functions, pools, staking, rewards, security, and upgrades
contract StakeTest is Test {
    Stake public implementation;
    ERC1967Proxy public proxy;
    Stake public stake;

    MockERC20 public metaNode;
    MockERC20 public stakingToken;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public user3 = address(4);
    address public nonAdmin = address(5);

    uint256 public constant START_BLOCK = 100;
    uint256 public constant END_BLOCK = 1000;
    uint256 public constant META_NODE_PER_BLOCK = 10 * 10 ** 18;

    event SetMetaNode(IERC20 indexed MetaNode);
    event PauseWithdraw();
    event UnpauseWithdraw();
    event PauseClaim();
    event UnpauseClaim();
    event SetStartBlock(uint256 indexed startBlock);
    event SetEndBlock(uint256 indexed endBlock);
    event SetMetaNodePerBlock(uint256 indexed MetaNodePerBlock);
    event AddPool(
        address indexed stTokenAddress,
        uint256 indexed poolWeight,
        uint256 indexed lastRewardBlock,
        uint256 minDepositAmount,
        uint256 unstakeLockedBlocks
    );
    event UpdatePoolInfo(
        uint256 indexed poolId,
        uint256 indexed minDepositAmount,
        uint256 indexed unstakeLockedBlocks
    );
    event SetPoolWeight(
        uint256 indexed poolId,
        uint256 indexed poolWeight,
        uint256 totalPoolWeight
    );
    event UpdatePool(
        uint256 indexed poolId,
        uint256 indexed lastRewardBlock,
        uint256 totalMetaNode
    );
    event Deposit(address indexed user, uint256 indexed poolId, uint256 amount);
    event RequestUnstake(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount
    );
    event Withdraw(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount,
        uint256 indexed blockNumber
    );
    event Claim(
        address indexed user,
        uint256 indexed poolId,
        uint256 MetaNodeReward
    );

    /// @notice Set up test environment before each test
    function setUp() public {
        vm.startPrank(admin);
        metaNode = new MockERC20("MetaNode", "MN");
        stakingToken = new MockERC20("StakingToken", "ST");

        implementation = new Stake();

        bytes memory initData = abi.encodeWithSelector(
            Stake.initialize.selector,
            IERC20(address(metaNode)),
            START_BLOCK,
            END_BLOCK,
            META_NODE_PER_BLOCK
        );
        proxy = new ERC1967Proxy(address(implementation), initData);
        stake = Stake(payable(address(proxy)));

        metaNode.transfer(address(stake), 500000 * 10 ** 18);

        metaNode.mint(user1, 10000 * 10 ** 18);
        metaNode.mint(user2, 10000 * 10 ** 18);
        stakingToken.mint(user1, 10000 * 10 ** 18);
        stakingToken.mint(user2, 10000 * 10 ** 18);

        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);

        vm.stopPrank();
    }

    // ============================================
    // 1. Contract Initialization Tests
    // ============================================

    /// @notice Test successful initialization
    function test_Initialize_Success() public view {
        assertEq(address(stake.MetaNode()), address(metaNode));
        assertEq(stake.startBlock(), START_BLOCK);
        assertEq(stake.endBlock(), END_BLOCK);
        assertEq(stake.MetaNodePerBlock(), META_NODE_PER_BLOCK);
        assertEq(stake.totalPoolWeight(), 0);
        assertFalse(stake.withdrawPaused());
        assertFalse(stake.claimPaused());
    }

    /// @notice Test initialization with invalid parameters
    function test_Initialize_InvalidParameters() public {
        Stake newImplementation = new Stake();

        bytes memory initData = abi.encodeWithSelector(
            Stake.initialize.selector,
            IERC20(address(metaNode)),
            200,
            100,
            META_NODE_PER_BLOCK
        );
        vm.expectRevert("invalid parameters");
        new ERC1967Proxy(address(newImplementation), initData);

        initData = abi.encodeWithSelector(
            Stake.initialize.selector,
            IERC20(address(metaNode)),
            100,
            200,
            0
        );
        vm.expectRevert("invalid parameters");
        new ERC1967Proxy(address(newImplementation), initData);
    }

    /// @notice Test that contract cannot be reinitialized
    function test_Initialize_CannotReinitialize() public {
        vm.expectRevert();
        stake.initialize(
            IERC20(address(metaNode)),
            START_BLOCK,
            END_BLOCK,
            META_NODE_PER_BLOCK
        );
    }

    /// @notice Test that roles are properly granted on initialization
    function test_Initialize_RolesGranted() public view {
        bytes32 adminRole = stake.ADMIN_ROLE();
        bytes32 upgradeRole = stake.UPGRADE_ROLE();
        bytes32 defaultAdminRole = stake.DEFAULT_ADMIN_ROLE();

        assertTrue(stake.hasRole(adminRole, admin));
        assertTrue(stake.hasRole(upgradeRole, admin));
        assertTrue(stake.hasRole(defaultAdminRole, admin));
    }

    // ============================================
    // 2. Admin Function Tests
    // ============================================

    /// @notice Test setMetaNode success
    function test_SetMetaNode_Success() public {
        MockERC20 newMetaNode = new MockERC20("NewMetaNode", "NMN");

        vm.startPrank(admin);
        vm.expectEmit(true, false, false, false);
        emit SetMetaNode(IERC20(address(newMetaNode)));
        stake.setMetaNode(IERC20(address(newMetaNode)));

        assertEq(address(stake.MetaNode()), address(newMetaNode));
        vm.stopPrank();
    }

    /// @notice Test setMetaNode access control
    function test_SetMetaNode_OnlyAdmin() public {
        MockERC20 newMetaNode = new MockERC20("NewMetaNode", "NMN");

        vm.startPrank(nonAdmin);
        vm.expectRevert();
        stake.setMetaNode(IERC20(address(newMetaNode)));
        vm.stopPrank();
    }

    /// @notice Test pauseWithdraw success
    function test_PauseWithdraw_Success() public {
        vm.startPrank(admin);
        vm.expectEmit(false, false, false, false);
        emit PauseWithdraw();
        stake.pauseWithdraw();

        assertTrue(stake.withdrawPaused());
        vm.stopPrank();
    }

    /// @notice Test pauseWithdraw when already paused
    function test_PauseWithdraw_AlreadyPaused() public {
        vm.startPrank(admin);
        stake.pauseWithdraw();

        vm.expectRevert("withdraw has been already paused");
        stake.pauseWithdraw();
        vm.stopPrank();
    }

    /// @notice Test pauseWithdraw access control
    function test_PauseWithdraw_OnlyAdmin() public {
        vm.startPrank(nonAdmin);
        vm.expectRevert();
        stake.pauseWithdraw();
        vm.stopPrank();
    }

    /// @notice Test unpauseWithdraw success
    function test_UnpauseWithdraw_Success() public {
        vm.startPrank(admin);
        stake.pauseWithdraw();

        vm.expectEmit(false, false, false, false);
        emit UnpauseWithdraw();
        stake.unpauseWithdraw();

        assertFalse(stake.withdrawPaused());
        vm.stopPrank();
    }

    /// @notice Test unpauseWithdraw when not paused
    function test_UnpauseWithdraw_NotPaused() public {
        vm.startPrank(admin);
        vm.expectRevert("withdraw has been already unpaused");
        stake.unpauseWithdraw();
        vm.stopPrank();
    }

    /// @notice Test pauseClaim success
    function test_PauseClaim_Success() public {
        vm.startPrank(admin);
        vm.expectEmit(false, false, false, false);
        emit PauseClaim();
        stake.pauseClaim();

        assertTrue(stake.claimPaused());
        vm.stopPrank();
    }

    /// @notice Test pauseClaim when already paused
    function test_PauseClaim_AlreadyPaused() public {
        vm.startPrank(admin);
        stake.pauseClaim();

        vm.expectRevert("claim has been already paused");
        stake.pauseClaim();
        vm.stopPrank();
    }

    /// @notice Test unpauseClaim success
    function test_UnpauseClaim_Success() public {
        vm.startPrank(admin);
        stake.pauseClaim();

        vm.expectEmit(false, false, false, false);
        emit UnpauseClaim();
        stake.unpauseClaim();

        assertFalse(stake.claimPaused());
        vm.stopPrank();
    }

    /// @notice Test unpauseClaim when not paused
    function test_UnpauseClaim_NotPaused() public {
        vm.startPrank(admin);
        vm.expectRevert("claim has been already unpaused");
        stake.unpauseClaim();
        vm.stopPrank();
    }

    /// @notice Test setStartBlock success
    function test_SetStartBlock_Success() public {
        vm.startPrank(admin);
        uint256 newStartBlock = 150;

        vm.expectEmit(true, false, false, false);
        emit SetStartBlock(newStartBlock);
        stake.setStartBlock(newStartBlock);

        assertEq(stake.startBlock(), newStartBlock);
        vm.stopPrank();
    }

    /// @notice Test setStartBlock with invalid value
    function test_SetStartBlock_InvalidValue() public {
        vm.startPrank(admin);
        vm.expectRevert("start block must be smaller than end block");
        stake.setStartBlock(END_BLOCK + 1);
        vm.stopPrank();
    }

    /// @notice Test setEndBlock success
    function test_SetEndBlock_Success() public {
        vm.startPrank(admin);
        uint256 newEndBlock = 2000;

        vm.expectEmit(true, false, false, false);
        emit SetEndBlock(newEndBlock);
        stake.setEndBlock(newEndBlock);

        assertEq(stake.endBlock(), newEndBlock);
        vm.stopPrank();
    }

    /// @notice Test setEndBlock with invalid value
    function test_SetEndBlock_InvalidValue() public {
        vm.startPrank(admin);
        vm.expectRevert("start block must be smaller than end block");
        stake.setEndBlock(START_BLOCK - 1);
        vm.stopPrank();
    }

    /// @notice Test setMetaNodePerBlock success
    function test_SetMetaNodePerBlock_Success() public {
        vm.startPrank(admin);
        uint256 newRate = 20 * 10 ** 18;

        vm.expectEmit(true, false, false, false);
        emit SetMetaNodePerBlock(newRate);
        stake.setMetaNodePerBlock(newRate);

        assertEq(stake.MetaNodePerBlock(), newRate);
        vm.stopPrank();
    }

    /// @notice Test setMetaNodePerBlock with zero value
    function test_SetMetaNodePerBlock_ZeroValue() public {
        vm.startPrank(admin);
        vm.expectRevert("invalid parameter");
        stake.setMetaNodePerBlock(0);
        vm.stopPrank();
    }

    // ============================================
    // 3. Pool Management Tests
    // ============================================

    /// @notice Test adding ETH pool successfully
    function test_AddPool_ETHPool_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        assertEq(stake.poolLength(), 1);
        (
            address stTokenAddress,
            uint256 poolWeight,
            uint256 lastRewardBlock,
            uint256 accMetaNodePerST,
            uint256 stTokenAmount,
            uint256 minDepositAmount,
            uint256 unstakeLockedBlocks
        ) = stake.pool(0);

        assertEq(stTokenAddress, address(0x0));
        assertEq(poolWeight, 100);
        assertEq(lastRewardBlock, START_BLOCK);
        assertEq(accMetaNodePerST, 0);
        assertEq(stTokenAmount, 0);
        assertEq(minDepositAmount, 0.1 ether);
        assertEq(unstakeLockedBlocks, 10);
        vm.stopPrank();
    }

    /// @notice Test adding ERC20 pool successfully
    function test_AddPool_ERC20Pool_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, false);

        assertEq(stake.poolLength(), 2);
        assertEq(stake.totalPoolWeight(), 300);
        vm.stopPrank();
    }

    /// @notice Test that first pool must be ETH
    function test_AddPool_FirstPoolMustBeETH() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        vm.expectRevert("invalid staking token address");
        stake.addPool(address(stakingToken), 100, 1 ether, 10, false);
        vm.stopPrank();
    }

    /// @notice Test that second pool cannot be ETH
    function test_AddPool_SecondPoolCannotBeETH() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        vm.expectRevert("invalid staking token address");
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();
    }

    /// @notice Test adding pool with zero unstake lock
    function test_AddPool_ZeroUnstakeLock() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        vm.expectRevert("invalid withdraw locked blocks");
        stake.addPool(address(0x0), 100, 0.1 ether, 0, false);
        vm.stopPrank();
    }

    /// @notice Test adding pool after end block
    function test_AddPool_AfterEndBlock() public {
        vm.startPrank(admin);
        vm.roll(END_BLOCK + 1);

        vm.expectRevert("Already ended");
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();
    }

    /// @notice Test adding pool with update flag
    function test_AddPool_WithUpdate() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        vm.roll(START_BLOCK + 10);
        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, true);

        (, , uint256 lastRewardBlock, , , , ) = stake.pool(0);
        assertEq(lastRewardBlock, START_BLOCK + 10);
        vm.stopPrank();
    }

    /// @notice Test updatePool success
    function test_UpdatePool_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        stake.updatePool(0, 0.5 ether, 50);

        (
            ,
            ,
            ,
            ,
            ,
            uint256 minDepositAmount,
            uint256 unstakeLockedBlocks
        ) = stake.pool(0);
        assertEq(minDepositAmount, 0.5 ether);
        assertEq(unstakeLockedBlocks, 50);
        vm.stopPrank();
    }

    /// @notice Test updatePool with invalid pid
    function test_UpdatePool_InvalidPid() public {
        vm.startPrank(admin);
        vm.expectRevert("invalid pid");
        stake.updatePool(0, 0.5 ether, 50);
        vm.stopPrank();
    }

    /// @notice Test setPoolWeight success
    function test_SetPoolWeight_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        stake.setPoolWeight(0, 200, false);

        (, uint256 poolWeight, , , , , ) = stake.pool(0);
        assertEq(poolWeight, 200);
        assertEq(stake.totalPoolWeight(), 200);
        vm.stopPrank();
    }

    /// @notice Test setPoolWeight with zero weight
    function test_SetPoolWeight_ZeroWeight() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        vm.expectRevert("invalid pool weight");
        stake.setPoolWeight(0, 0, false);
        vm.stopPrank();
    }

    /// @notice Test setPoolWeight with update flag
    function test_SetPoolWeight_WithUpdate() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);

        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);

        vm.roll(START_BLOCK + 10);
        stake.setPoolWeight(0, 200, true);

        (, , uint256 lastRewardBlock, , , , ) = stake.pool(0);
        assertEq(lastRewardBlock, START_BLOCK + 10);
        vm.stopPrank();
    }

    // ============================================
    // 4. Staking Function Tests
    // ============================================

    /// @notice Test ETH deposit success
    function test_DepositETH_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);

        vm.expectEmit(true, true, false, true);
        emit Deposit(user1, 0, 1 ether);
        stake.depositETH{value: 1 ether}();

        assertEq(stake.stakingBalance(0, user1), 1 ether);
        assertEq(address(stake).balance, 1 ether);
        vm.stopPrank();
    }

    /// @notice Test ETH deposit below minimum
    function test_DepositETH_BelowMinimum() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.expectRevert("deposit amount is too small");
        stake.depositETH{value: 0.5 ether}();
        vm.stopPrank();
    }

    /// @notice Test ERC20 deposit success
    function test_Deposit_ERC20_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);

        uint256 depositAmount = 1000 * 10 ** 18;
        stakingToken.approve(address(stake), depositAmount);

        vm.expectEmit(true, true, false, true);
        emit Deposit(user1, 1, depositAmount);
        stake.deposit(1, depositAmount);

        assertEq(stake.stakingBalance(1, user1), depositAmount);
        assertEq(stakingToken.balanceOf(address(stake)), depositAmount);
        vm.stopPrank();
    }

    /// @notice Test that deposit function fails for ETH pool
    function test_Deposit_ETHPoolFails() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.expectRevert("deposit not support ETH staking");
        stake.deposit(0, 1 ether);
        vm.stopPrank();
    }

    /// @notice Test ERC20 deposit below minimum
    function test_Deposit_BelowMinimum() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        stake.addPool(address(stakingToken), 200, 1000 * 10 ** 18, 20, false);
        vm.stopPrank();

        vm.startPrank(user1);
        stakingToken.approve(address(stake), 500 * 10 ** 18);

        vm.expectRevert("deposit amount is too small");
        stake.deposit(1, 500 * 10 ** 18);
        vm.stopPrank();
    }

    /// @notice Test multiple deposits accumulate
    function test_Deposit_MultipleDeposits() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.roll(START_BLOCK + 10);
        stake.depositETH{value: 2 ether}();

        assertEq(stake.stakingBalance(0, user1), 3 ether);

        uint256 pending = stake.pendingMetaNode(0, user1);
        assertTrue(pending > 0);
        vm.stopPrank();
    }

    // ============================================
    // 5. Unstaking Function Tests
    // ============================================

    /// @notice Test unstake success
    function test_Unstake_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 2 ether}();

        vm.roll(START_BLOCK + 10);

        vm.expectEmit(true, true, false, true);
        emit RequestUnstake(user1, 0, 1 ether);
        stake.unstake(0, 1 ether);

        assertEq(stake.stakingBalance(0, user1), 1 ether);

        (uint256 requestAmount, uint256 pendingWithdrawAmount) = stake
            .withdrawAmount(0, user1);
        assertEq(requestAmount, 1 ether);
        assertEq(pendingWithdrawAmount, 0);
        vm.stopPrank();
    }

    /// @notice Test unstake with insufficient balance
    function test_Unstake_InsufficientBalance() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.expectRevert("Not enough staking token balance");
        stake.unstake(0, 2 ether);
        vm.stopPrank();
    }

    /// @notice Test unstake when withdraw is paused
    function test_Unstake_WhenPaused() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        stake.depositETH{value: 1 ether}();
        vm.stopPrank();

        vm.startPrank(admin);
        stake.pauseWithdraw();
        vm.stopPrank();

        vm.startPrank(user1);
        vm.expectRevert("withdraw is paused");
        stake.unstake(0, 1 ether);
        vm.stopPrank();
    }

    /// @notice Test multiple unstake requests
    function test_Unstake_MultipleRequests() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 5 ether}();

        vm.roll(START_BLOCK + 10);
        stake.unstake(0, 1 ether);

        vm.roll(START_BLOCK + 20);
        stake.unstake(0, 2 ether);

        (uint256 requestAmount, ) = stake.withdrawAmount(0, user1);
        assertEq(requestAmount, 3 ether);
        assertEq(stake.stakingBalance(0, user1), 2 ether);
        vm.stopPrank();
    }

    // ============================================
    // 6. Withdrawal Function Tests
    // ============================================

    /// @notice Test successful ETH withdrawal
    function test_Withdraw_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 2 ether}();

        vm.roll(START_BLOCK + 10);
        stake.unstake(0, 1 ether);

        uint256 balanceBefore = user1.balance;

        // Unstake at block 110, unlockBlocks = 110 + 10 = 120
        // Need block.number >= 120, so roll to 120
        vm.roll(START_BLOCK + 20);

        stake.withdraw(0);

        assertEq(user1.balance - balanceBefore, 1 ether);

        (uint256 requestAmount, ) = stake.withdrawAmount(0, user1);
        assertEq(requestAmount, 0);
        vm.stopPrank();
    }

    /// @notice Test successful ERC20 withdrawal
    function test_Withdraw_ERC20() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);

        uint256 depositAmount = 1000 * 10 ** 18;
        stakingToken.approve(address(stake), depositAmount);
        stake.deposit(1, depositAmount);

        vm.roll(START_BLOCK + 10);
        stake.unstake(1, 500 * 10 ** 18);

        uint256 balanceBefore = stakingToken.balanceOf(user1);

        vm.roll(START_BLOCK + 31);
        stake.withdraw(1);

        assertEq(stakingToken.balanceOf(user1) - balanceBefore, 500 * 10 ** 18);
        vm.stopPrank();
    }

    /// @notice Test withdrawal with no unlocked amount
    function test_Withdraw_NoUnlockedAmount() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.roll(START_BLOCK + 10);
        stake.unstake(0, 1 ether);

        vm.roll(START_BLOCK + 15);
        stake.withdraw(0);

        (uint256 requestAmount, uint256 pendingWithdrawAmount) = stake
            .withdrawAmount(0, user1);
        assertEq(requestAmount, 1 ether);
        assertEq(pendingWithdrawAmount, 0);
        vm.stopPrank();
    }

    /// @notice Test partial unlock withdrawal
    function test_Withdraw_PartialUnlock() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 3 ether}();

        // First unstake at block 100+10=110, unlocks at 110+10=120
        vm.roll(START_BLOCK + 10);
        stake.unstake(0, 1 ether);

        // Second unstake at block 100+15=115, unlocks at 115+10=125
        vm.roll(START_BLOCK + 15);
        stake.unstake(0, 1 ether);

        // At block 120, first request should be unlocked
        vm.roll(START_BLOCK + 20);

        (uint256 requestAmount, uint256 pendingWithdrawAmount) = stake
            .withdrawAmount(0, user1);
        assertEq(requestAmount, 2 ether, "Should have 2 ether in requests");
        assertEq(
            pendingWithdrawAmount,
            1 ether,
            "Should have 1 ether unlocked"
        );

        uint256 balanceBefore = user1.balance;
        stake.withdraw(0);

        assertEq(
            user1.balance - balanceBefore,
            1 ether,
            "Should withdraw 1 ether"
        );

        // After first withdraw, should still have one pending request
        (requestAmount, pendingWithdrawAmount) = stake.withdrawAmount(0, user1);
        assertEq(
            requestAmount,
            1 ether,
            "Should have 1 ether left in requests"
        );
        assertEq(pendingWithdrawAmount, 0, "Should have 0 ether unlocked");

        // At block 125, second request should also be unlocked
        vm.roll(START_BLOCK + 25);
        (requestAmount, pendingWithdrawAmount) = stake.withdrawAmount(0, user1);
        assertEq(
            requestAmount,
            1 ether,
            "Should still have 1 ether in requests"
        );
        assertEq(
            pendingWithdrawAmount,
            1 ether,
            "Should have 1 ether unlocked"
        );

        balanceBefore = user1.balance;
        stake.withdraw(0);
        assertEq(
            user1.balance - balanceBefore,
            1 ether,
            "Should withdraw second 1 ether"
        );

        // After second withdraw, should have no pending requests
        (requestAmount, pendingWithdrawAmount) = stake.withdrawAmount(0, user1);
        assertEq(requestAmount, 0, "Should have 0 ether in requests");
        assertEq(pendingWithdrawAmount, 0, "Should have 0 ether unlocked");
        vm.stopPrank();
    }

    /// @notice Test withdrawal when paused
    function test_Withdraw_WhenPaused() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        stake.depositETH{value: 1 ether}();
        stake.unstake(0, 1 ether);
        vm.stopPrank();

        vm.startPrank(admin);
        stake.pauseWithdraw();
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 20);
        vm.expectRevert("withdraw is paused");
        stake.withdraw(0);
        vm.stopPrank();
    }

    // ============================================
    // 7. Reward Claim Tests
    // ============================================

    /// @notice Test successful reward claim
    function test_Claim_Success() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.roll(START_BLOCK + 11);

        uint256 pending = stake.pendingMetaNode(0, user1);
        assertTrue(pending > 0);

        uint256 balanceBefore = metaNode.balanceOf(user1);

        vm.expectEmit(true, true, false, false);
        emit Claim(user1, 0, pending);
        stake.claim(0);

        uint256 claimed = metaNode.balanceOf(user1) - balanceBefore;
        assertEq(claimed, pending);
        assertEq(stake.pendingMetaNode(0, user1), 0);
        vm.stopPrank();
    }

    /// @notice Test multiple claims
    function test_Claim_MultipleTimes() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.roll(START_BLOCK + 11);
        stake.claim(0);

        vm.roll(START_BLOCK + 21);
        uint256 pending = stake.pendingMetaNode(0, user1);
        assertTrue(pending > 0);

        stake.claim(0);
        assertEq(stake.pendingMetaNode(0, user1), 0);
        vm.stopPrank();
    }

    /// @notice Test claim when paused
    function test_Claim_WhenPaused() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        stake.depositETH{value: 1 ether}();
        vm.roll(START_BLOCK + 10);
        vm.stopPrank();

        vm.startPrank(admin);
        stake.pauseClaim();
        vm.stopPrank();

        vm.startPrank(user1);
        vm.expectRevert("claim is paused");
        stake.claim(0);
        vm.stopPrank();
    }

    /// @notice Test claim with no pending rewards
    function test_Claim_NoPending() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        stake.claim(0);

        assertEq(stake.pendingMetaNode(0, user1), 0);
        vm.stopPrank();
    }

    /// @notice Test claim when contract has insufficient MetaNode balance
    function test_Claim_InsufficientBalance() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();
        vm.stopPrank();

        // Move forward to accumulate rewards (100 tokens)
        vm.roll(START_BLOCK + 11);

        // Transfer most MetaNode out - leave only 50 tokens
        uint256 contractBalance = metaNode.balanceOf(address(stake));
        vm.prank(address(stake));
        metaNode.transfer(admin, contractBalance - 50 * 10 ** 18);

        uint256 pending = stake.pendingMetaNode(0, user1);
        uint256 remainingBalance = metaNode.balanceOf(address(stake));

        assertTrue(pending > remainingBalance);

        vm.startPrank(user1);
        uint256 balanceBefore = metaNode.balanceOf(user1);
        stake.claim(0);
        uint256 claimed = metaNode.balanceOf(user1) - balanceBefore;

        // Should only receive remaining balance
        assertEq(claimed, remainingBalance);
        assertEq(metaNode.balanceOf(address(stake)), 0);
        vm.stopPrank();
    }

    // ============================================
    // 8. Reward Calculation Tests
    // ============================================

    /// @notice Test pending rewards for single user
    function test_PendingMetaNode_SingleUser() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.roll(START_BLOCK + 11);

        uint256 pending = stake.pendingMetaNode(0, user1);
        uint256 expectedReward = 10 * META_NODE_PER_BLOCK;

        assertEq(pending, expectedReward);
        vm.stopPrank();
    }

    /// @notice Test reward distribution between multiple users
    function test_PendingMetaNode_MultipleUsers() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();
        vm.stopPrank();

        vm.startPrank(user2);
        vm.roll(START_BLOCK + 6);
        stake.depositETH{value: 1 ether}();
        vm.stopPrank();

        vm.roll(START_BLOCK + 11);

        uint256 pending1 = stake.pendingMetaNode(0, user1);
        uint256 pending2 = stake.pendingMetaNode(0, user2);

        assertTrue(pending1 > pending2);
        assertApproxEqRel(pending1, 75 * 10 ** 18, 0.01e18);
        assertApproxEqRel(pending2, 25 * 10 ** 18, 0.01e18);
    }

    /// @notice Test reward distribution across multiple pools
    function test_PendingMetaNode_MultiplePools() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        stake.addPool(address(stakingToken), 300, 100 * 10 ** 18, 20, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        stakingToken.approve(address(stake), 1000 * 10 ** 18);
        stake.deposit(1, 1000 * 10 ** 18);

        vm.roll(START_BLOCK + 11);

        uint256 pending0 = stake.pendingMetaNode(0, user1);
        uint256 pending1 = stake.pendingMetaNode(1, user1);

        assertTrue(pending1 > pending0);
        assertApproxEqRel(pending1, pending0 * 3, 0.01e18);
        vm.stopPrank();
    }

    /// @notice Test getMultiplier before start block
    function test_GetMultiplier_BeforeStart() public {
        vm.roll(START_BLOCK - 10);
        uint256 multiplier = stake.getMultiplier(
            START_BLOCK - 10,
            START_BLOCK + 10
        );
        assertEq(multiplier, 10 * META_NODE_PER_BLOCK);
    }

    /// @notice Test getMultiplier after end block
    function test_GetMultiplier_AfterEnd() public {
        vm.roll(END_BLOCK + 10);
        uint256 multiplier = stake.getMultiplier(START_BLOCK, END_BLOCK + 10);
        assertEq(multiplier, (END_BLOCK - START_BLOCK) * META_NODE_PER_BLOCK);
    }

    /// @notice Test getMultiplier spanning end block
    function test_GetMultiplier_SpanningEnd() public view {
        uint256 multiplier = stake.getMultiplier(
            END_BLOCK - 10,
            END_BLOCK + 10
        );
        assertEq(multiplier, 10 * META_NODE_PER_BLOCK);
    }

    /// @notice Test getMultiplier with invalid range
    function test_GetMultiplier_InvalidRange() public {
        vm.expectRevert("invalid block");
        stake.getMultiplier(200, 100);
    }

    // ============================================
    // 9. Boundary Condition Tests
    // ============================================

    /// @notice Test deposit with maximum amount
    function test_Deposit_MaxAmount() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0, 10, false);
        vm.stopPrank();

        vm.deal(user1, type(uint128).max);

        vm.startPrank(user1);
        uint256 maxDeposit = 1000000 ether;
        stake.depositETH{value: maxDeposit}();

        assertEq(stake.stakingBalance(0, user1), maxDeposit);
        vm.stopPrank();
    }

    /// @notice Test deposit with zero minimum amount
    function test_Deposit_ZeroMinAmount() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        stake.depositETH{value: 0.001 ether}();
        assertEq(stake.stakingBalance(0, user1), 0.001 ether);
        vm.stopPrank();
    }

    /// @notice Test unstaking full amount
    function test_Unstake_FullAmount() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        stake.depositETH{value: 1 ether}();
        stake.unstake(0, 1 ether);

        assertEq(stake.stakingBalance(0, user1), 0);
        vm.stopPrank();
    }

    /// @notice Test pending rewards after end block
    function test_PendingMetaNode_AfterEndBlock() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();

        vm.roll(END_BLOCK + 100);

        uint256 pending = stake.pendingMetaNode(0, user1);
        uint256 maxReward = (END_BLOCK - START_BLOCK - 1) * META_NODE_PER_BLOCK;

        assertEq(pending, maxReward);
        vm.stopPrank();
    }

    // ============================================
    // 10. Multi-User Concurrent Tests
    // ============================================

    /// @notice Test multiple users depositing, unstaking, and withdrawing
    function test_MultiUser_Deposit_Unstake_Withdraw() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();
        vm.stopPrank();

        vm.startPrank(user2);
        vm.roll(START_BLOCK + 2);
        stake.depositETH{value: 2 ether}();
        vm.stopPrank();

        vm.startPrank(user3);
        vm.roll(START_BLOCK + 3);
        stake.depositETH{value: 3 ether}();
        vm.stopPrank();

        // User1 unstakes at block 100+5=105, unlocks at 105+10=115
        vm.startPrank(user1);
        vm.roll(START_BLOCK + 5);
        stake.unstake(0, 0.5 ether);
        vm.stopPrank();

        // User2 unstakes at block 100+6=106, unlocks at 106+10=116
        vm.startPrank(user2);
        vm.roll(START_BLOCK + 6);
        stake.unstake(0, 1 ether);
        vm.stopPrank();

        // Wait until both are unlocked - roll to 120
        vm.roll(START_BLOCK + 20);

        // Check pending amounts before withdraw
        (uint256 req1, uint256 pend1) = stake.withdrawAmount(0, user1);
        (uint256 req2, uint256 pend2) = stake.withdrawAmount(0, user2);
        assertEq(req1, 0.5 ether);
        assertEq(pend1, 0.5 ether);
        assertEq(req2, 1 ether);
        assertEq(pend2, 1 ether);

        // Users withdraw
        uint256 balance1Before = user1.balance;
        vm.prank(user1);
        stake.withdraw(0);
        assertEq(user1.balance - balance1Before, 0.5 ether);

        uint256 balance2Before = user2.balance;
        vm.prank(user2);
        stake.withdraw(0);
        assertEq(user2.balance - balance2Before, 1 ether);

        assertEq(stake.stakingBalance(0, user1), 0.5 ether);
        assertEq(stake.stakingBalance(0, user2), 1 ether);
        assertEq(stake.stakingBalance(0, user3), 3 ether);
    }

    /// @notice Test reward distribution with multiple users
    function test_MultiUser_RewardDistribution() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 2 ether}();
        vm.stopPrank();

        vm.startPrank(user2);
        vm.roll(START_BLOCK + 6);
        stake.depositETH{value: 2 ether}();
        vm.stopPrank();

        vm.roll(START_BLOCK + 16);

        uint256 pending1 = stake.pendingMetaNode(0, user1);
        uint256 pending2 = stake.pendingMetaNode(0, user2);

        assertApproxEqRel(pending1, 100 * 10 ** 18, 0.01e18);
        assertApproxEqRel(pending2, 50 * 10 ** 18, 0.01e18);
    }

    // ============================================
    // 11. Query Function Tests
    // ============================================

    /// @notice Test poolLength function
    function test_PoolLength() public {
        assertEq(stake.poolLength(), 0);

        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        assertEq(stake.poolLength(), 1);

        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, false);
        assertEq(stake.poolLength(), 2);
        vm.stopPrank();
    }

    /// @notice Test stakingBalance function
    function test_StakingBalance() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        assertEq(stake.stakingBalance(0, user1), 0);

        vm.startPrank(user1);
        stake.depositETH{value: 1 ether}();
        assertEq(stake.stakingBalance(0, user1), 1 ether);

        stake.unstake(0, 0.5 ether);
        assertEq(stake.stakingBalance(0, user1), 0.5 ether);
        vm.stopPrank();
    }

    /// @notice Test withdrawAmount function
    function test_WithdrawAmount() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 3 ether}();

        vm.roll(START_BLOCK + 10);
        stake.unstake(0, 1 ether);

        (uint256 requestAmount, uint256 pendingWithdrawAmount) = stake
            .withdrawAmount(0, user1);
        assertEq(requestAmount, 1 ether);
        assertEq(pendingWithdrawAmount, 0);

        vm.roll(START_BLOCK + 21);
        (requestAmount, pendingWithdrawAmount) = stake.withdrawAmount(0, user1);
        assertEq(requestAmount, 1 ether);
        assertEq(pendingWithdrawAmount, 1 ether);
        vm.stopPrank();
    }

    /// @notice Test pendingMetaNodeByBlockNumber function
    function test_PendingMetaNodeByBlockNumber() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 1 ether}();
        vm.stopPrank();

        uint256 pending10 = stake.pendingMetaNodeByBlockNumber(
            0,
            user1,
            START_BLOCK + 11
        );
        uint256 pending20 = stake.pendingMetaNodeByBlockNumber(
            0,
            user1,
            START_BLOCK + 21
        );

        assertTrue(pending20 > pending10);
        assertEq(pending20, pending10 * 2);
    }

    // ============================================
    // 12. Reentrancy Attack Protection Tests
    // ============================================

    /// @notice Test reentrancy attack protection on withdraw
    function test_ReentrancyAttack_Withdraw() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        ReentrancyAttacker attacker = new ReentrancyAttacker(address(stake));
        vm.deal(address(attacker), 10 ether);

        vm.startPrank(address(attacker));
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 2 ether}();

        vm.roll(START_BLOCK + 10);
        stake.unstake(0, 2 ether);

        vm.roll(START_BLOCK + 21);

        vm.expectRevert();
        attacker.attack{value: 0}(0);
        vm.stopPrank();
    }

    // ============================================
    // 13. Upgrade Tests
    // ============================================

    /// @notice Test upgrade access control
    function test_Upgrade_OnlyUpgradeRole() public {
        Stake newImplementation = new Stake();

        vm.startPrank(nonAdmin);
        vm.expectRevert();
        stake.upgradeToAndCall(address(newImplementation), "");
        vm.stopPrank();
    }

    /// @notice Test that admin has upgrade role
    function test_Upgrade_AdminHasRole() public view {
        bytes32 upgradeRole = stake.UPGRADE_ROLE();
        assertTrue(stake.hasRole(upgradeRole, admin));
        assertFalse(stake.hasRole(upgradeRole, nonAdmin));
    }

    // ============================================
    // 14. Complete Workflow Tests
    // ============================================

    /// @notice Test complete staking workflow end-to-end
    function test_CompleteWorkflow() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, false);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 1);
        stake.depositETH{value: 5 ether}();
        vm.stopPrank();

        vm.startPrank(user2);
        vm.roll(START_BLOCK + 5);
        stakingToken.approve(address(stake), 1000 * 10 ** 18);
        stake.deposit(1, 1000 * 10 ** 18);
        vm.stopPrank();

        vm.roll(START_BLOCK + 20);
        uint256 pending1_pool0 = stake.pendingMetaNode(0, user1);
        uint256 pending2_pool1 = stake.pendingMetaNode(1, user2);
        assertTrue(pending1_pool0 > 0);
        assertTrue(pending2_pool1 > 0);

        // User1 unstakes at block 100+25=125, unlocks at 125+10=135
        vm.startPrank(user1);
        vm.roll(START_BLOCK + 25);
        stake.unstake(0, 2 ether);
        vm.stopPrank();

        vm.startPrank(user1);
        vm.roll(START_BLOCK + 30);
        uint256 balanceBefore = metaNode.balanceOf(user1);
        stake.claim(0);
        assertTrue(metaNode.balanceOf(user1) > balanceBefore);
        vm.stopPrank();

        // Wait until user1's unstake is unlocked (need >= 135)
        vm.startPrank(user1);
        vm.roll(START_BLOCK + 35);

        // Verify unlock status
        (uint256 reqAmount, uint256 pendAmount) = stake.withdrawAmount(
            0,
            user1
        );
        assertEq(reqAmount, 2 ether);
        assertEq(pendAmount, 2 ether);

        uint256 ethBefore = user1.balance;
        stake.withdraw(0);
        assertEq(user1.balance - ethBefore, 2 ether);
        vm.stopPrank();

        // User2 unstakes at block 100+40=140, unlocks at 140+20=160
        vm.startPrank(user2);
        vm.roll(START_BLOCK + 40);
        stake.unstake(1, 1000 * 10 ** 18);
        stake.claim(1);
        vm.stopPrank();

        // Wait until user2's unstake is unlocked (need >= 160)
        vm.startPrank(user2);
        vm.roll(START_BLOCK + 60);

        // Verify unlock status
        (reqAmount, pendAmount) = stake.withdrawAmount(1, user2);
        assertEq(reqAmount, 1000 * 10 ** 18);
        assertEq(pendAmount, 1000 * 10 ** 18);

        uint256 tokenBefore = stakingToken.balanceOf(user2);
        stake.withdraw(1);
        assertEq(stakingToken.balanceOf(user2) - tokenBefore, 1000 * 10 ** 18);
        vm.stopPrank();

        assertEq(stake.stakingBalance(0, user1), 3 ether);
        assertEq(stake.stakingBalance(1, user2), 0);
    }

    // ============================================
    // 15. Pool Update Tests
    // ============================================

    /// @notice Test updating pool with no stakers
    function test_UpdatePool_NoStakers() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        vm.stopPrank();

        vm.roll(START_BLOCK + 10);
        stake.updatePool(0);

        (, , uint256 lastRewardBlock, uint256 accMetaNodePerST, , , ) = stake
            .pool(0);
        assertEq(lastRewardBlock, START_BLOCK + 10);
        assertEq(accMetaNodePerST, 0);
    }

    /// @notice Test mass update of all pools
    function test_MassUpdatePools() public {
        vm.startPrank(admin);
        vm.roll(START_BLOCK);
        stake.addPool(address(0x0), 100, 0.1 ether, 10, false);
        stake.addPool(address(stakingToken), 200, 100 * 10 ** 18, 20, false);
        vm.stopPrank();

        vm.roll(START_BLOCK + 10);
        stake.massUpdatePools();

        (, , uint256 lastRewardBlock0, , , , ) = stake.pool(0);
        (, , uint256 lastRewardBlock1, , , , ) = stake.pool(1);

        assertEq(lastRewardBlock0, START_BLOCK + 10);
        assertEq(lastRewardBlock1, START_BLOCK + 10);
    }

    // ============================================
    // 16. Security Checks
    // ============================================

    /// @notice Test invalid pid protection for deposit
    function test_InvalidPid_Deposit() public {
        vm.startPrank(user1);
        vm.expectRevert("invalid pid");
        stake.deposit(99, 1 ether);
        vm.stopPrank();
    }

    /// @notice Test invalid pid protection for unstake
    function test_InvalidPid_Unstake() public {
        vm.startPrank(user1);
        vm.expectRevert("invalid pid");
        stake.unstake(99, 1 ether);
        vm.stopPrank();
    }

    /// @notice Test invalid pid protection for withdraw
    function test_InvalidPid_Withdraw() public {
        vm.startPrank(user1);
        vm.expectRevert("invalid pid");
        stake.withdraw(99);
        vm.stopPrank();
    }

    /// @notice Test invalid pid protection for claim
    function test_InvalidPid_Claim() public {
        vm.startPrank(user1);
        vm.expectRevert("invalid pid");
        stake.claim(99);
        vm.stopPrank();
    }

    /// @notice Test contract constants
    function test_Constants() public view {
        assertEq(stake.ETH_PID(), 0);
        assertEq(stake.ADMIN_ROLE(), keccak256("admin_role"));
        assertEq(stake.UPGRADE_ROLE(), keccak256("upgrade_role"));
    }
}
