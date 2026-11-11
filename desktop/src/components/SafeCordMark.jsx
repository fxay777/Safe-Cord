import React from 'react';
import logo from '../assets/logo.png';

// Logo oficial do SafeCord (arquivo em src/assets/logo.png — troque a imagem lá pra mudar em todo o app).
export default function SafeCordMark({ size = 22, style }) {
  return (
    <img
      src={logo}
      alt="SafeCord"
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size, borderRadius: '50%', display: 'block', flexShrink: 0, ...style }}
    />
  );
}
