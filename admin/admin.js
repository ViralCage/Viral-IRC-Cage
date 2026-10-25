(function(){
'use strict';
const firebaseConfig={apiKey:"AIzaSyC_R_O2e3D1-fGjHByesj98uynbjXnG9ng",authDomain:"bagh-chal-5dc2f.firebaseapp.com",databaseURL:"https://bagh-chal-5dc2f-default-rtdb.firebaseio.com",projectId:"bagh-chal-5dc2f",storageBucket:"bagh-chal-5dc2f.firebasestorage.app",messagingSenderId:"304434839417",appId:"1:304434839417:web:6c1ac04800e26c8f0039a8"};
const $=id=>document.getElementById(id);
const form=$('admin-login-form'),email=$('admin-email'),password=$('admin-password'),button=$('admin-login-button'),googleButton=$('google-login-button'),message=$('login-message'),status=$('auth-status');
let auth=null,db=null,unsubs=[],players=[],rooms=[],adminRoot=null,adminUid=null;
function msg(t,c){message.textContent=t;message.className='login-message'+(c?' '+c:'');}
function state(t){status.innerHTML='<i></i> '+t;}
function deny(){document.body.classList.remove('admin-authenticated');stopMonitoring();}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatSeen(value){if(value==null||value==='')return 'Last seen: unavailable';const n=Number(value);if(!Number.isFinite(n)||n<=0)return 'Last seen: unavailable';const d=new Date(n);return 'Last seen: '+d.toLocaleString();}
function stopMonitoring(){unsubs.forEach(fn=>{try{fn();}catch(e){}});unsubs=[];adminRoot=null;adminUid=null;}
function adminStatus(t,isError){const el=$('admin-note-status');if(el){el.textContent=t;el.className='login-message'+(isError?' error':' success');}}
function logAdminAction(action,details){if(!adminRoot)return Promise.resolve();return adminRoot.child('activity').push({action,details:String(details||''),at:firebase.database.ServerValue.TIMESTAMP}).catch(e=>adminStatus('Saved, but activity log failed: '+e.message,true));}
function renderAdminNotes(data){const el=$('admin-notes-list');if(!el)return;const items=Object.entries(data||{}).map(([id,n])=>({id,...(n||{})})).sort((a,b)=>(b.at||0)-(a.at||0));if(!items.length){el.innerHTML='<div class="empty"><b>No private notes yet</b><p>Notes are visible only to this Super Admin account.</p></div>';return;}el.innerHTML=items.slice(0,30).map(n=>'<article class="data-row"><div class="data-main"><b>'+esc(n.title||'Untitled note')+'</b><span>'+esc(n.body||'')+'</span><small>'+esc(n.at?new Date(n.at).toLocaleString():'Date unavailable')+'</small></div></article>').join('');}
function renderAdminActivity(data){const el=$('activity-list');if(!el)return;const items=Object.entries(data||{}).map(([id,x])=>({id,...(x||{})})).sort((a,b)=>(b.at||0)-(a.at||0));if(!items.length){el.innerHTML='<div class="empty compact"><b>No admin activity yet</b><p>Successful private admin changes will appear here.</p></div>';return;}el.innerHTML=items.slice(0,30).map(x=>'<article class="data-row"><div class="data-main"><b>'+esc(x.action||'Admin action')+'</b><span>'+esc(x.details||'')+'</span><small>'+esc(x.at?new Date(x.at).toLocaleString():'Date unavailable')+'</small></div></article>').join('');}
function startAdminWorkspace(user){adminUid=user.uid;adminRoot=db.ref('adminData/'+adminUid);const notesRef=adminRoot.child('notes').limitToLast(30),activityRef=adminRoot.child('activity').limitToLast(30);const onNotes=s=>renderAdminNotes(s.val()),onActivity=s=>renderAdminActivity(s.val());notesRef.on('value',onNotes,e=>adminStatus('Could not read private notes: '+e.message,true));activityRef.on('value',onActivity,e=>adminStatus('Could not read activity log: '+e.message,true));unsubs.push(()=>notesRef.off('value',onNotes),()=>activityRef.off('value',onActivity));}
function presenceFor(room){
 const p=room&&room.presence||{},out=[];
 Object.keys(p).forEach(role=>{const x=p[role];if(x&&x.connected){out.push({uid:x.uid||'',name:x.name||room.playerNames&&room.playerNames[role]||role,role,lastSeen:x.lastSeen||null});}});
 return out;
}
function renderRooms(){
 const el=$('room-list');if(!rooms.length){el.innerHTML='<div class="empty"><b>No rooms found</b><p>No room records were returned from bagchalRooms.</p></div>';return;}
 el.innerHTML=rooms.map(r=>'<article class="data-row"><div class="data-main"><b>'+esc(r.id)+'</b><span>'+esc(r.game||'Game type not specified')+' · '+r.players.length+' connected</span><small>'+r.players.map(p=>esc(p.name)+' ('+esc(p.role)+')').join(' · ')+'</small></div><span class="row-tag">'+esc(r.type||'ROOM')+'</span></article>').join('');
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
   const present=presenceFor(room);
   if(present.length){rooms.push({id,players:present,game:room.activeGameType||room.game&&room.game.type||'BaghChal',type:'ACTIVE'});present.forEach(p=>players.push({...p,room:id}));}
  });
  $('online-count').textContent=String(new Set(players.map(p=>p.uid||p.room+':'+p.role)).size);
  $('room-count').textContent=String(rooms.length);
  $('room-refresh-status').textContent='LIVE';
  renderRooms();renderPlayers();
 },err=>{ $('room-refresh-status').textContent='ERROR';$('connection-title').textContent='Database read blocked';$('connection-detail').textContent=err.message+' Check Realtime Database rules for authorized admins.';});
 unsubs.push(()=>roomsRef.off('value',unsubRooms));
 const queueRef=db.ref('bagchalRandomMatchQueue').limitToLast(100);
 const unsubQueue=queueRef.on('value',snap=>renderQueue(snap.val()),err=>{$('queue-list').innerHTML='<div class="empty"><b>Queue unavailable</b><p>'+esc(err.message)+'</p></div>';});
 unsubs.push(()=>queueRef.off('value',unsubQueue));
}
function verify(user){return user.getIdTokenResult(true).then(result=>{if(result.claims.superAdmin!==true){deny();return auth.signOut().then(()=>{throw new Error('This account does not have Super Admin permission.');});}document.body.classList.add('admin-authenticated');state('SUPER ADMIN');msg('Authorized administrator session active. Game data remains read only; private admin records are writable.','success');startMonitoring();startAdminWorkspace(user);return user;});}
try{if(!window.firebase)throw new Error('Firebase SDK did not load.');if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);auth=firebase.auth();db=firebase.database();auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);auth.onAuthStateChanged(user=>{if(!user){deny();state('SIGNED OUT');return;}state('VERIFYING ACCESS');verify(user).catch(e=>{msg(e.message||'Admin access denied.','error');state('ACCESS DENIED');});});}catch(e){msg(e.message||'Could not initialize Firebase.','error');state('LOGIN UNAVAILABLE');}
googleButton.addEventListener('click',()=>{if(!auth){msg('Firebase login is unavailable.','error');return;}googleButton.disabled=true;googleButton.textContent='Connecting to Google…';msg('Checking administrator permission…');const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});auth.signInWithPopup(provider).then(verify).catch(e=>msg(e.message||'Google sign-in failed.','error')).finally(()=>{googleButton.disabled=false;googleButton.innerHTML='<span class="google-g" aria-hidden="true">G</span> Continue with Google';});});
form.addEventListener('submit',e=>{e.preventDefault();if(!auth){msg('Firebase login is unavailable.','error');return;}button.disabled=true;button.textContent='Signing in…';msg('Checking administrator permission…');auth.signInWithEmailAndPassword(email.value.trim(),password.value).then(verify).catch(e=>msg(e.message||'Sign-in failed.','error')).finally(()=>{button.disabled=false;button.textContent='Sign in with email';password.value='';});});
$('admin-note-form').addEventListener('submit',e=>{e.preventDefault();if(!adminRoot){adminStatus('Admin database is not ready. Sign in again.',true);return;}const title=$('admin-note-title').value.trim(),body=$('admin-note-body').value.trim(),save=$('save-admin-note');if(!title||!body)return;save.disabled=true;save.textContent='Saving…';adminRoot.child('notes').push({title,body,at:firebase.database.ServerValue.TIMESTAMP,createdBy:adminUid}).then(()=>logAdminAction('Private note saved',title)).then(()=>{$('admin-note-form').reset();adminStatus('Private note saved successfully.');}).catch(err=>adminStatus('Save failed: '+err.message,true)).finally(()=>{save.disabled=false;save.textContent='Save private note';});});
$('player-search-button').addEventListener('click',renderPlayers);
$('player-search').addEventListener('input',renderPlayers);
window.addEventListener('beforeunload',stopMonitoring);
})();