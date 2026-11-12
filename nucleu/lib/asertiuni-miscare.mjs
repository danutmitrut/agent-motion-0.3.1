// index.motion.json din cronologie (spec 7.2, punctul 5; planul F, F7): comun tuturor șabloanelor HyperFrames.
// Formatul și eșantionarea sunt ale lui HyperFrames 0.8.96 (dist/chunk-QLDMGURX.js, buildMotionSampleTimes și parseMotionSpec):
// MOTION_FPS 20, cel mult 300 de eșantioane, pe durata compoziției (fișierul nu dă `duration`).
import { rotunjeste } from './cronologie.mjs';

const FPS_MISCARE = 20;
const ESANTIOANE_MAXIME = 300;
const START_PLUS = 1.0; // primul text e pe ecran la cel mult 1 s după începutul segmentului
const STATIC_MAXIM = 2; // keepsMoving: cel mult 2 s fără nicio schimbare

/**
 * Pasul dintre două eșantioane ale lui HyperFrames pentru o compoziție de `durata` secunde.
 * @param {number} durata @returns {number}
 */
export function pasEsantionare(durata) {
  const n = Math.min(ESANTIOANE_MAXIME, Math.max(2, Math.ceil(durata * FPS_MISCARE) + 1));
  return durata / (n - 1);
}

/**
 * Cea mai lungă porțiune în care cronologia îi permite imaginii să stea pe loc: ferestrele statice (C14), unite peste
 * golurile de cel mult STATIC_MAXIM secunde (un gol atât de scurt are voie să fie static și în afara ferestrelor),
 * inclusiv golurile de la începutul și de la sfârșitul videoului. Fără ferestre: 0.
 * @param {{durata: number, ferestre_statice?: {start: number, sfarsit: number}[]}} cronologie @returns {number}
 */
export function staticPermis(cronologie) {
  const ferestre = [...(cronologie.ferestre_statice ?? [])].sort((a, b) => a.start - b.start || a.sfarsit - b.sfarsit);
  let maxim = 0;
  let bloc = null;
  const inchide = () => {
    if (!bloc) return;
    const start = bloc.start <= STATIC_MAXIM ? 0 : bloc.start;
    const sfarsit = cronologie.durata - bloc.sfarsit <= STATIC_MAXIM ? cronologie.durata : bloc.sfarsit;
    maxim = Math.max(maxim, sfarsit - start);
  };
  for (const f of ferestre) {
    if (bloc && f.start - bloc.sfarsit <= STATIC_MAXIM) bloc.sfarsit = Math.max(bloc.sfarsit, f.sfarsit);
    else {
      inchide();
      bloc = { start: f.start, sfarsit: f.sfarsit };
    }
  }
  inchide();
  return maxim;
}

/**
 * Aserțiunile de mișcare, doar pentru segmentele cu `selectori` (în ordinea cronologiei).
 * bySec are un pas de eșantionare în plus (planul F, abaterea 1): un element vizibil exact la t se vede abia la eșantionul următor.
 * keepsMoving fără withinSelector: toată compoziția (HyperFrames refuză "*"). Pragul e 2 s, ridicat doar când ferestrele
 * statice declarate de șablon (C14) permit o porțiune statică mai lungă (staticPermis), plus un pas de eșantionare:
 * un șablon care își declară imaginea statică nu pică C10 pentru asta (interfața înghețată; proba-elemente).
 * Excepție: când `fundal` e `"filmare"`, keepsMoving nu se scrie deloc (HyperFrames nu vede mișcarea videoului).
 * @param {{durata: number, fundal?: string, segmente: object[]}} cronologie
 * @returns {null | {version: 1, assertions: object[]}}
 */
export function genereazaMotion(cronologie) {
  const cu = cronologie.segmente.filter((s) => Array.isArray(s.selectori) && s.selectori.length > 0);
  if (cu.length === 0) return null;
  const pas = pasEsantionare(cronologie.durata);
  const pana = (t) => rotunjeste(Math.min(cronologie.durata, t + pas));
  const assertions = [];
  for (const s of cu) {
    const primul = s.selectori[0];
    const ultimul = s.selectori[s.selectori.length - 1];
    assertions.push({ kind: 'appearsBy', selector: primul, bySec: pana(Math.min(s.start + START_PLUS, s.complet)) });
    if (ultimul !== primul) assertions.push({ kind: 'appearsBy', selector: ultimul, bySec: pana(s.complet) });
  }
  for (let i = 1; i < cu.length; i += 1) assertions.push({ kind: 'before', a: cu[i - 1].selectori[0], b: cu[i].selectori[0] });
  for (const s of cu) for (const selector of s.selectori) assertions.push({ kind: 'staysInFrame', selector });
  // Cu filmarea de fundal, HyperFrames nu vede mișcarea videoului (doar DOM-ul și GSAP), deci keepsMoving ar pica la
  // fiecare pauză a elementelor; înghețarea filmării o prind C14 (cadrul întreg, comparat cu sursa) și S10, la randarea completă.
  if (cronologie.fundal === 'filmare') return { version: 1, assertions };
  const permis = staticPermis(cronologie);
  assertions.push({ kind: 'keepsMoving', maxStaticSec: permis > STATIC_MAXIM ? rotunjeste(permis + pas) : STATIC_MAXIM });
  return { version: 1, assertions };
}
