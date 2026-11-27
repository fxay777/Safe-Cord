import { useCallback, useRef, useState } from 'react';
import { API_URL as API_BASE } from './api';
import { playJoinSound, playLeaveSound, playPeerJoinSound, playPeerLeaveSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from './sounds';

// STUN por si só falha pra muita gente (NAT simétrico, redes corporativas/4G) — sem um TURN
// de reserva, a chamada simplesmente não conecta e não dá nenhum erro visível.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:global.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// Qualidades do compartilhamento de tela (o seletor mostra essas opções)
export const SCREEN_QUALITIES = {
  '720p30': { label: '720p · 30 fps', width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  '1080p30': { label: '1080p · 30 fps', width: 1920, height: 1080, fps: 30, bitrate: 4_500_000 },
  '1080p60': { label: '1080p · 60 fps', width: 1920, height: 1080, fps: 60, bitrate: 6_500_000 },
};

// Ajusta o limite de bits de um "sender" (áudio da voz ou vídeo da tela). Pode falhar antes da
// negociação terminar em versões antigas do Chromium — por isso também tentamos de novo depois.
async function tuneSender(sender, { maxBitrate, maxFramerate, degradation } = {}) {
  if (!sender?.getParameters) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    if (maxBitrate) params.encodings[0].maxBitrate = maxBitrate;
    if (maxFramerate) params.encodings[0].maxFramerate = maxFramerate;
    if (degradation) params.degradationPreference = degradation;
    await sender.setParameters(params);
  } catch { /* ainda não negociado: tenta de novo quando conectar */ }
}

// Gerencia uma sala de voz em topologia mesh (cada peer conecta com todos os outros).
// Bom o suficiente para grupos pequenos (2-8 pessoas), que é o uso típico de servidores da galera.
export function useVoiceChannel(socket) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState([]); // [{socketId, user}]
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState('');
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteScreenShares, setRemoteScreenShares] = useState(new Map()); // socketId -> MediaStream

  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const audioElsRef = useRef(new Map()); // socketId -> HTMLAudioElement
  const channelIdRef = useRef(null);
  const wasMutedBeforeDeafenRef = useRef(false);
  const outputVolumeRef = useRef(1);
  const deafenedRef = useRef(false);
  const outputDeviceIdRef = useRef('');
  const roomInfoRef = useRef({ bitrate: 64, userLimit: 0, kind: 'server' });
  const screenQualityRef = useRef(SCREEN_QUALITIES['1080p30']);
  const pendingIceRef = useRef(new Map()); // socketId -> [candidates] que chegaram antes da descrição remota
  const [roomId, setRoomId] = useState(null);
  const [lastSound, setLastSound] = useState(null); // { name, by, color, at } — pra mostrar quem tocou
  const soundElsRef = useRef(new Set());
  const [roomInfo, setRoomInfo] = useState(null);

  const removeRemoteShare = useCallback((peerSocketId) => {
    setRemoteScreenShares((prev) => {
      if (!prev.has(peerSocketId)) return prev;
      const next = new Map(prev);
      next.delete(peerSocketId);
      return next;
    });
  }, []);

  // Um <audio> por stream recebido (chave "peer|streamId"): a voz e o som da tela
  // compartilhada chegam em streams separados — antes o som da tela SUBSTITUÍA a voz.
  const playRemoteAudio = useCallback((peerSocketId, stream) => {
    const key = `${peerSocketId}|${stream.id}`;
    let audioEl = audioElsRef.current.get(key);
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.volume = deafenedRef.current ? 0 : outputVolumeRef.current;
      if (outputDeviceIdRef.current && typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(outputDeviceIdRef.current).catch(() => {});
      }
      audioElsRef.current.set(key, audioEl);
    }
    if (audioEl.srcObject !== stream) audioEl.srcObject = stream;
    const playPromise = audioEl.play();
    if (playPromise?.catch) {
      playPromise.catch(() => setError('O áudio da chamada foi bloqueado — clique em qualquer lugar da tela e tente de novo.'));
    }
  }, []);

  const dropPeerAudio = useCallback((peerSocketId) => {
    for (const [key, el] of audioElsRef.current.entries()) {
      if (key.startsWith(`${peerSocketId}|`)) {
        el.srcObject = null;
        audioElsRef.current.delete(key);
      }
    }
  }, []);

  const tunePeer = useCallback((pc) => {
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      const isScreen = localScreenStreamRef.current?.getTracks().includes(sender.track);
      if (sender.track.kind === 'audio' && !isScreen) {
        tuneSender(sender, { maxBitrate: (roomInfoRef.current.bitrate || 64) * 1000 });
      } else if (sender.track.kind === 'video') {
        const q = screenQualityRef.current;
        tuneSender(sender, { maxBitrate: q.bitrate, maxFramerate: q.fps, degradation: q.fps >= 60 ? 'maintain-framerate' : 'maintain-resolution' });
      }
    }
  }, []);

  const flushIce = useCallback(async (peerSocketId, pc) => {
    const queued = pendingIceRef.current.get(peerSocketId);
    if (!queued?.length) return;
    pendingIceRef.current.delete(peerSocketId);
    for (const c of queued) {
      try { await pc.addIceCandidate(c); } catch { /* candidato velho */ }
    }
  }, []);

  // "Perfect negotiation" (padrão do WebRTC): qualquer lado pode mandar oferta quando
  // adiciona/remove uma track (ex.: começar a compartilhar a tela). Se as duas ofertas
  // se cruzarem, o lado "educado" cede e o outro ganha — antes as ofertas duplicadas
  // quebravam a conexão e o vídeo da tela nunca chegava.
  const createPeerConnection = useCallback((peerSocketId) => {
    const existing = peersRef.current.get(peerSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.__polite = String(socket.id) > String(peerSocketId);
    pc.__makingOffer = false;
    pc.__ignoreOffer = false;
    peersRef.current.set(peerSocketId, pc);

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });
    // Se eu já estava compartilhando a tela quando essa pessoa entrou, ela recebe o vídeo também
    localScreenStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localScreenStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice:signal', {
          to: peerSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate },
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        pc.__makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('voice:signal', { to: peerSocketId, signal: { type: 'offer', sdp: pc.localDescription } });
      } catch (e) {
        console.warn('Falha ao negociar com', peerSocketId, e);
      } finally {
        pc.__makingOffer = false;
      }
    };

    // Sem isso, uma conexão que falha (NAT bloqueado, TURN fora do ar) fica "pendurada"
    // pra sempre sem nenhum aviso — o usuário só via silêncio e achava que tava travado.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        setError('Não foi possível conectar com um dos participantes. Verifique sua conexão.');
        pc.restartIce?.();
      }
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setError('');
        tunePeer(pc);
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);

      // Vídeo = compartilhamento de tela de alguém; a UI renderiza num <video>
      if (event.track.kind === 'video') {
        setRemoteScreenShares((prev) => new Map(prev).set(peerSocketId, stream));
        const clear = () => removeRemoteShare(peerSocketId);
        event.track.onended = clear;
        stream.onremovetrack = () => {
          if (stream.getVideoTracks().length === 0) clear();
        };
        return;
      }

      playRemoteAudio(peerSocketId, stream);
    };

    return pc;
  }, [socket, playRemoteAudio, removeRemoteShare, tunePeer]);

  const handleSignal = useCallback(async ({ from, signal }) => {
    const pc = createPeerConnection(from);
    try {
      if (signal.type === 'offer' || signal.type === 'answer') {
        const description = signal.sdp;
        const collision = description.type === 'offer'
          && (pc.__makingOffer || pc.signalingState !== 'stable');
        pc.__ignoreOffer = !pc.__polite && collision;
        if (pc.__ignoreOffer) return;

        await pc.setRemoteDescription(description); // rollback implícito se colidiu
        await flushIce(from, pc);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('voice:signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
        }
        tunePeer(pc);
      } else if (signal.type === 'ice-candidate') {
        // Candidato que chega antes da descrição remota era jogado fora (addIceCandidate falha)
        // e a conexão às vezes nunca fechava — agora fica na fila até a descrição chegar.
        if (!pc.remoteDescription) {
          const list = pendingIceRef.current.get(from) || [];
          list.push(signal.candidate);
          pendingIceRef.current.set(from, list);
          return;
        }
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (e) {
          if (!pc.__ignoreOffer) console.warn('ICE candidate rejeitado', e);
        }
      }
    } catch (e) {
      console.warn('Erro de sinalização com', from, e);
    }
  }, [socket, createPeerConnection, flushIce, tunePeer]);

  const join = useCallback(async (channelId, options = {}) => {
    const { inputDeviceId, startMuted = false, outputDeviceId = '', outputVolume = 1 } = options;
    setError('');
    setConnecting(true);

    // Pergunta antes ao servidor se pode entrar (membro? canal cheio?) — sem pedir microfone à toa
    const answer = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'O servidor não respondeu. Tente de novo.' }), 8000);
      socket.emit('voice:join-check', { channelId }, (res) => { clearTimeout(timer); resolve(res || { ok: true }); });
    });
    if (answer?.error) {
      setConnecting(false);
      setError(answer.error);
      throw new Error(answer.error);
    }

    let stream;
    try {
      const audioConstraints = {
        ...(inputDeviceId ? { deviceId: { exact: inputDeviceId } } : {}),
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      };
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
      setConnecting(false);
      const message = err?.name === 'NotAllowedError'
        ? 'Permissão de microfone negada. Libere o acesso ao microfone nas configurações do sistema.'
        : err?.name === 'NotFoundError'
        ? 'Nenhum microfone encontrado.'
        : 'Não foi possível acessar o microfone.';
      setError(message);
      throw err;
    }

    channelIdRef.current = channelId;
    outputVolumeRef.current = outputVolume;
    outputDeviceIdRef.current = outputDeviceId;
    localStreamRef.current = stream;
    if (startMuted) {
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      setMuted(true);
    }

    socket.on('voice:existing-peers', (peers) => {
      setParticipants(peers.map((p) => ({ socketId: p.socketId, user: p.user })));
      peers.forEach((p) => createPeerConnection(p.socketId));
    });

    socket.on('voice:peer-joined', ({ socketId, user }) => {
      setParticipants((prev) => (prev.some((p) => p.socketId === socketId) ? prev : [...prev, { socketId, user }]));
      createPeerConnection(socketId);
      playPeerJoinSound();
    });

    socket.on('voice:signal', handleSignal);

    socket.on('voice:screen-state', ({ socketId, sharing }) => {
      if (!sharing) removeRemoteShare(socketId);
    });

    // Soundboard: cada um toca o som localmente, no dispositivo de saída e volume dele
    socket.on('voice:sound', (snd) => {
      setLastSound({ ...snd, at: Date.now() });
      if (deafenedRef.current) return;
      let userVol = 0.7;
      try { const v = Number(localStorage.getItem('safecord_soundboard_volume')); if (!Number.isNaN(v) && localStorage.getItem('safecord_soundboard_volume') !== null) userVol = v / 100; } catch { /* padrão */ }
      const el = new Audio(snd.url.startsWith('http') ? snd.url : `${API_BASE}${snd.url}`);
      el.volume = Math.max(0, Math.min(1, (snd.volume / 100) * userVol * (outputVolumeRef.current || 1)));
      if (outputDeviceIdRef.current && typeof el.setSinkId === 'function') el.setSinkId(outputDeviceIdRef.current).catch(() => {});
      soundElsRef.current.add(el);
      el.onended = () => soundElsRef.current.delete(el);
      el.play().catch(() => soundElsRef.current.delete(el));
    });

    socket.on('voice:peer-left', ({ socketId }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      pendingIceRef.current.delete(socketId);
      dropPeerAudio(socketId);
      removeRemoteShare(socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      playPeerLeaveSound();
    });

    const joined = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'O servidor não respondeu. Tente de novo.' }), 8000);
      socket.emit('voice:join', { channelId }, (res) => { clearTimeout(timer); resolve(res || { ok: true }); });
    });
    if (joined?.error) {
      ['voice:existing-peers', 'voice:peer-joined', 'voice:signal', 'voice:screen-state', 'voice:peer-left', 'voice:sound'].forEach((e) => socket.off(e));
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      channelIdRef.current = null;
      setConnecting(false);
      setError(joined.error);
      throw new Error(joined.error);
    }
    roomInfoRef.current = { bitrate: joined.bitrate || 64, userLimit: joined.userLimit || 0, kind: joined.kind || 'server' };
    setRoomInfo(roomInfoRef.current);
    setRoomId(channelId);
    setConnected(true);
    setConnecting(false);
    playJoinSound();
    return roomInfoRef.current;
  }, [socket, createPeerConnection, handleSignal, removeRemoteShare, dropPeerAudio, deafened]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    socket.off('voice:existing-peers');
    socket.off('voice:peer-joined');
    socket.off('voice:signal');
    socket.off('voice:peer-left');
    socket.off('voice:screen-state');
    socket.off('voice:sound');
    soundElsRef.current.forEach((el) => el.pause());
    soundElsRef.current.clear();
    setLastSound(null);

    localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current = null;
    setScreenSharing(false);
    setRemoteScreenShares(new Map());

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    audioElsRef.current.forEach((el) => { el.srcObject = null; });
    audioElsRef.current.clear();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    setConnected(false);
    setConnecting(false);
    setParticipants([]);
    setDeafened(false);
    deafenedRef.current = false;
    setError('');
    channelIdRef.current = null;
    pendingIceRef.current.clear();
    setRoomId(null);
    setRoomInfo(null);
    playLeaveSound();
  }, [socket]);

  const stopScreenShareRef = useRef(null);

  // Lista telas/janelas pro seletor (só existe no app desktop; no navegador retorna null
  // e o próprio navegador mostra o seletor dele).
  const getScreenSources = useCallback(async () => {
    if (!window.safecord?.getScreenSources) return null;
    return window.safecord.getScreenSources();
  }, []);

  // Pede a tela (ou uma janela) e manda o vídeo pra todo mundo na call.
  // App desktop: captura direto pelo Electron (getUserMedia com chromeMediaSource "desktop"
  // e o id da fonte escolhida no seletor) — não depende do getDisplayMedia, que falhava no app.
  // Navegador: getDisplayMedia normal (o navegador mostra o seletor dele).
  const startScreenShare = useCallback(async (opts = {}) => {
    const { sourceId = null, quality = '1080p30', withAudio = false } = typeof opts === 'string' ? { sourceId: opts } : opts;
    if (!localStreamRef.current) {
      setError('Entre em uma chamada antes de compartilhar a tela.');
      throw new Error('not-in-call');
    }
    if (localScreenStreamRef.current) return;
    const q = SCREEN_QUALITIES[quality] || SCREEN_QUALITIES['1080p30'];
    screenQualityRef.current = q;

    let stream;
    try {
      if (sourceId && window.safecord?.isDesktop) {
        const video = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: q.width, maxHeight: q.height, maxFrameRate: q.fps, minFrameRate: Math.min(15, q.fps),
          },
        };
        // Som do sistema: só o Windows entrega (loopback)
        const audio = withAudio && window.safecord.platform === 'win32' ? { mandatory: { chromeMediaSource: 'desktop' } } : false;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio, video });
        } catch (err) {
          if (!audio) throw err;
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video }); // sem áudio, mas compartilha
        }
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps, max: q.fps } },
          audio: withAudio,
        });
      }
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return; // cancelou
      setError(window.safecord?.platform === 'darwin'
        ? 'Não foi possível capturar a tela. No macOS, libere "Gravação de Tela" pro SafeCord em Ajustes do Sistema › Privacidade.'
        : 'Não foi possível iniciar o compartilhamento de tela.');
      throw err;
    }

    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack && 'contentHint' in videoTrack) videoTrack.contentHint = q.fps >= 60 ? 'motion' : 'detail';

    localScreenStreamRef.current = stream;
    setScreenSharing(true);
    setError('');
    // "Parar de compartilhar" na barra nativa do SO (ou a janela fechada) também encerra aqui
    if (videoTrack) videoTrack.onended = () => stopScreenShareRef.current?.();

    // addTrack dispara onnegotiationneeded em cada conexão → a oferta sai sozinha
    peersRef.current.forEach((pc) => {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      tunePeer(pc);
    });
    socket.emit('voice:screen-state', { sharing: true, streamId: stream.id });
  }, [socket, tunePeer]);

  const stopScreenShare = useCallback(() => {
    const stream = localScreenStreamRef.current;
    if (!stream) return;

    peersRef.current.forEach((pc) => {
      pc.getSenders()
        .filter((sender) => sender.track && stream.getTracks().includes(sender.track))
        .forEach((sender) => pc.removeTrack(sender));
    });

    stream.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current = null;
    setScreenSharing(false);
    socket.emit('voice:screen-state', { sharing: false });
  }, [socket]);

  stopScreenShareRef.current = stopScreenShare;

  // Diagnóstico (sem dados pessoais): estado de cada conexão e o que está sendo enviado.
  // Útil pra suporte: no console do app, rode __safecordVoiceStats()
  if (typeof window !== 'undefined') {
    window.__safecordVoiceStats = () => [...peersRef.current.entries()].map(([id, pc]) => ({
      peer: id, ice: pc.iceConnectionState, signaling: pc.signalingState, connection: pc.connectionState,
      sending: pc.getSenders().filter((x) => x.track).map((x) => `${x.track.kind}:${x.track.readyState}`),
      receiving: pc.getReceivers().filter((x) => x.track).map((x) => `${x.track.kind}:${x.track.readyState}:${x.track.muted ? 'muted' : 'live'}`),
    }));
  }

  const playSound = useCallback((soundId) => new Promise((resolve) => {
    socket.emit('voice:soundboard', { soundId }, (res) => resolve(res || { ok: true }));
  }), [socket]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    setMuted(newMuted);
    if (newMuted) playMuteSound(); else playUnmuteSound();
  }, [muted]);

  // Ensurdecer: para de ouvir todo mundo (volume 0 nos áudios remotos) e, como no Discord,
  // muta o próprio microfone junto — desensurdecer restaura o estado de mudo de antes.
  const toggleDeafen = useCallback(() => {
    const newDeafened = !deafened;
    setDeafened(newDeafened);
    deafenedRef.current = newDeafened;
    if (newDeafened) playDeafenSound(); else playUndeafenSound();

    audioElsRef.current.forEach((audioEl) => {
      audioEl.volume = newDeafened ? 0 : outputVolumeRef.current;
    });

    const stream = localStreamRef.current;
    if (newDeafened) {
      wasMutedBeforeDeafenRef.current = muted;
      if (stream) stream.getAudioTracks().forEach((t) => (t.enabled = false));
      setMuted(true);
    } else if (stream) {
      const restoreMuted = wasMutedBeforeDeafenRef.current;
      stream.getAudioTracks().forEach((t) => (t.enabled = !restoreMuted));
      setMuted(restoreMuted);
    }
  }, [deafened, muted]);

  const setOutputVolume = useCallback((volume /* 0..1 */) => {
    outputVolumeRef.current = volume;
    if (!deafened) {
      audioElsRef.current.forEach((audioEl) => {
        audioEl.volume = volume;
      });
    }
  }, [deafened]);

  const setOutputDevice = useCallback((deviceId) => {
    outputDeviceIdRef.current = deviceId;
    audioElsRef.current.forEach((audioEl) => {
      if (typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(deviceId).catch(() => {});
      }
    });
  }, []);

  return {
    connected,
    connecting,
    participants,
    muted,
    deafened,
    error,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    setOutputVolume,
    setOutputDevice,
    screenSharing,
    remoteScreenShares,
    startScreenShare,
    stopScreenShare,
    getScreenSources,
    localScreenStream: screenSharing ? localScreenStreamRef.current : null,
    channelId: channelIdRef.current,
    roomId,
    roomInfo,
    playSound,
    lastSound,
  };
}
