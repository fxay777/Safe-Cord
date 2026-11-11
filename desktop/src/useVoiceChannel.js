import { useCallback, useRef, useState } from 'react';
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
  }, [socket, playRemoteAudio, removeRemoteShare]);

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
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('voice:signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
        }
      } else if (signal.type === 'ice-candidate') {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (e) {
          if (!pc.__ignoreOffer) console.warn('ICE candidate rejeitado', e);
        }
      }
    } catch (e) {
      console.warn('Erro de sinalização com', from, e);
    }
  }, [socket, createPeerConnection]);

  const join = useCallback(async (channelId, options = {}) => {
    const { inputDeviceId, startMuted = false, outputDeviceId = '', outputVolume = 1 } = options;
    setError('');
    setConnecting(true);

    let stream;
    try {
      const audioConstraints = inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true;
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
      setParticipants((prev) => [...prev, { socketId, user }]);
      createPeerConnection(socketId);
      playPeerJoinSound();
    });

    socket.on('voice:signal', handleSignal);

    socket.on('voice:screen-state', ({ socketId, sharing }) => {
      if (!sharing) removeRemoteShare(socketId);
    });

    socket.on('voice:peer-left', ({ socketId }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      dropPeerAudio(socketId);
      removeRemoteShare(socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      playPeerLeaveSound();
    });

    socket.emit('voice:join', channelId);
    setConnected(true);
    setConnecting(false);
    playJoinSound();
  }, [socket, createPeerConnection, handleSignal, removeRemoteShare, dropPeerAudio, deafened]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    socket.off('voice:existing-peers');
    socket.off('voice:peer-joined');
    socket.off('voice:signal');
    socket.off('voice:peer-left');
    socket.off('voice:screen-state');

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
    playLeaveSound();
  }, [socket]);

  const stopScreenShareRef = useRef(null);

  // Lista telas/janelas pro seletor (só existe no app desktop; no navegador retorna null
  // e o próprio navegador mostra o seletor dele).
  const getScreenSources = useCallback(async () => {
    if (!window.safecord?.getScreenSources) return null;
    return window.safecord.getScreenSources();
  }, []);

  // Pede a tela (ou uma janela) e manda o vídeo pra todo mundo na call — WebRTC de
  // verdade, na mesma malha usada pelo áudio. sourceId vem do seletor no app desktop.
  const startScreenShare = useCallback(async (sourceId) => {
    if (!localStreamRef.current) {
      setError('Entre em um canal de voz antes de compartilhar a tela.');
      throw new Error('not-in-call');
    }
    if (localScreenStreamRef.current) return;

    let stream;
    try {
      if (sourceId && window.safecord?.selectScreenSource) {
        await window.safecord.selectScreenSource(sourceId);
      }
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: true, // som do sistema quando o SO permite (Windows)
      });
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return; // cancelou
      setError('Não foi possível iniciar o compartilhamento de tela.');
      throw err;
    }

    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack && 'contentHint' in videoTrack) videoTrack.contentHint = 'detail';

    localScreenStreamRef.current = stream;
    setScreenSharing(true);
    setError('');
    // "Parar de compartilhar" na barra nativa do SO também encerra aqui
    if (videoTrack) videoTrack.onended = () => stopScreenShareRef.current?.();

    // addTrack dispara onnegotiationneeded em cada conexão → a oferta sai sozinha
    peersRef.current.forEach((pc) => {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    });
    socket.emit('voice:screen-state', { sharing: true });
  }, [socket]);

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
  };
}
