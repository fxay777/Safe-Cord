import React from 'react';
import { BadgeIcon } from './Icons';

/**
 * Fileira de insígnias do usuário. Usada no popup de perfil e ao lado do nome
 * nas mensagens (com size pequeno). Cada insígnia é um ícone SVG na cor dela.
 */
export default function BadgeRow({ badges = [], size = 18, max = 6 }) {
  if (!badges || badges.length === 0) return null;
  const shown = badges.slice(0, max);
  const extra = badges.length - shown.length;

  return (
    <span style={styles.row}>
      {shown.map((b) => (
        <span
          key={b.id}
          title={`${b.name}${b.description ? ` — ${b.description}` : ''}`}
          style={{
            ...styles.badge,
            width: size,
            height: size,
            color: b.color,
            background: `${b.color}1F`,
            borderColor: `${b.color}4D`,
          }}
        >
          <BadgeIcon name={b.icon} size={Math.round(size * 0.66)} />
        </span>
      ))}
      {extra > 0 && <span style={{ ...styles.more, fontSize: size * 0.5 }}>+{extra}</span>}
    </span>
  );
}

const styles = {
  row: { display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' },
  badge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7, border: '1px solid transparent', flexShrink: 0,
  },
  more: { color: 'var(--text-low)', fontWeight: 700 },
};
