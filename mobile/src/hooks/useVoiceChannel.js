import { useCallback, useRef, useState } from 'react';
import { RTCPeerConnection, mediaDevices } from 'react-native-webrtc';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// Mesma lógica de mesh WebRTC do cliente desktop, adaptada pra react-native-webrtc
// (a API é praticamente idêntica à do navegador).
export function useVoiceChannel(socket) {
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [muted, setMuted] = useState(false);

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());

  const createPeerConnection = useCallback((peerSocketId, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice:signal', { to: peerSocketId, signal: { type: 'ice-candidate', candidate: event.candidate } });
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

  const join = useCallback(async (channelId) => {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;

    socket.on('voice:existing-peers', (peers) => {
      setParticipants(peers.map((p) => ({ socketId: p.socketId, user: p.user })));
      peers.forEach((p) => createPeerConnection(p.socketId, true));
    });

    socket.on('voice:peer-joined', ({ socketId, user }) => {
      setParticipants((prev) => [...prev, { socketId, user }]);
      createPeerConnection(socketId, false);
    });

    socket.on('voice:signal', async ({ from, signal }) => {
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeerConnection(from, false);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(signal.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:signal', { to: from, signal: { type: 'answer', sdp: answer } });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(signal.sdp);
      } else if (signal.type === 'ice-candidate') {
        try { await pc.addIceCandidate(signal.candidate); } catch (e) {}
      }
    });

    socket.on('voice:peer-left', ({ socketId }) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
    });

    socket.emit('voice:join', channelId);
    setConnected(true);
  }, [socket, createPeerConnection]);

  const leave = useCallback(() => {
    socket.emit('voice:leave');
    socket.off('voice:existing-peers');
    socket.off('voice:peer-joined');
    socket.off('voice:signal');
    socket.off('voice:peer-left');
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setConnected(false);
    setParticipants([]);
  }, [socket]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    setMuted(newMuted);
  }, [muted]);

  return { connected, participants, muted, join, leave, toggleMute };
}
