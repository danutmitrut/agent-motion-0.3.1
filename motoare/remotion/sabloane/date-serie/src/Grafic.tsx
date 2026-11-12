// Compoziția Grafic: fundalul pe tot filmul, scenele în TransitionSeries legate prin fade de `tranzitie` cadre
// (12, din durata.mjs, prin props) și muzica, dacă există. Duratele, pozițiile și textele vin toate din props.json;
// aici nu se calculează nimic din ce se măsoară (C13 și S04 folosesc aceleași numere).
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Fundal } from './comun/Fundal';
import { useFonturi } from './comun/fonturi';
import { deriva } from './comun/miscare.mjs';
import { Titlu } from './scene/Titlu';
import { Cifra } from './scene/Cifra';
import { Bare } from './scene/Bare';
import { Comparatie } from './scene/Comparatie';
import { Final } from './scene/Final';
import type { PropsGrafic, Scena, Stil } from './tipuri';

/** Scena, cu mișcarea lentă de după intrare (scala crește cu 2% până la capătul ei). */
const CuDeriva: React.FC<{ scena: Scena; children: React.ReactNode }> = ({ scena, children }) => {
  const cadru = useCurrentFrame();
  const s = deriva(cadru, scena.intrare, scena.cadre);
  return <AbsoluteFill style={{ transform: s === 1 ? undefined : `scale(${s})` }}>{children}</AbsoluteFill>;
};

function deseneaza(scena: Scena, stil: Stil, props: PropsGrafic): React.ReactNode {
  switch (scena.tip) {
    case 'titlu': return <Titlu scena={scena} stil={stil} />;
    case 'cifra': return <Cifra scena={scena} stil={stil} />;
    case 'bare': return <Bare scena={scena} stil={stil} />;
    case 'comparatie': return <Comparatie scena={scena} stil={stil} />;
    case 'final': return <Final scena={scena} stil={stil} sigla={props.sigla} />;
  }
}

export const Grafic: React.FC<PropsGrafic> = (props) => {
  useFonturi(props.fonturi);
  const stil: Stil = { culori: props.culori, familii: props.familii };
  return (
    <AbsoluteFill>
      <Fundal culori={props.culori} ceata={props.ceata} />
      <TransitionSeries>
        {props.scene.map((scena, i) => (
          <React.Fragment key={scena.ref}>
            {i > 0 ? (
              <TransitionSeries.Transition
                presentation={fade({ shouldFadeOutExitingScene: true })}
                timing={linearTiming({ durationInFrames: props.tranzitie })}
              />
            ) : null}
            <TransitionSeries.Sequence durationInFrames={scena.cadre} name={scena.ref}>
              <CuDeriva scena={scena}>{deseneaza(scena, stil, props)}</CuDeriva>
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
      </TransitionSeries>
      {props.muzica ? <Audio src={staticFile(props.muzica)} /> : null}
    </AbsoluteFill>
  );
};
