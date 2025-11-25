// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract IWSToken is
    Initializable,
    ERC20Upgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    uint8 private _customDecimals;
    mapping(address => bool) private _blacklist;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        address initialHolder_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __Ownable_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _customDecimals = decimals_;

        if (initialSupply_ > 0 && initialHolder_ != address(0)) {
            _mint(initialHolder_, initialSupply_);
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function decimals() public view virtual override returns (uint8) {
        return _customDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external whenNotPaused {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            transfer(recipients[i], amounts[i]);
        }
    }

    function addToBlacklist(address account) external onlyOwner {
        _blacklist[account] = true;
    }

    function removeFromBlacklist(address account) external onlyOwner {
        _blacklist[account] = false;
    }

    function isBlacklisted(address account) external view returns (bool) {
        return _blacklist[account];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override whenNotPaused {
        require(!_blacklist[from] && !_blacklist[to], "Blacklisted address");
        super._beforeTokenTransfer(from, to, amount);
    }

    function withdrawETH(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH balance");
        to.transfer(balance);
    }

    receive() external payable {}

    fallback() external payable {}
}
