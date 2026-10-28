/* Viral Cage Play — site-wide direct voice calls.
   Firebase carries presence/signaling only. Voice media is sent peer-to-peer by WebRTC. */
(() => {
  'use strict';
  if (window.__vcPlayerVoiceLoaded) return;
  window.__vcPlayerVoiceLoaded = true;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  const PRESENCE_PATH = 'voicePresence';
  const CALLS_PATH = 'voiceCalls';
  const STALE_AFTER = 60000;

  let db = null, uid = null, presenceSessionRef = null, presenceRootRef = null;
  let directoryListener = null, incomingListener = null;
  let activeCallRef = null, activeCallId = null, activePeer = null, localStream = null;
  let remoteCandidates = [], candidateListener = null, callListener = null;
  let incomingCallRef = null, incomingCallData = null, callSide = null;
  let muted = false, connected = false, callTimer = null;
  const $ = id => document.getElementById(id);

  function displayName() {
    const field = $('guestNameInput');
    const savedButton = $('editGuestNameBtn');
    let value = (field && field.value || '').trim();
    if (!value && savedButton) value = (savedButton.textContent || '').trim();
    if (!value) {
      try { value = localStorage.getItem('bagchal.guestName.v1') || ''; } catch (_) {}
    }
    return value.replace(/\s+/g, ' ').slice(0, 24) || ('Guest' + String(uid || '').slice(-4));
  }

  function setStatus(message) {
    const el = $('vcVoiceStatus');
    if (el) el.textContent = message;
  }

  function buildUI() {
    if ($('vcVoiceDock')) return;
    const style = document.createElement('style');
    style.id = 'vcPlayerVoiceStyles';
    style.textContent = `
      #vcVoiceDock{position:fixed;z-index:2147481000;right:18px;bottom:18px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#eaf1ff}
      #vcVoiceToggle{border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-weight:800;box-shadow:0 8px 28px #0005;cursor:pointer}
      #vcVoicePanel{display:none;position:absolute;right:0;bottom:58px;width:min(340px,calc(100vw - 28px));max-height:min(70vh,520px);overflow:auto;background:#0b1220;border:1px solid #334155;border-radius:16px;padding:14px;box-shadow:0 18px 55px #0009}
      #vcVoicePanel.open{display:block}
      #vcVoicePanel h3{margin:0 0 5px;font-size:16px;color:#fff}
      #vcVoicePanel p{margin:4px 0 10px;color:#9fb0ca;font-size:12px}
      #vcVoiceStatus{min-height:18px;color:#a5b4fc;font-size:12px;margin:8px 0}
      #vcVoiceList{display:grid;gap:7px}
      .vc-voice-player{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid #26364e;border-radius:10px;background:#111c2e}
      .vc-voice-player span{flex:1;min-width:0;overflow-wrap:anywhere;color:#e5edff;font-weight:650}
      .vc-voice-player small{display:block;color:#34d399;font-size:10px;font-weight:500}
      .vc-voice-player button,.vc-call-actions button,.vc-active-controls button{border:0;border-radius:8px;padding:8px 10px;font-weight:750;cursor:pointer}
      .vc-voice-player button{background:#2563eb;color:#fff}
      .vc-voice-player button:disabled{opacity:.45;cursor:not-allowed}
      #vcVoiceEmpty{padding:12px;text-align:center;color:#94a3b8;border:1px dashed #334155;border-radius:10px;font-size:12px}
      #vcIncomingCall{display:none;position:fixed;z-index:2147482000;inset:0;background:#020617b8;align-items:center;justify-content:center;padding:18px}
      #vcIncomingCall.open{display:flex}
      #vcIncomingCard{width:min(340px,100%);padding:20px;border-radius:18px;background:#101a2b;border:1px solid #475569;box-shadow:0 20px 70px #000b;text-align:center;color:#fff}
      #vcIncomingCard h3{margin:0 0 8px;font-size:19px}
      #vcIncomingCard p{color:#b7c6dc;font-size:13px;margin:0 0 16px}
      .vc-call-actions{display:flex;justify-content:center;gap:10px}
      .vc-call-actions .accept{background:#16a34a;color:#fff}.vc-call-actions .decline{background:#334155;color:#fff}
      #vcActiveCall{display:none;position:fixed;z-index:2147481500;left:18px;bottom:18px;max-width:calc(100vw - 36px);padding:12px 14px;border:1px solid #334155;border-radius:14px;background:#0b1220;color:#eaf1ff;box-shadow:0 10px 35px #0008;font:13px system-ui,sans-serif}
      #vcActiveCall.open{display:block}
      #vcActiveCall strong{display:block;margin-bottom:8px}
      .vc-active-controls{display:flex;gap:7px}
      .vc-active-controls button{background:#26364e;color:#fff}.vc-active-controls .end{background:#b91c1c}
      @media(max-width:520px){#vcVoiceDock{right:10px;bottom:10px}#vcActiveCall{left:10px;bottom:10px}}
    `;
    document.head.appendChild(style);

    const dock = document.createElement('div');
    dock.id = 'vcVoiceDock';
    dock.innerHTML = `
      <section id="vcVoicePanel" aria-label="Online players">
        <h3>Online Players</h3>
        <p>Select a player to start a private, direct voice call.</p>
        <div id="vcVoiceStatus" role="status" aria-live="polite">Connecting to player directory…</div>
        <div id="vcVoiceList"><div id="vcVoiceEmpty">Loading online players…</div></div>
      </section>
      <button id="vcVoiceToggle" type="button" aria-expanded="false">Players <span id="vcVoiceCount">0</span></button>`;
    document.body.appendChild(dock);

    const incoming = document.createElement('div');
    incoming.id = 'vcIncomingCall';
    incoming.innerHTML = `
      <div id="vcIncomingCard" role="dialog" aria-modal="true" aria-labelledby="vcIncomingTitle">
        <h3 id="vcIncomingTitle">Incoming voice call</h3>
        <p id="vcIncomingText">A player is calling you.</p>
        <div class="vc-call-actions">
          <button class="accept" id="vcAcceptCall" type="button">Accept</button>
          <button class="decline" id="vcDeclineCall" type="button">Decline</button>
        </div>
      </div>`;
    document.body.appendChild(incoming);

    const active = document.createElement('div');
    active.id = 'vcActiveCall';
    active.innerHTML = `
      <strong id="vcActiveTitle">Voice call</strong>
      <div class="vc-active-controls">
        <button id="vcMuteCall" type="button">Mute</button>
        <button class="end" id="vcEndCall" type="button">End call</button>
      </div>`;
    document.body.appendChild(active);

    $('vcVoiceToggle').addEventListener('click', () => {
      const panel = $('vcVoicePanel');
      const open = panel.classList.toggle('open');
      $('vcVoiceToggle').setAttribute('aria-expanded', String(open));
    });
    $('vcAcceptCall').addEventListener('click', acceptIncomingCall);
    $('vcDeclineCall').addEventListener('click', () => finishCall('declined'));
    $('vcEndCall').addEventListener('click', () => finishCall('ended'));
    $('vcMuteCall').addEventListener('click', toggleMute);
  }

  function safeText(element, value) { element.textContent = String(value || ''); }

  function renderPlayers(snapshot) {
    const list = $('vcVoiceList');
    if (!list) return;
    const now = Date.now(), players = [];
    const all = snapshot.val() || {};
    Object.entries(all).forEach(([playerUid, sessions]) => {
      if (playerUid === uid || !sessions || typeof sessions !== 'object') return;
      const live = Object.values(sessions).filter(s => s && s.online !== false && now - Number(s.lastSeen || 0) < STALE_AFTER);
      if (!live.length) return;
      live.sort((a,b) => Number(b.lastSeen || 0) - Number(a.lastSeen || 0));
      players.push({ uid: playerUid, name: live[0].name || 'Guest' });
    });
    players.sort((a,b) => a.name.localeCompare(b.name));
    $('vcVoiceCount').textContent = String(players.length);
    list.replaceChildren();
    if (!players.length) {
      const empty = document.createElement('div');
      empty.id = 'vcVoiceEmpty';
      empty.textContent = 'No other players are online right now.';
      list.appendChild(empty);
      return;
    }
    players.forEach(player => {
      const row = document.createElement('div'); row.className = 'vc-voice-player';
      const label = document.createElement('span'); label.textContent = player.name;
      const sub = document.createElement('small'); sub.textContent = 'Online now'; label.appendChild(sub);
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Call';
      button.disabled = !!activeCallRef;
      button.addEventListener('click', () => startOutgoingCall(player));
      row.append(label, button); list.appendChild(row);
    });
  }

  async function startPresence() {
    if (!window.ensureFirebase || !(await window.ensureFirebase())) {
      setStatus('Firebase sign-in is unavailable. Refresh and try again.');
      return;
    }
    db = firebase.database();
    uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
    if (!uid) { setStatus('Could not identify this player session.'); return; }
    presenceRootRef = db.ref(PRESENCE_PATH + '/' + uid);
    presenceSessionRef = presenceRootRef.push();
    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', snap => {
      if (!snap.val() || !presenceSessionRef) return;
      presenceSessionRef.onDisconnect().remove().then(() => presenceSessionRef.set({
        name: displayName(), online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP
      })).then(() => setStatus('Connected. Choose any online player to call.'))
        .catch(err => { console.error('Voice presence error:', err); setStatus('Player directory permission denied. Update Firebase database rules.'); });
    });
    directoryListener = snap => renderPlayers(snap);
    db.ref(PRESENCE_PATH).on('value', directoryListener, err => {
      console.error('Voice directory read error:', err);
      setStatus('Cannot read online players. Firebase database rules need voicePresence access.');
    });
    incomingListener = snap => {
      snap.forEach(child => {
        const data = child.val();
        if (!data || data.status !== 'ringing' || !data.offer || activeCallRef || incomingCallRef) return;
        incomingCallRef = child.ref;
        incomingCallData = data;
        $('vcIncomingTitle').textContent = 'Incoming voice call';
        $('vcIncomingText').textContent = (data.callerName || 'A player') + ' wants to talk with you.';
        $('vcIncomingCall').classList.add('open');
        setStatus('Incoming call from ' + (data.callerName || 'a player') + '.');
      });
    };
    db.ref(CALLS_PATH + '/' + uid).on('child_added', incomingListener, err => {
      console.error('Incoming call listener error:', err);
      setStatus('Cannot receive calls. Firebase voiceCalls rules need to be enabled.');
    });
    const nameField = $('guestNameInput');
    if (nameField) nameField.addEventListener('change', refreshPresenceName);
    const saveName = $('saveGuestNameBtn');
    if (saveName) saveName.addEventListener('click', () => setTimeout(refreshPresenceName, 0));
    window.addEventListener('beforeunload', cleanupPresence);
  }

  function refreshPresenceName() {
    if (presenceSessionRef) presenceSessionRef.update({ name: displayName(), lastSeen: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
  }
  function cleanupPresence() {
    if (presenceSessionRef) presenceSessionRef.remove().catch(() => {});
    if (db && uid) {
      db.ref(PRESENCE_PATH).off('value', directoryListener);
      db.ref(CALLS_PATH + '/' + uid).off('child_added', incomingListener);
    }
  }

  function makePeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    remoteCandidates = [];
    pc.ontrack = event => {
      let audio = $('vcRemoteAudio');
      if (!audio) {
        audio = document.createElement('audio'); audio.id = 'vcRemoteAudio';
        audio.autoplay = true; audio.playsInline = true; document.body.appendChild(audio);
      }
      audio.srcObject = event.streams[0];
      audio.play().catch(() => setStatus('Call connected. Tap the page once if audio is blocked.'));
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') { connected = true; setStatus('Voice connected directly to the other player.'); }
      else if (state === 'failed') setStatus('P2P connection failed. This network may require a TURN relay.');
      else if (state === 'disconnected') setStatus('Voice connection interrupted. Reconnecting…');
    };
    return pc;
  }

  async function acquireMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone access requires HTTPS and a supported browser.');
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  }

  async function startOutgoingCall(player) {
    if (!db || activeCallRef) return;
    if (!window.RTCPeerConnection) { setStatus('This browser does not support WebRTC voice calls.'); return; }
    try {
      setStatus('Requesting microphone permission…');
      localStream = await acquireMicrophone();
      callSide = 'caller'; activePeer = makePeerConnection();
      localStream.getTracks().forEach(track => activePeer.addTrack(track, localStream));
      const offer = await activePeer.createOffer();
      await activePeer.setLocalDescription(offer);
      activeCallRef = db.ref(CALLS_PATH + '/' + player.uid).push();
      activeCallId = activeCallRef.key;
      const queuedCandidates = [];
      activePeer.onicecandidate = event => {
        if (!event.candidate) return;
        const write = () => activeCallRef.child('candidates/' + uid).push(event.candidate.toJSON()).catch(console.warn);
        if (activeCallRef) write(); else queuedCandidates.push(event.candidate.toJSON());
      };
      await activeCallRef.set({
        callerUid: uid, callerName: displayName(), calleeUid: player.uid,
        status: 'ringing', createdAt: firebase.database.ServerValue.TIMESTAMP,
        offer: { type: activePeer.localDescription.type, sdp: activePeer.localDescription.sdp }
      });
      queuedCandidates.forEach(candidate => activeCallRef.child('candidates/' + uid).push(candidate));
      activeCallRef.onDisconnect().remove();
      watchActiveCall();
      $('vcActiveTitle').textContent = 'Calling ' + player.name + '…';
      $('vcActiveCall').classList.add('open');
      setStatus('Calling ' + player.name + '. Waiting for them to answer…');
    } catch (err) {
      console.error('Could not start P2P voice call:', err);
      setStatus(err && err.name === 'NotAllowedError' ? 'Microphone permission denied. Allow microphone access and try again.' : (err.message || 'Could not start the voice call.'));
      await releaseMedia();
    }
  }

  function watchActiveCall() {
    if (!activeCallRef || !activePeer) return;
    callListener = snap => {
      const data = snap.val();
      if (!data) { finishCallLocal('Call ended.'); return; }
      if (data.status === 'declined') { finishCallLocal('The player declined your call.'); return; }
      if (data.status === 'ended') { finishCallLocal('The other player ended the call.'); return; }
      if (data.answer && !activePeer.remoteDescription) {
        activePeer.setRemoteDescription(new RTCSessionDescription(data.answer))
          .then(flushCandidates).catch(err => { console.error(err); setStatus('Could not set up the voice connection.'); });
      }
    };
    activeCallRef.on('value', callListener);
    candidateListener = snap => {
      const candidate = snap.val();
      if (!candidate || !activePeer) return;
      if (activePeer.remoteDescription) activePeer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
      else remoteCandidates.push(candidate);
    };
    activeCallRef.child('candidates/' + incomingTargetUid()).on('child_added', candidateListener);
  }
  let targetUidForCall = null;
  function incomingTargetUid() { return callSide === 'caller' ? targetUidForCall : incomingCallData && incomingCallData.callerUid; }

  async function acceptIncomingCall() {
    if (!incomingCallRef || !incomingCallData || activeCallRef) return;
    const ref = incomingCallRef, data = incomingCallData;
    try {
      $('vcIncomingCall').classList.remove('open');
      setStatus('Connecting microphone…');
      localStream = await acquireMicrophone();
      callSide = 'callee'; activeCallRef = ref; activeCallId = ref.key;
      activePeer = makePeerConnection();
      localStream.getTracks().forEach(track => activePeer.addTrack(track, localStream));
      activePeer.onicecandidate = event => {
        if (event.candidate) activeCallRef.child('candidates/' + uid).push(event.candidate.toJSON()).catch(console.warn);
      };
      await activePeer.setRemoteDescription(new RTCSessionDescription(data.offer));
      await flushCandidates();
      const answer = await activePeer.createAnswer();
      await activePeer.setLocalDescription(answer);
      await activeCallRef.update({ status: 'accepted', answer: { type: answer.type, sdp: answer.sdp } });
      candidateListener = snap => {
        const candidate = snap.val();
        if (!candidate || !activePeer) return;
        if (activePeer.remoteDescription) activePeer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
        else remoteCandidates.push(candidate);
      };
      activeCallRef.child('candidates/' + data.callerUid).on('child_added', candidateListener);
      watchActiveCall();
      $('vcActiveTitle').textContent = 'Voice call with ' + (data.callerName || 'player');
      $('vcActiveCall').classList.add('open');
      incomingCallRef = null; incomingCallData = null;
      setStatus('Answer sent. Establishing direct P2P audio…');
    } catch (err) {
      console.error('Could not accept P2P voice call:', err);
      setStatus(err && err.name === 'NotAllowedError' ? 'Microphone permission denied. Allow access to accept the call.' : (err.message || 'Could not accept the call.'));
      await finishCall('ended');
    }
  }

  async function flushCandidates() {
    if (!activePeer || !activePeer.remoteDescription) return;
    const pending = remoteCandidates.splice(0);
    for (const candidate of pending) {
      try { await activePeer.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (err) { console.warn('Could not add remote ICE candidate:', err); }
    }
  }

  function toggleMute() {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    $('vcMuteCall').textContent = muted ? 'Unmute' : 'Mute';
  }

  async function releaseMedia() {
    if (activeCallRef) {
      if (callListener) activeCallRef.off('value', callListener);
      if (candidateListener) activeCallRef.child('candidates/' + incomingTargetUid()).off('child_added', candidateListener);
    }
    callListener = candidateListener = null;
    if (activePeer) { try { activePeer.close(); } catch (_) {} }
    activePeer = null;
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    const audio = $('vcRemoteAudio');
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); }
    if (activeCallRef && callTimer) clearTimeout(callTimer);
    activeCallRef = null; activeCallId = null; targetUidForCall = null;
    incomingCallRef = null; incomingCallData = null; callSide = null;
    remoteCandidates = []; connected = false; muted = false; callTimer = null;
    $('vcActiveCall').classList.remove('open');
    $('vcMuteCall').textContent = 'Mute';
    if (directoryListener && db) db.ref(PRESENCE_PATH).once('value').then(renderPlayers).catch(() => {});
  }

  async function finishCall(status) {
    const ref = activeCallRef || incomingCallRef;
    if (incomingCallRef && !activeCallRef) {
      try { await incomingCallRef.update({ status }); } catch (_) {}
      $('vcIncomingCall').classList.remove('open');
      incomingCallRef = null; incomingCallData = null;
      setStatus(status === 'declined' ? 'Call declined.' : 'Call ended.');
      return;
    }
    if (ref) {
      try { await ref.update({ status }); } catch (_) {}
      callTimer = setTimeout(() => ref.remove().catch(() => {}), 5000);
    }
    await releaseMedia();
    setStatus(status === 'declined' ? 'Call declined.' : 'Call ended.');
  }

  async function finishCallLocal(message) {
    await releaseMedia();
    setStatus(message);
  }

  // Track the selected destination before the call node is created.
  const originalStartOutgoing = startOutgoingCall;
  startOutgoingCall = async player => {
    targetUidForCall = player.uid;
    await originalStartOutgoing(player);
  };

  function boot() {
    buildUI();
    startPresence().catch(err => {
      console.error('Player voice initialization failed:', err);
      setStatus('Could not start the player directory. Check Firebase connection and rules.');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
