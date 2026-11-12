// Fundalul întregului film, sub tranziții: culoarea plină și, la atmosfera „ceata”, două pete de lumină estompate
// care se plimbă lent pe tot filmul (aceleași straturi și aceeași intensitate pe care le măsoară C06, din props.ceata).
// Mișcarea e o funcție de cadru (sinusuri), fără numere aleatoare: același cadru dă aceeași imagine.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Culori, StratCeata } from '../tipuri';

function rgba(hex: string, alfa: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

// pozițiile petelor ca la text-animat (#glow-a, #glow-b), în pixelii cadrului 1080x1920
const PETE = [
  { stanga: -378, sus: -307, latime: 1080, inaltime: 998, ax: 140, ay: 90, perioada: 420, faza: 0 },
  { stanga: -119, sus: 1363, latime: 1404, inaltime: 826, ax: 120, ay: 70, perioada: 510, faza: 2.1 },
];

export const Fundal: React.FC<{ culori: Culori; ceata: StratCeata[] }> = ({ culori, ceata }) => {
  const cadru = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: culori.fundal }}>
      {ceata.map((strat, i) => {
        const p = PETE[i % PETE.length];
        const unghi = (2 * Math.PI * cadru) / p.perioada + p.faza;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.stanga,
              top: p.sus,
              width: p.latime,
              height: p.inaltime,
              borderRadius: '50%',
              backgroundColor: rgba(strat.culoare, strat.alfa),
              filter: 'blur(90px)',
              transform: `translate(${p.ax * Math.sin(unghi)}px, ${p.ay * Math.cos(unghi)}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
