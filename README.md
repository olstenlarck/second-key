# Second Key

Private TOTP vault on Cloudflare, built with Astro 7, Vite+, Tailwind CSS 4, pnpm, and Workers KV.

## Setup

```bash
pnpm install
pnpm dev
```

Set `MASTER_KEY` with `pnpm wrangler secret put MASTER_KEY`. Shoo provides Google authentication; secrets are encrypted with AES-GCM before KV storage.


## Deploy

Pushes to `main` run validation and deploy the Astro build to the existing `second-key-totp` Cloudflare Worker through GitHub Actions.
