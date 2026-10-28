const CORS_ORIGIN = "https://viralcage.com";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_PACKET_LENGTH = 1200000;

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
  return new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8",...corsHeaders(origin)}});
}
function validRoomCode(value) { return /^\d{3,4}$/.test(String(value || "")); }
function makeRoomCode(length) {
  const bytes = new Uint8Array(length);crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => String(byte % 10)).join("");
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || CORS_ORIGIN;
    const originAllowed = origin === CORS_ORIGIN || origin === "https://www.viralcage.com";
    if (request.headers.get("Origin") && !originAllowed) return new Response("Origin not allowed",{status:403});
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(origin)});
    if (url.pathname === "/health" && request.method === "GET") return json({ok:true,service:"viral-cage-chat",transport:"websocket",features:["text","emoji","attachments","camera-photos","voice-messages","typing","presence","webrtc-voice","webrtc-video","cloudflare-signaling"]},200,origin);
    if (url.pathname === "/voice" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const id = env.VOICE_HUB.idFromName("global");
      return env.VOICE_HUB.get(id).fetch(request);
    }
    if (url.pathname === "/rooms" && request.method === "POST") {
      let body={};try{body=await request.json()}catch{return json({error:"Invalid request body."},400,origin)}
      if(body.action!=="create")return json({error:"Unsupported room action."},400,origin);
      for(const length of [3,4])for(let attempt=0;attempt<40;attempt++){
        const code=makeRoomCode(length),id=env.CHAT_ROOMS.idFromName(code),stub=env.CHAT_ROOMS.get(id);
        const result=await stub.fetch("https://room.internal/create",{method:"POST"});
        if(result.status===201)return json({room:code},201,origin);
        if(result.status!==409)return json({error:"Room service could not create a room."},503,origin);
      }
      return json({error:"Room capacity is busy. Please try again."},503,origin);
    }
    const match=url.pathname.match(/^\/rooms\/(\d{3,4})$/);
    if(match&&request.method==="POST"){
      const id=env.CHAT_ROOMS.idFromName(match[1]);
      const stub=env.CHAT_ROOMS.get(id);
      const result=await stub.fetch("https://room.internal/create",{method:"POST"});
      if(result.status!==201&&result.status!==409)return json({error:"Could not prepare the matching game chat room."},503,origin);
      return json({ok:true,room:match[1]},200,origin);
    }
    if(match&&request.headers.get("Upgrade")?.toLowerCase()==="websocket"){
      const id=env.CHAT_ROOMS.idFromName(match[1]);return env.CHAT_ROOMS.get(id).fetch(request);
    }
    return json({error:"Not found."},404,origin);
  }
};
export class ChatRoom {
  constructor(ctx){this.ctx=ctx;this.state=ctx.storage;this.rate=new WeakMap();this.typing=new WeakMap()}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==="/create"&&request.method==="POST"){
      if(await this.state.get("created"))return new Response("exists",{status:409});
      await this.state.put("created",true);await this.state.put("createdAt",Date.now());await this.state.setAlarm(Date.now()+ROOM_TTL_MS);return new Response("created",{status:201});
    }
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return new Response("WebSocket upgrade required",{status:426});
    if(!await this.state.get("created"))return new Response("Room not found",{status:404});
    const name=(url.searchParams.get("name")||"Guest").trim().slice(0,24)||"Guest";
    const uid=(url.searchParams.get("uid")||crypto.randomUUID()).slice(0,64);
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server,[uid]);server.serializeAttachment({uid,name});await this.touch();
    this.broadcast({type:"system",text:name+" joined the room."},server);this.broadcastPresence();
    return new Response(null,{status:101,webSocket:client});
  }
  async touch(){await this.state.setAlarm(Date.now()+ROOM_TTL_MS)}
  broadcast(payload,except=null){
    const data=JSON.stringify(payload);
    for(const socket of this.ctx.getWebSockets())if(socket!==except&&socket.readyState===WebSocket.OPEN){try{socket.send(data)}catch{}}
  }
  broadcastPresence(){this.broadcast({type:"presence",online:this.ctx.getWebSockets().length})}
  async webSocketMessage(socket,raw){
    if(typeof raw!=="string"||raw.length>MAX_PACKET_LENGTH){try{socket.send(JSON.stringify({type:"error",message:"File or message is too large."}))}catch{};return}
    let message;try{message=JSON.parse(raw)}catch{return}
    if(!message||typeof message.type!=="string")return;
    const attachment=socket.deserializeAttachment()||{};
    if(message.type==="typing"||message.type==="typing-clear"){
      const now=Date.now(),last=this.typing.get(socket)||0;if(now-last<700)return;this.typing.set(socket,now);
      this.broadcast({type:message.type,name:attachment.name||"A guest"},socket);return;
    }
    let outgoing;
    if(message.type==="message"){
      const text=String(message.text||"").trim();if(!text||text.length>MAX_MESSAGE_LENGTH)return;
      outgoing={type:"message",uid:attachment.uid||"guest",name:attachment.name||"Guest",text,at:Date.now()};
    }else if(message.type==="attachment"||message.type==="voice"){
      const data=String(message.data||""),mime=String(message.mime||"application/octet-stream");
      if(!data.startsWith("data:")||data.length>1100000||!/^data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,/.test(data))return;
      if(message.type==="voice"&&!mime.startsWith("audio/"))return;
      if(message.type==="attachment"&&(mime==="text/html"||mime==="image/svg+xml"||mime==="application/javascript"))return;
      outgoing={type:message.type,uid:attachment.uid||"guest",name:attachment.name||"Guest",fileName:String(message.name||"Attachment").slice(0,100),mime,size:Math.max(0,Math.min(Number(message.size)||0,900000)),data,at:Date.now()};
    }else return;
    const now=Date.now(),rate=this.rate.get(socket)||{start:now,count:0};
    if(now-rate.start>1000){rate.start=now;rate.count=0}rate.count++;this.rate.set(socket,rate);
    if(rate.count>8){try{socket.send(JSON.stringify({type:"error",message:"Please slow down."}))}catch{};return}
    this.broadcast(outgoing);await this.touch();
  }
  async webSocketClose(socket,code,reason){
    const attachment=socket.deserializeAttachment()||{};this.broadcast({type:"system",text:(attachment.name||"A guest")+" left the room."});this.broadcastPresence();await this.touch();
  }
  async webSocketError(socket){try{socket.close(1011,"Connection error")}catch{};this.broadcastPresence()}
  async alarm(){if(this.ctx.getWebSockets().length){await this.touch();return}await this.state.deleteAll()}
}

/* Global Cloudflare Durable Object for WebRTC presence and signaling.
   Audio/video media stays peer-to-peer; this object relays SDP/ICE only. */
export class ChatVoiceHub {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", {status:426});
    const url = new URL(request.url);
    const uid = String(url.searchParams.get("uid") || "").slice(0,64);
    const name = String(url.searchParams.get("name") || "Guest").replace(/[<>\x00-\x1f]/g,"").trim().slice(0,24) || "Guest";
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(uid)) return new Response("Invalid guest identity", {status:400});
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server, [uid]);
    server.serializeAttachment({uid,name});
    server.send(JSON.stringify({type:"ready",uid}));
    this.broadcastDirectory();
    return new Response(null,{status:101,webSocket:client});
  }
  peers() {
    const unique = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = ws.deserializeAttachment() || {};
      if (a.uid) unique.set(a.uid,{uid:a.uid,name:a.name || "Guest"});
    }
    return [...unique.values()];
  }
  broadcastDirectory() {
    const packet = JSON.stringify({type:"directory",peers:this.peers()});
    for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) { try { ws.send(packet); } catch {} }
  }
  webSocketMessage(socket, raw) {
    if (typeof raw !== "string" || raw.length > 100000) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const sender = socket.deserializeAttachment() || {};
    if (!sender.uid || !["offer","answer","ice","hangup","reject","busy"].includes(msg.signalType)) return;
    const to = String(msg.to || "").slice(0,64), callId = String(msg.callId || "").slice(0,80);
    if (!to || !callId || to === sender.uid) return;
    const payload = msg.payload == null ? null : msg.payload;
    const encoded = JSON.stringify({type:"signal",from:sender.uid,fromName:sender.name || "Guest",signalType:msg.signalType,callId,payload});
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const target = ws.deserializeAttachment() || {};
      if (target.uid === to) { try { ws.send(encoded); } catch {} }
    }
  }
  webSocketClose() { this.broadcastDirectory(); }
  webSocketError(socket) { try { socket.close(1011,"Signaling connection error"); } catch {} this.broadcastDirectory(); }
}
