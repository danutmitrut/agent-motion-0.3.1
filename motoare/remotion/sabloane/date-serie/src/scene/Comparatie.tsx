// Scena comparatie: două sau trei valori mari, una sub alta, fiecare cu eticheta ei; intră la 8 cadre una după alta
// și numără de la 0. Valoarea evidențiată are deja culoarea de accent în props.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Text, bloc } from '../comun/Text';
import { esteCifre } from '../comun/cifre.mjs';
import { esalonat, progres } from '../comun/miscare.mjs';
import { valoareLa } from './Cifra';
import type { Scena, Stil } from '../tipuri';

const DECALAJ = 8;
const NUMARARE = 30;

export const Comparatie: React.FC<{ scena: Extract<Scena, { tip: 'comparatie' }>; stil: Stil }> = ({ scena, stil }) => {
  const cadru = useCurrentFrame();
  const { randuri } = scena.detalii;
  const aleRandurilor = new Set(randuri.flatMap((r) => [r.idEticheta, r.idValoare]));
  const restul = scena.texte.filter((t) => !aleRandurilor.has(t.id));
  return (
    <AbsoluteFill>
      {restul.map((t, k) => (
        <Text key={t.id} bloc={t} stil={stil} {...esalonat(k, Math.min(18, scena.intrare))} />
      ))}
      {randuri.map((r, i) => {
        const de = DECALAJ * i;
        const pana = Math.min(de + NUMARARE, scena.intrare);
        const p = progres(cadru, de, pana);
        return (
          <React.Fragment key={r.idValoare}>
            <Text bloc={bloc(scena.texte, r.idEticheta)} stil={stil} de={de} pana={Math.min(de + 12, pana)} />
            <Text
              bloc={bloc(scena.texte, r.idValoare)}
              stil={stil}
              de={de}
              pana={pana}
              cifre={esteCifre('comparatie', r.idValoare)}
              continut={cadru < pana ? valoareLa(r, p) : undefined}
            />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
