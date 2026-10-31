const ORIGIN = "https://viralcage.com";
const TTL = 24 * 60 * 60 * 1000;
const MAX_PAYLOAD = 16000;
const GAMES = new Set(["teen-patti","jutpatti","rummy","call-break"]);
const headers = origin => ({
  "Access-Control-Allow-Origin": origin === "https://www.viralcage.com" ? origin : ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});
const reply = (data,status,origin) => new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...headers(origin)}});
function newCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=new Uint8Array(6);crypto.getRandomValues(b);return [...b].map(x=>chars[x%chars.length]).join("");}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get("Origin")||ORIGIN;
  if(request.headers.get("Origin")&&!([ORIGIN,"https://www.viralcage.com"].includes(origin)))return new Response("Forbidden",{status:403});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(url.pathname==="/health")return reply({ok:true,service:"vc-game-rooms"},200,origin);
  if(url.pathname==="/rooms"&&request.method==="POST"){
   let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
   if(body.action!=="create"||!GAMES.has(body.game))return reply({error:"Select a supported game."},400,origin);
   for(let i=0;i<8;i++){const code=newCode(),stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code));const r=await stub.fetch("https://room.internal/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:body.game})});if(r.status===201)return reply({room:code,game:body.game},201,origin);}
   return reply({error:"Could not allocate a room. Try again."},503,origin);
  }
  const match=url.pathname.match(/^\/rooms\/([A-Z0-9]{6})$/i);
  if(match&&request.headers.get("Upgrade")?.toLowerCase()==="websocket"){
   const code=match[1].toUpperCase(),game=url.searchParams.get("game")||"";
   if(!GAMES.has(game))return new Response("Invalid game",{status:400});
   const id=env.GAME_ROOMS.idFromName(code);
   return env.GAME_ROOMS.get(id).fetch(new Request("https://room.internal/connect?game="+encodeURIComponent(game)+"&name="+encodeURIComponent(url.searchParams.get("name")||"Guest"),request));
  }
  return reply({error:"Not found"},404,origin);
 }
};
export class GameRoom {
 constructor(ctx){this.ctx=ctx;this.storage=ctx.storage;this.rate=new WeakMap();}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==="/create"&&request.method==="POST"){
   const existing=await this.storage.get("room");
   if(existing)return new Response("exists",{status:409});
   let data={};try{data=await request.json()}catch{}
   await this.storage.put("room",{game:data.game,createdAt:Date.now()});
   await this.storage.setAlarm(Date.now()+TTL);
   return new Response("created",{status:201});
  }
  if(url.pathname!=="/connect"||request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return new Response("WebSocket upgrade required",{status:426});
  const room=await this.storage.get("room");
  if(!room)return new Response("Room not found",{status:404});
  if(url.searchParams.get("game")!==room.game)return new Response("This room belongs to another game.",{status:409});
  const sockets=this.ctx.getWebSockets();
  if(sockets.length>=6)return new Response("Room is full",{status:409});
  const name=(url.searchParams.get("name")||"Guest").trim().slice(0,24)||"Guest";
  const uid=crypto.randomUUID(),pair=new WebSocketPair(),client=pair[0],server=pair[1];
  this.ctx.acceptWebSocket(server,[uid]);server.serializeAttachment({uid,name});
  await this.touch();
  this.broadcast({type:"system",text:name+" joined."},server);
  this.presence();
  return new Response(null,{status:101,webSocket:client});
 }
 async touch(){await this.storage.setAlarm(Date.now()+TTL);}
 broadcast(msg,except=null){const raw=JSON.stringify(msg);for(const ws of this.ctx.getWebSockets())if(ws!==except&&ws.readyState===WebSocket.OPEN){try{ws.send(raw)}catch{}}}
 presence(){this.broadcast({type:"presence",online:this.ctx.getWebSockets().length});}
 async webSocketMessage(ws,raw){
  if(typeof raw!=="string"||raw.length>MAX_PAYLOAD)return;
  let msg;try{msg=JSON.parse(raw)}catch{return}
  if(!msg||!["game:action","game:state"].includes(msg.type))return;
  const now=Date.now(),rate=this.rate.get(ws)||{start:now,count:0};
  if(now-rate.start>1000){rate.start=now;rate.count=0;}rate.count++;this.rate.set(ws,rate);
  if(rate.count>20){try{ws.send(JSON.stringify({type:"error",message:"Too many updates. Slow down."}))}catch{}return;}
  const user=ws.deserializeAttachment()||{};
  // Relay game events only inside the matching room; game engines must validate moves.
  this.broadcast({type:msg.type,from:user.uid,name:user.name,payload:msg.payload,at:now},ws);
  await this.touch();
 }
 async webSocketClose(ws){const u=ws.deserializeAttachment()||{};this.broadcast({type:"system",text:(u.name||"A player")+" left."});this.presence();await this.touch();}
 async webSocketError(ws){try{ws.close(1011,"Connection error")}catch{}this.presence();}
 async alarm(){if(this.ctx.getWebSockets().length){await this.touch();return;}await this.storage.deleteAll();}
}