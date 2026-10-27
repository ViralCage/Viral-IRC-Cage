(function(){
'use strict';
const $=id=>document.getElementById(id);
const STUN={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
let db=null,adminUid='',sessionId='',sessionRef=null,requestsRef=null,participantsRef=null,requestHandler=null,participantHandler=null,peerByUid=new Map(),candidateHandlers=new Map(),offerHandlers=new Map(),activeStreams=new Map(),expiryTimer=null,videoBySlot=new Map(),uidToSlot=new Map(),cameraStatus=new Map();
const root='tournamentCameras/sessions/';
function status(text){const el=$('camera-admin-status');if(el)el.textContent=text;}
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function stopPeer(uid){const pc=peerByUid.get(uid);if(pc){try{pc.close();}catch(_){}peerByUid.delete(uid);}const h=candidateHandlers.get(uid);if(h&&sessionRef){sessionRef.child('participants/'+uid+'/phoneToAdmin/candidates').off('child_added',h);candidateHandlers.delete(uid);}const oh=offerHandlers.get(uid);if(oh&&sessionRef){sessionRef.child('participants/'+uid+'/phoneToAdmin/offer').off('value',oh);offerHandlers.delete(uid);}const stream=activeStreams.get(uid);if(stream){stream.getTracks().forEach(t=>t.stop());activeStreams.delete(uid);}const slot=uidToSlot.get(uid);const video=slot&&videoBySlot.get(slot);if(video)video.srcObject=null;if(slot){cameraStatus.set(slot,'Camera disconnected');notifyCameraLayout();}uidToSlot.delete(uid);}
function stopSessionListeners(){if(requestsRef&&requestHandler)requestsRef.off('value',requestHandler);if(participantsRef&&participantHandler)participantsRef.off('child_added',participantHandler);requestsRef=null;participantsRef=null;requestHandler=null;participantHandler=null;peerByUid.forEach((_,uid)=>stopPeer(uid));if(expiryTimer)clearTimeout(expiryTimer);expiryTimer=null;}
function renderRequests(data){const host=$('camera-requests');if(!host)return;const rows=Object.entries(data||{});if(!rows.length){host.innerHTML='<p class="camera-empty">No phone requests yet. Open the invitation on two phones.</p>';return;}host.innerHTML=rows.map(([uid,r])=>'<div class="camera-request"><div><b>'+escapeHtml(r.nickname||'Player')+'</b><small>Slot '+escapeHtml(r.requestedSlot||'?')+' · '+escapeHtml(uid.slice(0,9))+'</small></div><button class="button camera-approve" type="button" data-camera-approve="'+escapeHtml(uid)+'" data-camera-slot="'+escapeHtml(r.requestedSlot||'1')+'">Approve</button></div>').join('');}
function notifyCameraLayout(){window.dispatchEvent(new CustomEvent('vc-tournament-camera-update'));}
function renderSlot(uid,slot,label){
 slot=String(slot);uidToSlot.set(uid,slot);
 let video=videoBySlot.get(slot);
 if(!video){video=document.createElement('video');video.id='spectator-camera-video-'+slot;video.autoplay=true;video.playsInline=true;video.muted=true;video.setAttribute('aria-label','Tournament Camera '+slot);videoBySlot.set(slot,video);}
 cameraStatus.set(slot,label||'Phone approved · connecting');
 notifyCameraLayout();
}
function setPhoneState(uid,text){const slot=uidToSlot.get(uid);if(slot){cameraStatus.set(slot,text);notifyCameraLayout();}}
window.getTournamentCameraVideo=slot=>videoBySlot.get(String(slot))||null;
window.getTournamentCameraStatus=slot=>cameraStatus.get(String(slot))||'Waiting for camera';
async function addPhone(uid,participant){
 if(!sessionRef||peerByUid.has(uid)||!participant||participant.approved!==true)return;
 const slot=String(participant.slot||'1');renderSlot(uid,slot,participant.nickname||'Phone connected');
 const pc=new RTCPeerConnection(STUN);peerByUid.set(uid,pc);
 pc.ontrack=e=>{const slot=uidToSlot.get(uid),video=slot&&videoBySlot.get(slot);if(video){video.srcObject=e.streams[0];video.play().catch(()=>{});setPhoneState(uid,'LIVE · Camera connected');}};
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
 participantsRef=sessionRef.child('participants');participantHandler=s=>{const p=s.val();if(p&&p.approved===true)addPhone(s.key,p).catch(e=>setPhoneState(s.key,'Connection error: '+e.message));};participantsRef.on('child_added',participantHandler,err=>status('Camera access blocked: '+err.message));
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
  if(window.QRCode&&qr){qr.innerHTML='';await QRCode.toCanvas(url.toString(),{width:220,margin:2,errorCorrectionLevel:'M',color:{dark:'#111827',light:'#ffffff'}},(err,canvas)=>{if(err){qr.textContent='QR code could not be generated.';return;}qr.appendChild(canvas);});}$('camera-slots').innerHTML='';$('camera-requests').innerHTML='<p class="camera-empty">Waiting for phone requests…</p>';
  status('SESSION ACTIVE · EXPIRES IN 2 HOURS');watchSession();
  expiryTimer=setTimeout(()=>{closeSession().catch(()=>{});},Math.max(0,expiresAt-Date.now()));
 }catch(e){status('Could not create session: '+e.message);}
 finally{btn.disabled=false;}
}
async function closeSession(){if(sessionRef){await sessionRef.child('meta/status').set('closed').catch(()=>{});await sessionRef.child('meta/closedAt').set(Date.now()).catch(()=>{});}stopSessionListeners();sessionId='';sessionRef=null;$('camera-session-tools').hidden=true;$('camera-invite-link').value='';$('camera-slots').innerHTML='';status('SESSION CLOSED');}
async function approve(uid,slot){if(!sessionRef||!adminUid)return;const request=(await sessionRef.child('joinRequests/'+uid).once('value')).val();if(!request)return;try{const selectedSlot=String(slot||request.requestedSlot||'1');const existing=(await sessionRef.child('participants').once('value')).val()||{};if(Object.entries(existing).some(([otherUid,p])=>otherUid!==uid&&p&&p.approved===true&&String(p.slot)===selectedSlot)){status('CAMERA '+selectedSlot+' IS ALREADY APPROVED');return;}await sessionRef.child('participants/'+uid).set({approved:true,slot:selectedSlot,nickname:String(request.nickname||'Phone camera').slice(0,32),joinedAt:Date.now()});await sessionRef.child('joinRequests/'+uid).remove();status('APPROVED · CAMERA '+selectedSlot);}catch(e){status('Approval failed: '+e.message);}}
document.addEventListener('click',e=>{const approveBtn=e.target.closest('[data-camera-approve]');if(approveBtn)approve(approveBtn.dataset.cameraApprove,approveBtn.dataset.cameraSlot);});
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