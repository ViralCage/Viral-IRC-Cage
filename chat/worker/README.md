# Viral Cage Chat — Cloudflare Worker

This Worker is the standalone backend for `https://viralcage.com/chat/`.
It is intentionally separate from the game backend and does not edit the root site.

## Current scope

- Creates six-character invite rooms.
- WebSocket real-time text messaging.
- Guest nicknames; no Firebase Auth.
- Live online count and join/leave notices.
- Messages are broadcast live and are **not stored**.
- Rooms expire after 24 hours without activity.
- Message length and per-connection send rate are limited.

## Deploy

1. In Cloudflare, open **Workers & Pages** and create a Worker named `viral-cage-chat`.
2. Upload/deploy the files in this folder, or use Wrangler from this folder:
   `npx wrangler deploy`.
3. Confirm the Worker has the Durable Object binding `CHAT_ROOMS` and the `ChatRoom` SQLite migration from `wrangler.toml`.
4. In the Worker settings, add the custom domain `chat-api.viralcage.com`. This is a dedicated chat API hostname; it does not change the root website or game routes.
5. Check `https://chat-api.viralcage.com/health`. It should return JSON with `ok: true`.
6. Set `API_BASE` in `../index.html` to `https://chat-api.viralcage.com` (already set for the planned custom domain in this branch).

## Free-plan note

This is designed to minimize server work, not promise unlimited usage. WebSocket sessions, Durable Object requests and storage are subject to Cloudflare plan limits. Live text messages pass through the room Durable Object. File transfer and voice/video P2P are not included in this first migration phase.

## Security and operations

- Only `https://viralcage.com` and `https://www.viralcage.com` are allowed by the CORS response.
- Do not place API tokens or secrets in the frontend.
- Room codes are random six-character codes; share them only with intended participants.
- No durable chat history is retained.

## Cloudflare build trigger

This documentation-only update is on the `feature/cloudflare-chat-migration` branch. It can be used to verify that the connected Cloudflare Git integration detects commits on the configured production branch.
