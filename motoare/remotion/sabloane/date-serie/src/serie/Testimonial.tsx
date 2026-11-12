// Compoziția Serie: un card de testimonial pe tot filmul (un MP4 pe rândul din tabel). Eticheta și sigla sus,
// ghilimelele, citatul care intră rând cu rând, omul (avatar, nume, rol) și îndemnul jos. Tot ce se măsoară vine
// din props.json (serie/card.mjs); aici doar se desenează, cu aceleași intervale pe care le știe cronologia.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { Fundal } from '../comun/Fundal';
import { Avatar } from '../comun/Avatar';
import { Text } from '../comun/Text';
import { useFonturi } from '../comun/fonturi';
import { deriva, progres } from '../comun/miscare.mjs';
import { INTERLINIE } from '../comun/zone.mjs';
import type { BlocText, Card, Interval, PropsSerie, Stil } from '../tipuri';

/** Semnul citatului, desenat (nu un glif: fontul temei poate să nu-l aibă), în culoarea de accent. */
const Ghilimele: React.FC<{ g: Card['ghilimele']; stil: Stil }> = ({ g, stil }) => {
  const p = progres(useCurrentFrame(), g.de, g.pana);
  return (
    <svg
      viewBox="0 0 24 18" width={g.latime} height={g.inaltime}
      style={{ position: 'absolute', left: g.x, top: g.y, opacity: p, transform: p === 1 ? undefined : `translateY(${(1 - p) * 20}px)` }}
    >
      <path d="M0 18h7l3-6V0H0v12h4zm13 0h7l3-6V0H13v12h4z" fill={stil.culori.accent} />
    </svg>
  );
};

/** Citatul, rând cu rând: fiecare rând e un bloc de un rând, la poziția lui în blocul măsurat. */
const Citat: React.FC<{ bloc: BlocText; randuri: Interval[]; stil: Stil }> = ({ bloc, randuri, stil }) => (
  <>
    {bloc.randuri.map((rand, k) => (
      <Text
        key={k}
        bloc={{ ...bloc, text: rand, randuri: [rand], y: bloc.y + Math.round(k * bloc.marime * INTERLINIE), inaltime: Math.round(bloc.marime * INTERLINIE) }}
        stil={stil}
        de={randuri[k].de}
        pana={randuri[k].pana}
      />
    ))}
  </>
);

export const Serie: React.FC<PropsSerie> = (props) => {
  useFonturi(props.fonturi);
  const cadru = useCurrentFrame();
  const stil: Stil = { culori: props.culori, familii: props.familii };
  const { card, sigla } = props;
  const s = deriva(cadru, card.intrare, props.cadre);
  return (
    <AbsoluteFill>
      <Fundal culori={props.culori} ceata={props.ceata} />
      <AbsoluteFill style={{ transform: s === 1 ? undefined : `scale(${s})` }}>
        <Ghilimele g={card.ghilimele} stil={stil} />
        {card.texte.map((t) =>
          t.id === 'citat'
            ? <Citat key={t.id} bloc={t} randuri={card.randuriCitat} stil={stil} />
            : <Text key={t.id} bloc={t} stil={stil} de={t.de} pana={t.pana} />,
        )}
        <Avatar avatar={card.avatar} stil={stil} />
        {sigla ? (
          <Img
            src={staticFile(sigla.url)}
            style={{ position: 'absolute', left: sigla.x, top: sigla.y, width: sigla.latime, height: sigla.inaltime, objectFit: 'contain', opacity: progres(cadru, sigla.de, sigla.pana) }}
          />
        ) : null}
      </AbsoluteFill>
      {props.muzica ? <Audio src={staticFile(props.muzica)} /> : null}
    </AbsoluteFill>
  );
};
