// Scena titlu: eticheta, titlul și subtitlul intră eșalonat, cu fade și o urcare scurtă.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Text } from '../comun/Text';
import { esalonat } from '../comun/miscare.mjs';
import type { Scena, Stil } from '../tipuri';

export const Titlu: React.FC<{ scena: Extract<Scena, { tip: 'titlu' }>; stil: Stil }> = ({ scena, stil }) => (
  <AbsoluteFill>
    {scena.texte.map((t, k) => (
      <Text key={t.id} bloc={t} stil={stil} {...esalonat(k, scena.intrare)} />
    ))}
  </AbsoluteFill>
);
