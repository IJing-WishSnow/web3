// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title Mock ERC721 Token
 * @notice Minimal implementation of ERC721 for testing purposes
 */
contract MockERC721 {
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    /**
     * @notice Get owner of token
     * @param tokenId Token ID to query
     * @return address Owner address
     */
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: invalid token ID");
        return owner;
    }

    /**
     * @notice Transfer token
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     */
    function transferFrom(address from, address to, uint256 tokenId) external {
        require(
            _isApprovedOrOwner(msg.sender, tokenId),
            "ERC721: caller is not token owner or approved"
        );
        _transfer(from, to, tokenId);
    }

    /**
     * @notice Safe transfer token
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @notice Safe transfer token with data
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     * @param data Additional data
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public {
        require(
            _isApprovedOrOwner(msg.sender, tokenId),
            "ERC721: caller is not token owner or approved"
        );
        _safeTransfer(from, to, tokenId, data);
    }

    /**
     * @notice Approve token for spending
     * @param to Approved address
     * @param tokenId Token ID to approve
     */
    function approve(address to, uint256 tokenId) external {
        address owner = _owners[tokenId];
        require(to != owner, "ERC721: approval to current owner");
        require(
            msg.sender == owner || _operatorApprovals[owner][msg.sender],
            "ERC721: approve caller is not token owner or approved for all"
        );
        _tokenApprovals[tokenId] = to;
    }

    /**
     * @notice Set approval for all tokens
     * @param operator Operator address
     * @param approved Approval status
     */
    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
    }

    /**
     * @notice Mint new token
     * @param to Recipient address
     * @param tokenId Token ID to mint
     */
    function mint(address to, uint256 tokenId) external {
        require(to != address(0), "ERC721: mint to the zero address");
        require(_owners[tokenId] == address(0), "ERC721: token already minted");

        _owners[tokenId] = to;
        _balances[to]++;
    }

    /**
     * @notice Check if address is approved or owner
     * @param spender Address to check
     * @param tokenId Token ID to check
     * @return bool Is approved or owner
     */
    function _isApprovedOrOwner(
        address spender,
        uint256 tokenId
    ) internal view returns (bool) {
        address owner = _owners[tokenId];
        return (spender == owner ||
            _tokenApprovals[tokenId] == spender ||
            _operatorApprovals[owner][spender]);
    }

    /**
     * @notice Internal transfer function
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     */
    function _transfer(address from, address to, uint256 tokenId) internal {
        require(
            _owners[tokenId] == from,
            "ERC721: transfer from incorrect owner"
        );
        require(to != address(0), "ERC721: transfer to the zero address");

        _owners[tokenId] = to;
        _balances[from]--;
        _balances[to]++;
    }

    /**
     * @notice Internal safe transfer function
     * @param from From address
     * @param to To address
     * @param tokenId Token ID to transfer
     * @param data Additional data
     */
    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) internal {
        _transfer(from, to, tokenId);
        if (to.code.length > 0) {
            try
                IERC721Receiver(to).onERC721Received(
                    msg.sender,
                    from,
                    tokenId,
                    data
                )
            returns (bytes4 retval) {
                require(
                    retval == IERC721Receiver.onERC721Received.selector,
                    "ERC721: transfer to non ERC721Receiver implementer"
                );
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert(
                        "ERC721: transfer to non ERC721Receiver implementer"
                    );
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }
}

/**
 * @title ERC721 Receiver Interface
 * @notice Interface for contracts that handle ERC721 token receipts
 */
interface IERC721Receiver {
    /**
     * @notice Handle ERC721 token receipt
     * @param operator Operator address
     * @param from From address
     * @param tokenId Token ID received
     * @param data Additional data
     * @return bytes4 Function selector
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}
