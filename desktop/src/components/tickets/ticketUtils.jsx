import React, { useEffect, useState } from 'react';
import { TicketIcon, HelpIcon, AlertIcon, ShopIcon, ShieldCheckIcon, StarIcon, ChatIcon, BugIcon } from '../Icons';

export const OPTION_ICONS = {
  ticket: TicketIcon, help: HelpIcon, alert: AlertIcon, cart: ShopIcon, shield: ShieldCheckIcon, star: StarIcon, chat: ChatIcon, bug: BugIcon,
};
export const ICON_LIST = Object.keys(OPTION_ICONS);
export function OptionIcon({ name, size = 16, style }) {
  const I = OPTION_ICONS[name] || TicketIcon;
  return <I size={size} style={style} />;
}

export const ticketNo = (n) => `#${String(n || 0).padStart(4, '0')}`;
export const errText = (err, fb = 'Algo deu errado') => err?.response?.data?.error || fb;
export const personName = (u) => (u ? u.display_name || u.username : 'alguém');

// Painéis do servidor em cache: vários cartões no mesmo canal não buscam tudo de novo
const cache = new Map(); // serverId → { version, promise, data }
export function usePanels(api, serverId, version = 0) {
  const [data, setData] = useState(() => cache.get(serverId)?.data || null);
  useEffect(() => {
    if (!serverId) return undefined;
    let alive = true;
    let entry = cache.get(serverId);
    if (!entry || entry.version !== version) {
      entry = { version, promise: api.get(`/servers/${serverId}/tickets/panels`).then(({ data: d }) => d), data: entry?.data || null };
      cache.set(serverId, entry);
    }
    entry.promise.then((d) => { entry.data = d; if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [api, serverId, version]);
  return data;
}
