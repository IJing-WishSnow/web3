// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFTERC721
 * @author Your Name
 * @notice A simple ERC721 NFT implementation with custom token URI logic
 * @dev This contract extends OpenZeppelin's ERC721 implementation and provides
 *      custom metadata handling for different token IDs
 */
contract NFTERC721 is ERC721("NFTERC721", "NFTERC721") {
    using Strings for uint256;

    /**
     * @notice Emitted when a new token is minted
     * @param to The address that received the minted token
     * @param tokenId The ID of the minted token
     */
    event TokenMinted(address indexed to, uint256 indexed tokenId);

    /**
     * @notice Mint a new NFT to the specified address
     * @dev Uses the internal _mint function from ERC721. Anyone can call this function.
     * @param to The address that will receive the minted NFT
     * @param tokenId The ID of the token to mint
     *
     * Requirements:
     * - `to` cannot be the zero address
     * - `tokenId` must not already exist
     *
     * Emits a {TokenMinted} event
     */
    function mint(address to, uint256 tokenId) public {
        _mint(to, tokenId);
        emit TokenMinted(to, tokenId);
    }

    /**
     * @notice Returns the base URI for all tokens
     * @dev Overrides the _baseURI function from ERC721. Returns a fixed IPFS URI.
     * @return The base URI string for token metadata
     */
    function _baseURI() internal pure override returns (string memory) {
        return
            "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/";
    }

    /**
     * @notice Returns the Uniform Resource Identifier (URI) for a given token ID
     * @dev Overrides tokenURI from ERC721. Provides custom logic for different token IDs:
     * - Token IDs 0 and 1 return the same metadata file
     * - Other token IDs return sequentially named metadata files
     * @param tokenId The token ID to query
     * @return The URI string for the given token ID
     *
     * Requirements:
     * - `tokenId` must exist and be owned by someone (not burned)
     *
     * Example return values:
     * - tokenURI(0) → "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/bubuyier.json"
     * - tokenURI(1) → "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/bubuyier.json"
     * - tokenURI(2) → "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/bubuyier3.json"
     * - tokenURI(3) → "ipfs://bafybeie6fvm4v775pwd37dc3jzy462cjyxvy3wvjvxx55g4rh2cp2aa62i/bubuyier4.json"
     */
    function tokenURI(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        // This will revert if the token doesn't exist
        _requireOwned(tokenId);

        string memory baseURI = _baseURI();

        // Special handling for token IDs 0 and 1
        if (tokenId == 0 || tokenId == 1) {
            return string.concat(baseURI, "bubuyier.json");
        } else {
            // For other token IDs, use sequential naming starting from tokenId + 1
            return
                string.concat(
                    baseURI,
                    "bubuyier",
                    (tokenId + 1).toString(),
                    ".json"
                );
        }
    }

    /**
     * @notice Check if a token exists
     * @dev Convenience function to check token existence without reverting
     * @param tokenId The token ID to check
     * @return True if the token exists (has been minted and not burned), false otherwise
     */
    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @notice Get the current token counter (if implemented)
     * @dev This is a placeholder function. In a production contract, I might want
     *      to track the next available token ID to prevent minting conflicts.
     * @return A message indicating this feature isn't implemented
     */
    function getNextTokenId() public pure returns (string memory) {
        return "Token ID tracking not implemented in this version";
    }
}
