(function(){
'use strict';
const firebaseConfig={apiKey:"AIzaSyC_R_O2e3D1-fGjHByesj98uynbjXnG9ng",authDomain:"bagh-chal-5dc2f.firebaseapp.com",databaseURL:"https://bagh-chal-5dc2f-default-rtdb.firebaseio.com",projectId:"bagh-chal-5dc2f",storageBucket:"bagh-chal-5dc2f.firebasestorage.app",messagingSenderId:"304434839417",appId:"1:304434839417:web:6c1ac04800e26c8f0039a8"};
const $=id=>document.getElementById(id);
const form=$('admin-login-form'),email=$('admin-email'),password=$('admin-password'),button=$('admin-login-button'),googleButton=$('google-login-button'),message=$('login-message'),status=$('auth-status');
let auth=null,db=null,unsubs=[],players=[],rooms=[],adminUid=null,spectatorRef=null,spectatorHandler=null,inactiveRoomTimers=new Map();
function msg(t,c){message.textContent=t;message.className='login-message'+(c?' '+c:'');}
function state(t){status.innerHTML='<i></i> '+t;}
function deny(){document.body.classList.remove('admin-authenticated');stopMonitoring();}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatSeen(value){if(value==null||value==='')return 'Last seen: unavailable';const n=Number(value);if(!Number.isFinite(n)||n<=0)return 'Last seen: unavailable';const d=new Date(n);return 'Last seen: '+d.toLocaleString();}
function stopMonitoring(){unsubs.forEach(fn=>{try{fn();}catch(e){}});unsubs=[];inactiveRoomTimers.forEach(timer=>clearTimeout(timer));inactiveRoomTimers.clear();if(spectatorRef&&spectatorHandler)spectatorRef.off('value',spectatorHandler);spectatorRef=null;spectatorHandler=null;adminUid=null;}
function renderSpectatorGame(room){
 const type=room.activeGameType||'baghchal', mini=room.miniGames||{}, data=type==='baghchal'?(room.game||{}):(mini[type]||{});
 const arr=Array.isArray(data.board)?data.board:[];
 const turn=data.turn===1?'Goats':data.turn===2?'Tigers':(data.turn||'—');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let board='',meta='Turn: '+turn;
 const grid=(items,cls)=>'<div class="spectator-grid '+cls+'">'+items.join('')+'</div>';
 if(type==='chess'){
  const hist=Array.isArray(data.history)?data.history:[], pos=hist[hist.length-1]||{}, b=Array.isArray(pos.b)?pos.b:[];
  const glyph={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
  board=grid(Array.from({length:64},(_,i)=>{const r=Math.floor(i/8),c=i%8,p=b[r*16+c]||'.';return '<div class="spectator-square '+((r+c)%2?'dark':'light')+'">'+(glyph[p]||'')+'</div>';}),'chess-grid');
  meta='Chess · '+(pos.t===1?'White to move':'Black to move')+' · Move '+(pos.full||1);
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
  const edges=Array.isArray(data.edges)?data.edges:[],boxes=Array.isArray(data.boxes)?data.boxes:[];
  board='<div class="dots-board">'+Array.from({length:4},(_,r)=>'<div class="dots-row">'+Array.from({length:4},(_,c)=>{const k=r*4+c;return '<div class="dot-cell"><i></i><span>'+(boxes[k]?esc(boxes[k]):'')+'</span></div>'+(c<3?'<b class="'+(edges[r*3+c]?'edge-on':'')+'"></b>':'');}).join('')+'</div>'+(r<3?'<div class="dots-hrow">'+Array.from({length:4},(_,c)=>'<b class="'+(edges[12+r*4+c]?'edge-on':'')+'"></b>').join('')+'</div>':'')).join('')+'</div>';meta='Dots & Boxes · Turn: '+esc(data.turn||'—')+' · X '+(data.scores?.X||0)+' – O '+(data.scores?.O||0);
 }else{board='<div class="spectator-empty">Visual board is not available for '+esc(type)+'.</div>';meta='Game: '+esc(type);}
 const names=room.playerNames||{},presence=room.presence||{};
 const roles=[...new Set([...Object.keys(names),...Object.keys(presence)])];
 const playerCards=roles.slice(0,2).map((role,index)=>{
  const live=presence[role]||{},name=live.name||names[role]||role;
  const label=String(role).replace(/[_-]/g,' ');
  return '<div class="spectator-player-card '+(index===0?'spectator-player-top':'spectator-player-bottom')+'"><span class="spectator-player-side">'+(index===0?'PLAYER SIDE 1':'PLAYER SIDE 2')+'</span><strong>'+esc(name)+'</strong><small>'+esc(label)+' · '+(live.connected?'CONNECTED':'OFFLINE')+'</small></div>';
 });
 const playerLabels=roles.map(role=>{
  const live=presence[role]||{},name=live.name||names[role]||role;
  return esc(name)+(live.connected?' (connected)':'');
 });
 const topCard=playerCards[0]||'<div class="spectator-player-card spectator-player-top"><span class="spectator-player-side">PLAYER SIDE 1</span><strong>Waiting for player</strong><small>Not connected</small></div>';
 const bottomCard=playerCards[1]||'<div class="spectator-player-card spectator-player-bottom"><span class="spectator-player-side">PLAYER SIDE 2</span><strong>Waiting for player</strong><small>Not connected</small></div>';
 $('spectator-meta').textContent=meta+(playerLabels.length?' · Players: '+playerLabels.join(' vs '):' · Player names unavailable')+(data.winner?' · Winner: '+data.winner:'');
 $('spectator-data').innerHTML='<div class="spectator-player-rail">'+topCard+'</div><div class="spectator-board-face">'+board+'</div><div class="spectator-player-rail">'+bottomCard+'</div>';
}
function watchRoom(roomId){if(spectatorRef&&spectatorHandler)spectatorRef.off('value',spectatorHandler);spectatorRef=db.ref('bagchalRooms/'+roomId);$('spectator-status').textContent='CONNECTING';$('spectator-meta').textContent='Room: '+roomId+' · Live updates';$('spectator-data').textContent='Loading live room…';spectatorHandler=snap=>{if(!snap.exists()){$('spectator-status').textContent='ROOM ENDED';$('spectator-data').textContent='This room record no longer exists.';return;}const value=snap.val();$('spectator-status').textContent='LIVE';renderSpectatorGame(value);};spectatorRef.on('value',spectatorHandler,err=>{$('spectator-status').textContent='ERROR';$('spectator-data').textContent='Could not watch this room: '+err.message;});}
function presenceFor(room){
 const p=room&&room.presence||{},out=[];
 Object.keys(p).forEach(role=>{const x=p[role];if(x&&x.connected){out.push({uid:x.uid||'',name:x.name||room.playerNames&&room.playerNames[role]||role,role,lastSeen:x.lastSeen||null});}});
 return out;
}
function renderRooms(){
 const el=$('room-list');if(!rooms.length){el.innerHTML='<div class="empty"><b>No active rooms</b><p>Inactive rooms are automatically removed after 2 minutes.</p></div>';return;}
 el.innerHTML=rooms.filter(r=>r.active).map(r=>'<article class="data-row"><div class="data-main"><b>'+esc(r.id)+'</b><span>'+esc(r.game||'Game type not specified')+' · '+r.players.length+' connected</span><small>'+(r.players.length?r.players.map(p=>esc(p.name)+' ('+esc(p.role)+')').join(' · '):'No connected players')+'</small></div><div class="room-actions"><span class="row-tag '+(r.active?'':'inactive-tag')+'">'+(r.active?'ACTIVE':'INACTIVE')+'</span><button class="watch-room-button" type="button" data-watch-room="'+esc(r.id)+'">Watch</button><button class="delete-room-button" type="button" data-room-id="'+esc(r.id)+'">Delete room</button></div></article>').join('');
}
function renderPlayers(){
 const q=($('player-search').value||'').trim().toLowerCase();
 const el=$('player-results');
 if(!q){el.innerHTML='';return;}
 const shown=players.filter(p=>(p.name||'').toLowerCase().includes(q));
 if(!shown.length){el.innerHTML='<div class="empty"><b>No matching connected players</b><p>Only player names are searched.</p></div>';return;}
 el.innerHTML=shown.map(p=>'<article class="data-row"><div class="data-main"><b>'+esc(p.name)+'</b><span>'+esc(p.role)+' · Room '+esc(p.room)+'</span><small>UID: '+esc(p.uid||'Not provided')+'</small></div><span class="row-tag">CONNECTED</span></article>').join('');
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
 const queueRef=db.ref('bagchalRandomMatchQueue').limitToLast(100);
 const unsubQueue=queueRef.on('value',snap=>renderQueue(snap.val()),err=>{$('queue-list').innerHTML='<div class="empty"><b>Queue unavailable</b><p>'+esc(err.message)+'</p></div>';});
 unsubs.push(()=>queueRef.off('value',unsubQueue));
}
function verify(user){return user.getIdTokenResult(true).then(result=>{if(result.claims.superAdmin!==true){deny();return auth.signOut().then(()=>{throw new Error('This account does not have Super Admin permission.');});}document.body.classList.add('admin-authenticated');state('SUPER ADMIN');msg('Authorized administrator session active. Game data remains read only.','success');startMonitoring();return user;});}
try{if(!window.firebase)throw new Error('Firebase SDK did not load.');if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);auth=firebase.auth();db=firebase.database();auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);auth.onAuthStateChanged(user=>{if(!user){deny();state('SIGNED OUT');return;}state('VERIFYING ACCESS');verify(user).catch(e=>{msg(e.message||'Admin access denied.','error');state('ACCESS DENIED');});});}catch(e){msg(e.message||'Could not initialize Firebase.','error');state('LOGIN UNAVAILABLE');}
googleButton.addEventListener('click',()=>{if(!auth){msg('Firebase login is unavailable.','error');return;}googleButton.disabled=true;googleButton.textContent='Connecting to Google…';msg('Checking administrator permission…');const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});auth.signInWithPopup(provider).then(verify).catch(e=>msg(e.message||'Google sign-in failed.','error')).finally(()=>{googleButton.disabled=false;googleButton.innerHTML='<span class="google-g" aria-hidden="true">G</span> Continue with Google';});});
form.addEventListener('submit',e=>{e.preventDefault();if(!auth){msg('Firebase login is unavailable.','error');return;}button.disabled=true;button.textContent='Signing in…';msg('Checking administrator permission…');auth.signInWithEmailAndPassword(email.value.trim(),password.value).then(verify).catch(e=>msg(e.message||'Sign-in failed.','error')).finally(()=>{button.disabled=false;button.textContent='Sign in with email';password.value='';});});
$('room-list').addEventListener('click',e=>{const watch=e.target.closest('.watch-room-button');if(watch){const id=watch.getAttribute('data-watch-room');if(id)watchRoom(id);return;}const btn=e.target.closest('.delete-room-button');if(!btn)return;const roomId=btn.getAttribute('data-room-id');if(!roomId||!adminUid||!db)return;if(!window.confirm('Permanently delete room "'+roomId+'"? This cannot be undone.'))return;btn.disabled=true;btn.textContent='Deleting…';db.ref('bagchalRooms/'+roomId).remove().then(()=>{$('room-refresh-status').textContent='ROOM DELETED';}).catch(err=>{btn.disabled=false;btn.textContent='Delete room';$('room-refresh-status').textContent='DELETE ERROR';window.alert('Could not delete room: '+err.message);});});
$('player-search-button').addEventListener('click',renderPlayers);
$('player-search').addEventListener('input',renderPlayers);
let spectatorRotation=0,spectatorTilt=17,spectatorZoom=.94;
const spectatorStage=$('spectator-data');
function applySpectatorCamera(){
 spectatorStage.style.setProperty('--view-rotation',spectatorRotation+'deg');
 spectatorStage.style.setProperty('--view-tilt',spectatorTilt+'deg');
 spectatorStage.style.setProperty('--view-zoom',spectatorZoom);
}
$('spectator-panel')?.addEventListener('click',e=>{
 const control=e.target.closest('[data-spectator-action]');
 if(!control)return;
 const action=control.getAttribute('data-spectator-action');
 if(action==='rotate-left')spectatorRotation=(spectatorRotation-45+360)%360;
 else if(action==='rotate-right')spectatorRotation=(spectatorRotation+45)%360;
 else if(action==='tilt')spectatorTilt=spectatorTilt>=42?12:spectatorTilt+10;
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
window.addEventListener('beforeunload',stopMonitoring);
})();