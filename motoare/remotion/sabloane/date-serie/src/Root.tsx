// Compozițiile șablonului date-serie: Grafic (planul I) și Serie (un card de testimonial pe MP4, felia 3).
// Durata nu se scrie de mână: calculateMetadata o ia din cadrele scenelor, cu formula din durata.mjs
// (aceeași pe care o folosește mg la cronologie și la S06), deci props.json și MP4-ul nu se pot contrazice.
import React from 'react';
import { Composition } from 'remotion';
import { Grafic } from './Grafic';
import { Serie } from './serie/Testimonial';
import { CADRE_TRANZITIE, FPS, cadreTotale } from './durata.mjs';
import type { PropsGrafic, PropsSerie } from './tipuri';

// Props-uri minime valide, doar ca rezervă: mg dă mereu --props=<build/props.json>.
const IMPLICITE: PropsGrafic = {
  versiune: 1,
  latime: 1080,
  inaltime: 1920,
  fps: FPS,
  cadre: 60,
  tranzitie: CADRE_TRANZITIE,
  culori: { fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#FF7A59' },
  fonturi: [],
  familii: { titlu: 'sans-serif', text: 'sans-serif' },
  atmosfera: 'plin',
  ceata: [],
  muzica: null,
  sigla: null,
  scene: [{ ref: 'Scena 1', tip: 'titlu', cadre: 60, inceput: 0, intrare: 18, texte: [], detalii: {} }],
};

const IMPLICITE_SERIE: PropsSerie = {
  ...(({ scene, tranzitie, ...rest }) => rest)(IMPLICITE),
  sigla: null,
  card: {
    ref: 'Testimonial 1', intrare: 30, texte: [], randuriCitat: [],
    ghilimele: { x: 72, y: 300, latime: 112, inaltime: 88, de: 3, pana: 18 },
    avatar: { x: 72, y: 1500, diametru: 176, poza: null, initiale: 'A', de: 12, pana: 26 },
  },
};

export const Root: React.FC = () => (
  <>
  <Composition
    id="Grafic"
    component={Grafic}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={IMPLICITE.cadre}
    defaultProps={IMPLICITE}
    calculateMetadata={({ props }) => ({ durationInFrames: cadreTotale(props.scene.map((s) => s.cadre)) })}
  />
  {/* la Serie, durata e chiar props.cadre: cardul e o singură „scenă”, fără tranziții */}
  <Composition
    id="Serie"
    component={Serie}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={IMPLICITE_SERIE.cadre}
    defaultProps={IMPLICITE_SERIE}
    calculateMetadata={({ props }) => ({ durationInFrames: props.cadre })}
  />
  </>
);
