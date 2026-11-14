import React from 'react';

// Ícones em linha (estilo outline, stroke=currentColor) pra substituir emojis —
// ficam consistentes em qualquer SO/fonte, ao contrário de emoji nativo.
// Todos aceitam `size` e passam o resto das props pro <svg> (style, title, etc).

const base = (size) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' });

export function TrashIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m3 0-.8 12.2A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.8L6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SpeakerIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19.2 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 17.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 13 1.65 1.65 0 0 0 3.17 12H3.1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 6.99a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 2.28l.06.06A1.65 1.65 0 0 0 8.92 2.6 1.65 1.65 0 0 0 9.92 1.1V1a2 2 0 1 1 4 0v.09c.03.63.4 1.2.98 1.51.6.28 1.3.2 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82c.28.6.85.98 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ size = 14, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EditIcon({ size = 14, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m14 6 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SmileyIcon({ size = 18, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="10" r="1.1" fill="currentColor" />
      <circle cx="15" cy="10" r="1.1" fill="currentColor" />
      <path d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 14, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReturnIcon({ size = 14, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M19 6v5a3 3 0 0 1-3 3H6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 10-4 4 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MailIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4 6.5 8 6.2 8-6.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path
        d="M6.5 3.5h2.7l1.3 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.3v2.7a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
    </svg>
  );
}

export function CameraIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h1.6l1-1.6h7.8l1 1.6h1.6A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function CameraOffIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h1.6l1-1.6h7.8l1 1.6h1.6A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function VideoIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15 10 6-3v10l-6-3v-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function MonitorIcon({ size = 22, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function WindowIcon({ size = 22, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6" cy="7" r="0.6" fill="currentColor" />
      <circle cx="8.2" cy="7" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function MicIcon({ size = 17, muted = false, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {muted && <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

export function HeadsetIcon({ size = 17, deafened = false, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="13" width="4.5" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.5" y="13" width="4.5" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      {deafened && <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

export function UserIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PaletteIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path
        d="M12 3a9 8 0 1 0 0 16c1.1 0 1.7-.9 1.2-1.9-.3-.6-.1-1.4.6-1.6.8-.2 1.7-.1 2.5-.1 2 0 3.7-1.5 3.7-4A8.6 8 0 0 0 12 3Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1.1" fill="currentColor" />
      <circle cx="15.2" cy="8.3" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function SparklesIcon({ size = 14, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M11 3v3M11 15v3M4 9h3M15 9h3M6 6l1.8 1.8M14.2 7.8 16 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 5.5 12.3 9l3.5 1.3-3.5 1.3L11 15l-1.3-3.4L6.2 10.3l3.5-1.3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function MusicIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M9 18V5.5l10-2v12.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="15.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function LinkIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M9.5 14.5 14.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 6.5 12.6 5a3.6 3.6 0 0 1 5 5L16 11.5M13 17.5 11.4 19a3.6 3.6 0 0 1-5-5L8 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GameControllerIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path
        d="M7 8h10a4 4 0 0 1 4 4.6l-.6 3a2.4 2.4 0 0 1-4.2 1.1L15 15H9l-1.2 1.7a2.4 2.4 0 0 1-4.2-1.1l-.6-3A4 4 0 0 1 7 8Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M8 10.5v3M6.5 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="11" r="0.8" fill="currentColor" />
      <circle cx="14" cy="13" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function GithubIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path
        d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.3-3.4-1.3-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5A4 4 0 0 1 6.7 9c-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.9 1a10 10 0 0 1 5.3 0c2-1.3 2.9-1 2.9-1 .6 1.4.2 2.4.1 2.7a4 4 0 0 1 1.1 2.8c0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  );
}

export function DiceIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.3" cy="8.3" r="1.1" fill="currentColor" />
      <circle cx="15.7" cy="8.3" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="8.3" cy="15.7" r="1.1" fill="currentColor" />
      <circle cx="15.7" cy="15.7" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function TwitchIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 3 3.5 6.5v13H8V22l3-2.5h4L20 15V3H5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M13 7.5v5M17 7.5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PlayCircleIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" />
    </svg>
  );
}

export function CameraSquareIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="7.2" r="1" fill="currentColor" />
    </svg>
  );
}

export function TikTokIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path
        d="M15 3v10.8a2.7 2.7 0 1 1-2.2-2.66"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M15 3c.3 2 1.8 3.5 4 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GlobeIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.4 2.5 3.7 5.6 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.6-3.7-9S9.6 5.5 12 3Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function HashIcon({ size = 15, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompassIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15 9-2 6-6 2 2-6 6-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Ícones adicionados pra substituir os emojis restantes ───────────────

const stroke = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function CloseIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M6 6l12 12M18 6 6 18" {...stroke} />
    </svg>
  );
}

export function ShopIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 8h14l-1.2 11.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9L5 8Z" {...stroke} />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" {...stroke} />
    </svg>
  );
}

export function UsersIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="9" cy="8" r="3.2" {...stroke} />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" {...stroke} />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5" {...stroke} />
    </svg>
  );
}

export function PaperclipIcon({ size = 14, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="m20 11.5-7.6 7.6a5 5 0 0 1-7.1-7.1l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3" {...stroke} />
    </svg>
  );
}

export function LeaveIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" {...stroke} />
      <path d="M10 8l-4 4 4 4M6 12h10" {...stroke} />
    </svg>
  );
}

export function AlertIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" {...stroke} />
      <path d="M12 10v4M12 17h.01" {...stroke} />
    </svg>
  );
}

export function ScreenShareIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" {...stroke} />
      <path d="M9 20h6M12 16v4" {...stroke} />
      <path d="M12 13V7.5M9.5 10 12 7.5 14.5 10" {...stroke} />
    </svg>
  );
}

export function StopShareIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" {...stroke} />
      <path d="M9 20h6M12 16v4" {...stroke} />
      <path d="M9.5 7.5l5 5M14.5 7.5l-5 5" {...stroke} />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6l-7-3Z" {...stroke} />
      <path d="m9 12 2.2 2.2L15.5 10" {...stroke} />
    </svg>
  );
}

export function CrownIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13L4 8Z" {...stroke} />
      <path d="M6 21h12" {...stroke} />
    </svg>
  );
}

export function DiamondIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M7 4h10l4 5-9 11L3 9l4-5Z" {...stroke} />
      <path d="M3 9h18M10 4 8.5 9 12 20l3.5-11L14 4" {...stroke} />
    </svg>
  );
}

export function RocketIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M14 4c3 0 6 3 6 6l-6 6-6-6 6-6Z" {...stroke} />
      <circle cx="15" cy="9" r="1.6" {...stroke} />
      <path d="m8 10-3 1-1 3 4-1M14 16l-1 3-3 1 1-4M6 18l-2 2" {...stroke} />
    </svg>
  );
}

export function HeartIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" {...stroke} />
    </svg>
  );
}

export function StarIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" {...stroke} />
    </svg>
  );
}

export function WandIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 20 15 9M13 7l4 4" {...stroke} />
      <path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2M10 3v2M9 4h2" {...stroke} />
    </svg>
  );
}

export function BadgeGenericIcon({ size = 16, ...props }) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="9" r="5" {...stroke} />
      <path d="m9 13.5-1.5 7 4.5-2.5 4.5 2.5-1.5-7" {...stroke} />
    </svg>
  );
}

// As insígnias guardam no banco uma chave ("verified", "crown"…) e não o desenho;
// este mapa decide o ícone. Chave desconhecida cai num ícone genérico.
const BADGE_ICONS = {
  verified: ShieldCheckIcon,
  crown: CrownIcon,
  diamond: DiamondIcon,
  rocket: RocketIcon,
  heart: HeartIcon,
  star: StarIcon,
  wand: WandIcon,
};

export function BadgeIcon({ name, size = 16, ...props }) {
  const Icon = BADGE_ICONS[name] || BadgeGenericIcon;
  return <Icon size={size} {...props} />;
}

// ─── Ícones do layout novo ──────────────────────────────────────────────────
export function ChevronDownIcon({ size = 14, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="m6 9 6 6 6-6" {...stroke} />
    </svg>
  );
}

export function UserPlusIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="9" cy="8" r="3.6" {...stroke} />
      <path d="M2.8 19.5c.9-3.3 3.4-5.2 6.2-5.2s5.3 1.9 6.2 5.2M18.5 8v6M15.5 11h6" {...stroke} />
    </svg>
  );
}

export function ImageIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" {...stroke} />
      <circle cx="9" cy="9.5" r="1.6" {...stroke} />
      <path d="m4.5 17.5 4.6-4.4a1.5 1.5 0 0 1 2 0l2.4 2.2 2.1-1.9a1.5 1.5 0 0 1 2 0l2.9 2.6" {...stroke} />
    </svg>
  );
}

export function SendIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M20.5 3.5 10 14M20.5 3.5l-6.6 17-3.9-6.5-6.5-3.9 17-6.6Z" {...stroke} />
    </svg>
  );
}

export function MoreIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="5.5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="18.5" r="1.7" />
    </svg>
  );
}

export function PlusIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </svg>
  );
}

export function LockIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.6" {...stroke} />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" {...stroke} />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function EyeIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...stroke} />
      <circle cx="12" cy="12" r="3" {...stroke} />
    </svg>
  );
}

export function EyeOffIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 4l16 16M9.9 6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" {...stroke} />
    </svg>
  );
}

// ─── Mercado ────────────────────────────────────────────────────────────────
export function PackageIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" {...stroke} />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5" {...stroke} />
    </svg>
  );
}

export function TruckIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7" {...stroke} />
      <circle cx="7" cy="17.5" r="1.8" {...stroke} /><circle cx="17" cy="17.5" r="1.8" {...stroke} />
    </svg>
  );
}

export function DownloadIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" {...stroke} />
    </svg>
  );
}

export function FileIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5l-5-5Z" {...stroke} />
      <path d="M14 3.5v5h5" {...stroke} />
    </svg>
  );
}

export function WalletIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" {...stroke} />
      <rect x="4" y="7.5" width="16.5" height="11.5" rx="2.5" {...stroke} />
      <circle cx="16" cy="13.2" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function StoreIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 9.5 5.5 4.5h13L20 9.5a2.7 2.7 0 0 1-5.3.6 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 9.5Z" {...stroke} />
      <path d="M5.5 11.5v8h13v-8M10 19.5v-4.5h4v4.5" {...stroke} />
    </svg>
  );
}

export function TagIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0l-8.3-8.3Z" {...stroke} />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}
