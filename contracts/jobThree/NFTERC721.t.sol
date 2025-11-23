// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {NFTERC721} from "./NFTERC721.sol";
import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFTERC721 Unit Tests
 * @notice Comprehensive test suite for NFTERC721 upgradeable NFT contract
 * @dev Tests cover initialization, core logic, permissions, and upgrade functionality
 */
contract NFTERC721UnitTest is Test {
    using Strings for uint256;

    NFTERC721 implementation;
    ERC1967Proxy proxy;
    NFTERC721 nft;

    address admin = makeAddr("admin");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");
    address user3 = makeAddr("user3");

    string constant NAME = "TestNFT";
    string constant SYMBOL = "TNFT";
    string constant BASE_URI =
        "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";

    /**
     * @notice Emitted when a new token is minted
     * @param to The address that received the minted token
     * @param tokenId The ID of the minted token
     */
    event TokenMinted(address indexed to, uint256 indexed tokenId);

    /**
     * @notice Emitted when base URI is updated
     */
    event BaseURIUpdated(string newBaseURI);

    /// @dev Setup test environment before each test
    function setUp() public {
        implementation = new NFTERC721();

        bytes memory data = abi.encodeWithSelector(
            NFTERC721.initialize.selector,
            NAME,
            SYMBOL,
            BASE_URI
        );
        proxy = new ERC1967Proxy(address(implementation), data);
        nft = NFTERC721(address(proxy));
    }

    // ========== Initialization Tests ==========

    /// @notice Test contract initialization with correct parameters
    function test_Initialization_StateVariables() public view {
        assertEq(nft.name(), NAME);
        assertEq(nft.symbol(), SYMBOL);
        assertEq(nft.owner(), address(this));
    }

    /// @notice Test prevention of reinitialization
    function test_Initialization_PreventReinitialization() public {
        vm.expectRevert();
        nft.initialize("NewName", "NEW", "new-uri");
    }

    // ========== Core Business Logic Tests ==========

    /// @notice Test normal minting flow
    function test_MintFunction_NormalFlow() public {
        nft.mint(user1, 1);

        assertEq(nft.ownerOf(1), user1);
        assertTrue(nft.exists(1));
        assertEq(nft.balanceOf(user1), 1);
    }

    /// @notice Test token URI generation logic
    function test_TokenURI_ReturnValue() public {
        nft.mint(user1, 0);
        nft.mint(user1, 2);

        assertEq(nft.tokenURI(0), string.concat(BASE_URI, "bubuyier.json"));
        assertEq(nft.tokenURI(2), string.concat(BASE_URI, "bubuyier2.json"));
    }

    // ========== Boundary Conditions and Exception Tests ==========

    /// @notice Test minting to zero address reverts
    function test_BoundaryConditions_ZeroAddress() public {
        vm.expectRevert();
        nft.mint(address(0), 1);
    }

    /// @notice Test handling of maximum token ID
    function test_BoundaryConditions_MaxTokenId() public {
        uint256 maxId = type(uint256).max;
        nft.mint(user1, maxId);
        assertEq(nft.ownerOf(maxId), user1);
    }

    /// @notice Test duplicate mint prevention
    function test_ExceptionHandling_DuplicateMint() public {
        nft.mint(user1, 1);
        vm.expectRevert();
        nft.mint(user2, 1);
    }

    // ========== Permissions and Access Control Tests ==========

    /// @notice Test onlyOwner modifier on setBaseURI
    function test_Permissions_SetBaseURIAccess() public {
        vm.prank(user1);
        vm.expectRevert();
        nft.setBaseURI("new-uri");
    }

    /// @notice Test onlyOwner modifier on upgrade function
    function test_Permissions_UpgradeAccess() public {
        address newImplementation = address(new NFTERC721());

        vm.prank(user1);
        vm.expectRevert();
        nft.upgradeTo(newImplementation);
    }

    // ========== Multi-user Concurrency Tests ==========

    /// @notice Test state isolation between multiple users
    function test_Concurrency_MultipleUsers() public {
        nft.mint(user1, 1);
        nft.mint(user2, 2);
        nft.mint(user3, 3);

        assertEq(nft.balanceOf(user1), 1);
        assertEq(nft.balanceOf(user2), 1);
        assertEq(nft.balanceOf(user3), 1);
    }

    /// @notice Test race condition protection for duplicate token IDs
    function test_Concurrency_RaceConditions() public {
        nft.mint(user1, 1);
        vm.expectRevert();
        nft.mint(user2, 1);
    }

    // ========== Upgrade and Migration Tests ==========

    /// @notice Test data preservation after upgrade
    function test_Upgrade_DataPreservation() public {
        nft.mint(user1, 1);
        nft.mint(user2, 2);
        nft.setBaseURI("custom-uri/");

        NFTERC721 newImplementation = new NFTERC721();
        nft.upgradeTo(address(newImplementation));

        assertEq(nft.ownerOf(1), user1);
        assertEq(nft.ownerOf(2), user2);
        assertEq(nft.balanceOf(user1), 1);
        assertEq(nft.balanceOf(user2), 1);
    }

    // ========== Fuzz Tests ==========

    /// @notice Fuzz test mint and transfer operations
    function testFuzz_MintAndTransfer(address to, uint256 tokenId) public {
        vm.assume(to != address(0));
        vm.assume(to != address(this));
        vm.assume(tokenId > 100);

        nft.mint(to, tokenId);
        assertEq(nft.ownerOf(tokenId), to);

        address newOwner = makeAddr("newOwner");
        vm.prank(to);
        nft.transferFrom(to, newOwner, tokenId);

        assertEq(nft.ownerOf(tokenId), newOwner);
    }

    /// @notice Fuzz test token URI generation
    function testFuzz_TokenURI(uint256 tokenId) public {
        vm.assume(tokenId < type(uint256).max - 10);

        nft.mint(user1, tokenId);

        string memory uri = nft.tokenURI(tokenId);
        assertTrue(bytes(uri).length > 0);

        if (tokenId == 0 || tokenId == 1) {
            assertEq(uri, string.concat(BASE_URI, "bubuyier.json"));
        } else {
            string memory expected = string.concat(
                BASE_URI,
                "bubuyier",
                uint256(tokenId).toString(),
                ".json"
            );
            assertEq(uri, expected);
        }
    }

    // ========== Event Emission Tests ==========

    /// @notice Test TokenMinted event emission
    function test_Events_TokenMinted() public {
        vm.expectEmit(true, true, false, true);
        emit TokenMinted(user1, 1);
        nft.mint(user1, 1);
    }

    /// @notice Test BaseURIUpdated event emission
    function test_Events_BaseURIUpdated() public {
        string memory newURI = "https://new-base-uri.com/";
        vm.expectEmit(false, false, false, true);
        emit BaseURIUpdated(newURI);
        nft.setBaseURI(newURI);
    }

    // ========== Additional Edge Cases ==========

    /// @notice Test token existence check
    function test_Exists_Function() public {
        assertFalse(nft.exists(1));
        nft.mint(user1, 1);
        assertTrue(nft.exists(1));
    }

    /// @notice Test token URI reverts for non-existent token
    function test_TokenURI_RevertsNonExistent() public {
        vm.expectRevert();
        nft.tokenURI(999);
    }

    /// @notice Test version information
    function test_Version_Information() public view {
        assertEq(nft.getVersion(), "v1.0.0");
    }
}
