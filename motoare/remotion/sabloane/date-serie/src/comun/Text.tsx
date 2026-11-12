// Un bloc de text din props, în caseta lui absolută. Mărimea, rândurile și poziția vin gata calculate din Node
// (asezare.mjs, cu fontkit, pe același woff2); aici nu se măsoară și nu se rupe nimic.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { progres } from './miscare.mjs';
import { INTERLINIE } from './zone.mjs';
import type { BlocText, Stil } from '../tipuri';

const URCARE = 28; // px: textul intră de jos, cu fade

type Props = {
  bloc: BlocText;
  stil: Stil;
  /** cadrul local la care începe intrarea */
  de: number;
  /** cadrul local la care textul e în caseta din props, la opacitate 1 (cel târziu intrarea scenei) */
  pana: number;
  /** textul afișat în locul lui bloc.text cât timp numără (scena îl dă doar înainte de `pana`) */
  continut?: string;
  /** deplasarea în px peste poziția finală (eticheta valorii care urcă odată cu bara); 0 la `pana` */
  dx?: number;
  dy?: number;
  /** cifre tabulare (valorile măsurate cu cifrele înlocuite de 0 în asezare.mjs, vezi comun/cifre.mjs) */
  cifre?: boolean;
};

export const Text: React.FC<Props> = ({ bloc, stil, de, pana, continut, dx = 0, dy = 0, cifre = false }) => {
  const cadru = useCurrentFrame();
  const p = progres(cadru, de, pana);
  const final = cadru >= pana;
  const randuri = continut === undefined ? bloc.randuri : continut.split('\n');
  return (
    <div
      style={{
        position: 'absolute',
        left: bloc.x,
        top: bloc.y,
        width: bloc.latime,
        height: bloc.inaltime,
        opacity: p,
        transform: final ? undefined : `translate(${dx}px, ${dy + (1 - p) * URCARE}px)`,
        fontFamily: `"${stil.familii[bloc.font]}"`,
        fontWeight: bloc.greutate,
        fontSize: bloc.marime,
        lineHeight: `${bloc.marime * INTERLINIE}px`,
        letterSpacing: `${bloc.spatiere}em`,
        color: stil.culori[bloc.culoare],
        textAlign: bloc.aliniere === 'centru' ? 'center' : 'left',
        fontVariantNumeric: cifre ? 'tabular-nums' : undefined,
        whiteSpace: 'pre',
      }}
    >
      {randuri.map((rand, i) => (
        <div key={i}>{bloc.afixe ? <CuAfixe rand={rand} afixe={bloc.afixe} /> : rand}</div>
      ))}
    </div>
  );
};

/** Un rând de forma prefix + cifre + sufix, cu prefixul și sufixul la mărimea lor (asezare.mjs, latimeAfixe). */
const CuAfixe: React.FC<{ rand: string; afixe: NonNullable<BlocText['afixe']> }> = ({ rand, afixe }) => {
  const { prefix, sufix, marime } = afixe;
  const areP = prefix !== '' && rand.startsWith(prefix);
  const areS = sufix !== '' && rand.endsWith(sufix);
  const mijloc = rand.slice(areP ? prefix.length : 0, areS ? rand.length - sufix.length : rand.length);
  return (
    <>
      {areP ? <span style={{ fontSize: marime }}>{prefix}</span> : null}
      {mijloc}
      {areS ? <span style={{ fontSize: marime }}>{sufix}</span> : null}
    </>
  );
};

/** Blocul cu id-ul dat; lipsa lui e o greșeală a lui props.mjs, nu a cursantului. */
export function bloc(texte: BlocText[], id: string): BlocText {
  const gasit = texte.find((t) => t.id === id);
  if (!gasit) throw new Error(`props.json: lipsește textul ${id}`);
  return gasit;
}
