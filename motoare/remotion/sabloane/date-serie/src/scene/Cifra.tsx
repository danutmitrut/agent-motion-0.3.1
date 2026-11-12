// Scena cifra: valoarea numără de la 0 la valoarea finală pe toată intrarea (formatRo, ca în blocul aprobat);
// eticheta și textul intră eșalonat. De la cadrul `intrare`, valoarea afișată e exact textul din props.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Text } from '../comun/Text';
import { esalonat, progres } from '../comun/miscare.mjs';
import { esteCifre } from '../comun/cifre.mjs';
import { formatRo } from '../comun/numere.mjs';
import type { Scena, Stil, Valoare } from '../tipuri';

/** Valoarea la progresul p (0..1), cu prefixul, sufixul și zecimalele ei. */
export function valoareLa(v: Valoare, p: number): string {
  return `${v.prefix}${formatRo(v.valoare * p, v.zecimale)}${v.sufix}`;
}

export const Cifra: React.FC<{ scena: Extract<Scena, { tip: 'cifra' }>; stil: Stil }> = ({ scena, stil }) => {
  const cadru = useCurrentFrame();
  const d = scena.detalii;
  const numar = progres(cadru, 0, scena.intrare);
  const celelalte = scena.texte.filter((t) => t.id !== d.idText);
  return (
    <AbsoluteFill>
      {scena.texte.map((t) =>
        t.id === d.idText ? (
          <Text key={t.id} bloc={t} stil={stil} de={0} pana={Math.min(12, scena.intrare)} cifre={esteCifre('cifra', t.id)} continut={cadru < scena.intrare ? valoareLa(d, numar) : undefined} />
        ) : (
          <Text key={t.id} bloc={t} stil={stil} {...esalonat(celelalte.indexOf(t), scena.intrare)} />
        ),
      )}
    </AbsoluteFill>
  );
};
