(function(){
'use strict';
const firebaseConfig={apiKey:"AIzaSyC_R_O2e3D1-fGjHByesj98uynbjXnG9ng",authDomain:"bagh-chal-5dc2f.firebaseapp.com",databaseURL:"https://bagh-chal-5dc2f-default-rtdb.firebaseio.com",projectId:"bagh-chal-5dc2f",storageBucket:"bagh-chal-5dc2f.firebasestorage.app",messagingSenderId:"304434839417",appId:"1:304434839417:web:6c1ac04800e26c8f0039a8"};
const $=id=>document.getElementById(id),sessionId=new URLSearchParams(location.search).get('s')||'',STUN={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
let auth,db,uid,sessionRef,participantRef,pc,stream,answerHandler,candidateHandler,stopped=false;
function say(t){$('status').textContent=t;}
function clean(){stopped=true;if(answerHandler&&participantRef)participantRef.child('adminToPhone/answer').off('value',answerHandler);if(candidateHandler&&participantRef)participantRef.child('adminToPhone/candidates').off('child_added',candidateHandler);if(pc){pc.close();pc=null;}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}const v=$('preview');if(v)v.srcObject=null;}
async function startCamera(){
 if(stopped||!participantRef)return;
 try{
  say('Admin approved. Requesting camera permission…');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:false});
  $('preview-wrap').hidden=false;$('preview').srcObject=stream;
  pc=new RTCPeerConnection(STUN);stream.getTracks().forEach(track=>pc.addTrack(track,stream));
  pc.onconnectionstatechange=()=>say('Camera connection: '+pc.connectionState.toUpperCase());
  const phoneSignal=participantRef.child('phoneToAdmin'),adminSignal=participantRef.child('adminToPhone');
  pc.onicecandidate=e=>{if(e.candidate)phoneSignal.child('candidates').push(e.candidate.toJSON()).catch(err=>say('Network setup failed: '+err.message));};
  let remoteReady=false;const queued=[];
  candidateHandler=snap=>{const c=snap.val();if(!c)return;const ice=new RTCIceCandidate(c);if(remoteReady)pc.addIceCandidate(ice).catch(()=>{});else queued.push(ice);};
  adminSignal.child('candidates').on('child_added',candidateHandler);
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  await phoneSignal.child('offer').set({type:offer.type,sdp:offer.sdp});
  answerHandler=async snap=>{const answer=snap.val();if(!answer||!answer.sdp||pc.remoteDescription)return;try{await pc.setRemoteDescription(new RTCSessionDescription(answer));remoteReady=true;while(queued.length)await pc.addIceCandidate(queued.shift()).catch(()=>{});say('Connecting live camera to admin…');}catch(e){say('Connection setup failed: '+e.message);}};
  adminSignal.child('answer').on('value',answerHandler);
 }catch(e){say(e.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser settings.':e.message||'Could not start camera.');}
}
async function init(){
 if(!sessionId){say('Invalid invitation link. Ask the admin for a new link.');return;}
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){say('Open this link in Safari or Chrome using HTTPS. Camera access is not supported here.');return;}
 try{
  if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);auth=firebase.auth();db=firebase.database();
  const credential=await auth.signInAnonymously();uid=credential.user.uid;sessionRef=db.ref('tournamentCameras/sessions/'+sessionId);
  const meta=(await sessionRef.child('meta').once('value')).val();
  if(!meta||meta.status!=='active'||Number(meta.expiresAt)<=Date.now()){say('This camera invitation has expired or was closed. Ask admin for a new link.');return;}
  const requestBtn=$('request');requestBtn.disabled=false;say('Private session found. Select a camera slot and request approval.');
  requestBtn.addEventListener('click',async()=>{requestBtn.disabled=true;try{const nickname=$('nickname').value.trim()||'Phone camera';await sessionRef.child('joinRequests/'+uid).set({nickname:nickname.slice(0,32),requestedSlot:$('slot').value,createdAt:Date.now()});say('Request sent. Keep this page open while the admin approves your phone.');participantRef=sessionRef.child('participants/'+uid);participantRef.on('value',snap=>{const p=snap.val();if(p&&p.approved===true)startCamera();else if(!p)say('Waiting for admin approval…');});}catch(e){say('Could not send request: '+e.message);requestBtn.disabled=false;}});
 }catch(e){say(e.code==='auth/operation-not-allowed'?'Anonymous Authentication is not enabled in Firebase.':e.message||'Could not connect to the camera service.');}
}
window.addEventListener('pagehide',clean);document.addEventListener('visibilitychange',()=>{if(document.hidden&&pc&&pc.connectionState==='connected')say('Camera is still connected. Keep this page open.');});
init();
})();