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
  board=grid(Array.from({length:25},(_,i)=>{const p=arr[i];return '<div class="bagh-node">'+(p===1?'<span class="tiger-piece">🐅</span>':p===2?'<span class="goat-piece">🐐</span>':'')+'</div>';}),'baghchal-grid');meta='BaghChal · '+(data.goatsToPlace??'—')+' goats to place · '+(data.goatsCaptured??0)+' captured · Turn: '+(data.turn===1?'Tigers':'Goats');
 }else if(type==='dotsboxes'){
  const edges=Array.isArray(data.edges)?data.edges:[],boxes=Array.isArray(data.boxes)?data.boxes:[];
  board='<div class="dots-board">'+Array.from({length:4},(_,r)=>'<div class="dots-row">'+Array.from({length:4},(_,c)=>{const k=r*4+c;return '<div class="dot-cell"><i></i><span>'+(boxes[k]?esc(boxes[k]):'')+'</span></div>'+(c<3?'<b class="'+(edges[r*3+c]?'edge-on':'')+'"></b>':'');}).join('')+'</div>'+(r<3?'<div class="dots-hrow">'+Array.from({length:4},(_,c)=>'<b class="'+(edges[12+r*4+c]?'edge-on':'')+'"></b>').join('')+'</div>':'')).join('')+'</div>';meta='Dots & Boxes · Turn: '+esc(data.turn||'—')+' · X '+(data.scores?.X||0)+' – O '+(data.scores?.O||0);
 }else{board='<div class="spectator-empty">Visual board is not available for '+esc(type)+'.</div>';meta='Game: '+esc(type);}
 const names=room.playerNames||{},presence=room.presence||{};
 const roles=[...new Set([...Object.keys(names),...Object.keys(presence)])];
 const playerLabels=roles.map(role=>{
  const live=presence[role]||{},name=live.name||names[role]||role;
  return esc(name)+(live.connected?' (connected)':'');
 });
 $('spectator-meta').textContent=meta+(playerLabels.length?' · Players: '+playerLabels.join(' vs '):' · Player names unavailable')+(data.winner?' · Winner: '+data.winner:'');
 $('spectator-data').innerHTML=board;
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
 const q=($('player-search').value||'').trim().toLowerCase(),shown=players.filter(p=>!q||(p.name+' '+p.uid+' '+p.room+' '+p.role).toLowerCase().includes(q));
 const el=$('player-results');if(!shown.length){el.innerHTML='<div class="empty"><b>No matching connected players</b><p>Search covers connected participants in rooms only.</p></div>';return;}
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
window.addEventListener('beforeunload',stopMonitoring);
})();