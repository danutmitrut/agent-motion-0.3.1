// Scena final: titlul și îndemnul intră eșalonat; sigla (dacă există) apare ultima, în caseta ei din props.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Text } from '../comun/Text';
import { esalonat, progres } from '../comun/miscare.mjs';
import type { Scena, Sigla, Stil } from '../tipuri';

export const Final: React.FC<{ scena: Extract<Scena, { tip: 'final' }>; stil: Stil; sigla: Sigla | null }> = ({ scena, stil, sigla }) => {
  const cadru = useCurrentFrame();
  const n = scena.texte.length;
  return (
    <AbsoluteFill>
      {scena.texte.map((t, k) => (
        <Text key={t.id} bloc={t} stil={stil} {...esalonat(k, scena.intrare)} />
      ))}
      {sigla ? (
        <Img
          src={staticFile(sigla.url)}
          style={{
            position: 'absolute', left: sigla.x, top: sigla.y, width: sigla.latime, height: sigla.inaltime,
            objectFit: 'contain', opacity: progres(cadru, esalonat(n, scena.intrare).de, scena.intrare),
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
