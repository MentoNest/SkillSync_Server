# SkillSync Soroban Contract

Stellar Soroban smart contract for SkillSync.

## Structure

```
contract/
├── Cargo.toml
├── rustfmt.toml
├── .gitignore
└── src/
    ├── lib.rs
    └── test.rs
```

## Prerequisites

- Rust toolchain (`rustup`)
- WASM target:
  ```bash
  rustup target add wasm32v1-none
  ```
- Stellar CLI (recommended):
  ```bash
  cargo install --locked stellar-cli
  ```

## Build

```bash
cargo build --target wasm32v1-none --release
```

Or with the Stellar CLI:

```bash
stellar contract build
```

## Test

```bash
cargo test
```
