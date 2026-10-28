const CORS_ORIGIN = "https://viralcage.com";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

function corsHeaders(origin) {
  const allowed = origin === CORS_ORIGIN || origin === "https://www.viralcage.com";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = CORS_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}

function validRoomCode(value) {
  return /^\d{3,4}$/.test(String(value || ""));
}

function makeRoomCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => String(byte % 10)).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || CORS_ORIGIN;
    const originAllowed = origin === CORS_ORIGIN || origin === "https://www.viralcage.com";
    if (request.headers.get("Origin") && !originAllowed) return new Response("Origin not allowed", { status: 403 });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "viral-cage-chat", transport: "websocket" }, 200, origin);
    }

    if (url.pathname === "/rooms" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400, origin); }
      if (body.action !== "create") return json({ error: "Unsupported room action." }, 400, origin);

      // Prefer compact 3-digit codes; fall back to 4 digits after repeated collisions.
      for (const length of [3, 4]) {
        for (let attempt = 0; attempt < 40; attempt++) {
          const code = makeRoomCode(length);
          const id = env.CHAT_ROOMS.idFromName(code);
          const stub = env.CHAT_ROOMS.get(id);
          const result = await stub.fetch("https://room.internal/create", { method: "POST" });
          if (result.status === 201) return json({ room: code }, 201, origin);
          if (result.status !== 409) return json({ error: "Room service could not create a room." }, 503, origin);
        }
      }
      return json({ error: "Room capacity is busy. Please try again." }, 503, origin);
    }

    const match = url.pathname.match(/^\/rooms\/(\d{3,4})$/);
    if (match && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const code = match[1].toUpperCase();
      const id = env.CHAT_ROOMS.idFromName(code);
      return env.CHAT_ROOMS.get(id).fetch(request);
    }

    return json({ error: "Not found." }, 404, origin);
  }
};

export class ChatRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = ctx.storage;
    this.rate = new WeakMap();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      const existing = await this.state.get("created");
      if (existing) return new Response("exists", { status: 409 });
      await this.state.put("created", true);
      await this.state.put("createdAt", Date.now());
      await this.state.setAlarm(Date.now() + ROOM_TTL_MS);
      return new Response("created", { status: 201 });
    }

    if (url.pathname === "/rooms" || url.pathname === "/create") {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const room = await this.state.get("created");
    if (!room) return new Response("Room not found", { status: 404 });

    const name = (url.searchParams.get("name") || "Guest").trim().slice(0, 24) || "Guest";
    const uid = (url.searchParams.get("uid") || crypto.randomUUID()).slice(0, 64);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server, [uid]);
    server.serializeAttachment({ uid, name });
    await this.touch();
    this.broadcast({ type: "system", text: name + " joined the room." }, server);
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async touch() {
    await this.state.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  broadcast(payload, except = null) {
    const data = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except && socket.readyState === WebSocket.OPEN) {
        try { socket.send(data); } catch {}
      }
    }
  }

  broadcastPresence() {
    this.broadcast({ type: "presence", online: this.ctx.getWebSockets().length });
  }

  async webSocketMessage(socket, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || message.type !== "message") return;

    const text = String(message.text || "").trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) return;

    const now = Date.now();
    const rate = this.rate.get(socket) || { start: now, count: 0 };
    if (now - rate.start > 1000) { rate.start = now; rate.count = 0; }
    rate.count++;
    this.rate.set(socket, rate);
    if (rate.count > 8) {
      try { socket.send(JSON.stringify({ type: "error", message: "Please slow down." })); } catch {}
      return;
    }

    const attachment = socket.deserializeAttachment() || {};
    this.broadcast({
      type: "message",
      uid: attachment.uid || "guest",
      name: attachment.name || "Guest",
      text,
      at: now
    });
    await this.touch();
  }

  async webSocketClose(socket, code, reason) {
    const attachment = socket.deserializeAttachment() || {};
    this.broadcast({ type: "system", text: (attachment.name || "A guest") + " left the room." });
    this.broadcastPresence();
    await this.touch();
  }

  async webSocketError(socket) {
    try { socket.close(1011, "Connection error"); } catch {}
    this.broadcastPresence();
  }

  async alarm() {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length) {
      await this.touch();
      return;
    }
    await this.state.deleteAll();
  }
}
