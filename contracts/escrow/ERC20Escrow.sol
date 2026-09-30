// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ERC20Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        CREATED,
        FUNDED,
        RELEASED,
        REFUNDED
    }

    struct Escrow {
        address buyer;
        address seller;
        address token;
        uint256 amount;
        Status status;
    }

    error InvalidSeller();
    error InvalidToken();
    error InvalidAmount();
    error EscrowNotFound(uint256 escrowId);
    error UnauthorizedBuyer(address caller);
    error InvalidStatus(Status currentStatus);
    error IncorrectFundingAmount(uint256 expected, uint256 received);
    error IncorrectTransferAmount(uint256 expected, uint256 received);
    error NativeCurrencyNotAccepted();

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount
    );
    event EscrowFunded(
        uint256 indexed escrowId,
        address indexed buyer,
        address token,
        uint256 amount
    );
    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount
    );
    event EscrowRefunded(
        uint256 indexed escrowId,
        address indexed buyer,
        address token,
        uint256 amount
    );

    uint256 public nextEscrowId = 1;
    mapping(uint256 escrowId => Escrow escrow) public escrows;

    receive() external payable {
        revert NativeCurrencyNotAccepted();
    }

    fallback() external payable {
        revert NativeCurrencyNotAccepted();
    }

    function createEscrow(address seller, address token, uint256 amount)
        external
        returns (uint256 escrowId)
    {
        if (seller == address(0) || seller == msg.sender || seller == address(this)) {
            revert InvalidSeller();
        }
        if (token == address(0) || token.code.length == 0) revert InvalidToken();
        if (amount == 0) revert InvalidAmount();

        escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            status: Status.CREATED
        });

        emit EscrowCreated(escrowId, msg.sender, seller, token, amount);
    }

    function fund(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireBuyer(escrow);
        _requireStatus(escrow, Status.CREATED);

        IERC20 token = IERC20(escrow.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        escrow.status = Status.FUNDED;
        token.safeTransferFrom(escrow.buyer, address(this), escrow.amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != escrow.amount) {
            revert IncorrectFundingAmount(escrow.amount, received);
        }

        emit EscrowFunded(escrowId, escrow.buyer, escrow.token, escrow.amount);
    }

    function release(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireBuyer(escrow);
        _requireStatus(escrow, Status.FUNDED);

        escrow.status = Status.RELEASED;
        _transferExact(IERC20(escrow.token), escrow.seller, escrow.amount);

        emit EscrowReleased(
            escrowId, escrow.buyer, escrow.seller, escrow.token, escrow.amount
        );
    }

    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireBuyer(escrow);
        _requireStatus(escrow, Status.FUNDED);

        escrow.status = Status.REFUNDED;
        _transferExact(IERC20(escrow.token), escrow.buyer, escrow.amount);

        emit EscrowRefunded(escrowId, escrow.buyer, escrow.token, escrow.amount);
    }

    function _getEscrow(uint256 escrowId) private view returns (Escrow storage escrow) {
        escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert EscrowNotFound(escrowId);
    }

    function _requireBuyer(Escrow storage escrow) private view {
        if (msg.sender != escrow.buyer) revert UnauthorizedBuyer(msg.sender);
    }

    function _requireStatus(Escrow storage escrow, Status requiredStatus) private view {
        if (escrow.status != requiredStatus) revert InvalidStatus(escrow.status);
    }

    function _transferExact(IERC20 token, address recipient, uint256 amount) private {
        uint256 balanceBefore = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 balanceAfter = token.balanceOf(recipient);
        uint256 received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert IncorrectTransferAmount(amount, received);
    }
}
