import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('safecord_token');
      const u = await AsyncStorage.getItem('safecord_user');
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u));
      }
      setReady(true);
    })();
  }, []);

  async function handleAuth(newToken, newUser) {
    await AsyncStorage.setItem('safecord_token', newToken);
    await AsyncStorage.setItem('safecord_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  async function handleLogout() {
    await AsyncStorage.clear();
    setToken(null);
    setUser(null);
  }

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      {token && user ? (
        <HomeScreen token={token} user={user} onLogout={handleLogout} />
      ) : (
        <AuthScreen onAuth={handleAuth} />
      )}
    </>
  );
}
