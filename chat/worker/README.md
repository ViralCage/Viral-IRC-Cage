# Viral Cage Chat

Standalone chat page: `https://viralcage.com/chat/`.

## Features
- Guest rooms with 3-digit codes and 4-digit fallback.
- Live text messages, emoji picker, online count and typing status.
- Temporary file/photo attachments (800 KB client limit), camera photo capture and voice-message recording.
- Invite URL copy and QR sharing.
- Messages and media are relayed live and are not persisted as chat history.
- Empty rooms expire after 24 hours without activity.

## Deploy the Worker separately
The Cloudflare Pages project that serves the website and this Worker are separate deployments.

1. In Cloudflare **Workers & Pages**, open the Worker named `viral-cage-chat`.
2. Deploy the contents of this folder using the existing `wrangler.toml` configuration, or from this folder run `npx wrangler deploy`.
3. Confirm the Worker has the Durable Object binding `CHAT_ROOMS` and the `ChatRoom` SQLite migration.
4. Check `https://viral-cage-chat.viralcage.workers.dev/health`. It should return `ok: true` and list the chat features.
5. The chat page frontend uses that Worker URL.

## Free-tier limits and privacy
This implementation uses browser APIs and the existing Cloudflare Worker/Durable Objects. It does not require a paid chat SDK, media API, Firebase, or a paid storage service. Cloudflare free-plan quotas and limits still apply; this is not unlimited hosting. Media is temporarily relayed through the room and is not saved for later download. File transfers are limited to small attachments to control bandwidth. Camera and microphone access require HTTPS and explicit user permission. Browser/device support varies.

## Security
- Only `https://viralcage.com` and `https://www.viralcage.com` origins are allowed.
- Never put API tokens or secrets in the frontend.
- Do not share sensitive files in guest rooms.
