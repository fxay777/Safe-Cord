import { useCallback, useEffect, useState } from 'react';

const ACCOUNTS_KEY = 'safecord_accounts';
const ACTIVE_KEY = 'safecord_active_id';

// Migra o formato antigo (um único token/usuário salvo) pro novo formato de lista,
// pra quem já tinha o SafeCord instalado não perder a sessão.
function migrateLegacySession() {
  const legacyToken = localStorage.getItem('safecord_token');
  const legacyUserRaw = localStorage.getItem('safecord_user');
  if (!legacyToken || !legacyUserRaw) return [];
  try {
    const legacyUser = JSON.parse(legacyUserRaw);
    localStorage.removeItem('safecord_token');
    localStorage.removeItem('safecord_user');
    return [{ token: legacyToken, user: legacyUser }];
  } catch {
    return [];
  }
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* dados corrompidos — recomeça do zero */
  }
  return migrateLegacySession();
}

function loadActiveId(accounts) {
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (stored && accounts.some((a) => String(a.user.id) === stored)) return stored;
  return accounts[0]?.user?.id != null ? String(accounts[0].user.id) : null;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState(loadAccounts);
  const [activeId, setActiveId] = useState(() => loadActiveId(loadAccounts()));

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    if (activeId == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const active = accounts.find((a) => String(a.user.id) === String(activeId)) || null;

  // Login bem-sucedido: se a conta já estava salva, só atualiza o token; senão, adiciona.
  // Em ambos os casos, essa conta vira a ativa.
  const addOrSwitchAccount = useCallback((token, user) => {
    setAccounts((prev) => {
      const idx = prev.findIndex((a) => String(a.user.id) === String(user.id));
      if (idx === -1) return [...prev, { token, user }];
      const next = [...prev];
      next[idx] = { token, user };
      return next;
    });
    setActiveId(String(user.id));
  }, []);

  const switchAccount = useCallback((userId) => {
    setActiveId(String(userId));
  }, []);

  // Atualiza os dados do usuário da conta ativa (perfil, avatar, banner) sem trocar o token.
  const updateActiveUser = useCallback((patch) => {
    setAccounts((prev) => prev.map((a) => (
      String(a.user.id) === String(activeId) ? { ...a, user: { ...a.user, ...patch } } : a
    )));
  }, [activeId]);

  // Remove uma conta salva (usada tanto pra "sair" da conta atual quanto pra
  // esquecer uma conta secundária da lista). Se a conta removida era a ativa,
  // promove a próxima disponível — ou fica sem sessão nenhuma.
  const removeAccount = useCallback((userId) => {
    setAccounts((prev) => prev.filter((a) => String(a.user.id) !== String(userId)));
    setActiveId((currentActive) => {
      if (String(currentActive) !== String(userId)) return currentActive;
      const remaining = accounts.filter((a) => String(a.user.id) !== String(userId));
      return remaining[0]?.user?.id != null ? String(remaining[0].user.id) : null;
    });
  }, [accounts]);

  return {
    accounts,
    active,
    token: active?.token || null,
    user: active?.user || null,
    addOrSwitchAccount,
    switchAccount,
    removeAccount,
    updateActiveUser,
  };
}
