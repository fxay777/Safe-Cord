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

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const audioElsRef = useRef(new Map()); // socketId -> HTMLAudioElement
  const channelIdRef = useRef(null);
  const wasMutedBeforeDeafenRef = useRef(false);
  const outputVolumeRef = useRef(1);
  const outputDeviceIdRef = useRef('');

  const createPeerConnection = useCallback((peerSocketId, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice:signal', {
          to: peerSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate },
        });
      }
    };

    // Sem isso, uma conexão que falha (NAT bloqueado, TURN fora do ar) fica "pendurada"
    // pra sempre sem nenhum aviso — o usuário só via silêncio e achava que tava travado.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        setError('Não foi possível conectar com um dos participantes. Verifique sua conexão.');
        // tenta reiniciar a negociação ICE antes de desistir de vez
        pc.restartIce?.();
      }
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setError('');
      }
    };

    pc.ontrack = (event) => {
      let audioEl = audioElsRef.current.get(peerSocketId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.volume = deafened ? 0 : outputVolumeRef.current;
        if (outputDeviceIdRef.current && typeof audioEl.setSinkId === 'function') {
          audioEl.setSinkId(outputDeviceIdRef.current).catch(() => {});
        }
        audioElsRef.current.set(peerSocketId, audioEl);
      }
      audioEl.srcObject = event.streams[0];
      // Reforço: mesmo com autoplay=true, alguns navegadores só tocam de fato depois
      // de um .play() explícito — sem isso, o áudio remoto ficava "mudo" sem erro nenhum.
      const playPromise = audioEl.play();
      if (playPromise?.catch) {
        playPromise.catch(() => setError('O navegador bloqueou o áudio da chamada — clique em qualquer lugar da tela e tente de novo.'));
      }
    };

    peersRef.current.set(peerSocketId, pc);

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voice:signal', { to: peerSocketId, signal: { type: 'offer', sdp: offer } });
      };
    }

    return pc;
  }, [socket]);

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
    outputVolumeRef.current = deafened ? 0 : outputVolume;
    outputDeviceIdRef.current = outputDeviceId;
    localStreamRef.current = stream;
    if (startMuted) {
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      setMuted(true);
    }

    socket.on('voice:existing-peers', (peers) => {
      setParticipants(peers.map((p) => ({ socketId: p.socketId, user: p.user })));
      peers.forEach((p) => createPeerConnection(p.socketId, true));
    });

    socket.on('voice:peer-joined', ({ socketId, user }) => {
      setParticipants((prev) => [...prev, { socketId, user }]);
      createPeerConnection(socketId, false);
      playPeerJoinSound();
    });

    socket.on('voice:signal', async ({ from, signal }) => {
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeerConnection(from, false);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:signal', { to: from, signal: { type: 'answer', sdp: answer } });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'ice-candidate') {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (e) {
          /* ignora candidatos fora de ordem */
        }
      }
    });

    socket.on('voice:peer-left', ({ socketId }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      audioElsRef.current.delete(socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      playPeerLeaveSound();
    });

    socket.emit('voice:join', channelId);
    setConnected(true);
    setConnecting(false);
    playJoinSound();
  }, [socket, createPeerConnection, deafened]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    socket.off('voice:existing-peers');
    socket.off('voice:peer-joined');
    socket.off('voice:signal');
    socket.off('voice:peer-left');

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    audioElsRef.current.clear();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    setConnected(false);
    setConnecting(false);
    setParticipants([]);
    setDeafened(false);
    setError('');
    channelIdRef.current = null;
    playLeaveSound();
  }, [socket]);

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
    channelId: channelIdRef.current,
  };
}
