// Scena bare: axa pornește de la 0, barele cresc decalat (3 cadre între ele) cu spring, iar valoarea fiecăreia
// numără și urcă odată cu capătul barei. Bara evidențiată are culoarea de accent. Caseta fiecărei bare și a fiecărui
// text vine din props; la cadrul `intrare` (30 + 2 × (n − 1), ca în durata.mjs) totul e la mărimea și în poziția finală.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Text, bloc } from '../comun/Text';
import { esteCifre } from '../comun/cifre.mjs';
import { crestere, esalonat, progres } from '../comun/miscare.mjs';
import { valoareLa } from './Cifra';
import type { Scena, Stil } from '../tipuri';

const DECALAJ = 3;
const CRESTERE = 30;

export const Bare: React.FC<{ scena: Extract<Scena, { tip: 'bare' }>; stil: Stil }> = ({ scena, stil }) => {
  const cadru = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { orientare, axa, bare } = scena.detalii;
  const coloane = orientare === 'coloane';
  const aleBarelor = new Set(bare.flatMap((b) => [b.idEticheta, b.idValoare]));
  const restul = scena.texte.filter((t) => !aleBarelor.has(t.id));
  return (
    <AbsoluteFill>
      {restul.map((t, k) => (
        <Text key={t.id} bloc={t} stil={stil} {...esalonat(k, Math.min(18, scena.intrare))} />
      ))}
      <div
        style={{
          position: 'absolute', left: axa.x, top: axa.y, width: axa.latime, height: axa.inaltime,
          backgroundColor: stil.culori.atenuat, opacity: progres(cadru, 0, 12),
        }}
      />
      {bare.map((b, i) => {
        const de = DECALAJ * i;
        const pana = Math.min(de + CRESTERE, scena.intrare);
        const g = crestere(cadru, de, pana, fps);
        const raza = Math.min(8, (coloane ? b.latime : b.inaltime) / 4);
        return (
          <React.Fragment key={b.idValoare}>
            <div
              style={{
                position: 'absolute',
                left: b.x,
                top: coloane ? b.y + b.inaltime * (1 - g) : b.y,
                width: coloane ? b.latime : b.latime * g,
                height: coloane ? b.inaltime * g : b.inaltime,
                backgroundColor: b.accent ? stil.culori.accent : stil.culori.atenuat,
                borderRadius: coloane ? `${raza}px ${raza}px 0 0` : `0 ${raza}px ${raza}px 0`,
              }}
            />
            <Text
              bloc={bloc(scena.texte, b.idValoare)}
              stil={stil}
              de={de}
              pana={pana}
              cifre={esteCifre('bare', b.idValoare)}
              continut={cadru < pana ? valoareLa(b, g) : undefined}
              dx={coloane ? 0 : -b.latime * (1 - g)}
              dy={coloane ? b.inaltime * (1 - g) : 0}
            />
            <Text bloc={bloc(scena.texte, b.idEticheta)} stil={stil} de={de} pana={Math.min(de + 18, scena.intrare)} />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
