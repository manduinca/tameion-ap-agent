// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUSDC {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

/// @notice Testnet AP treasury. All amounts use the ERC-20 USDC interface (6 decimals).
/// Budget windows are fixed 30-day UTC epochs, not calendar months.
contract APTreasury {
    IUSDC public immutable usdc;
    address public immutable owner;
    address public immutable operator;
    uint256 public immutable autoLimit;
    uint256 public immutable perTransactionLimit;
    uint256 public immutable totalBudget;
    uint256 public constant PERIOD = 30 days;
    mapping(address => bool) public allowedVendor;
    mapping(bytes32 => uint256) public categoryBudget;
    mapping(uint256 => uint256) public totalSpent;
    mapping(uint256 => mapping(bytes32 => uint256)) public categorySpent;
    mapping(bytes32 => bool) public paid;
    mapping(bytes32 => bool) public approval;
    bool private entered;

    event Decision(bytes32 indexed invoiceRef, uint8 action, bytes32 reasonHash);
    event Payment(bytes32 indexed invoiceRef, address indexed vendor, uint256 amount, bytes32 category);
    event Approved(bytes32 indexed commitment);

    modifier onlyOwner() { require(msg.sender == owner, "OWNER_ONLY"); _; }
    modifier onlyOperator() { require(msg.sender == operator, "OPERATOR_ONLY"); _; }

    constructor(address token, address owner_, address operator_, address[] memory vendors,
        bytes32[] memory categories, uint256[] memory budgets,
        uint256 autoLimit_, uint256 perTransactionLimit_, uint256 totalBudget_) {
        require(token != address(0) && owner_ != address(0) && operator_ != address(0), "ZERO_ADDRESS");
        require(owner_ != operator_, "SEPARATE_ROLES");
        require(categories.length == budgets.length && categories.length > 0, "CATEGORIES");
        require(autoLimit_ > 0 && perTransactionLimit_ >= autoLimit_ && totalBudget_ >= perTransactionLimit_, "LIMITS");
        usdc = IUSDC(token); owner = owner_; operator = operator_;
        autoLimit = autoLimit_; perTransactionLimit = perTransactionLimit_; totalBudget = totalBudget_;
        for (uint256 i; i < vendors.length; i++) { require(vendors[i] != address(0), "ZERO_VENDOR"); allowedVendor[vendors[i]] = true; }
        for (uint256 i; i < categories.length; i++) { require(budgets[i] > 0, "ZERO_BUDGET"); categoryBudget[categories[i]] = budgets[i]; }
    }

    function commitment(bytes32 ref, address vendor, uint256 amount, bytes32 category) public pure returns (bytes32) {
        return keccak256(abi.encode(ref, vendor, amount, category));
    }

    function approve(bytes32 ref, address vendor, uint256 amount, bytes32 category) external onlyOwner {
        bytes32 key = commitment(ref, vendor, amount, category);
        approval[key] = true; emit Approved(key);
    }

    function recordDecision(bytes32 ref, uint8 action, bytes32 reasonHash) external onlyOperator {
        require(action == 1 || action == 2, "PAY_REQUIRES_PAYMENT");
        emit Decision(ref, action, reasonHash);
    }

    function pay(bytes32 ref, address vendor, uint256 amount, bytes32 category, bytes32 reasonHash) external onlyOperator {
        require(!entered, "REENTRANCY"); entered = true;
        require(!paid[ref], "ALREADY_PAID");
        require(allowedVendor[vendor], "VENDOR_NOT_ALLOWED");
        require(amount > 0 && amount <= perTransactionLimit, "TRANSACTION_LIMIT");
        uint256 period = block.timestamp / PERIOD;
        require(totalSpent[period] + amount <= totalBudget, "TOTAL_BUDGET");
        require(categoryBudget[category] > 0 && categorySpent[period][category] + amount <= categoryBudget[category], "CATEGORY_BUDGET");
        bytes32 key = commitment(ref, vendor, amount, category);
        if (amount > autoLimit) { require(approval[key], "OWNER_APPROVAL_REQUIRED"); delete approval[key]; }
        paid[ref] = true; totalSpent[period] += amount; categorySpent[period][category] += amount;
        require(usdc.transfer(vendor, amount), "TRANSFER_FAILED");
        emit Decision(ref, 0, reasonHash); emit Payment(ref, vendor, amount, category);
        entered = false;
    }
}
