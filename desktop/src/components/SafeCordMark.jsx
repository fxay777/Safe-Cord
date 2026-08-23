import React from 'react';

// Mascote original do SafeCord — uma coruja estilizada (vigilância/proteção, combina
// com o "Safe" do nome). Traço geométrico próprio, sem relação com nenhuma marca de terceiros.
export default function SafeCordMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* tufos das orelhas */}
      <path d="M6.2 6.6 8 3.4l1.6 3.4-3.4-.2Z" fill="var(--accent)" />
      <path d="M17.8 6.6 16 3.4l-1.6 3.4 3.4-.2Z" fill="var(--accent)" />
      {/* cabeça */}
      <path
        d="M12 4.4c3.9 0 6.6 3 6.6 7 0 3.6-1.9 6.4-4.6 7.6-.5.9-1.2 1.4-2 1.4s-1.5-.5-2-1.4c-2.7-1.2-4.6-4-4.6-7.6 0-4 2.7-7 6.6-7Z"
        fill="var(--accent)"
      />
      {/* rosto (recorte mais claro) */}
      <path
        d="M12 6.6c2.7 0 4.4 2.1 4.4 4.9 0 2.9-1.7 5.1-4.4 5.1s-4.4-2.2-4.4-5.1c0-2.8 1.7-4.9 4.4-4.9Z"
        fill="var(--bg-void)"
        opacity="0.92"
      />
      {/* olhos */}
      <circle cx="9.6" cy="11.2" r="1.9" fill="var(--accent)" />
      <circle cx="14.4" cy="11.2" r="1.9" fill="var(--accent)" />
      <circle cx="10.1" cy="10.6" r="0.55" fill="var(--bg-void)" />
      <circle cx="14.9" cy="10.6" r="0.55" fill="var(--bg-void)" />
      {/* bico */}
      <path d="M12 12.6 13 14.2 12 14.9 11 14.2 12 12.6Z" fill="var(--accent)" />
    </svg>
  );
}
