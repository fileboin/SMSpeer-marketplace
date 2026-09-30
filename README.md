# SMSpeer

SMSpeer is an independent project for a future peer-to-peer SMS marketplace.
The current scope is Phase 1: establish and test an ERC-20 escrow foundation
before connecting to Base. This repository does not contain marketplace,
gateway, Android, or OTP code.

## Current status

- Phase 1, Block 2: minimal local ERC-20 escrow contract and tests
- No blockchain network is configured or used by the tests
- No production wallet, deployment, or real-funds configuration is included

## Project layout

- `contracts/escrow/ERC20Escrow.sol`: escrow lifecycle contract
- `contracts/test/MockERC20.sol`: local test token, including fee-on-transfer cases
- `test/escrow/ERC20Escrow.test.js`: escrow lifecycle and authorization tests
- `contracts/ToolchainCheck.sol`: Hardhat toolchain verification contract
- `test/toolchain.test.js`: local compile/deploy/read verification test
- `script/`: reserved for later local/testnet scripts
- `config/networks/`: network metadata
- `config/tokens/`: chain-specific token metadata
- `hardhat.config.js`: local Hardhat configuration

## Requirements

- Node.js and npm

OpenZeppelin Contracts is used for safe ERC-20 operations and reentrancy
protection. Tests use a local mock token; no RPC endpoint is needed.

## Local setup

Install dependencies with `npm install`. No wallet, RPC endpoint, or secrets
are needed for local checks.

Run the local compile and test checks with:

```sh
npm run build
npm test
```

The escrow supports `CREATED -> FUNDED -> RELEASED` and
`CREATED -> FUNDED -> REFUNDED`. Only the buyer can fund, release, or refund an
escrow. Fee-on-transfer tokens are rejected if the exact agreed amount is not
received by the escrow and settlement recipient.

## Planned escrow lifecycle

This contract has not been audited and has not been deployed. It has no timeout,
dispute, cancellation, marketplace, or recovery mechanism. Use only with tokens
whose ERC-20 behavior is compatible with exact-balance checks.
