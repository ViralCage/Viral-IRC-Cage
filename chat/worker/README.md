# Viral Cage Chat

Standalone chat page: `https://viralcage.com/chat/`.

## Features
- Guest rooms with 3-digit codes and 4-digit fallback.
- Live text messages, emoji picker, online count and typing status.
- Temporary file/photo attachments, camera photo capture and voice-message recording.
- Invite URL copy and QR sharing.
- Global online-player directory, private WebRTC voice calls and video calls.
- Cloudflare Durable Object handles online presence and WebRTC signaling (offer/answer/ICE). Voice and video media streams travel peer-to-peer between browsers; Firebase is not used for call signaling.
- Messages and media are not persisted as chat history. Empty rooms expire after 24 hours without activity.

## Deploy the Worker separately
The Cloudflare Pages project that serves the website and this Worker are separate deployments. The new calling feature requires deploying this Worker update; updating the GitHub files alone does not publish the Worker.

1. In Cloudflare **Workers & Pages**, open the Worker named `viral-cage-chat`.
2. Deploy from the `chat/worker` folder using its `wrangler.toml`, or run `npx wrangler deploy` from that folder.
3. Keep the existing `CHAT_ROOMS` binding and `ChatRoom` migration. Add the `VOICE_HUB` Durable Object binding and apply the `v2` SQLite migration for `ChatVoiceHub` as declared in `wrangler.toml`.
4. Confirm `https://viral-cage-chat.viralcage.workers.dev/health` returns `ok: true` and includes `cloudflare-signaling`, `webrtc-voice`, and `webrtc-video`.
5. Open `https://viralcage.com/chat/` on two devices, allow microphone/camera access, and test voice and video calls.

## Media connectivity
The signaling server does not carry call audio/video. WebRTC attempts direct peer-to-peer connectivity using public STUN servers. Some restrictive networks and carrier-grade NATs require a TURN relay; without one, a call may fail to connect. A TURN service is not configured in this version.

## Limits and privacy
This uses browser APIs and Cloudflare Durable Objects, not Firebase for call signaling. Cloudflare plan quotas and limits still apply. Camera and microphone access require HTTPS and explicit permission. Browser/device support varies.

## Security
- Only `https://viralcage.com` and `https://www.viralcage.com` origins are allowed.
- Never put API tokens or secrets in the frontend.
- Guest identities are client-generated identifiers, not verified accounts. Do not treat the directory as an authenticated identity system.
- Do not share sensitive files in guest rooms.
