(function(){
'use strict';
const firebaseConfig={apiKey:"AIzaSyC_R_O2e3D1-fGjHByesj98uynbjXnG9ng",authDomain:"bagh-chal-5dc2f.firebaseapp.com",databaseURL:"https://bagh-chal-5dc2f-default-rtdb.firebaseio.com",projectId:"bagh-chal-5dc2f",storageBucket:"bagh-chal-5dc2f.firebasestorage.app",messagingSenderId:"304434839417",appId:"1:304434839417:web:6c1ac04800e26c8f0039a8"};
const $=id=>document.getElementById(id);
const form=$('admin-login-form'),email=$('admin-email'),password=$('admin-password'),button=$('admin-login-button'),googleButton=$('google-login-button'),message=$('login-message'),status=$('auth-status');
let auth=null,db=null,unsubs=[],players=[],rooms=[],adminUid=null,spectatorRef=null,spectatorHandler=null,inactiveRoomTimers=new Map(),activeSpectatorRoomId='',roomCodesById={},activeSpectatorRoomData=null;
function msg(t,c){message.textContent=t;message.className='login-message'+(c?' '+c:'');}
function state(t){status.innerHTML='<i></i> '+t;}
function deny(){document.body.classList.remove('admin-authenticated');stopMonitoring();moderationBans={};if($('ban-count'))$('ban-count').textContent='—';if($('ban-record-list'))$('ban-record-list').innerHTML='<div class="empty">Sign in to load moderation records.</div>';}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatSeen(value){if(value==null||value==='')return 'Last seen: unavailable';const n=Number(value);if(!Number.isFinite(n)||n<=0)return 'Last seen: unavailable';const d=new Date(n);return 'Last seen: '+d.toLocaleString();}
function stopMonitoring(){unsubs.forEach(fn=>{try{fn();}catch(e){}});unsubs=[];inactiveRoomTimers.forEach(timer=>clearTimeout(timer));inactiveRoomTimers.clear();if(spectatorRef&&spectatorHandler)spectatorRef.off('value',spectatorHandler);spectatorRef=null;spectatorHandler=null;adminUid=null;}

let commentatorPrevious=null,commentatorAudioEnabled=false,commentatorLastText='',commentatorLanguage='en',tournamentAudioContext=null,tournamentAmbience=null;
function commentatorPlayers(room){const names=room.playerNames||{},presence=room.presence||{};return Object.keys({...names,...presence}).map(role=>({role,name:(presence[role]&&presence[role].name)||names[role]||role}));}
function commentatorName(room,token){const value=String(token||'').trim(),players=commentatorPlayers(room);const found=players.find(p=>p.role.toLowerCase()===value.toLowerCase()||p.name.toLowerCase()===value.toLowerCase());return found?found.name:value||'the players';}
function bilingual(en,np){return en;}
function commentatorState(room){
 const type=room.activeGameType||'baghchal', data=type==='baghchal'?(room.game||{}):((room.miniGames||{})[type]||{});
 const board=Array.isArray(data.board)?data.board:(type==='chess'&&Array.isArray(data.history)?(data.history[data.history.length-1]||{}).b:[]);
 const winner=data.winner||room.winner||'';
 return {type,data,board:Array.isArray(board)?board.slice():[],winner:String(winner||''),turn:data.turn,moveCount:Array.isArray(data.history)?data.history.length:0,captured:Number(data.goatsCaptured||0),boxes:Array.isArray(data.boxes)?data.boxes.filter(Boolean).length:0,scores:data.scores||{}};
}
function commentatorSay(message,kind='move',speechText={en:message,np:message}){
 const feed=$('commentator-feed');if(!feed||!message||message===commentatorLastText)return;commentatorLastText=message;
 const row=document.createElement('div');row.className='commentary-line '+kind;row.textContent=message;feed.prepend(row);while(feed.children.length>6)feed.lastElementChild.remove();
 const st=$('commentator-status');if(st)st.textContent=kind==='win'?'VICTORY COMMENTARY':'LIVE COMMENTARY';
 if(commentatorAudioEnabled&&'speechSynthesis'in window){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(speechText.en||message);u.lang='en-CA';u.rate=kind==='win'?.98:1.02;u.pitch=kind==='win'?1.12:1.02;u.volume=.95;speechSynthesis.speak(u);}catch(_){}}
}

function getTournamentAudio(){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
 if(!tournamentAudioContext)tournamentAudioContext=new AC();
 if(tournamentAudioContext.state==='suspended')tournamentAudioContext.resume().catch(()=>{});
 return tournamentAudioContext;
}
function startTournamentAmbience(){
 const ctx=getTournamentAudio();if(!ctx||tournamentAmbience)return;
 const master=ctx.createGain();master.gain.value=.075;master.connect(ctx.destination);
 const noise=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=noise.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.22;
 const crowd=ctx.createBufferSource();crowd.buffer=noise;crowd.loop=true;
 const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=520;filter.Q.value=.55;
 const crowdGain=ctx.createGain();crowdGain.gain.value=.22;
 crowd.connect(filter);filter.connect(crowdGain);crowdGain.connect(master);crowd.start();
 const low=ctx.createOscillator(),lowGain=ctx.createGain();low.type='sine';low.frequency.value=55;lowGain.gain.value=.12;low.connect(lowGain);lowGain.connect(master);low.start();
 const pulse=ctx.createOscillator(),pulseGain=ctx.createGain();pulse.type='triangle';pulse.frequency.value=110;pulseGain.gain.value=.018;pulse.connect(pulseGain);pulseGain.connect(master);pulse.start();
 tournamentAmbience={master,crowd,filter,crowdGain,low,pulse};
}
function setTournamentGameAmbience(type){
 const ctx=getTournamentAudio(),amb=tournamentAmbience;if(!ctx||!amb)return;
 const profiles={chess:[340,.07],checkers:[390,.09],dotsboxes:[520,.12],fourconnect:[620,.18],baghchal:[470,.14],ludo:[680,.19],carrom:[420,.08],pool:[360,.08],tictactoe:[500,.1]};
 const p=profiles[type]||[460,.11],now=ctx.currentTime;
 amb.filter.frequency.setTargetAtTime(p[0],now,.7);amb.crowdGain.gain.setTargetAtTime(p[1],now,.7);
}
function stopTournamentAmbience(){
 if(!tournamentAmbience||!tournamentAudioContext)return;
 const ctx=tournamentAudioContext,amb=tournamentAmbience;tournamentAmbience=null;
 try{amb.master.gain.setTargetAtTime(0,ctx.currentTime,.18);setTimeout(()=>{try{amb.crowd.stop();amb.low.stop();amb.pulse.stop();amb.master.disconnect();}catch(_){}},900);}catch(_){}
}
function playTournamentMoveSound(type='generic',event='move'){
 const ctx=getTournamentAudio();if(!ctx||!commentatorAudioEnabled)return;
 const profiles={chess:390,checkers:440,dotsboxes:690,fourconnect:190,baghchal:300,ludo:520,carrom:240,pool:210,tictactoe:560};
 const now=ctx.currentTime,f=profiles[type]||480,osc=ctx.createOscillator(),gain=ctx.createGain();
 osc.type=event==='capture'?'sawtooth':'sine';osc.frequency.setValueAtTime(event==='capture'?f*.55:f,now);osc.frequency.exponentialRampToValueAtTime(event==='capture'?85:f*.68,now+.095);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(event==='capture'?.15:.1,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.13);
 osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.14);
}

function playFireworkSound(){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
 try{
  const ctx=new AC(),now=ctx.currentTime;
  const noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.8),ctx.sampleRate),channel=noise.getChannelData(0);
  for(let i=0;i<channel.length;i++)channel[i]=(Math.random()*2-1)*(1-i/channel.length);
  const src=ctx.createBufferSource();src.buffer=noise;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(2600,now);filter.frequency.exponentialRampToValueAtTime(180,now+.72);
  const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.32,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.78);
  src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);src.start(now);src.stop(now+.8);
  [0,.17,.34].forEach((delay,k)=>{const osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(95-k*13,now+delay);g.gain.setValueAtTime(.0001,now+delay);g.gain.exponentialRampToValueAtTime(.13,now+delay+.02);g.gain.exponentialRampToValueAtTime(.0001,now+delay+.32);osc.connect(g);g.connect(ctx.destination);osc.start(now+delay);osc.stop(now+delay+.34);});
  setTimeout(()=>ctx.close().catch(()=>{}),1300);
 }catch(_){}
}
function fireworkBurst(){playFireworkSound();const panel=$('spectator-panel');if(panel){panel.classList.add('spectator-victory-burst');setTimeout(()=>panel.classList.remove('spectator-victory-burst'),1400);}}
function commentaryStable(value){
 if(Array.isArray(value))return value.map(commentaryStable);
 if(value&&typeof value==='object'){
  const out={};
  Object.keys(value).sort().forEach(key=>{
   if(/^(updatedAt|updated_at|timestamp|lastSeen|last_seen|connected|online|presence|heartbeat|createdAt|created_at)$/i.test(key))return;
   const v=value[key];if(typeof v!=='function'&&v!==undefined)out[key]=commentaryStable(v);
  });
  return out;
 }
 return value;
}
function commentatorPlayerForSide(room,side){
 const names=room.playerNames||{},presence=room.presence||{};
 const key=String(side==null?'':side).toLowerCase();
 const role=({goat:'goat',goats:'goat',2:'goat',x:'goat',white:'goat',player1:'goat',player_1:'goat',p1:'goat',tiger:'tiger',tigers:'tiger',1:'tiger',o:'tiger',black:'tiger',player2:'tiger',player_2:'tiger',p2:'tiger'})[key]||key;
 const live=presence[role]||{};
 return String(live.name||names[role]||'').trim();
}
function commentatorMover(room,turn,moveNumber,type,previousData,currentData){
 let side=turn;
 if(type==='chess'){
  const history=Array.isArray(previousData&&previousData.history)?previousData.history:[];
  const position=history[history.length-1]||{};
  side=Number(position.t)===1?'white':Number(position.t)===-1?'black':side;
 }
 if(side==null||side===''){
  const lm=(currentData&&currentData.lastMove)||(previousData&&previousData.lastMove)||{};
  side=lm.by||lm.player||'';
 }
 const exact=commentatorPlayerForSide(room,side);
 if(exact)return exact;
 const names=room.playerNames||{},presence=room.presence||{};
 return String(presence.goat?.name||names.goat||presence.tiger?.name||names.tiger||'A player');
}
function observeCommentary(room){
 const cur=commentatorState(room),prev=commentatorPrevious;
 const ps=commentatorPlayers(room),n1=commentatorPlayerForSide(room,'goat')||ps[0]?.name||'Player 1',n2=commentatorPlayerForSide(room,'tiger')||ps.find(p=>p.role==='tiger')?.name||ps[1]?.name||'Player 2';
 const data=cur.data||{};
 const signature=JSON.stringify(commentaryStable(data));
 cur.signature=signature;
 commentatorPrevious=cur;
 if(!prev||prev.type!==cur.type){
  const en='Welcome to VC Play live tournament coverage. '+n1+' takes on '+n2+' in '+cur.type+'. The match is underway!';
  if(commentatorAudioEnabled){startTournamentAmbience();setTournamentGameAmbience(cur.type);}
  commentatorSay(en,'intro',{en});return;
 }
 if(cur.winner&&cur.winner!==prev.winner){
  const winner=commentatorMover(room,cur.winner,1,cur.type,cur.data,cur.data);
  const en='What a finish! '+winner+' wins the '+cur.type+' match! A fantastic performance. Congratulations!';
  commentatorSay(en,'win',{en});fireworkBurst();return;
 }
 if(signature===prev.signature)return;
 const moveNumber=Math.max(1,cur.moveCount||prev.moveCount+1);
 const mover=commentaryMover(room,prev.turn,moveNumber);
 const nextTurn=cur.turn==null?'':String(cur.turn);
 const turnText=nextTurn?'. The next turn is '+nextTurn+'.':'';
 let en=mover+' makes the next move in '+cur.type+'. Every decision matters at this stage'+turnText;
 if(cur.type==='baghchal'){
  if(cur.captured>prev.captured)en='Tiger capture! '+mover+' captures a goat. '+cur.captured+' goats have now been captured. The pressure is building!';
  else if(cur.board.length!==prev.board.length||cur.board.join('|')!==prev.board.join('|'))en=mover+' moves on the BaghChal board. The tigers and goats are battling for position. What happens next?';
  else en=mover+' adjusts the BaghChal position. The strategy is developing with every turn.';
 }else if(cur.type==='chess'){
  const pos=Array.isArray(data.history)?data.history[data.history.length-1]||{}:{};
  const side=prev.turn===1?'White':prev.turn===2?'Black':String(prev.turn||'player');
  en=mover+' plays '+side+' in chess. Move '+(pos.full||moveNumber)+'. Watch the board carefully; one tactical idea can change everything!';
  if(data.check||pos.check)en='Check! '+mover+' puts the king under pressure. The defending side must respond!';
 }else if(cur.type==='checkers'){
  en=mover+' makes a checkers move. The fight for the middle of the board is getting tighter!';
  if(Number(data.captured||data.captures||0)>Number(prev.data.captured||prev.data.captures||0))en='A capture in checkers! '+mover+' takes an opponent piece. The match momentum could be shifting!';
 }else if(cur.type==='fourconnect'){
  en=mover+' drops a counter into Four Connect. The winning connection is taking shape. Keep watching those lines!';
 }else if(cur.type==='tictactoe'){
  const mark=String(prev.turn||'');
  en=mover+' places '+(mark?mark+' ':'a mark ')+'in Tic-Tac-Toe. A row, column or diagonal could decide the match!';
 }else if(cur.type==='dotsboxes'){
  const gained=Math.max(0,cur.boxes-prev.boxes),scores=cur.scores||{};
  en=gained?mover+' claims '+gained+' '+(gained===1?'box':'boxes')+' in Dots and Boxes! The score is now '+Number(scores.X||0)+' to '+Number(scores.O||0)+'.':mover+' draws a line in Dots and Boxes. The next line could complete a box!';
 }else if(cur.type==='ludo'){
  en=mover+' makes a move in Ludo. The race around the board is on; every roll can change the standings!';
  if(data.dice!=null)en=mover+' rolls '+data.dice+' in Ludo and makes a move. The race is heating up!';
 }else if(cur.type==='carrom'){
  en=mover+' takes a shot in Carrom. The striker is in play and the score could change with this turn!';
 }else if(cur.type==='pool'||cur.type==='8ball'||cur.type==='nineball'){
  en=mover+' takes a shot in '+cur.type+'. Watch the cue ball and the next pocket attempt!';
 }else{
  en=mover+' makes a move in '+cur.type+'. The live match is changing with every action. Stay tuned!';
 }
 const score=cur.scores||{};
 if(cur.type!=='dotsboxes'&&JSON.stringify(score)!==JSON.stringify(prev.scores||{})){
  const entries=Object.entries(score).filter(([,v])=>Number.isFinite(Number(v)));
  if(entries.length)en+=' Current score: '+entries.map(([k,v])=>k+' '+v).join(', ')+'.';
 }
 playTournamentMoveSound(cur.type,cur.captured>prev.captured?'capture':cur.boxes>prev.boxes?'score':'move');
 commentatorSay(en,'move',{en});
}
function setCommentatorAudio(){
 commentatorAudioEnabled=!commentatorAudioEnabled;
 if(commentatorAudioEnabled){startTournamentAmbience();if(commentatorPrevious)setTournamentGameAmbience(commentatorPrevious.type);}else{stopTournamentAmbience();}
 const b=$('commentator-audio');if(b)b.textContent=commentatorAudioEnabled?'Mute live audio':'Enable live audio';
 const state=$('commentator-audio-state');if(state)state.textContent=commentatorAudioEnabled?'ENGLISH COMMENTARY · GAME FX':'SOUND OFF · Click Enable live audio to start';
 if(commentatorAudioEnabled){if(window.speechSynthesis){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance('Welcome to VC Play tournament live coverage. The match is about to begin.');u.lang='en-CA';speechSynthesis.speak(u);} }
 else if(window.speechSynthesis)speechSynthesis.cancel();
}
function renderSpectatorGame(room){
 const type=room.activeGameType||'baghchal', mini=room.miniGames||{}, data=type==='baghchal'?(room.game||{}):(mini[type]||{});
 const arr=Array.isArray(data.board)?data.board:[];
 const turn=data.turn===1?'Goats':data.turn===2?'Tigers':(data.turn||'—');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let board='',meta='Turn: '+turn;
 const grid=(items,cls)=>'<div class="spectator-grid '+cls+'">'+items.join('')+'</div>';
 if(type==='chess'){
  const hist=Array.isArray(data.history)?data.history:[],pos=hist[hist.length-1]||{},b=Array.isArray(pos.b)?pos.b:[];
  const glyph={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
  const last=data.lastMove||pos.lastMove||{},from=String(last.from||last.source||''),to=String(last.to||last.target||'');
  const files='abcdefgh',rankLabels=Array.from({length:8},(_,r)=>8-r),displayFiles=[4,3,2,1,0,7,6,5];
  const tiles=Array.from({length:64},(_,i)=>{
   const r=Math.floor(i/8),viewC=i%8,c=displayFiles[viewC],p=b[r*16+c]||'.',square=files[c]+(8-r),white=p!=='.'&&p===p.toUpperCase();
   const coord=(viewC===0?'<small class="chess-rank">'+rankLabels[r]+'</small>':'')+(r===7?'<small class="chess-file">'+files[c]+'</small>':'');
   const piece=p!=='.'?'<span class="chess-piece '+(white?'piece-white':'piece-black')+'" aria-label="'+(white?'White ':'Black ')+({K:'king',Q:'queen',R:'rook',B:'bishop',N:'knight',P:'pawn',k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'}[p]||'piece')+'">'+glyph[p]+'</span>':'';
   return '<div class="chess-tile '+((r+c)%2?'chess-dark':'chess-light')+((square===from||square===to)?' last-move':'')+'">'+coord+piece+'</div>';
  });
  board='<div class="chess-stage"><div class="chess-board-frame"><div class="chess-board">'+tiles.join('')+'</div></div><div class="chess-legend"><span><i class="legend-white"></i> White</span><span><i class="legend-black"></i> Black</span></div></div>';
  meta='Chess · '+(pos.t===1?'White to move':'Black to move')+' · Move '+(pos.full||1)+(pos.check?' · CHECK':'');
 }else if(type==='tictactoe'){
  const a=Array.isArray(data.board)?data.board:[];board=grid(Array.from({length:9},(_,i)=>'<div class="spectator-square ttt-square '+(a[i]==='X'?'mark-x':a[i]==='O'?'mark-o':'')+'">'+esc(a[i])+'</div>'),'ttt-grid');meta='Tic-Tac-Toe · Turn: '+esc(data.turn||'—');
 }else if(type==='checkers'){
  board=grid(Array.from({length:64},(_,i)=>{const p=arr[i]||'';return '<div class="spectator-square '+((Math.floor(i/8)+i%8)%2?'dark':'light')+'">'+(p?'<span class="checker-piece '+(p[0]==='X'?'red-piece':'black-piece')+'">'+(p.length>1?'♛':'●')+'</span>':'')+'</div>';}),'checkers-grid');meta='Checkers · Turn: '+esc(data.turn||'—');
 }else if(type==='fourconnect'){
  board=grid(Array.from({length:42},(_,i)=>{const p=arr[i]||'';return '<div class="connect-hole">'+(p?'<span class="connect-piece '+(p==='X'?'red-piece':'yellow-piece')+'"></span>':'')+'</div>';}),'connect-grid');meta='Four Connect · Turn: '+esc(data.turn||'—');
 }else if(type==='baghchal'){
  const tigerArt='<svg class="animal-sculpture tiger-sculpture" viewBox="0 0 100 100" role="img" aria-label="Tiger game piece"><defs><radialGradient id="tigerGold" cx="32%" cy="22%"><stop offset="0" stop-color="#ffe6a1"/><stop offset=".48" stop-color="#d98a32"/><stop offset="1" stop-color="#713315"/></radialGradient><linearGradient id="tigerMuzzle" x2="0" y2="1"><stop stop-color="#fff2d8"/><stop offset="1" stop-color="#b9a18a"/></linearGradient></defs><ellipse cx="50" cy="87" rx="29" ry="7" fill="#000" opacity=".32"/><path d="M18 30 9 9 34 17Q50 8 66 17L91 9 82 32Q91 52 77 70 65 86 50 86 35 86 23 70 9 52 18 30Z" fill="url(#tigerGold)" stroke="#51270f" stroke-width="3"/><path d="M18 26 31 32 25 43 15 39M82 26 69 32 75 43 85 39M30 18 38 31M70 18 62 31M19 48 34 53M81 48 66 53M30 69 42 62M70 69 58 62" fill="none" stroke="#2b1a12" stroke-width="6" stroke-linecap="round"/><path d="M29 46Q39 38 46 47M71 46Q61 38 54 47" fill="none" stroke="#fff0ce" stroke-width="5"/><ellipse cx="37" cy="48" rx="4" ry="5" fill="#16120f"/><ellipse cx="63" cy="48" rx="4" ry="5" fill="#16120f"/><path d="M42 62Q50 54 58 62L50 69Z" fill="#39201b"/><path d="M34 66Q50 78 66 66Q63 82 50 82Q37 82 34 66Z" fill="url(#tigerMuzzle)"/><path d="M40 72Q50 77 60 72" fill="none" stroke="#5b3024" stroke-width="2"/><path d="M28 60 8 56M28 66 8 68M72 60 92 56M72 66 92 68" stroke="#f5e5cf" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const goatArt='<svg class="animal-sculpture goat-sculpture" viewBox="0 0 100 100" role="img" aria-label="Goat game piece"><defs><radialGradient id="goatCoat" cx="32%" cy="18%"><stop stop-color="#fff" /><stop offset=".52" stop-color="#d9e0e8"/><stop offset="1" stop-color="#788596"/></radialGradient><linearGradient id="goatHorn" x2="1" y2="1"><stop stop-color="#fff4d7"/><stop offset="1" stop-color="#94795a"/></linearGradient></defs><ellipse cx="50" cy="88" rx="28" ry="6" fill="#000" opacity=".32"/><path d="M29 26Q17 5 24 4 38 7 39 28M71 26Q83 5 76 4 62 7 61 28" fill="none" stroke="url(#goatHorn)" stroke-width="8" stroke-linecap="round"/><path d="M22 29 9 19Q5 44 23 54M78 29 91 19Q95 44 77 54" fill="url(#goatCoat)" stroke="#687486" stroke-width="2"/><path d="M23 31Q25 15 50 15 75 15 77 31L73 65Q68 83 50 86 32 83 27 65Z" fill="url(#goatCoat)" stroke="#718093" stroke-width="2.5"/><path d="M31 43Q40 35 46 44M69 43Q60 35 54 44" fill="none" stroke="#fff" stroke-width="5"/><ellipse cx="39" cy="47" rx="3.5" ry="5" fill="#202936"/><ellipse cx="61" cy="47" rx="3.5" ry="5" fill="#202936"/><path d="M43 59Q50 54 57 59L50 66Z" fill="#5c6470"/><path d="M44 67Q50 72 56 67Q57 82 50 84 43 82 44 67Z" fill="#e8edf2" stroke="#9aa5b3" stroke-width="1.5"/><path d="M38 76Q50 82 62 76" fill="none" stroke="#687486" stroke-width="2"/><path d="M32 57 18 54M32 62 17 63M68 57 82 54M68 62 83 63" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const nodes=Array.from({length:25},(_,i)=>{const p=arr[i];return '<div class="bagh-node">'+(p===1?'<span class="tiger-piece" title="Tiger">'+tigerArt+'</span>':p===2?'<span class="goat-piece" title="Goat">'+goatArt+'</span>':'')+'</div>';});
  board='<div class="baghchal-real-board"><svg class="baghchal-lines" viewBox="0 0 500 500" aria-hidden="true"><g><path d="M50 50H450 M50 150H450 M50 250H450 M50 350H450 M50 450H450 M50 50V450 M150 50V450 M250 50V450 M350 50V450 M450 50V450"/><path d="M50 50L450 450 M450 50L50 450"/></g></svg><div class="baghchal-points">'+nodes.join('')+'</div></div>';
  meta='BaghChal · '+(data.goatsToPlace??'—')+' goats to place · '+(data.goatsCaptured??0)+' captured · Turn: '+(data.turn===1?'Tigers':'Goats');
 }else if(type==='dotsboxes'){
  const edges=Array.isArray(data.edges)?data.edges:[],edgeOwners=Array.isArray(data.edgeOwners)?data.edgeOwners:[],boxes=Array.isArray(data.boxes)?data.boxes:[];
  const players=room.playerNames||{},presence=room.presence||{};
  const ownerName=owner=>{
   const key=String(owner||'').toLowerCase(),role=({x:'player1',o:'player2',1:'player1',2:'player2'})[key]||key;
   const live=presence[role]||{};
   return live.name||players[role]||players[key]||owner;
  };
  const lastEdge=Number(data.lastMove&&data.lastMove.edge),cells=[];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
   if(r%2===0&&c%2===0)cells.push('<div class="dots-node"></div>');
   else if(r%2===0){
    const k=(r/2)*4+Math.floor(c/2),on=!!edges[k],side=String(edgeOwners[k]||'').toLowerCase();
    const color=side==='x'?'edge-x':side==='o'?'edge-o':'';
    cells.push('<div class="dots-edge dots-edge-h '+(on?'edge-on ':'')+color+(k===lastEdge?' edge-last':'')+'"><span></span></div>');
   }else if(c%2===0){
    const k=20+Math.floor(r/2)*5+c/2,on=!!edges[k],side=String(edgeOwners[k]||'').toLowerCase();
    const color=side==='x'?'edge-x':side==='o'?'edge-o':'';
    cells.push('<div class="dots-edge dots-edge-v '+(on?'edge-on ':'')+color+(k===lastEdge?' edge-last':'')+'"><span></span></div>');
   }else{
    const k=Math.floor(r/2)*4+Math.floor(c/2),owner=boxes[k]||'',label=owner?ownerName(owner):'';
    const side=String(owner).toLowerCase(),cls=side==='x'||side==='player1'||side==='1'?'box-x':side==='o'||side==='player2'||side==='2'?'box-o':'';
    cells.push('<div class="dots-box '+cls+(owner?' box-claimed':'')+'">'+(owner?'<span>'+esc(label)+'</span>':'')+'</div>');
   }
  }
  const score=data.scores||{},scoreRows=['X','O'].map(side=>{
   const label=ownerName(side)||side,cls=side==='X'?'score-x':'score-o';
   return '<div class="dots-score '+cls+'"><b>'+esc(label)+'</b><strong>'+Number(score[side]||0)+'</strong></div>';
  }).join('');
  board='<div class="dots-arena"><div class="dots-board-shell"><div class="dots-board-grid">'+cells.join('')+'</div></div><div class="dots-scorebar">'+scoreRows+'</div></div>';
  meta='Dots & Boxes · '+(data.turn!=null?'Turn: '+esc(ownerName(data.turn)||data.turn):'Live match')+' · '+boxes.filter(Boolean).length+' boxes claimed';
}else{board='<div class="spectator-empty">Visual board is not available for '+esc(type)+'.</div>';meta='Game: '+esc(type);}
 const names=room.playerNames||{},presence=room.presence||{};
 const roles=[...new Set([...Object.keys(names),...Object.keys(presence)])];
 const seatAliases=[['player1','player_1','p1','goat','goats','white','x','1'],['player2','player_2','p2','tiger','tigers','black','o','2']];
 const seats=seatAliases.map((aliases,index)=>{
  let role=roles.find(r=>aliases.includes(String(r).toLowerCase()));
  if(!role)role=roles[index]||'';
  const live=role?presence[role]||{}:{},name=live.name||(role&&names[role])||(role?role:'Waiting for player');
  return {role,name,connected:!!live.connected};
 });
 const seatCard=(seat,index)=>{
  const side=index===0?'PLAYER 1':'PLAYER 2',tone=index===0?'seat-one':'seat-two';
  const state=seat.connected?'PLAYER CONNECTED':'WAITING FOR PLAYER';
  return '<aside class="spectator-tv-seat '+tone+'"><div class="spectator-camera-frame"><div class="spectator-camera-glow"></div><div class="spectator-camera-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="5" y="11" width="27" height="26" rx="5"></rect><path d="m32 19 11-6v22l-11-6z"></path><circle cx="18.5" cy="24" r="6"></circle></svg></div><span class="spectator-camera-label">CAMERA FEED</span><span class="spectator-camera-status">'+(seat.connected?'CAMERA NOT SHARED':'PLAYER OFFLINE')+'</span></div><div class="spectator-seat-info"><span class="spectator-player-side">'+side+'</span><strong>'+esc(seat.name)+'</strong><small><i class="'+(seat.connected?'is-connected':'')+'"></i>'+state+'</small></div></aside>';
 };
 const playerLabels=seats.map(seat=>esc(seat.name)+(seat.connected?' (connected)':''));
 const shortRoomCode=roomCodesById[activeSpectatorRoomId]||'';
 $('spectator-meta').innerHTML='<div class="spectator-room-code"><span>ROOM CODE</span><strong>'+esc(shortRoomCode||'CODE UNAVAILABLE')+'</strong>'+(shortRoomCode?'<button type="button" class="copy-room-code-button" data-copy-room="'+esc(shortRoomCode)+'">Copy code</button>':'')+'</div><div class="spectator-room-details">'+esc(meta)+(playerLabels.length?' · Players: '+playerLabels.join(' vs '):' · Player names unavailable')+' · Room ID: '+esc(activeSpectatorRoomId)+(data.winner?' · Winner: '+esc(data.winner):'')+'</div>';
 $('spectator-data').innerHTML='<div class="spectator-tv-layout">'+seatCard(seats[0],0)+'<main class="spectator-board-face">'+board+'</main>'+seatCard(seats[1],1)+'</div>';
}
function watchRoom(roomId){if(!roomId)return;activeSpectatorRoomId=String(roomId);activeSpectatorRoomData=null;try{const url=new URL(window.location.href);url.searchParams.set('watch',roomId);window.history.replaceState({},'',url.toString());}catch(e){}commentatorPrevious=null;commentatorLastText='';if($('commentator-feed'))$('commentator-feed').innerHTML='<div class="commentary-line intro">Connecting to live match commentary…</div>';if(spectatorRef&&spectatorHandler)spectatorRef.off('value',spectatorHandler);spectatorRef=db.ref('bagchalRooms/'+roomId);$('spectator-status').textContent='CONNECTING';const code=roomCodesById[activeSpectatorRoomId]||'';$('spectator-meta').innerHTML='<div class="spectator-room-code"><span>ROOM CODE</span><strong>'+esc(code||'LOOKING UP…')+'</strong>'+(code?'<button type="button" class="copy-room-code-button" data-copy-room="'+esc(code)+'">Copy code</button>':'')+'</div><div class="spectator-room-details">Live updates · Room ID: '+esc(roomId)+'</div>';$('spectator-data').textContent='Loading live room…';spectatorHandler=snap=>{if(!snap.exists()){$('spectator-status').textContent='ROOM ENDED';$('spectator-data').textContent='This room record no longer exists.';return;}const value=snap.val();activeSpectatorRoomData=value;$('spectator-status').textContent='LIVE';observeCommentary(value);renderSpectatorGame(value);};spectatorRef.on('value',spectatorHandler,err=>{$('spectator-status').textContent='ERROR';$('spectator-data').textContent='Could not watch this room: '+err.message;});}
function presenceFor(room){
 const p=room&&room.presence||{},out=[];
 Object.keys(p).forEach(role=>{const x=p[role];if(x&&x.connected){out.push({uid:x.uid||'',name:x.name||room.playerNames&&room.playerNames[role]||role,role,lastSeen:x.lastSeen||null});}});
 return out;
}
function renderRooms(){
 const el=$('room-list');if(!rooms.length){el.innerHTML='<div class="empty"><b>No active rooms</b><p>Inactive rooms are automatically removed after 2 minutes.</p></div>';return;}
 el.innerHTML=rooms.filter(r=>r.active).map(r=>{const code=roomCodesById[r.id]||'';return '<article class="data-row"><div class="data-main"><b>ROOM CODE: '+esc(code||'CODE UNAVAILABLE')+'</b><span>'+esc(r.game||'Game type not specified')+' · '+r.players.length+' connected</span><small>'+(r.players.length?r.players.map(p=>esc(p.name)+' ('+esc(p.role)+')').join(' · '):'No connected players')+' · Room ID: '+esc(r.id)+'</small></div><div class="room-actions"><span class="row-tag '+(r.active?'':'inactive-tag')+'">'+(r.active?'ACTIVE':'INACTIVE')+'</span>'+(code?'<button class="copy-room-code-button" type="button" data-copy-room="'+esc(code)+'">Copy code</button>':'')+'<button class="watch-room-button" type="button" data-watch-room="'+esc(r.id)+'">Watch</button><button class="end-room-button danger-outline" type="button" data-room-id="'+esc(r.id)+'">End game</button></div></article>';}).join('');
}
function renderPlayers(){
 const q=($('player-search').value||'').trim().toLowerCase();
 const el=$('player-results');
 if(!q){el.innerHTML='';return;}
 const shown=players.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.uid||'').toLowerCase().includes(q));
 if(!shown.length){el.innerHTML='<div class="empty"><b>No matching connected players</b><p>Only player names are searched.</p></div>';return;}
 el.innerHTML=shown.map(p=>'<article class="data-row"><div class="data-main"><b>'+esc(p.name)+'</b><span>'+esc(p.role)+' · Room '+esc(p.room)+'</span><small>UID: <code>'+esc(p.uid||'Not provided')+'</code></small></div><div class="moderation-actions"><span class="row-tag">CONNECTED</span>'+(p.uid?'<button type="button" class="copy-player-uid-button" data-copy-uid="'+esc(p.uid)+'">Copy UID</button><button type="button" class="ban-player-fill-button" data-ban-uid="'+esc(p.uid)+'">Ban player</button>':'')+'<button type="button" class="kick-player-button" data-kick-room="'+esc(p.room)+'" data-kick-role="'+esc(p.role)+'" data-kick-uid="'+esc(p.uid||'')+'">Kick from room</button></div></article>').join('');
}

 const moderationPath=()=>adminUid?'adminData/'+adminUid+'/moderation':'';
 let moderationBans={};
 function renderBanRecords(){
  const el=$('ban-record-list');if(!el)return;
  const entries=Object.entries(moderationBans||{}).map(([uid,b])=>({uid,...(b||{})})).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
  const now=Date.now(),active=entries.filter(x=>!x.revokedAt&&(!Number(x.expiresAt)||Number(x.expiresAt)>now));
  if($('ban-count'))$('ban-count').textContent=String(active.length);
  if($('ban-record-status'))$('ban-record-status').textContent=entries.length+' record(s)';
  if(!entries.length){el.innerHTML='<div class="empty"><b>No moderation records</b><p>Ban records will appear here.</p></div>';return;}
  el.innerHTML=entries.map(x=>{const inactive=!!x.revokedAt||(Number(x.expiresAt)>0&&Number(x.expiresAt)<=now);return '<article class="data-row"><div class="data-main"><b>'+esc(x.nickname||x.uid)+'</b><span>'+esc(x.reason||'No reason')+' · '+(inactive?'INACTIVE':'ACTIVE')+'</span><small>UID: '+esc(x.uid)+' · '+esc(x.durationLabel||'Unknown')+' · '+esc(x.createdAt?new Date(x.createdAt).toLocaleString():'Date unavailable')+'</small></div>'+(inactive?'':'<button type="button" class="unban-player-button" data-unban-uid="'+esc(x.uid)+'">Unban</button>')+'</article>';}).join('');
 }
 function watchModeration(){
  if(!adminUid||!db)return;const ref=db.ref(moderationPath()+'/bans');
  const handler=snap=>{moderationBans=snap.val()||{};renderBanRecords();};
  ref.on('value',handler,err=>{if($('ban-record-status'))$('ban-record-status').textContent='Read error: '+err.message;});
  unsubs.push(()=>ref.off('value',handler));
 }
 function durationLabel(ms){return ms===0?'Permanent':ms===3600000?'1 hour':ms===86400000?'24 hours':ms===604800000?'7 days':'30 days';}
 function audit(action,details){return db.ref(moderationPath()+'/audit').push({action,details,by:adminUid,at:Date.now()});}
 function createBan(){
  const uid=$('ban-target').value.trim(),reason=$('ban-reason').value,duration=Number($('ban-duration').value);
  if(!/^[A-Za-z0-9_-]{10,128}$/.test(uid)){alert('Enter a valid Firebase UID.');return;}
  if(!reason){alert('Select a reason.');return;}if(!adminUid||!db){alert('Sign in as Super Admin first.');return;}
  if(!confirm('Record a '+durationLabel(duration)+' ban for '+uid+'?'))return;
  const p=players.find(x=>x.uid===uid),now=Date.now(),record={uid,nickname:p&&p.name||'',reason,durationMs:duration,durationLabel:durationLabel(duration),createdAt:now,expiresAt:duration?now+duration:0,revokedAt:0,createdBy:adminUid,enforcement:'ADMIN_RECORD_ONLY'};
  const btn=$('ban-submit');btn.disabled=true;btn.textContent='Saving…';
  db.ref(moderationPath()+'/bans/'+uid).set(record).then(()=>audit('ban_created',{uid,reason,durationMs:duration})).then(()=>{$('ban-target').value='';$('ban-reason').value='';$('ban-record-status').textContent='RECORD SAVED';}).catch(e=>alert('Save failed: '+e.message)).finally(()=>{btn.disabled=false;btn.textContent='Record ban';});
 }
 function revokeBan(uid){
  if(!confirm('Revoke the ban record for '+uid+'?'))return;const ref=db.ref(moderationPath()+'/bans/'+uid);
  ref.once('value').then(s=>{if(!s.exists())throw new Error('Record not found.');return ref.update({revokedAt:Date.now(),revokedBy:adminUid}).then(()=>audit('ban_revoked',{uid}));}).catch(e=>alert('Unban failed: '+e.message));
 }
 function requestKick(roomId,role,uid){
  if(!confirm('Kick this player from room '+roomId+'? Their current room presence and matchmaking entries will be removed. They may reconnect until game-client enforcement is added.'))return;
  const updates={};updates['bagchalRooms/'+roomId+'/presence/'+role]=null;
  if(uid){updates['bagchalRandomMatchQueue/'+uid]=null;updates['bagchalMatchmaking/'+uid]=null;}
  updates[moderationPath()+'/kickRequests/'+roomId+'_'+role+'_'+Date.now()]={roomId,role,uid:uid||'',by:adminUid,at:Date.now(),status:'presence_removed'};
  db.ref().update(updates).then(()=>audit('kick_requested',{roomId,role,uid:uid||''})).then(()=>$('room-refresh-status').textContent='KICK REQUEST RECORDED').catch(e=>alert('Kick request failed: '+e.message));
 }
function renderQueue(data){
 const el=$('queue-list'),entries=Object.entries(data||{}).map(([id,v])=>({id,...(v||{})}));
 if(!entries.length){el.innerHTML='<div class="empty"><b>Queue is empty</b><p>No matchmaking entries are currently visible.</p></div>';return;}
 el.innerHTML=entries.slice(0,100).map(x=>'<article class="data-row"><div class="data-main"><b>'+esc(x.name||'Unnamed player')+'</b><span>'+esc(x.preferredRole||'Any role')+' · '+esc(x.status||'unknown')+'</span><small>UID: '+esc(x.uid||x.id)+'</small></div><span class="row-tag">'+esc(x.status||'QUEUED')+'</span></article>').join('');
}
function startMonitoring(){
 stopMonitoring();
 if(!db){$('connection-title').textContent='Firebase unavailable';$('connection-detail').textContent='Realtime Database SDK did not initialize.';return;}
 $('connection-title').textContent='Firebase connected';$('connection-detail').textContent='Live monitoring · read only · no game data is modified';
 const roomsRef=db.ref('bagchalRooms').limitToLast(150);
 const unsubRooms=roomsRef.on('value',snap=>{
  const data=snap.val()||{};rooms=[];players=[];
  Object.entries(data).forEach(([id,room])=>{
   if(!room||typeof room!=='object')return;
   const present=presenceFor(room),active=present.length>0;
   if(active){
    const pending=inactiveRoomTimers.get(id);if(pending){clearTimeout(pending);inactiveRoomTimers.delete(id);}
    rooms.push({id,players:present,active:true,game:room.activeGameType||room.game&&room.game.type||'BaghChal'});
    present.forEach(p=>players.push({...p,room:id}));
   }else if(!inactiveRoomTimers.has(id)){
    const timer=setTimeout(()=>{
     inactiveRoomTimers.delete(id);
     const ref=db.ref('bagchalRooms/'+id);
     ref.once('value').then(current=>{
      if(!current.exists()||presenceFor(current.val()).length)return;
      return ref.remove();
     }).catch(err=>{$('room-refresh-status').textContent='AUTO-DELETE ERROR';$('connection-detail').textContent='Could not remove inactive room '+id+': '+err.message;});
    },120000);
    inactiveRoomTimers.set(id,timer);
   }
  });
  $('online-count').textContent=String(new Set(players.map(p=>p.uid||p.room+':'+p.role)).size);
  $('room-count').textContent=String(rooms.filter(r=>r.active).length);
  $('room-refresh-status').textContent='LIVE · ACTIVE ONLY';
  renderRooms();renderPlayers();
 },err=>{ $('room-refresh-status').textContent='ERROR';$('connection-title').textContent='Database read blocked';$('connection-detail').textContent=err.message+' Check Realtime Database rules for authorized admins.';});
 unsubs.push(()=>roomsRef.off('value',unsubRooms));
 const roomCodesRef=db.ref('bagchalRoomCodes');
 const unsubRoomCodes=roomCodesRef.on('value',snap=>{roomCodesById={};const codes=snap.val()||{};Object.entries(codes).forEach(([code,roomId])=>{if(/^\d{4}$/.test(code)&&typeof roomId==='string')roomCodesById[roomId]=code;});renderRooms();if(activeSpectatorRoomData)renderSpectatorGame(activeSpectatorRoomData);},err=>{$('room-refresh-status').textContent='ROOM CODES UNAVAILABLE';$('connection-detail').textContent='Could not read four-digit room-code mappings: '+err.message;});
 unsubs.push(()=>roomCodesRef.off('value',unsubRoomCodes));
 const queueRef=db.ref('bagchalRandomMatchQueue').limitToLast(100);
 const unsubQueue=queueRef.on('value',snap=>renderQueue(snap.val()),err=>{$('queue-list').innerHTML='<div class="empty"><b>Queue unavailable</b><p>'+esc(err.message)+'</p></div>';});
 unsubs.push(()=>queueRef.off('value',unsubQueue));
 const savedRoom=new URLSearchParams(window.location.search).get('watch');
 if(savedRoom)watchRoom(savedRoom);
}
function verify(user){return user.getIdTokenResult(true).then(result=>{if(result.claims.superAdmin!==true){deny();return auth.signOut().then(()=>{throw new Error('This account does not have Super Admin permission.');});}document.body.classList.add('admin-authenticated');state('SUPER ADMIN');msg('Authorized administrator session active. Moderation records are stored separately from game data.','success');startMonitoring();adminUid=user.uid;watchModeration();return user;});}
try{if(!window.firebase)throw new Error('Firebase SDK did not load.');if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);auth=firebase.auth();db=firebase.database();auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);auth.onAuthStateChanged(user=>{if(!user){deny();state('SIGNED OUT');return;}state('VERIFYING ACCESS');verify(user).catch(e=>{msg(e.message||'Admin access denied.','error');state('ACCESS DENIED');});});}catch(e){msg(e.message||'Could not initialize Firebase.','error');state('LOGIN UNAVAILABLE');}
googleButton.addEventListener('click',()=>{if(!auth){msg('Firebase login is unavailable.','error');return;}googleButton.disabled=true;googleButton.textContent='Connecting to Google…';msg('Checking administrator permission…');const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});auth.signInWithPopup(provider).then(verify).catch(e=>msg(e.message||'Google sign-in failed.','error')).finally(()=>{googleButton.disabled=false;googleButton.innerHTML='<span class="google-g" aria-hidden="true">G</span> Continue with Google';});});
form.addEventListener('submit',e=>{e.preventDefault();if(!auth){msg('Firebase login is unavailable.','error');return;}button.disabled=true;button.textContent='Signing in…';msg('Checking administrator permission…');auth.signInWithEmailAndPassword(email.value.trim(),password.value).then(verify).catch(e=>msg(e.message||'Sign-in failed.','error')).finally(()=>{button.disabled=false;button.textContent='Sign in with email';password.value='';});});
$('spectator-meta').addEventListener('click',e=>{const copy=e.target.closest('.copy-room-code-button');if(!copy)return;const code=copy.getAttribute('data-copy-room')||'';if(!code)return;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(()=>{copy.textContent='Copied';setTimeout(()=>{if(copy.isConnected)copy.textContent='Copy code';},1400);}).catch(()=>window.prompt('Copy room code:',code));}else{window.prompt('Copy room code:',code);}});
$('room-list').addEventListener('click',e=>{const copy=e.target.closest('.copy-room-code-button');if(copy){const code=copy.getAttribute('data-copy-room')||'';if(code&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(()=>{copy.textContent='Copied';setTimeout(()=>{if(copy.isConnected)copy.textContent='Copy code';},1400);}).catch(()=>{window.prompt('Copy room code:',code);});}else if(code){window.prompt('Copy room code:',code);}return;}const watch=e.target.closest('.watch-room-button');if(watch){const id=watch.getAttribute('data-watch-room');if(id)watchRoom(id);return;}const btn=e.target.closest('.end-room-button');if(!btn)return;const roomId=btn.getAttribute('data-room-id');if(!roomId||!adminUid||!db)return;if(!window.confirm('END GAME? Room '+roomId+' will be permanently removed from Firebase. This cannot be undone.'))return;btn.disabled=true;btn.textContent='Ending…';db.ref('bagchalRooms/'+roomId).remove().then(()=>{recordAudit('game_ended',{roomId});$('room-refresh-status').textContent='GAME ENDED · ROOM REMOVED';}).catch(err=>{btn.disabled=false;btn.textContent='End game';$('room-refresh-status').textContent='END GAME ERROR';window.alert('Could not end game: '+err.message);});});
$('player-search-button').addEventListener('click',renderPlayers);
$('player-search').addEventListener('input',renderPlayers);
 $('ban-submit')?.addEventListener('click',createBan);
 $('ban-record-list')?.addEventListener('click',e=>{const b=e.target.closest('[data-unban-uid]');if(b)revokeBan(b.getAttribute('data-unban-uid'));});
 $('player-results')?.addEventListener('click',e=>{
 const copy=e.target.closest('.copy-player-uid-button');
 if(copy){const uid=copy.getAttribute('data-copy-uid')||'';if(uid&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(uid).then(()=>{copy.textContent='Copied';setTimeout(()=>{if(copy.isConnected)copy.textContent='Copy UID';},1300);}).catch(()=>window.prompt('Copy player UID:',uid));}else if(uid)window.prompt('Copy player UID:',uid);return;}
 const ban=e.target.closest('.ban-player-fill-button');
 if(ban){const uid=ban.getAttribute('data-ban-uid')||'';$('ban-target').value=uid;$('ban-reason').value='Cheating';$('ban-target').scrollIntoView({behavior:'smooth',block:'center'});$('ban-target').focus();return;}
 const kick=e.target.closest('.kick-player-button');
 if(kick)requestKick(kick.getAttribute('data-kick-room'),kick.getAttribute('data-kick-role'),kick.getAttribute('data-kick-uid'));
});
let spectatorRotation=0,spectatorTilt=17,spectatorZoom=.94;
const spectatorStage=$('spectator-data');
function applySpectatorCamera(){
 spectatorStage.style.setProperty('--view-yaw',spectatorRotation+'deg');
 spectatorStage.style.setProperty('--view-rotation','0deg');
 spectatorStage.style.setProperty('--view-tilt',spectatorTilt+'deg');
 spectatorStage.style.setProperty('--view-zoom',spectatorZoom);
 spectatorStage.style.setProperty('--view-perspective', '1400px');
 document.querySelectorAll('[data-spectator-action="tilt-3d"]').forEach(btn=>btn.setAttribute('aria-pressed',String(spectatorTilt===17)));
}
const spectatorToolbar=document.querySelector('.spectator-toolbar');
const commentatorControls=document.querySelector('.commentator-controls');
if(spectatorToolbar&&!spectatorToolbar.querySelector('[data-spectator-action="rotate-up"]')){
 const verticalButton=(action,label,aria)=>{const button=document.createElement('button');button.type='button';button.className='button button-muted';button.dataset.spectatorAction=action;button.setAttribute('aria-label',aria);button.textContent=label;return button;};
 const rightButton=spectatorToolbar.querySelector('[data-spectator-action="rotate-right"]');
 if(rightButton){rightButton.after(verticalButton('rotate-down','Vertical ↓','Rotate board top to bottom'),verticalButton('rotate-up','Vertical ↑','Rotate board bottom to top'));}
}
$('spectator-panel')?.addEventListener('click',e=>{
 if(e.target.closest('#commentator-audio')){setCommentatorAudio();return;}
 if(e.target.closest('#commentator-language'))return;
 const control=e.target.closest('[data-spectator-action]');
 if(!control)return;
 const action=control.getAttribute('data-spectator-action');
 if(action==='rotate-left')spectatorRotation-=45;
 else if(action==='rotate-right')spectatorRotation+=45;
 else if(action==='rotate-up')spectatorTilt-=45;
 else if(action==='rotate-down')spectatorTilt+=45;
 else if(action==='tilt-3d')spectatorTilt=17;
 else if(action==='zoom-in')spectatorZoom=Math.min(1.2,+(spectatorZoom+.08).toFixed(2));
 else if(action==='zoom-out')spectatorZoom=Math.max(.72,+(spectatorZoom-.08).toFixed(2));
 else if(action==='reset'){spectatorRotation=0;spectatorTilt=17;spectatorZoom=.94;}
 else if(action==='fullscreen'){
  const panel=$('spectator-panel');
  if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});}
  else if(panel.requestFullscreen){panel.requestFullscreen().catch(()=>{});}
 }
 applySpectatorCamera();
});
applySpectatorCamera();
$('commentator-language')?.addEventListener('change',e=>{commentatorLanguage=e.target.value;commentatorLastText='';const st=$('commentator-audio-state');if(st)st.textContent='COMMENTARY LANGUAGE · ENGLISH'+(commentatorAudioEnabled?' · AUDIO ON':' · SOUND OFF');});
window.addEventListener('beforeunload',stopMonitoring);
})();