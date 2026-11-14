import React from 'react';
import { resolveAssetUrl } from '../api';
import BadgeRow from './BadgeRow';
import { CrownIcon } from './Icons';
import { SpotifyMiniCard, statusMeta } from './UserProfilePopup';
import { platformMeta } from './profilePlatforms';

const HEX = /^#[0-9a-f]{6}$/i;

export function profileTheme(user) {
  const p = HEX.test(user?.theme_primary || '') ? user.theme_primary : null;
  const s = HEX.test(user?.theme_secondary || '') ? user.theme_secondary : null;
  if (!p && !s) return null;
  return { primary: p || s, secondary: s || p };
}

function formatJoined(value) {
  if (!value) return null;
  const d = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ServerChip({ server }) {
  const icon = resolveAssetUrl(server.icon_url);
  return (
    <span style={st.serverChip} title={server.name}>
      {icon ? (
        <img src={icon} alt="" style={st.serverIcon} />
      ) : (
        <span style={{ ...st.serverIcon, background: server.color || 'var(--accent)' }}>
          {(server.name || '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <span style={st.serverName}>{server.name}</span>
    </span>
  );
}

/**
 * Cartão de perfil único — usado no seu popup, ao clicar num membro, ao clicar num nome
 * no chat e na prévia do editor. Mostra tema, pronomes, status, bio, música, conexões,
 * cargos no servidor e servidores em comum.
 */
export default function ProfileCard({ user, member = null, mutualServers = null, width = 300, showStatus = true, children }) {
  const name = user?.display_name || user?.username || 'Usuário';
  const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const avatarUrl = resolveAssetUrl(user?.avatar_url);
  const bannerUrl = resolveAssetUrl(user?.banner_url);
  const theme = profileTheme(user);
  const status = statusMeta(user?.status_mode);
  const connections = user?.connections || [];
  const joined = formatJoined(member?.joined_at);
  const ring = theme ? `color-mix(in srgb, ${theme.primary} 55%, var(--bg-surface))` : 'var(--bg-surface)';

  const shell = theme
    ? { background: `linear-gradient(180deg, ${theme.primary}, ${theme.secondary})`, padding: 4, border: 'none' }
    : {};

  return (
    <div style={{ ...st.shell, width, ...shell }} data-profile-card>
      <div style={{ ...st.inner, ...(theme ? st.innerThemed : {}) }}>
        <div
          style={{
            ...st.banner,
            ...(bannerUrl
              ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: theme ? 'transparent' : user?.avatar_color || 'var(--accent-gradient)' }),
          }}
        />
        <div style={st.avatarWrap}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} style={{ ...st.avatar, borderColor: ring }} />
          ) : (
            <div style={{ ...st.avatar, ...st.avatarFallback, borderColor: ring, background: user?.avatar_color || 'var(--accent)' }}>
              {initials}
            </div>
          )}
          {showStatus && <span style={{ ...st.statusDot, background: status.color, borderColor: ring }} title={status.label} />}
        </div>

        <div style={st.body}>
          <div style={st.panel}>
            <div style={st.nameRow}>
              <span style={st.name}>{name}</span>
              {member?.is_owner && <CrownIcon size={14} style={{ color: '#F0B429' }} title="Dono do servidor" />}
            </div>
            <div style={st.handleRow}>
              <span style={st.handle}>{user?.username}#{user?.tag}</span>
              {user?.pronouns && <><span style={st.dot}>•</span><span style={st.handle}>{user.pronouns}</span></>}
              <BadgeRow badges={user?.badges} size={16} />
            </div>
            {user?.status_text && <div style={st.statusText}>{user.status_text}</div>}

            {user?.bio && (
              <Section title="Sobre mim"><div style={st.bio}>{user.bio}</div></Section>
            )}

            {user?.spotify_track && (
              <Section title="Ouvindo"><SpotifyMiniCard track={user.spotify_track} /></Section>
            )}

            {(joined || member?.roles?.length > 0) && (
              <Section title={member?.roles?.length ? 'Cargos' : 'Membro desde'}>
                {member?.roles?.length > 0 && (
                  <div style={st.roles}>
                    {member.roles.map((r) => (
                      <span key={r.id} style={st.role}>
                        <span style={{ ...st.roleDot, background: r.color || 'var(--text-low)' }} />
                        {r.name}
                      </span>
                    ))}
                  </div>
                )}
                {joined && <div style={st.meta}>{member?.roles?.length ? `Membro desde ${joined}` : joined}</div>}
              </Section>
            )}

            {connections.length > 0 && (
              <Section title="Conexões">
                <div style={st.conns}>
                  {connections.map((c, i) => {
                    const meta = platformMeta(c.platform);
                    const isLink = /^https?:\/\//i.test(c.url || '');
                    const Tag = isLink ? 'a' : 'span';
                    return (
                      <Tag
                        key={`${c.platform}-${i}`}
                        style={st.conn}
                        title={meta.label}
                        {...(isLink ? { href: c.url, target: '_blank', rel: 'noreferrer' } : {})}
                      >
                        <meta.Icon size={13} style={{ color: meta.color }} />
                        <span style={st.connLabel}>{c.label}</span>
                      </Tag>
                    );
                  })}
                </div>
              </Section>
            )}

            {mutualServers && mutualServers.length > 0 && (
              <Section title={`${mutualServers.length} servidor${mutualServers.length > 1 ? 'es' : ''} em comum`}>
                <div style={st.servers}>
                  {mutualServers.slice(0, 6).map((s) => <ServerChip key={s.id} server={s} />)}
                  {mutualServers.length > 6 && <span style={st.meta}>+{mutualServers.length - 6}</span>}
                </div>
              </Section>
            )}

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={st.section}>
      <div style={st.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

const st = {
  shell: {
    borderRadius: 20, overflow: 'hidden', background: 'var(--bg-surface)', border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-lg)', boxSizing: 'border-box', maxWidth: '100%',
  },
  inner: { borderRadius: 16, overflow: 'hidden', position: 'relative', background: 'var(--bg-surface)' },
  innerThemed: { background: 'color-mix(in srgb, var(--bg-surface) 22%, transparent)' },
  banner: { height: 96 },
  avatarWrap: { position: 'absolute', left: 16, top: 54 },
  avatar: {
    width: 78, height: 78, borderRadius: '50%', objectFit: 'cover', display: 'block',
    border: '5px solid var(--bg-surface)', boxSizing: 'border-box',
  },
  avatarFallback: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-color, #fff)', fontWeight: 800, fontSize: 24,
  },
  statusDot: { position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: '50%', border: '4px solid var(--bg-surface)', boxSizing: 'border-box' },
  body: { padding: '34px 10px 10px' },
  panel: {
    background: 'color-mix(in srgb, var(--bg-surface) 86%, transparent)', borderRadius: 14, padding: '12px 12px 6px',
    display: 'flex', flexDirection: 'column',
  },
  nameRow: { display: 'flex', alignItems: 'center', gap: 6 },
  name: { fontSize: 18, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.2, wordBreak: 'break-word' },
  handleRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  handle: { fontSize: 12.5, color: 'var(--text-mid)' },
  dot: { fontSize: 10, color: 'var(--text-low)' },
  statusText: {
    marginTop: 10, fontSize: 12.5, color: 'var(--text-hi)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '7px 10px', lineHeight: 1.4, wordBreak: 'break-word',
  },
  section: { borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, paddingBottom: 4 },
  sectionTitle: { fontSize: 11, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  bio: { fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  roles: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  role: {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text-hi)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 8px',
  },
  roleDot: { width: 9, height: 9, borderRadius: '50%' },
  meta: { fontSize: 12, color: 'var(--text-mid)' },
  conns: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  conn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-hi)', textDecoration: 'none',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '5px 9px', maxWidth: '100%',
  },
  connLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 },
  servers: { display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  serverChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-hi)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '3px 8px 3px 3px', maxWidth: 160,
  },
  serverIcon: {
    width: 20, height: 20, borderRadius: 6, objectFit: 'cover', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
  },
  serverName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
