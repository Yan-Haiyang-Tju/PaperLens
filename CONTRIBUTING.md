# Contributing to PaperLens

Thank you for helping make close academic reading calmer and more private.

1. Create a focused branch from `main`.
2. Run `npm ci`, then `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`.
3. Run `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
4. Keep API keys and real papers out of commits. Add migrations for every database schema change.
5. Describe user-visible behavior, privacy impact, and verification evidence in the pull request.

Please use a conventional, imperative commit subject and keep unrelated changes separate.
