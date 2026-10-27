(function(){
'use strict';
const $=id=>document.getElementById(id);
const STUN={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
let db=null,adminUid='',sessionId='',sessionRef=null,requestsRef=null,participantsRef=null,requestHandler=null,participantHandler=null,participantChangedHandler=null,peerByUid=new Map(),candidateHandlers=new Map(),offerHandlers=new Map(),activeStreams=new Map(),remoteAudioByUid=new Map(),expiryTimer=null,videoBySlot=new Map(),uidToSlot=new Map(),cameraStatus=new Map(),adminMediaStream=null,adminMuted=false,adminCameraOff=false;
const root='tournamentCameras/sessions/';
function status(text){const el=$('camera-admin-status');if(el)el.textContent=text;}
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function stopPeer(uid){const pc=peerByUid.get(uid);if(pc){try{pc.close();}catch(_){}peerByUid.delete(uid);}const h=candidateHandlers.get(uid);if(h&&sessionRef){sessionRef.child('participants/'+uid+'/phoneToAdmin/candidates').off('child_added',h);candidateHandlers.delete(uid);}const oh=offerHandlers.get(uid);if(oh&&sessionRef){sessionRef.child('participants/'+uid+'/phoneToAdmin/offer').off('value',oh);offerHandlers.delete(uid);}const stream=activeStreams.get(uid);if(stream){stream.getTracks().forEach(t=>t.stop());activeStreams.delete(uid);}const remoteAudio=remoteAudioByUid.get(uid);if(remoteAudio){remoteAudio.pause();remoteAudio.srcObject=null;remoteAudio.remove();remoteAudioByUid.delete(uid);}const slot=uidToSlot.get(uid);const video=slot&&videoBySlot.get(slot);if(video)video.srcObject=null;if(slot){cameraStatus.set(slot,'Camera disconnected');notifyCameraLayout();}uidToSlot.delete(uid);}
function stopSessionListeners(){if(requestsRef&&requestHandler)requestsRef.off('value',requestHandler);if(participantsRef&&participantHandler)participantsRef.off('child_added',participantHandler);if(participantsRef&&participantChangedHandler)participantsRef.off('child_changed',participantChangedHandler);requestsRef=null;participantsRef=null;requestHandler=null;participantHandler=null;participantChangedHandler=null;peerByUid.forEach((_,uid)=>stopPeer(uid));if(expiryTimer)clearTimeout(expiryTimer);expiryTimer=null;if(adminMediaStream){adminMediaStream.getTracks().forEach(t=>t.stop());adminMediaStream=null;}}
function renderRequests(data){const host=$('camera-requests');if(!host)return;const rows=Object.entries(data||{});if(!rows.length){host.innerHTML='<p class="camera-empty">No phone requests yet. Open the invitation on two phones.</p>';return;}host.innerHTML=rows.map(([uid,r])=>'<div class="camera-request"><div><b>'+escapeHtml(r.nickname||'Player')+'</b><small>Slot '+escapeHtml(r.requestedSlot||'?')+' · '+escapeHtml(uid.slice(0,9))+'</small></div><div class="camera-request-actions"><button class="button camera-approve" type="button" data-camera-approve="'+escapeHtml(uid)+'" data-camera-slot="'+escapeHtml(r.requestedSlot||'1')+'">Accept call</button><button class="button button-muted" type="button" data-camera-decline="'+escapeHtml(uid)+'">Decline</button></div></div>').join('');}
function notifyCameraLayout(){window.dispatchEvent(new CustomEvent('vc-tournament-camera-update'));}
function renderSlot(uid,slot,label){
 slot=String(slot);uidToSlot.set(uid,slot);
 let video=videoBySlot.get(slot);
 if(!video){video=document.createElement('video');video.id='spectator-camera-video-'+slot;video.autoplay=true;video.playsInline=true;video.muted=true;video.setAttribute('aria-label','Tournament Camera '+slot);videoBySlot.set(slot,video);}
 cameraStatus.set(slot,label||'Phone approved · connecting');
 notifyCameraLayout();
}
function setPhoneState(uid,text){const slot=uidToSlot.get(uid);if(slot){cameraStatus.set(slot,text);notifyCameraLayout();}}
function toggleAdminTrack(uid,kind,enabled){if(!adminMediaStream)return;adminMediaStream.getTracks().filter(t=>t.kind===kind).forEach(t=>t.enabled=enabled);if(kind==='audio')adminMuted=!enabled;else adminCameraOff=!enabled;const b=document.querySelector('[data-call-'+(kind==='audio'?'mute':'camera')+'="'+uid+'"]');if(b)b.textContent=kind==='audio'?(enabled?'Mute mic':'Unmute mic'):(enabled?'Camera off':'Camera on');}
async function decline(uid){if(!sessionRef)return;await sessionRef.child('declinedRequests/'+uid).set({at:Date.now()});await sessionRef.child('joinRequests/'+uid).remove();status('CALL DECLINED');}
async function endCall(uid){if(!sessionRef)return;await sessionRef.child('participants/'+uid+'/callState').set('ended').catch(()=>{});stopPeer(uid);const row=document.querySelector('[data-call-controls="'+uid+'"]');if(row)row.remove();status('CALL ENDED');}
window.getTournamentCameraVideo=slot=>videoBySlot.get(String(slot))||null;
window.getTournamentCameraStatus=slot=>cameraStatus.get(String(slot))||'Waiting for camera';
async function ensureAdminMedia(){
 if(adminMediaStream)return adminMediaStream;
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('This browser cannot access camera or microphone. Use HTTPS in Safari or Chrome.');
 const attempts=[
  {audio:{echoCancellation:true,noiseSuppression:true},video:{width:{ideal:960},height:{ideal:540},frameRate:{ideal:24,max:30}}},
  {audio:false,video:{width:{ideal:960},height:{ideal:540},frameRate:{ideal:24,max:30}}},
  {audio:{echoCancellation:true,noiseSuppression:true},video:false}
 ];
 let lastError=null;
 for(const constraints of attempts){
  try{adminMediaStream=await navigator.mediaDevices.getUserMedia(constraints);return adminMediaStream;}
  catch(error){lastError=error;}
 }
 // Do not block phone approval when the admin device has no available camera/microphone.
 // The admin can still receive the phone's live video and audio.
 adminMediaStream=new MediaStream();
 return adminMediaStream;
}
function renderCallControls(uid,slot,nickname){const host=$('camera-slots');if(!host)return;host.hidden=false;let row=host.querySelector('[data-call-controls="'+uid+'"]');if(!row){row=document.createElement('div');row.className='camera-call-controls';row.dataset.callControls=uid;row.innerHTML='<strong></strong><button type="button" class="button button-muted" data-call-mute="'+escapeHtml(uid)+'">Mute mic</button><button type="button" class="button button-muted" data-call-camera="'+escapeHtml(uid)+'">Camera off</button><button type="button" class="button button-danger" data-call-end="'+escapeHtml(uid)+'">End call</button>';host.appendChild(row);}row.querySelector('strong').textContent='Slot '+slot+' · '+nickname;}
async function addPhone(uid,participant){
 if(!sessionRef||peerByUid.has(uid)||!participant||participant.approved!==true)return;
 const slot=String(participant.slot||'1');renderSlot(uid,slot,participant.nickname||'Phone connected');
 let local;try{local=await ensureAdminMedia();}catch(e){setPhoneState(uid,'Admin media unavailable: '+e.message);return;}
 const pc=new RTCPeerConnection(STUN);peerByUid.set(uid,pc);
 if(local.getTracks().length)local.getTracks().forEach(track=>pc.addTrack(track,local));
 else{pc.addTransceiver('audio',{direction:'recvonly'});pc.addTransceiver('video',{direction:'recvonly'});}
 renderCallControls(uid,slot,participant.nickname||'Phone');
 pc.ontrack=e=>{const slot=uidToSlot.get(uid),video=slot&&videoBySlot.get(slot);if(video&&e.track.kind==='video'){video.srcObject=e.streams[0];video.play().catch(()=>{});}if(e.track.kind==='audio'){let audio=remoteAudioByUid.get(uid);if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.style.display='none';document.body.appendChild(audio);remoteAudioByUid.set(uid,audio);}audio.srcObject=e.streams[0];audio.play().catch(()=>{});}setPhoneState(uid,'VIDEO CALL · '+pc.connectionState.toUpperCase());};
 pc.onconnectionstatechange=()=>setPhoneState(uid,'Connection: '+pc.connectionState.toUpperCase());
 const signal=sessionRef.child('participants/'+uid+'/phoneToAdmin'),adminSignal=sessionRef.child('participants/'+uid+'/adminToPhone');
 let remoteReady=false,answerStarted=false;const queued=[];
 const candidateHandler=snap=>{const c=snap.val();if(!c)return;const ice=new RTCIceCandidate(c);if(remoteReady)pc.addIceCandidate(ice).catch(()=>{});else queued.push(ice);};
 candidateHandlers.set(uid,candidateHandler);signal.child('candidates').on('child_added',candidateHandler);
 pc.onicecandidate=e=>{if(e.candidate)adminSignal.child('candidates').push(e.candidate.toJSON()).catch(()=>{});};
 const offerHandler=async snap=>{
  const offer=snap.val();if(!offer||!offer.sdp||answerStarted||!peerByUid.has(uid))return;answerStarted=true;
  try{await pc.setRemoteDescription(new RTCSessionDescription(offer));remoteReady=true;while(queued.length)await pc.addIceCandidate(queued.shift()).catch(()=>{});const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await adminSignal.child('answer').set({type:answer.type,sdp:answer.sdp});setPhoneState(uid,'Negotiating live video…');}
  catch(err){setPhoneState(uid,'Connection setup failed: '+err.message);}
 };
 offerHandlers.set(uid,offerHandler);signal.child('offer').on('value',offerHandler);
 setPhoneState(uid,'Waiting for phone camera…');
}
function watchSession(){
 stopSessionListeners();
 if(!sessionRef)return;
 requestsRef=sessionRef.child('joinRequests');requestHandler=s=>renderRequests(s.val());requestsRef.on('value',requestHandler,err=>status('Request read blocked: '+err.message));
 participantsRef=sessionRef.child('participants');participantHandler=s=>{const p=s.val();if(p&&p.approved===true)addPhone(s.key,p).catch(e=>setPhoneState(s.key,'Connection error: '+e.message));};participantChangedHandler=s=>{const p=s.val();if(p&&p.callState==='ended'){stopPeer(s.key);const row=document.querySelector('[data-call-controls="'+s.key+'"]');if(row)row.remove();setPhoneState(s.key,'Call ended');}};participantsRef.on('child_added',participantHandler,err=>status('Camera access blocked: '+err.message));participantsRef.on('child_changed',participantChangedHandler);
}
async function createSession(){
 if(!db||!adminUid)return status('Sign in as Super Admin first.');
 const btn=$('camera-create-session');btn.disabled=true;
 try{
  const match=null;
  if(sessionId&&sessionRef)await sessionRef.child('meta/status').set('closed');
  stopSessionListeners();sessionId=db.ref(root).push().key;const now=Date.now(),expiresAt=now+2*60*60*1000;
  sessionRef=db.ref(root+sessionId);
  await sessionRef.child('meta').set({adminUid,createdAt:now,expiresAt,status:'active'});
  const url=new URL('/tournament-camera/',window.location.origin);url.searchParams.set('s',sessionId);
  $('camera-invite-link').value=url.toString();$('camera-session-code').textContent=sessionId;
  $('camera-session-tools').hidden=false;
  const qr=$('camera-invite-qr');
  if(qr){
   qr.replaceChildren();
   qr.setAttribute('aria-busy','true');
   qr.style.width='240px';qr.style.height='240px';qr.style.minWidth='240px';qr.style.minHeight='240px';
   const showFallback=index=>{
    const sources=[
     'https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=png&data='+encodeURIComponent(url.toString()),
     'https://quickchart.io/qr?text='+encodeURIComponent(url.toString())+'&size=220'
    ];
    if(index>=sources.length){qr.textContent='QR unavailable. Use Copy link or Share link.';qr.removeAttribute('aria-busy');return;}
    const image=new Image();image.alt='Scan to join the tournament camera session';image.width=220;image.height=220;
    image.style.cssText='display:block;width:220px;height:220px;max-width:100%;object-fit:contain';
    image.onload=()=>{qr.replaceChildren(image);qr.removeAttribute('aria-busy');};
    image.onerror=()=>showFallback(index+1);image.src=sources[index];
   };
   try{
    if(!window.QRCode||typeof window.QRCode.toCanvas!=='function')throw new Error('QR generator did not load');
    const canvas=document.createElement('canvas');
    await new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>reject(new Error('QR generation timed out')),8000);
     window.QRCode.toCanvas(canvas,url.toString(),{width:220,margin:3,errorCorrectionLevel:'H',color:{dark:'#111827',light:'#ffffff'}},error=>{
      clearTimeout(timeout);if(error)reject(error);else resolve();
     });
    });
    canvas.style.cssText='display:block;width:220px;height:220px;max-width:100%';
    qr.replaceChildren(canvas);qr.removeAttribute('aria-busy');
   }catch(qrError){console.warn('Local QR generation failed:',qrError);showFallback(0);}
  }
  $('camera-slots').innerHTML='';$('camera-requests').innerHTML='<p class="camera-empty">Waiting for phone requests…</p>';
  status('SESSION ACTIVE · EXPIRES IN 2 HOURS');watchSession();
  expiryTimer=setTimeout(()=>{closeSession().catch(()=>{});},Math.max(0,expiresAt-Date.now()));
 }catch(e){status('Could not create session: '+e.message);}
 finally{btn.disabled=false;}
}
async function closeSession(){if(sessionRef){await sessionRef.child('meta/status').set('closed').catch(()=>{});await sessionRef.child('meta/closedAt').set(Date.now()).catch(()=>{});}stopSessionListeners();sessionId='';sessionRef=null;$('camera-session-tools').hidden=true;$('camera-invite-link').value='';$('camera-slots').innerHTML='';status('SESSION CLOSED');}
async function approve(uid,slot){
 if(!sessionRef||!adminUid)return;
 const request=(await sessionRef.child('joinRequests/'+uid).once('value')).val();
 if(!request)return;
 try{
  const selectedSlot=String(slot||request.requestedSlot||'1');
  const existing=(await sessionRef.child('participants').once('value')).val()||{};
  if(Object.entries(existing).some(([otherUid,p])=>otherUid!==uid&&p&&p.approved===true&&String(p.slot)===selectedSlot)){
   status('CAMERA '+selectedSlot+' IS ALREADY APPROVED');return;
  }
  // Approval must never depend on local camera/microphone hardware.
  // Signaling starts immediately; addPhone attempts local media separately.
  await sessionRef.child('participants/'+uid).set({approved:true,slot:selectedSlot,nickname:String(request.nickname||'Phone camera').slice(0,32),joinedAt:Date.now()});
  await sessionRef.child('joinRequests/'+uid).remove();
  status('APPROVED · CAMERA '+selectedSlot+' · CONNECTING');
 }catch(e){status('Approval failed: '+e.message);}
}
document.addEventListener('click',e=>{const t=e.target;const approveBtn=t.closest('[data-camera-approve]');if(approveBtn)approve(approveBtn.dataset.cameraApprove,approveBtn.dataset.cameraSlot);const declineBtn=t.closest('[data-camera-decline]');if(declineBtn)decline(declineBtn.dataset.cameraDecline);const muteBtn=t.closest('[data-call-mute]');if(muteBtn)toggleAdminTrack(muteBtn.dataset.callMute,'audio',adminMuted);const cameraBtn=t.closest('[data-call-camera]');if(cameraBtn)toggleAdminTrack(cameraBtn.dataset.callCamera,'video',adminCameraOff);const endBtn=t.closest('[data-call-end]');if(endBtn)endCall(endBtn.dataset.callEnd);});
$('camera-create-session')?.addEventListener('click',createSession);
$('camera-close-session')?.addEventListener('click',()=>closeSession());
$('camera-share-invite')?.addEventListener('click',async()=>{
 const url=$('camera-invite-link')?.value;if(!url)return;
 const data={title:'Viral Cage Play · Tournament Camera',text:'Join the live tournament camera session.',url};
 try{if(navigator.share&&(!navigator.canShare||navigator.canShare(data))){await navigator.share(data);status('INVITATION READY TO SHARE');}
 else{await navigator.clipboard.writeText(url);status('INVITATION LINK COPIED · SHARE IT IN YOUR MESSAGE APP');}}
 catch(e){if(e&&e.name==='AbortError')return;try{await navigator.clipboard.writeText(url);status('INVITATION LINK COPIED');}catch(_){status('USE COPY INVITATION TO SHARE THIS LINK');}}
});
$('camera-copy-invite')?.addEventListener('click',async()=>{const input=$('camera-invite-link');if(!input.value)return;try{await navigator.clipboard.writeText(input.value);status('INVITATION LINK COPIED');}catch(_){input.select();document.execCommand('copy');status('INVITATION LINK COPIED');}});
window.initTournamentCameras=function(options){if(!options||!options.db||!options.uid)return;db=options.db;adminUid=options.uid;status('READY · CREATE A PRIVATE SESSION');};
window.addEventListener('vc-admin-ready',e=>window.initTournamentCameras(e.detail));
window.addEventListener('vc-admin-signed-out',()=>{if(sessionRef)sessionRef.child('meta/status').set('closed').catch(()=>{});stopSessionListeners();db=null;adminUid='';sessionId='';sessionRef=null;if($('camera-session-tools'))$('camera-session-tools').hidden=true;status('ADMIN SIGN-IN REQUIRED');});
window.stopTournamentCameras=function(){stopSessionListeners();};
})();