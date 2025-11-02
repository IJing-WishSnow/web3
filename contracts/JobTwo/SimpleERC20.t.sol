// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import "./SimpleERC20.sol";

/**
 * @title SimpleERC20Test
 * @dev Test contract for SimpleERC20 token using Hardhat + Forge Std
 */
contract SimpleERC20Test is Test {
    SimpleERC20 public token;

    // Test account addresses
    address public owner = makeAddr("owner");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public spender = makeAddr("spender");

    // Token constants
    uint256 constant INITIAL_SUPPLY = 1000000;
    uint8 constant DECIMALS = 18;
    string constant NAME = "Test Token";
    string constant SYMBOL = "TEST";

    // Re-stating the event in order to use it in the test
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event Mint(address indexed to, uint256 value);

    /**
     * @dev Setup function run before each test
     */
    function setUp() public {
        // Deploy contract using owner address
        vm.startPrank(owner);
        token = new SimpleERC20(NAME, SYMBOL, DECIMALS, INITIAL_SUPPLY);
        vm.stopPrank();
    }

    // =============================================
    // Constructor Tests
    // =============================================

    /**
     * @dev Test constructor initialization
     */
    function testConstructorInitialization() public view {
        // Verify token basic information
        assertEq(token.name(), NAME, "Token name should match");
        assertEq(token.symbol(), SYMBOL, "Token symbol should match");
        assertEq(token.decimals(), DECIMALS, "Decimals should match");

        // Verify supply and ownership
        assertEq(
            token.totalSupply(),
            INITIAL_SUPPLY * (10 ** DECIMALS),
            "Total supply should be correct"
        );
        assertEq(token.owner(), owner, "Contract owner should be correct");
        assertEq(
            token.balanceOf(owner),
            INITIAL_SUPPLY * (10 ** DECIMALS),
            "Initial tokens should be allocated to deployer"
        );
    }

    // =============================================
    // Transfer Function Tests
    // =============================================

    /**
     * @dev Test normal transfer between users
     */
    function testTransfer() public {
        uint256 transferAmount = 1000 * (10 ** DECIMALS);

        // Execute transfer
        vm.prank(owner);
        token.transfer(user1, transferAmount);

        // Verify balance changes
        assertEq(
            token.balanceOf(owner),
            (INITIAL_SUPPLY - 1000) * (10 ** DECIMALS),
            "Sender balance should decrease"
        );
        assertEq(
            token.balanceOf(user1),
            transferAmount,
            "Receiver balance should increase"
        );
    }

    /**
     * @dev Test transfer event emission
     */
    function testTransferEvent() public {
        uint256 transferAmount = 500 * (10 ** DECIMALS);

        // Expect Transfer event
        vm.expectEmit(true, true, false, true);
        emit Transfer(owner, user1, transferAmount);

        // Execute transfer
        vm.prank(owner);
        token.transfer(user1, transferAmount);
    }

    /**
     * @dev Test transfer with insufficient balance
     */
    function testTransferInsufficientBalance() public {
        uint256 excessiveAmount = (INITIAL_SUPPLY + 1000) * (10 ** DECIMALS);

        // Expect transaction to revert
        vm.prank(owner);
        vm.expectRevert("ERC20: transfer amount exceeds balance");
        token.transfer(user1, excessiveAmount);
    }

    /**
     * @dev Test transfer to zero address
     */
    function testTransferToZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("ERC20: transfer to the zero address");
        token.transfer(address(0), 1000);
    }

    // =============================================
    // Approval Function Tests
    // =============================================

    /**
     * @dev Test approval functionality
     */
    function testApprove() public {
        uint256 approveAmount = 5000 * (10 ** DECIMALS);

        // Execute approval
        vm.prank(owner);
        token.approve(spender, approveAmount);

        // Verify allowance
        assertEq(
            token.allowance(owner, spender),
            approveAmount,
            "Allowance should be set correctly"
        );
    }

    /**
     * @dev Test approval event emission
     */
    function testApproveEvent() public {
        uint256 approveAmount = 3000 * (10 ** DECIMALS);

        // Expect Approval event
        vm.expectEmit(true, true, false, true);
        emit Approval(owner, spender, approveAmount);

        // Execute approval
        vm.prank(owner);
        token.approve(spender, approveAmount);
    }

    /**
     * @dev Test transferFrom functionality
     */
    function testTransferFrom() public {
        uint256 approveAmount = 2000 * (10 ** DECIMALS);
        uint256 transferAmount = 1500 * (10 ** DECIMALS);

        // Step 1: Approve
        vm.prank(owner);
        token.approve(spender, approveAmount);

        // Step 2: Transfer from
        vm.prank(spender);
        token.transfrom(owner, user1, transferAmount);

        // Verify results
        assertEq(
            token.balanceOf(owner),
            (INITIAL_SUPPLY - 1500) * (10 ** DECIMALS),
            "Owner balance should decrease"
        );
        assertEq(
            token.balanceOf(user1),
            transferAmount,
            "Receiver balance should increase"
        );
        assertEq(
            token.allowance(owner, spender),
            approveAmount - transferAmount,
            "Allowance should decrease"
        );
    }

    /**
     * @dev Test transferFrom with insufficient allowance
     */
    function testTransferFromInsufficientAllowance() public {
        uint256 approveAmount = 1000 * (10 ** DECIMALS);
        uint256 transferAmount = 1500 * (10 ** DECIMALS);

        // Setup approval
        vm.prank(owner);
        token.approve(spender, approveAmount);

        // Expect transaction to revert
        vm.prank(spender);
        vm.expectRevert("ERC20: transfer amount exceeds allowance");
        token.transfrom(owner, user1, transferAmount);
    }

    // =============================================
    // Mint Function Tests
    // =============================================

    /**
     * @dev Test mint functionality by owner
     */
    function testMint() public {
        uint256 mintAmount = 50000 * (10 ** DECIMALS);

        // Execute mint
        vm.prank(owner);
        token.mint(user1, mintAmount);

        // Verify mint results
        assertEq(
            token.balanceOf(user1),
            mintAmount,
            "Receiver should receive minted tokens"
        );
        assertEq(
            token.totalSupply(),
            (INITIAL_SUPPLY + 50000) * (10 ** DECIMALS),
            "Total supply should increase"
        );
    }

    /**
     * @dev Test mint event emissions
     */
    function testMintEvent() public {
        uint256 mintAmount = 10000 * (10 ** DECIMALS);

        // Expect Transfer event (from zero address)
        vm.expectEmit(true, true, false, true);
        emit Transfer(address(0), user1, mintAmount);

        // Expect Mint event
        vm.expectEmit(true, false, false, true);
        emit Mint(user1, mintAmount);

        // Execute mint
        vm.prank(owner);
        token.mint(user1, mintAmount);
    }

    /**
     * @dev Test mint by non-owner
     */
    function testMintNotOwner() public {
        uint256 mintAmount = 1000 * (10 ** DECIMALS);

        // Expect transaction to revert (permission denied)
        vm.prank(user1);
        vm.expectRevert("Only owner can call this function");
        token.mint(user1, mintAmount);
    }

    /**
     * @dev Test mint to zero address
     */
    function testMintToZeroAddress() public {
        uint256 mintAmount = 1000 * (10 ** DECIMALS);

        vm.prank(owner);
        vm.expectRevert("ERC20: mint to the zero address");
        token.mint(address(0), mintAmount);
    }

    // =============================================
    // Ownership Management Tests
    // =============================================

    /**
     * @dev Test ownership transfer
     */
    function testTransferOwnership() public {
        vm.prank(owner);
        token.transferOwnership(user1);

        assertEq(
            token.owner(),
            user1,
            "New owner address should be set correctly"
        );
    }

    /**
     * @dev Test ownership transfer by non-owner
     */
    function testTransferOwnershipNotOwner() public {
        vm.prank(user1);
        vm.expectRevert("Only owner can call this function");
        token.transferOwnership(user2);
    }

    /**
     * @dev Test ownership transfer to zero address
     */
    function testTransferOwnershipToZero() public {
        vm.prank(owner);
        vm.expectRevert("New owner is the zero address");
        token.transferOwnership(address(0));
    }

    // =============================================
    // Integration Tests
    // =============================================

    /**
     * @dev Test complete allowance workflow
     */
    function testCompleteAllowanceFlow() public {
        uint256 initialBalance = token.balanceOf(owner);
        uint256 approveAmount = 5000 * (10 ** DECIMALS);
        uint256 transfer1 = 2000 * (10 ** DECIMALS);
        uint256 transfer2 = 1500 * (10 ** DECIMALS);

        // Step 1: Approve
        vm.prank(owner);
        token.approve(spender, approveAmount);

        // Step 2: First transferFrom
        vm.prank(spender);
        token.transfrom(owner, user1, transfer1);

        // Verify state after first transfer
        assertEq(
            token.balanceOf(user1),
            transfer1,
            "First transfer receiver balance should be correct"
        );
        assertEq(
            token.allowance(owner, spender),
            approveAmount - transfer1,
            "Allowance should decrease after first transfer"
        );

        // Step 3: Second transferFrom
        vm.prank(spender);
        token.transfrom(owner, user2, transfer2);

        // Final state verification
        assertEq(
            token.balanceOf(user2),
            transfer2,
            "Second transfer receiver balance should be correct"
        );
        assertEq(
            token.balanceOf(owner),
            initialBalance - transfer1 - transfer2,
            "Final owner balance should be correct"
        );
        assertEq(
            token.allowance(owner, spender),
            approveAmount - transfer1 - transfer2,
            "Final allowance should be correct"
        );
    }

    /**
     * @dev Test batch transfer scenario
     */
    function testBatchTransfers() public {
        uint256 singleTransfer = 100 * (10 ** DECIMALS);
        uint256 batchCount = 5; // 减少数量以避免 gas 限制

        // Prepare test funds
        vm.prank(owner);
        token.transfer(user1, singleTransfer * batchCount);

        // Execute batch transfers
        for (uint256 i = 0; i < batchCount; i++) {
            // Generate different recipient addresses
            address recipient = address(
                uint160(uint256(keccak256(abi.encodePacked(i))))
            );

            vm.prank(user1);
            token.transfer(recipient, singleTransfer);

            // Verify each transfer
            assertEq(
                token.balanceOf(recipient),
                singleTransfer,
                "Each recipient should receive correct amount"
            );
        }

        // Verify sender balance is zero
        assertEq(token.balanceOf(user1), 0, "Sender balance should be zero");
    }

    // =============================================
    // Fuzz Tests
    // =============================================

    /**
     * @dev Fuzz test for transfer functionality
     * @param amount Randomly generated transfer amount
     */
    function testFuzzTransfer(uint256 amount) public {
        // Constrain test range: amount must be > 0 and <= initial supply
        vm.assume(amount > 0 && amount <= INITIAL_SUPPLY * (10 ** DECIMALS));

        uint256 initialOwnerBalance = token.balanceOf(owner);
        uint256 initialUser1Balance = token.balanceOf(user1);

        // Execute transfer
        vm.prank(owner);
        token.transfer(user1, amount);

        // Verify balance changes
        assertEq(
            token.balanceOf(owner),
            initialOwnerBalance - amount,
            "Sender balance should decrease"
        );
        assertEq(
            token.balanceOf(user1),
            initialUser1Balance + amount,
            "Receiver balance should increase"
        );
    }
}
