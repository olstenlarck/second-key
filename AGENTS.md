# Repository instructions

- Use `pnpm exec vp test` for tests.
- Use `pnpm exec vp run check` after every code or configuration change. It is the canonical formatting, linting, and type-checking command.
- Do not add separate `check`, `lint`, or `format` package scripts.
- Prefer readable TypeScript: descriptive names, small focused functions, early returns, and blank lines before `return` statements.
- Keep imports sorted by the Vite+ perfectionist rules.
- Preserve the `second-key-totp` Worker name, `TOTP_KV` binding, and inherited `MASTER_KEY` secret.
