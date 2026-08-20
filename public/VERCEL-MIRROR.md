# THE BIG DIPPER — Vercel Mirror

This branch keeps the existing Render deployment untouched and exposes the exact same `public/` interface as an independent Vercel frontend.

## Vercel project settings

- Repository: `Tresor562/DIPPER-`
- Production branch: `vercel-mirror`
- Root Directory: `public`
- Framework Preset: Other
- Build Command: leave empty
- Output Directory: leave empty

The browser calls `/pair` on the Vercel domain. `vercel.json` rewrites that request to `api/pair.js`, which proxies the request server-side to the persistent THE BIG DIPPER backend.

Default backend order:
1. `https://the-big-dipper.onrender.com`
2. `https://the-big-dipper.zone.id`

Optional environment overrides:
- `DIPPER_BACKEND_URL`
- `DIPPER_BACKEND_FALLBACK_URL`

Do not put WhatsApp/Baileys sessions on Vercel. Render remains the persistent bot runtime.
