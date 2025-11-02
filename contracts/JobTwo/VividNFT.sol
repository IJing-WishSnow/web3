// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VividNFT - 支持富媒体的动态NFT合约
/// @author Solidity Expert
/// @notice 本合约实现了带有URI存储和所有者控制铸造的ERC721标准
contract VividNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId = 0;

    /// @dev 用于追踪已使用的token URI以防止重复
    mapping(string => bool) private _usedURIs;

    /// @notice 当新NFT被铸造时触发的事件
    /// @param to 接收NFT的地址
    /// @param tokenId 被铸造的token ID
    /// @param tokenURI 与token关联的元数据URI
    event TokenMinted(
        address indexed to,
        uint256 indexed tokenId,
        string tokenURI
    );

    /// @notice 当token的URI被更新时触发的事件
    /// @param tokenId 被更新的token ID
    /// @param newTokenURI 新的元数据URI
    event TokenURIUpdated(uint256 indexed tokenId, string newTokenURI);

    /// @dev 合约构造函数
    /// @param name_ NFT集合的名称
    /// @param symbol_ NFT集合的符号
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {}

    /// @notice 铸造一个新的NFT到指定地址并附带元数据URI
    /// @dev 只有所有者可以调用此函数。URI不能是之前使用过的。
    /// @param to 将接收NFT的地址
    /// @param _tokenURI 指向JSON元数据的元数据URI
    /// @return 新铸造的token ID
    function safeMint(
        address to,
        string memory _tokenURI
    ) external onlyOwner returns (uint256) {
        require(
            bytes(_tokenURI).length > 0,
            "VividNFT: tokenURI cannot be empty"
        );
        require(!_usedURIs[_tokenURI], "VividNFT: tokenURI already used");

        uint256 tokenId = _nextTokenId++;

        // 使用uri
        _usedURIs[_tokenURI] = true;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        emit TokenMinted(to, tokenId, _tokenURI);
        return tokenId;
    }

    /// @notice 批量铸造多个NFT到多个地址
    /// @dev 只有所有者可以调用此函数。数组长度必须相同。
    /// @param recipients 接收者地址数组
    /// @param tokenURIs 元数据tokenURIs数组
    function batchMint(
        address[] memory recipients,
        string[] memory tokenURIs
    ) external onlyOwner {
        require(
            recipients.length == tokenURIs.length,
            "VividNFT: arrays length mismatch"
        );
        require(recipients.length > 0, "VividNFT: empty arrays");
        require(recipients.length <= 50, "VividNFT: batch too large");

        for (uint256 i = 0; i < recipients.length; i++) {
            // 直接使用内部逻辑而不是调用external函数以避免gas限制
            _mintSingle(recipients[i], tokenURIs[i]);
        }
    }

    /// @dev 内部单次铸造函数，用于批量铸造
    function _mintSingle(address to, string memory _tokenURI) private {
        require(
            bytes(_tokenURI).length > 0,
            "VividNFT: tokenURI cannot be empty"
        );
        require(!_usedURIs[_tokenURI], "VividNFT: tokenURI already used");

        uint256 tokenId = _nextTokenId++;

        _usedURIs[_tokenURI] = true;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        emit TokenMinted(to, tokenId, _tokenURI);
    }

    /// @notice 更新现有token的元数据URI
    /// @dev 只有所有者可以调用此函数。新的URI不能是之前使用过的。
    /// @param tokenId 要更新的token ID
    /// @param newTokenURI 新的元数据URI
    function updateTokenURI(
        uint256 tokenId,
        string memory newTokenURI
    ) external onlyOwner {
        require(
            _ownerOf(tokenId) != address(0),
            "VividNFT: token does not exist"
        );
        require(
            bytes(newTokenURI).length > 0,
            "VividNFT: tokenURI cannot be empty"
        );
        require(!_usedURIs[newTokenURI], "VividNFT: tokenURI already used");

        // 释放旧的URI
        string memory oldTokenURI = tokenURI(tokenId);
        _usedURIs[oldTokenURI] = false;

        _usedURIs[newTokenURI] = true;
        _setTokenURI(tokenId, newTokenURI);

        emit TokenURIUpdated(tokenId, newTokenURI);
    }

    /// @notice 检查URI是否已经被使用
    /// @param uri 要检查的URI
    /// @return 如果URI已经被使用返回true，否则返回false
    function isURIUsed(string memory uri) external view returns (bool) {
        return _usedURIs[uri];
    }

    /// @notice 获取当前token ID计数器的值
    /// @return token ID计数器的当前值
    function getCurrentTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    /// @notice 获取已铸造token的总数
    /// @return token的总供应量
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    /// @notice 检查token是否存在
    /// @param tokenId 要检查的token ID
    /// @return 如果token存在返回true，否则返回false
    function exists(uint256 tokenId) external view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /// @dev Solidity多重继承所需的覆盖
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    /// @dev Solidity多重继承所需的覆盖
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev 覆盖_update函数以在销毁时清理URI
    /// @notice 当token被销毁时（to == address(0)），清理URI使用标记
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // 如果token将被销毁，先清理URI使用标记
        if (to == address(0) && from != address(0)) {
            string memory oldTokenURI = tokenURI(tokenId);
            _usedURIs[oldTokenURI] = false;
        }

        // 调用父合约的_update完成实际的更新/销毁操作
        return super._update(to, tokenId, auth);
    }
}
