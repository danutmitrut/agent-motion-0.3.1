// Șablonul de probă pentru Remotion (planul I, I04): aceleași date și aceeași cronologie ca `proba`, iar build-ul e
// doar build/props.json, desenat de compoziția Proba din src/Root.tsx. Importă doar module native, pentru că testele
// îl copiază într-o rădăcină temporară (nu importă nici sdk.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Copie intenționată a lui rotunjeste din nucleu/lib/cronologie.mjs (ca în proba); valideazaCronologie o verifică.
const rotunjeste = (x) => Math.round(x * 1000) / 1000;
const faraAccent = (rand) => rand.replaceAll('*', '');

/**
 * Compoziția e statică: după ce textul e complet, imaginea stă pe loc până la finalul segmentului. Ferestrele declară
 * asta: `citire` de la complet la sfârșitul fiecărui segment, iar pe ultimul segment `citire` se oprește la începutul
 * pauzei finale, care e fereastra ei, `pauza-finala`.
 */
function ferestreStatice(segmente, durata, pauzaFinala) {
  const inceputPauza = rotunjeste(durata - pauzaFinala);
  const citire = segmente
    .map((s) => ({ start: s.complet, sfarsit: Math.min(s.sfarsit, inceputPauza), motiv: 'citire' }))
    .filter((f) => f.sfarsit > f.start);
  return [...citire, { start: inceputPauza, sfarsit: durata, motiv: 'pauza-finala' }];
}

/**
 * Regulile de dincolo de schema.json; nucleul o apelează doar după ce C02 a trecut.
 * @returns {{erori: object[], avertismente: object[]}}
 */
export function valideaza(date, ctx) {
  const erori = [];
  date.scene.forEach((scena, i) => {
    scena.titlu.forEach((rand, j) => {
      const camp = `scene[${i}].titlu[${j}]`;
      if (rand.trim() === '') {
        erori.push({
          cod: 'valoare-invalida',
          camp,
          mesaj: `Scena ${i + 1}, rândul ${j + 1} e gol.`,
          sugestie: `Scrie textul rândului sau șterge rândul din scene[${i}].titlu.`,
        });
      } else if ((rand.match(/\*/g) ?? []).length % 2 === 1) {
        erori.push({
          cod: 'accent-neinchis',
          camp,
          mesaj: `Scena ${i + 1}, rândul ${j + 1}: accentul deschis cu * nu e închis.`,
          sugestie: 'Adaugă * la finalul segmentului accentuat sau scoate * de la început.',
        });
      }
    });
  });
  return { erori, avertismente: [] };
}

/** Ca la proba: 3 s pe scenă, textul complet după 0,5 s, static până la finalul scenei. */
export function cronologie(date, stil, ctx) {
  const { meta, implicite } = ctx.sablon;
  const format = date.format ?? 'vertical';
  const { latime, inaltime, zona_text: zonaText } = implicite.formate[format];
  const pas = implicite.scene.secunde_pe_scena;
  const completDupa = implicite.scene.complet_dupa;
  const durata = rotunjeste(date.scene.length * pas);

  const segmente = date.scene.map((scena, i) => ({
    ref: `Scena ${i + 1}`,
    camp: `scene[${i}]`,
    tip: scena.tip,
    start: rotunjeste(i * pas),
    complet: rotunjeste(i * pas + completDupa),
    sfarsit: rotunjeste((i + 1) * pas),
    zona_text: [...zonaText],
    texte: scena.titlu.map(faraAccent),
  }));

  const candidati = [
    ...segmente.map((s) => ({ t: s.complet, ref: s.ref, eticheta: `${s.ref}, complet` })),
    { t: rotunjeste(durata - 1 / meta.fps), ref: segmente.at(-1).ref, eticheta: 'Ultimul cadru' },
  ].sort((a, b) => a.t - b.t);
  const momente = [];
  // Copie intenționată a regulii de deduplicare din nucleu (momente la cel puțin 0,1 s); valideazaCronologie o verifică.
  for (const m of candidati) {
    const anterior = momente.at(-1);
    if (anterior === undefined || m.t - anterior.t >= 0.1 - 1e-9) momente.push(m);
  }

  const cron = {
    versiune: 1,
    sablon: ctx.sablon.nume,
    format,
    latime,
    inaltime,
    fps: meta.fps,
    durata,
    fundal: stil.culori.fundal.valoare,
    segmente,
    ferestre_statice: ferestreStatice(segmente, durata, implicite.reguli.pauza_finala),
    momente_foaie: momente,
    audio: null,
  };
  return { cronologie: cron, intern: null, erori: [], avertismente: [] };
}

/**
 * Scrie build/props.json: tot ce desenează compoziția Proba, în cadre (30 fps) și pixeli. Aceleași date dau același
 * fișier, octet cu octet (cheile în ordinea construcției, fără valori calculate din timp sau întâmplare).
 */
export async function construieste(date, stil, cron, dirBuild, ctx) {
  const cadru = (t) => Math.round(t * cron.fps);
  const props = {
    latime: cron.latime,
    inaltime: cron.inaltime,
    fps: cron.fps,
    cadre: cadru(cron.durata),
    fundal: cron.fundal,
    culoare: stil.culori.text.valoare,
    px: ctx.sablon.implicite.titlu.px,
    scene: cron.segmente.map((s) => ({
      start: cadru(s.start),
      cadre: cadru(s.sfarsit) - cadru(s.start),
      zona: [...s.zona_text],
      randuri: [...s.texte],
    })),
  };
  mkdirSync(dirBuild, { recursive: true });
  writeFileSync(join(dirBuild, 'props.json'), `${JSON.stringify(props, null, 2)}\n`, 'utf8');
  return { intrare: 'props.json', fisiere: ['props.json'], motor: { props: 'props.json', compozitie: 'Proba' } };
}

/** Ce trebuie să apară în MP4, pentru verificările comune (harta 5.9). */
export function asteptari(cron) {
  return {
    texte: cron.segmente.flatMap((s) => s.texte.map((text) => ({ ref: s.ref, text, t: s.complet, zona_text: [...s.zona_text] }))),
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: cron.audio !== null, durata: cron.audio === null ? null : cron.audio.durata },
    fundal: cron.fundal,
  };
}
