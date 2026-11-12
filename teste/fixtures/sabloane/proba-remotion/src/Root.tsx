// Compoziția de probă a adaptorului Remotion: fundalul temei și rândurile fiecărei scene, statice, în zona textului.
// Toate numerele vin din build/props.json (scris de sablon.mjs); aici doar se desenează.
import React from 'react';
import { AbsoluteFill, Composition, Sequence } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';

type Scena = { start: number; cadre: number; zona: number[]; randuri: string[] };
type Props = {
  latime: number;
  inaltime: number;
  fps: number;
  cadre: number;
  fundal: string;
  culoare: string;
  px: number;
  scene: Scena[];
};

const Proba: React.FC<Props> = ({ fundal, culoare, px, scene }) => (
  <AbsoluteFill style={{ backgroundColor: fundal }}>
    {scene.map((s, i) => (
      <Sequence key={i} from={s.start} durationInFrames={s.cadre} layout="none">
        <p
          style={{
            position: 'absolute', margin: 0, left: s.zona[0], top: s.zona[1], width: s.zona[2], height: s.zona[3],
            font: `700 ${px}px sans-serif`, lineHeight: 1.1, color: culoare,
          }}
        >
          {s.randuri.map((r, j) => (
            <React.Fragment key={j}>
              {j > 0 ? <br /> : null}
              {r}
            </React.Fragment>
          ))}
        </p>
      </Sequence>
    ))}
  </AbsoluteFill>
);

const metadate: CalculateMetadataFunction<Props> = ({ props }) => {
  if (!Number.isInteger(props.cadre) || props.cadre < 1) {
    throw new Error(`props.cadre trebuie să fie un întreg pozitiv (primit: ${String(props.cadre)})`);
  }
  return { durationInFrames: props.cadre, fps: props.fps, width: props.latime, height: props.inaltime };
};

const IMPLICITE: Props = { latime: 1080, inaltime: 1920, fps: 30, cadre: 30, fundal: '#000000', culoare: '#FFFFFF', px: 88, scene: [] };

export const Radacina: React.FC = () => (
  <Composition id="Proba" component={Proba} defaultProps={IMPLICITE} calculateMetadata={metadate} />
);
