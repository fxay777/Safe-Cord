import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { createApiClient, createSocket } from '../api';
import { useVoiceChannel } from '../hooks/useVoiceChannel';
import { colors } from '../theme';

export default function HomeScreen({ token, user, onLogout }) {
  const api = useMemo(() => createApiClient(token), [token]);
  const socket = useMemo(() => createSocket(token), [token]);
  const voice = useVoiceChannel(socket);

  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [voiceChannelId, setVoiceChannelId] = useState(null);

  const activeServer = servers.find((s) => s.id === activeServerId);

  useEffect(() => {
    socket.connect();
    return () => socket.disconnect();
  }, [socket]);

  const loadServers = useCallback(async () => {
    const { data } = await api.get('/servers');
    setServers(data.servers);
    if (!activeServerId && data.servers[0]) setActiveServerId(data.servers[0].id);
  }, [api, activeServerId]);

  useEffect(() => { loadServers(); }, []);

  useEffect(() => {
    const onMsg = (msg) => {
      setMessages((prev) => (msg.channelId === activeChannel?.id ? [...prev, msg] : prev));
    };
    socket.on('message:new', onMsg);
    return () => socket.off('message:new', onMsg);
  }, [socket, activeChannel]);

  async function openChannel(channel) {
    if (channel.type === 'voice') {
      if (voice.connected && voiceChannelId === channel.id) {
        voice.leave();
        setVoiceChannelId(null);
      } else {
        if (voice.connected) voice.leave();
        await voice.join(channel.id);
        setVoiceChannelId(channel.id);
      }
      return;
    }
    if (activeChannel) socket.emit('channel:leave', activeChannel.id);
    setActiveChannel(channel);
    socket.emit('channel:join', channel.id);
    const { data } = await api.get(`/messages/${channel.id}`);
    setMessages(data.messages);
  }

  function send() {
    if (!text.trim() || !activeChannel) return;
    socket.emit('message:send', { channelId: activeChannel.id, content: text });
    setText('');
  }

  async function createServer() {
    Alert.prompt?.(
      'Criar servidor',
      'Nome do servidor',
      async (name) => {
        if (!name?.trim()) return;
        const { data } = await api.post('/servers', { name: name.trim() });
        setServers((prev) => [...prev, data.server]);
        setActiveServerId(data.server.id);
      }
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Barra de servidores */}
      <FlatList
        horizontal
        data={servers}
        keyExtractor={(s) => s.id}
        style={styles.serverBar}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => { setActiveServerId(item.id); setActiveChannel(null); }}
            style={[styles.serverPill, item.id === activeServerId && styles.serverPillActive]}
          >
            <Text style={styles.serverInitial}>{item.name.slice(0, 2).toUpperCase()}</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.addServerBtn} onPress={createServer}>
            <Text style={{ color: colors.accent, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        }
      />

      {!activeChannel ? (
        // Lista de canais do servidor ativo
        <FlatList
          data={activeServer?.channels || []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 14 }}
          ListHeaderComponent={<Text style={styles.serverName}>{activeServer?.name}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.channelRow} onPress={() => openChannel(item)}>
              <Text style={styles.channelText}>
                {item.type === 'voice' ? '🔊' : '#'} {item.name}
                {voiceChannelId === item.id ? '  (conectado)' : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        // Chat do canal selecionado
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setActiveChannel(null)}>
              <Text style={{ color: colors.accent }}>‹ Canais</Text>
            </TouchableOpacity>
            <Text style={styles.chatHeaderTitle}>#{activeChannel.name}</Text>
          </View>

          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <View style={styles.msgRow}>
                <Text style={styles.msgAuthor}>{item.username}</Text>
                <Text style={styles.msgContent}>{item.content}</Text>
              </View>
            )}
          />

          <View style={styles.inputBar}>
            <TextInput
              style={styles.chatInput}
              value={text}
              onChangeText={setText}
              placeholder={`Conversar em #${activeChannel.name}`}
              placeholderTextColor={colors.textLow}
              onSubmitEditing={send}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={send}>
              <Text style={{ color: '#052622', fontWeight: '700' }}>Enviar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {voice.connected && (
        <View style={styles.voiceBar}>
          <Text style={styles.voiceText}>🔊 Voz conectada — {voice.participants.length + 1} pessoa(s)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={voice.toggleMute} style={styles.voiceBtn}>
              <Text>{voice.muted ? '🔇' : '🎙️'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { voice.leave(); setVoiceChannelId(null); }} style={styles.voiceLeaveBtn}>
              <Text style={{ color: colors.danger, fontWeight: '600' }}>Sair</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.logout} onPress={onLogout}>
        <Text style={{ color: colors.textLow, fontSize: 12 }}>Sair da conta ({user.username})</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bgVoid },
  serverBar: { flexGrow: 0, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: colors.border },
  serverPill: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bgSurface, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  serverPillActive: { backgroundColor: colors.accent },
  serverInitial: { color: colors.textHi, fontWeight: '700', fontSize: 12 },
  addServerBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  serverName: { color: colors.textHi, fontWeight: '700', fontSize: 18, marginBottom: 12 },
  channelRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  channelText: { color: colors.textMid, fontSize: 15 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: colors.border },
  chatHeaderTitle: { color: colors.textHi, fontWeight: '700', fontSize: 15 },
  msgRow: { marginBottom: 12 },
  msgAuthor: { color: colors.accent, fontWeight: '700', fontSize: 12.5, marginBottom: 2 },
  msgContent: { color: colors.textHi, fontSize: 14.5 },
  inputBar: { flexDirection: 'row', padding: 10, gap: 8, borderTopWidth: 1, borderColor: colors.border },
  chatInput: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: 8, paddingHorizontal: 12, color: colors.textHi },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  voiceBar: { backgroundColor: colors.bgElevated, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  voiceText: { color: colors.textHi, fontSize: 13 },
  voiceBtn: { backgroundColor: colors.bgHover, borderRadius: 8, padding: 8 },
  voiceLeaveBtn: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 8 },
  logout: { padding: 10, alignItems: 'center' },
});
