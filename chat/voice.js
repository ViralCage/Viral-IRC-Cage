/* Viral Cage Chat — global player presence + direct WebRTC voice calls.
   Firebase Realtime Database is used only for presence and signaling.
   Voice media is exchanged peer-to-peer; chat rooms/messages remain on the chat Worker. */
(() => {
  'use strict';
  if (window.__vcChatDirectVoice) return;
  window.__vcChatDirectVoice = true;

  const firebaseConfig = {
    apiKey: "AIzaSyC_R_O2e3D1-fGjHByesj98uynbjXnG9ng",
    authDomain: "bagh-chal-5dc2f.firebaseapp.com",
    databaseURL: "https://bagh-chal-5dc2f-default-rtdb.firebaseio.com",
    projectId: "bagh-chal-5dc2f",
    storageBucket: "bagh-chal-5dc2f.firebasestorage.app",
    messagingSenderId: "304434839417",
    appId: "1:304434839417:web:6c1ac04800e26c8f0039a8"
  };
  const PRESENCE = 'chatVoicePresence';
  const CALLS = 'chatVoiceCalls';
  const STALE_MS = 65000;
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  const $ = id => document.getElementById(id);
  let db=null, authUid=null, sessionRef=null, directoryRef=null, incomingRef=null;
  let peer=null, localStream=null, activeRef=null, activeSide=null, remoteUid=null;
  let callValueHandler=null, remoteCandidateHandler=null, incomingCallRef=null, incomingCallData=null;
  let pendingCandidates=[], muted=false, ending=false, callerIceQueue=[], callNodeReady=false;
  let ringTimer=null;

  function nickname() {
    const field=$('nickname');
    return String(field && field.value || 'Guest').trim().replace(/\s+/g,' ').slice(0,24) || 'Guest';
  }
  function status(message) { const el=$('vcVoiceStatus'); if(el) el.textContent=message; }
  function injectUI() {
    const style=document.createElement('style');
    style.textContent=`
      #vcChatVoiceDock{position:fixed;z-index:9000;right:18px;bottom:18px;color:#f3f6ff;font:14px/1.4 Inter,system-ui,sans-serif}
      #vcChatVoiceToggle{border:1px solid #526fc5;border-radius:999px;padding:11px 16px;background:linear-gradient(110deg,#8528ef,#145eff);color:white;font-weight:850;box-shadow:0 8px 28px #0008;cursor:pointer}
      #vcChatVoicePanel{display:none;position:absolute;right:0;bottom:58px;width:min(350px,calc(100vw - 24px));max-height:min(65vh,500px);overflow:auto;padding:14px;border:1px solid #34528f;border-radius:16px;background:#08152d;box-shadow:0 18px 55px #000b}
      #vcChatVoicePanel.open{display:block}#vcChatVoicePanel h3{margin:0 0 5px;color:#9ecbff;font-size:16px}
      #vcVoiceStatus{margin:8px 0;color:#9eb7e8;font-size:12px;min-height:18px}
      #vcVoicePlayers{display:grid;gap:7px}.vcVoicePlayer{display:flex;align-items:center;gap:9px;padding:9px;border:1px solid #294477;border-radius:10px;background:#101f3c}
      .vcVoicePlayer>span{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:750}.vcVoicePlayer small{display:block;color:#54e2b6;font-size:10px;font-weight:600}
      .vcVoicePlayer button,#vcVoiceIncoming button,#vcVoiceActive button{border:0;border-radius:8px;padding:8px 11px;min-height:36px;font-weight:800;cursor:pointer;color:white;background:#245fce}
      .vcVoicePlayer button:disabled{opacity:.45}#vcVoiceEmpty{padding:12px;text-align:center;color:#9aadd5;border:1px dashed #345080;border-radius:10px;font-size:12px}
      #vcVoiceIncoming{display:none;position:fixed;z-index:9100;inset:0;background:#020617c9;align-items:center;justify-content:center;padding:18px}
      #vcVoiceIncoming.open{display:flex}#vcVoiceIncoming>div{width:min(340px,100%);padding:20px;border:1px solid #526a9b;border-radius:17px;background:#0c1930;text-align:center;box-shadow:0 20px 70px #000b}
      #vcVoiceIncoming h3{margin:0 0 7px;color:#a9caff}#vcVoiceIncoming p{color:#c0cdea;font-size:13px}
      #vcVoiceIncoming .accept{background:#15975c}#vcVoiceIncoming .decline{background:#354967;margin-left:8px}
      #vcVoiceActive{display:none;position:fixed;z-index:9050;left:18px;bottom:18px;padding:12px 14px;border:1px solid #345080;border-radius:14px;background:#08152d;color:#fff;box-shadow:0 10px 35px #0009;font:13px system-ui,sans-serif}
      #vcVoiceActive.open{display:block}#vcVoiceActive strong{display:block;margin-bottom:8px}
      #vcVoiceActive .end{background:#b91c1c}#vcVoiceActive .mute{background:#30496f}
      @media(max-width:520px){#vcChatVoiceDock{right:10px;bottom:10px}#vcVoiceActive{left:10px;bottom:10px}}
    `;
    document.head.appendChild(style);
    const dock=document.createElement('div');dock.id='vcChatVoiceDock';
    dock.innerHTML='<section id="vcChatVoicePanel"><h3>Online players</h3><div id="vcVoiceStatus">Connecting to player directory…</div><div id="vcVoicePlayers"><div id="vcVoiceEmpty">Loading…</div></div></section><button id="vcChatVoiceToggle" type="button" aria-expanded="false">Players · <span id="vcVoiceCount">0</span></button>';
    document.body.appendChild(dock);
    const incoming=document.createElement('div');incoming.id='vcVoiceIncoming';
    incoming.innerHTML='<div role="dialog" aria-modal="true" aria-labelledby="vcVoiceIncomingTitle"><h3 id="vcVoiceIncomingTitle">Incoming voice call</h3><p id="vcVoiceIncomingText">A player is calling.</p><button class="accept" id="vcVoiceAccept">Accept</button><button class="decline" id="vcVoiceDecline">Decline</button></div>';
    document.body.appendChild(incoming);
    const active=document.createElement('div');active.id='vcVoiceActive';
    active.innerHTML='<strong id="vcVoiceActiveTitle">Voice call</strong><button class="mute" id="vcVoiceMute">Mute</button> <button class="end" id="vcVoiceEnd">End call</button>';
    document.body.appendChild(active);
    $('vcChatVoiceToggle').addEventListener('click',()=>{const open=$('vcChatVoicePanel').classList.toggle('open');$('vcChatVoiceToggle').setAttribute('aria-expanded',String(open));});
    $('vcVoiceAccept').addEventListener('click',acceptCall);
    $('vcVoiceDecline').addEventListener('click',()=>finishCall('declined'));
    $('vcVoiceEnd').addEventListener('click',()=>finishCall('ended'));
    $('vcVoiceMute').addEventListener('click',toggleMute);
  }
  function loadSdk(name) {
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-vc-firebase="'+name+'"]');
      if(existing){if(window.firebase && (name==='app'?firebase.initializeApp:name==='auth'?firebase.auth:firebase.database)){resolve();return;}existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const s=document.createElement('script');s.dataset.vcFirebase=name;s.src='https://www.gstatic.com/firebasejs/10.14.1/firebase-'+name+'-compat.js';s.onload=resolve;s.onerror=()=>reject(new Error('Firebase '+name+' SDK failed to load'));document.head.appendChild(s);
    });
  }
  async function initFirebase() {
    await loadSdk('app'); await loadSdk('auth'); await loadSdk('database');
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth=firebase.auth();
    const user=auth.currentUser || (await auth.signInAnonymously()).user;
    authUid=user.uid; db=firebase.database();
    directoryRef=db.ref(PRESENCE);
    sessionRef=directoryRef.child(authUid).push();
    const connected=db.ref('.info/connected');
    connected.on('value',snap=>{
      if(!snap.val()||!sessionRef)return;
      sessionRef.onDisconnect().remove().then(()=>sessionRef.set({
        name:nickname(),online:true,lastSeen:firebase.database.ServerValue.TIMESTAMP
      })).then(()=>status('Connected. Choose any online player for a private voice call.'))
      .catch(err=>{console.error(err);status('Firebase presence permission denied. Add the chat voice database rules.');});
    });
    directoryRef.on('value',renderPlayers,err=>{console.error(err);status('Cannot read player directory. Check Firebase database rules.');});
    incomingRef=db.ref(CALLS+'/'+authUid);
    incomingRef.on('child_added',handleIncoming,err=>{console.error(err);status('Cannot receive calls. Check Firebase call rules.');});
    const nameField=$('nickname'); if(nameField) nameField.addEventListener('change',refreshPresence);
    window.addEventListener('pagehide',cleanupPresence);
  }
  function refreshPresence(){if(sessionRef)sessionRef.update({name:nickname(),lastSeen:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});}
  function renderPlayers(snapshot) {
    const all=snapshot.val()||{}, now=Date.now(), map=new Map();
    Object.entries(all).forEach(([id,sessions])=>{
      if(id===authUid||!sessions||typeof sessions!=='object')return;
      const active=Object.values(sessions).filter(s=>s&&s.online!==false&&now-Number(s.lastSeen||0)<STALE_MS).sort((a,b)=>Number(b.lastSeen||0)-Number(a.lastSeen||0));
      if(active.length)map.set(id,{uid:id,name:String(active[0].name||'Guest').slice(0,24)});
    });
    const players=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    $('vcVoiceCount').textContent=String(players.length);
    const list=$('vcVoicePlayers');list.replaceChildren();
    if(!players.length){const e=document.createElement('div');e.id='vcVoiceEmpty';e.textContent='No other players are online right now.';list.append(e);return;}
    players.forEach(p=>{
      const row=document.createElement('div');row.className='vcVoicePlayer';
      const label=document.createElement('span');label.textContent=p.name;
      const small=document.createElement('small');small.textContent='Online now';label.append(small);
      const btn=document.createElement('button');btn.textContent='Call';btn.disabled=!!activeRef||!!incomingCallRef;
      btn.addEventListener('click',()=>startCall(p));row.append(label,btn);list.append(row);
    });
  }
  function cleanupPresence(){if(sessionRef)sessionRef.remove().catch(()=>{});if(directoryRef)directoryRef.off('value',renderPlayers);if(incomingRef)incomingRef.off();}
  async function microphone(){if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone needs HTTPS and a supported browser.');return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}
  function makePeer(){
    const pc=new RTCPeerConnection({iceServers:ICE});pendingCandidates=[];
    pc.ontrack=e=>{let a=$('vcVoiceRemoteAudio');if(!a){a=document.createElement('audio');a.id='vcVoiceRemoteAudio';a.autoplay=true;a.playsInline=true;document.body.append(a);}a.srcObject=e.streams[0];a.play().catch(()=>status('Connected. Tap the page once to enable audio playback.'));};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')status('Voice connected directly peer-to-peer.');else if(pc.connectionState==='failed')status('P2P failed on this network. A TURN relay may be required.');else if(pc.connectionState==='disconnected')status('Voice connection interrupted…');};
    return pc;
  }
  function addRemoteCandidate(candidate){if(!candidate||!peer)return;if(peer.remoteDescription)peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);else pendingCandidates.push(candidate);}
  async function flushCandidates(){if(!peer?.remoteDescription)return;for(const c of pendingCandidates.splice(0)){try{await peer.addIceCandidate(new RTCIceCandidate(c));}catch(e){console.warn(e);}}}
  function watchCall(){
    if(!activeRef)return;
    callValueHandler=snap=>{
      const d=snap.val();if(!d){closeLocal('Call ended.');return;}
      if(d.status==='declined'){closeLocal('The player declined the call.');return;}
      if(d.status==='ended'){closeLocal('The other player ended the call.');return;}
      if(activeSide==='caller'&&d.answer&&peer&&!peer.remoteDescription){
        peer.setRemoteDescription(new RTCSessionDescription(d.answer)).then(flushCandidates).catch(e=>{console.error(e);status('Could not establish voice connection.');});
      }
    };
    activeRef.on('value',callValueHandler);
    remoteCandidateHandler=s=>addRemoteCandidate(s.val());
    activeRef.child('candidates/'+remoteUid).on('child_added',remoteCandidateHandler);
  }
  async function startCall(player){
    if(activeRef)return;
    try{
      status('Requesting microphone permission…');localStream=await microphone();
      activeSide='caller';remoteUid=player.uid;peer=makePeer();
      localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
      activeRef=db.ref(CALLS+'/'+player.uid).push();callNodeReady=false;callerIceQueue=[];
      peer.onicecandidate=e=>{if(!e.candidate||!activeRef)return;const c=e.candidate.toJSON();if(!callNodeReady)callerIceQueue.push(c);else activeRef.child('candidates/'+authUid).push(c).catch(console.warn);};
      const offer=await peer.createOffer();await peer.setLocalDescription(offer);
      await activeRef.set({callerUid:authUid,callerName:nickname(),calleeUid:player.uid,status:'ringing',createdAt:firebase.database.ServerValue.TIMESTAMP,offer:{type:peer.localDescription.type,sdp:peer.localDescription.sdp}});
      callNodeReady=true;for(const c of callerIceQueue.splice(0))activeRef.child('candidates/'+authUid).push(c).catch(console.warn);
      activeRef.onDisconnect().remove();watchCall();
      $('vcVoiceActiveTitle').textContent='Calling '+player.name+'…';$('vcVoiceActive').classList.add('open');
      status('Calling '+player.name+'… waiting for answer.');
    }catch(e){console.error(e);status(e.name==='NotAllowedError'?'Microphone permission denied. Allow access and try again.':(e.message||'Could not start call.'));await closeLocal('');}
  }
  function handleIncoming(snapshot){
    const d=snapshot.val();if(!d||d.status!=='ringing'||!d.offer||activeRef||incomingCallRef)return;
    if(d.callerUid===authUid)return;
    if(d.createdAt&&Date.now()-Number(d.createdAt)>90000)return;
    incomingCallRef=snapshot.ref;incomingCallData=d;
    $('vcVoiceIncomingText').textContent=(d.callerName||'A player')+' is calling you.';
    $('vcVoiceIncoming').classList.add('open');status('Incoming call from '+(d.callerName||'a player')+'.');
  }
  async function acceptCall(){
    if(!incomingCallRef||!incomingCallData||activeRef)return;
    const ref=incomingCallRef,d=incomingCallData;
    try{
      $('vcVoiceIncoming').classList.remove('open');status('Connecting microphone…');
      localStream=await microphone();activeSide='callee';remoteUid=d.callerUid;activeRef=ref;peer=makePeer();
      localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
      peer.onicecandidate=e=>{if(e.candidate&&activeRef)activeRef.child('candidates/'+authUid).push(e.candidate.toJSON()).catch(console.warn);};
      await peer.setRemoteDescription(new RTCSessionDescription(d.offer));
      const candidatesRef=activeRef.child('candidates/'+remoteUid);
      remoteCandidateHandler=s=>addRemoteCandidate(s.val());candidatesRef.on('child_added',remoteCandidateHandler);
      await flushCandidates();
      const answer=await peer.createAnswer();await peer.setLocalDescription(answer);
      await activeRef.update({status:'accepted',answer:{type:answer.type,sdp:answer.sdp}});
      watchCall();activeRef.onDisconnect().remove();
      $('vcVoiceActiveTitle').textContent='Voice call with '+(d.callerName||'player');$('vcVoiceActive').classList.add('open');
      incomingCallRef=null;incomingCallData=null;status('Answer sent. Establishing direct audio…');
    }catch(e){console.error(e);status(e.name==='NotAllowedError'?'Microphone permission denied.':(e.message||'Could not accept call.'));await finishCall('ended');}
  }
  function toggleMute(){if(!localStream)return;muted=!muted;localStream.getAudioTracks().forEach(t=>t.enabled=!muted);$('vcVoiceMute').textContent=muted?'Unmute':'Mute';}
  async function finishCall(state){
    if(incomingCallRef&&!activeRef){const ref=incomingCallRef;incomingCallRef=null;incomingCallData=null;$('vcVoiceIncoming').classList.remove('open');try{await ref.update({status:state});}catch{}status(state==='declined'?'Call declined.':'Call ended.');return;}
    const ref=activeRef;if(ref){try{await ref.update({status:state});}catch{}setTimeout(()=>ref.remove().catch(()=>{}),4000);}
    await closeLocal(state==='declined'?'Call declined.':'Call ended.');
  }
  async function closeLocal(message){
    if(ending)return;ending=true;
    if(activeRef&&callValueHandler)activeRef.off('value',callValueHandler);
    if(activeRef&&remoteCandidateHandler&&remoteUid)activeRef.child('candidates/'+remoteUid).off('child_added',remoteCandidateHandler);
    if(peer){try{peer.close();}catch{}}peer=null;
    if(localStream)localStream.getTracks().forEach(t=>t.stop());localStream=null;
    const audio=$('vcVoiceRemoteAudio');if(audio){audio.pause();audio.srcObject=null;audio.remove();}
    activeRef=null;activeSide=null;remoteUid=null;callValueHandler=null;remoteCandidateHandler=null;pendingCandidates=[];callerIceQueue=[];callNodeReady=false;muted=false;
    $('vcVoiceActive').classList.remove('open');$('vcVoiceMute').textContent='Mute';
    if(message)status(message);ending=false;
  }
  function boot(){injectUI();initFirebase().catch(e=>{console.error('Chat voice setup failed:',e);status(e.code==='auth/operation-not-allowed'?'Enable Anonymous sign-in in Firebase Authentication.':(e.message||'Could not connect to Firebase.'));});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();