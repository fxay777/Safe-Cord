import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { createApiClient } from '../api';
import { colors } from '../theme';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setLoading(true);
    try {
      const api = createApiClient();
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const { data } = await api.post(path, { username, password });
      onAuth(data.token, data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.brand}>🛡️ SafeCord</Text>
      <Text style={styles.tagline}>
        {mode === 'login' ? 'Bem-vindo de volta à sua sala.' : 'Crie sua conta e chame a galera.'}
      </Text>

      <Text style={styles.label}>Usuário</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholder="ex: joaozinho"
        placeholderTextColor={colors.textLow}
      />

      <Text style={styles.label}>Senha</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="mínimo 6 caracteres"
        placeholderTextColor={colors.textLow}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.submit} onPress={submit} disabled={loading}>
        <Text style={styles.submitText}>{loading ? 'Conectando…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
        <Text style={styles.switchMode}>
          {mode === 'login' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bgVoid, justifyContent: 'center', padding: 28 },
  brand: { fontSize: 28, fontWeight: '700', color: colors.textHi, marginBottom: 4 },
  tagline: { color: colors.textMid, marginBottom: 28, fontSize: 14 },
  label: { color: colors.textMid, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textHi, fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  submit: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 22 },
  submitText: { color: '#052622', fontWeight: '700', fontSize: 15 },
  switchMode: { color: colors.accent, textAlign: 'center', marginTop: 18, fontSize: 13 },
});
