// Timpii și cronologia compoziției Grafic (decizia 10 din planul I). Cadrele vin din src/durata.mjs, aceleași pe care
// le folosește React, deci scenele din MP4 și segmentele din cronologie.json nu se pot despărți. Fiecare segment e
// tăiat la mijlocul tranziției de 12 cadre, deci segmentele sunt lipite și C09 nu vede suprapuneri.
import { rotunjeste, audioCronologie } from '../../../../nucleu/lib/sdk.mjs';
import { FPS, CADRE_TRANZITIE, cadreScena, cadreTotale, inceputuri, cadreIntrare } from './src/durata.mjs';
import { durataScena } from './reguli.mjs';

const EPS = 1e-9;
const sec = (cadre) => rotunjeste(cadre / FPS, 3);

/**
 * Cadrele fiecărei scene (cu duratele implicite aplicate).
 * @param {{scene: object[]}} date @param {object} implicite implicite.json
 * @returns {{durate: number[], cadre: number[], inceputuri: number[], intrari: number[], total: number}}
 */
export function timpi(date, implicite) {
  const durate = date.scene.map((s) => durataScena(s, implicite));
  const cadre = durate.map(cadreScena);
  return {
    durate,
    cadre,
    inceputuri: inceputuri(cadre),
    intrari: date.scene.map((s) => cadreIntrare(s.tip, s.valori?.length ?? 0)),
    total: cadreTotale(cadre),
  };
}

/**
 * Segmentul scenei i, în secunde: start și sfarsit la mijlocul tranzițiilor (0 și durata la capete), complet la
 * inceput + intrare.
 */
export function segmentTimp(t, i) {
  const n = t.cadre.length;
  const jumatate = CADRE_TRANZITIE / 2;
  return {
    start: i === 0 ? 0 : sec(t.inceputuri[i] + jumatate),
    complet: sec(t.inceputuri[i] + t.intrari[i]),
    sfarsit: i === n - 1 ? sec(t.total) : sec(t.inceputuri[i + 1] + jumatate),
  };
}

/** Momentele foii de contact, ca la text-animat: completul fiecărei scene, tranzițiile, ultimul cadru; la cel puțin 0,1 s. */
function momenteFoaie(segmente, durata) {
  const momente = segmente.map((s) => ({ t: s.complet, ref: s.ref, eticheta: `${s.ref}, complet` }));
  for (let i = 1; i < segmente.length; i++) momente.push({ t: segmente[i].start, ref: segmente[i].ref, eticheta: `Tranziția spre scena ${i + 1}` });
  momente.push({ t: rotunjeste(durata - 1 / FPS, 3), ref: segmente[segmente.length - 1].ref, eticheta: 'Ultimul cadru' });
  momente.sort((x, y) => x.t - y.t);
  const rezultat = [];
  for (const m of momente) {
    const ultim = rezultat[rezultat.length - 1];
    if (!ultim || m.t - ultim.t >= 0.1 - EPS) rezultat.push(m);
  }
  return rezultat;
}

/**
 * Cronologia comună (docs/interfete/cronologie.md). `texte` are câte o intrare pe rând afișat, în ordinea blocurilor
 * din asezare (decizia 9: rândurile sunt despărțite explicit, deci C17 le găsește ca valori separate în props.json).
 * @param {object} date @param {{culori: {fundal: string}}} stilPlat
 * @param {ReturnType<typeof timpi>} t @param {{scene: Array<{texte: object[], zona: number[]}>}} asezare
 */
export function cronologieGrafic(date, stilPlat, t, asezare) {
  const durata = sec(t.total);
  const segmente = date.scene.map((s, i) => ({
    ref: `Scena ${i + 1}`,
    camp: `scene[${i}]`,
    tip: s.tip,
    ...segmentTimp(t, i),
    zona_text: asezare.scene[i].zona,
    texte: asezare.scene[i].texte.flatMap((b) => b.randuri),
  }));
  return {
    versiune: 1,
    sablon: 'date-serie',
    format: 'vertical',
    latime: 1080,
    inaltime: 1920,
    fps: FPS,
    durata,
    fundal: stilPlat.culori.fundal,
    segmente,
    ferestre_statice: [],
    momente_foaie: momenteFoaie(segmente, durata),
    audio: audioCronologie(date, durata),
  };
}
