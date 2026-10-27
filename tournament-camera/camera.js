(function(){
'use strict';
const firebaseConfig={apiKey:"AIzaSyC_R_O2e3D1-fGjHByesj98uynbjXnG9ng",authDomain:"bagh-chal-5dc2f.firebaseapp.com",databaseURL:"https://bagh-chal-5dc2f-default-rtdb.firebaseio.com",projectId:"bagh-chal-5dc2f",storageBucket:"bagh-chal-5dc2f.firebasestorage.app",messagingSenderId:"304434839417",appId:"1:304434839417:web:6c1ac04800e26c8f0039a8"};
const $=id=>document.getElementById(id),sessionId=new URLSearchParams(location.search).get('s')||'',STUN={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
let auth,db,uid,sessionRef,participantRef,pc,stream,answerHandler,candidateHandler,participantHandler,declineHandler,stopped=false,cameraStarted=false,remoteAdminStream=null,phoneMuted=false,phoneCameraOff=false;
function say(t){$('status').textContent=t;}
function clean(){stopped=true;if(answerHandler&&participantRef)participantRef.child('adminToPhone/answer').off('value',answerHandler);if(candidateHandler&&participantRef)participantRef.child('adminToPhone/candidates').off('child_added',candidateHandler);if(participantHandler&&participantRef)participantRef.off('value',participantHandler);if(declineHandler&&sessionRef)sessionRef.child('declinedRequests/'+uid).off('value',declineHandler);if(pc){pc.close();pc=null;}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}const v=$('preview');if(v)v.srcObject=null;const remote=$('admin-video');if(remote)remote.srcObject=null;}
async function startCamera(){
 if(stopped||!participantRef||cameraStarted)return;cameraStarted=true;
 try{
  say('Admin accepted your call. Allow camera and microphone access…');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'user'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  $('preview-wrap').hidden=false;
  const preview=$('preview'),pipButton=$('pip-button');
  preview.srcObject=stream;
  preview.play().catch(()=>{});
  if(pipButton){
   const supportsPiP=!!(document.pictureInPictureEnabled&&preview.requestPictureInPicture)||typeof preview.webkitSetPresentationMode==='function';
   pipButton.hidden=!supportsPiP;
   pipButton.onclick=async()=>{
    try{
     if(document.pictureInPictureElement===preview){await document.exitPictureInPicture();return;}
     if(document.pictureInPictureEnabled&&preview.requestPictureInPicture)await preview.requestPictureInPicture();
     else if(typeof preview.webkitSetPresentationMode==='function')preview.webkitSetPresentationMode('picture-in-picture');
     else say('Picture-in-Picture is not supported by this browser. Keep the camera tab open.');
    }catch(error){say('Could not float the camera: '+(error.message||'Browser blocked Picture-in-Picture.'));}
   };
  }
  pc=new RTCPeerConnection(STUN);stream.getTracks().forEach(track=>pc.addTrack(track,stream));pc.ontrack=e=>{const remote=$('admin-video');if(remote){remoteAdminStream=e.streams[0];remote.srcObject=remoteAdminStream;remote.muted=false;remote.play().catch(()=>say('Tap the admin video to enable call audio.'));$('admin-video-wrap').hidden=false;}};
  const mute=$('phone-mute'),camera=$('phone-camera-toggle'),end=$('phone-end-call');if(mute)mute.onclick=()=>{phoneMuted=!phoneMuted;stream.getAudioTracks().forEach(t=>t.enabled=!phoneMuted);mute.textContent=phoneMuted?'Unmute microphone':'Mute microphone';};if(camera)camera.onclick=()=>{phoneCameraOff=!phoneCameraOff;stream.getVideoTracks().forEach(t=>t.enabled=!phoneCameraOff);camera.textContent=phoneCameraOff?'Turn camera on':'Turn camera off';};if(end)end.onclick=async()=>{if(participantRef)await participantRef.child('callState').set('ended').catch(()=>{});say('You ended the call.');clean();};
  pc.onconnectionstatechange=()=>{say('Video call: '+pc.connectionState.toUpperCase());if(pc&&['closed','failed'].includes(pc.connectionState))clean();};
  const phoneSignal=participantRef.child('phoneToAdmin'),adminSignal=participantRef.child('adminToPhone');
  pc.onicecandidate=e=>{if(e.candidate)phoneSignal.child('candidates').push(e.candidate.toJSON()).catch(err=>say('Network setup failed: '+err.message));};
  let remoteReady=false;const queued=[];
  candidateHandler=snap=>{const c=snap.val();if(!c||!pc)return;const ice=new RTCIceCandidate(c);if(remoteReady&&pc.remoteDescription)pc.addIceCandidate(ice).catch(()=>{});else queued.push(ice);};
  adminSignal.child('candidates').on('child_added',candidateHandler);
  answerHandler=async snap=>{const answer=snap.val();if(!answer||!answer.sdp||!pc||pc.remoteDescription)return;try{await pc.setRemoteDescription(new RTCSessionDescription(answer));remoteReady=true;while(queued.length){const ice=queued.shift();await pc.addIceCandidate(ice).catch(()=>{});}say('Video call connected. You can see and hear the admin.');}catch(e){say('Connection setup failed: '+e.message);}};
  adminSignal.child('answer').on('value',answerHandler);
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  await phoneSignal.child('offer').set({type:offer.type,sdp:offer.sdp});await participantRef.child('callState').set('connecting').catch(()=>{});
 }catch(e){cameraStarted=false;say(e.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser settings.':e.message||'Could not start camera.');}
}
async function init(){
 if(!sessionId){say('Invalid invitation link. Ask the admin for a new link.');return;}
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){say('Open this link in Safari or Chrome using HTTPS. Camera access is not supported here.');return;}
 try{
  if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);auth=firebase.auth();db=firebase.database();
  const credential=await auth.signInAnonymously();uid=credential.user.uid;sessionRef=db.ref('tournamentCameras/sessions/'+sessionId);
  const meta=(await sessionRef.child('meta').once('value')).val();
  if(!meta||meta.status!=='active'||Number(meta.expiresAt)<=Date.now()){say('This camera invitation has expired or was closed. Ask admin for a new link.');return;}
  const slot=$('slot'),nicknameInput=$('nickname'),requestBtn=$('request');
  if(!slot||!nicknameInput||!requestBtn){say('Camera page is incomplete. Reload this page or ask the admin to refresh the site.');return;}
  requestBtn.disabled=false;say('Enter your nickname and choose left or right camera. No game-name matching is required.');
  requestBtn.addEventListener('click',async()=>{const nickname=String(nicknameInput.value||'').trim().slice(0,32),selected=String(slot.value||'1');if(!nickname){say('Please enter your nickname first.');nicknameInput.focus();return;}requestBtn.disabled=true;try{await sessionRef.child('declinedRequests/'+uid).remove();await sessionRef.child('joinRequests/'+uid).set({nickname,requestedSlot:selected,createdAt:Date.now()});say('Request sent as '+nickname+'. Waiting for admin approval…');participantRef=sessionRef.child('participants/'+uid);participantHandler=snap=>{const p=snap.val();if(p&&p.callState==='ended'){say('Admin ended the call.');clean();return;}if(p&&p.approved===true)startCamera();else if(!p)say('Waiting for admin approval…');};participantRef.on('value',participantHandler,err=>{say('Connection update failed: '+err.message);requestBtn.disabled=false;});declineHandler=snap=>{if(snap.exists()){say('Admin declined the call request.');requestBtn.disabled=false;}};sessionRef.child('declinedRequests/'+uid).on('value',declineHandler);}catch(e){say('Could not send request: '+(e&&e.message?e.message:String(e)));requestBtn.disabled=false;}});
 }catch(e){say(e.code==='auth/operation-not-allowed'?'Anonymous Authentication is not enabled in Firebase.':e.message||'Could not connect to the camera service.');}
}
window.addEventListener('pagehide',clean);document.addEventListener('visibilitychange',()=>{if(document.hidden&&pc&&pc.connectionState==='connected')say('Camera is still connected. Keep this page open.');});
init();
})();