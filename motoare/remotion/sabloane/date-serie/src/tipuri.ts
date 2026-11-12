// Forma lui build/props.json (planul I, „Forma datelor interne”). Props-urile le scrie props.mjs (I09);
// compoziția doar le desenează: nicio mărime, poziție sau durată nu se calculează aici.

export type Jeton = 'fundal' | 'text' | 'atenuat' | 'accent';

export type Culori = Record<Jeton, string>;

export type Font = {
  familie: string;
  url: string;
  greutate: string;
  unicodeRange: string;
};

export type StratCeata = { culoare: string; alfa: number };

export type BlocText = {
  id: string;
  text: string;
  randuri: string[];
  x: number;
  y: number;
  latime: number;
  inaltime: number;
  marime: number;
  font: 'titlu' | 'text';
  greutate: number;
  culoare: Jeton;
  spatiere: number;
  aliniere: 'stanga' | 'centru';
  /** doar la cifra XL: prefixul și sufixul desenate la mărimea lor, mai mică decât a cifrelor */
  afixe?: { prefix: string; sufix: string; marime: number };
};

export type Caseta = { x: number; y: number; latime: number; inaltime: number };

export type Valoare = { valoare: number; zecimale: number; prefix: string; sufix: string };

export type Bara = Caseta & Valoare & { accent: boolean; idEticheta: string; idValoare: string };

export type DetaliiCifra = Valoare & { idText: string };

export type DetaliiBare = { orientare: 'coloane' | 'orizontal'; axa: Caseta; bare: Bara[] };

export type DetaliiComparatie = { randuri: Array<Valoare & { idEticheta: string; idValoare: string; accent: boolean }> };

type Baza = { ref: string; cadre: number; inceput: number; intrare: number; texte: BlocText[] };

export type Scena =
  | (Baza & { tip: 'titlu'; detalii: Record<string, never> })
  | (Baza & { tip: 'cifra'; detalii: DetaliiCifra })
  | (Baza & { tip: 'bare'; detalii: DetaliiBare })
  | (Baza & { tip: 'comparatie'; detalii: DetaliiComparatie })
  | (Baza & { tip: 'final'; detalii: Record<string, never> });

export type Sigla = Caseta & { url: string };

export type PropsGrafic = {
  versiune: 1;
  latime: number;
  inaltime: number;
  fps: number;
  cadre: number;
  tranzitie: number;
  culori: Culori;
  fonturi: Font[];
  familii: { titlu: string; text: string };
  atmosfera: 'ceata' | 'plin';
  ceata: StratCeata[];
  muzica: string | null;
  sigla: Sigla | null;
  scene: Scena[];
};

/** Ce primește fiecare scenă în afara datelor ei: culorile și familiile, ca Text să nu le caute singur. */
export type Stil = { culori: Culori; familii: PropsGrafic['familii'] };

/** Intervalul de intrare al unui element, în cadre de la începutul cardului (serie/card.mjs, coregrafie). */
export type Interval = { de: number; pana: number };

/** Cardul unui testimonial (compoziția Serie, felia 3): o singură „scenă”, cu așezarea și coregrafia din card.mjs. */
export type Card = {
  ref: string;
  intrare: number;
  texte: Array<BlocText & Interval>;
  randuriCitat: Interval[];
  ghilimele: Caseta & Interval;
  avatar: { x: number; y: number; diametru: number; poza: string | null; initiale: string } & Interval;
};

export type PropsSerie = Omit<PropsGrafic, 'scene' | 'tranzitie' | 'sigla'> & {
  sigla: (Sigla & Interval) | null;
  card: Card;
};
