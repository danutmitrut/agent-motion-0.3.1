// Adaptorul HyperFrames (planul I, decizia 3): codul HyperFrames mutat neschimbat din randeaza/index.mjs.
// check (C10) și C17 pe build/index.html, schița (check la tranziții, instantanee, foaia), randarea cu o singură
// reluare cu --low-memory-mode și ștergerea lui .cache după randarea completă.
import { join } from 'node:path';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { existaFisier, scrieJsonAtomic, stergeRecursiv } from '../fisiere.mjs';
import { ultimeleRanduri } from '../ffmpeg.mjs';
import { foaieDinInstantanee } from '../foaie.mjs';
import { checkJson, ruleazaHyperframes } from '../motor-hf.mjs';
import { verificaBuild } from '../verificari/build.mjs';

const CATEGORII_CHECK = Object.freeze(['lint', 'runtime', 'layout', 'motion', 'contrast']);

/** Rezumatul lui check --json pentru rezultatul comenzii: ok, numărul de erori și avertismente, găsirile pe scurt. */
export function rezumatCheck(check) {
  const gasiri = CATEGORII_CHECK.flatMap((categorie) => (check?.[categorie]?.findings ?? []).map((f) => ({
    categorie, severitate: f.severity, cod: f.code, mesaj: f.message,
  })));
  return {
    ok: check?.ok === true,
    la_tranzitii: true,
    erori: gasiri.filter((g) => g.severitate === 'error').length,
    avertismente: gasiri.filter((g) => g.severitate !== 'error').length,
    gasiri,
  };
}

const GIB = 1024 ** 3;
// spec 9.3 și tabelul de riscuri: sub 12 GB RAM, mai puține procese de randare (același prag ca mesajul din mg doctor, A13)
const PRAG_MEMORIE = 12 * GIB;
// fiecare worker HyperFrames pornește un Chrome de ~256 MB (render --help pe 0.8.96); 2 e alegere tehnică (B-Î1), nu din spec
const WORKERI_MEMORIE_MICA = 2;

/**
 * Argumentele de paralelism pentru prima randare: sub prag, --workers 2; altfel nimic (HyperFrames alege auto).
 * @param {number} memorieTotala octeți
 * @returns {string[]}
 */
export function argumenteWorkeri(memorieTotala) {
  return memorieTotala < PRAG_MEMORIE ? ['--workers', String(WORKERI_MEMORIE_MICA)] : [];
}

/**
 * Opțiunile lui ruleazaHyperframes pentru `render`: fără cwd (rădăcina, T9) și fără reîncercările automate la EBUSY,
 * ca singura reluare să fie cea cu --low-memory-mode (spec 7.1), nu până la 4 randări de 15 minute pe încercare.
 * @param {string} radacina
 * @param {{ffmpeg: string, ffprobe: string}} ff
 */
export function optiuniRender(radacina, ff) {
  return { radacina, ff, reincercariEbusy: 0 };
}

/**
 * Argumentele lui render: cele fixate de nucleu, apoi motor.randare.argumente ale șablonului (planul H, decizia 13).
 * @param {{build: string, iesire: string, fps: number, motor?: {randare?: {argumente: string[]}}}} p
 * @returns {string[]}
 */
export function argumenteRandare({ build, iesire, fps, motor }) {
  return ['render', build, '-o', iesire, '--quality', 'looks', '--fps', String(fps), '--strict', '--quiet', ...(motor?.randare?.argumente ?? [])];
}

export const adaptorHyperframes = Object.freeze({
  nume: 'hyperframes',
  eticheta: 'HyperFrames',
  camp: 'mediu.hyperframes',
  descriereReluare: '--low-memory-mode',

  /** C10 (hyperframes check, cu argumentele șablonului) și C17 (textele statice din build/index.html). */
  async verificaBuild({ radacina, cai, construit, asteptari, versiuni }) {
    // folderul curent rămâne rădăcina (implicit): build/ se șterge la următoarea rulare, iar pe Windows un folder
    // curent al lui Chrome (pornit de hyperframes) nu se poate șterge (T9)
    const check = await checkJson(cai.build, { radacina, argumente: construit?.motor?.check?.argumente ?? [] });
    return verificaBuild({ dirBuild: cai.build, asteptari, check, versiuni });
  },

  /** check --json --at-transitions pe build/, instantaneele la `momente` în dirInstantanee și foaia schiței din ele. */
  async schita({ radacina, proiect, cai, construit, dirInstantanee, momente, iesireJpg, iesireJson, ff }) {
    // fără cwd: build/ se șterge la următoarea rulare, iar pe Windows un folder curent al lui Chrome nu se poate șterge (T9)
    const optiuni = { radacina, ff };
    // check la fiecare început și sfârșit de tween (plus mijlocul segmentelor)
    const check = await checkJson(cai.build, { ...optiuni, laTranzitii: true, argumente: construit?.motor?.check?.argumente ?? [] });
    const rezumat = rezumatCheck(check);
    const instantanee = await ruleazaHyperframes(
      ['snapshot', cai.build, '--at', momente.map((m) => m.t).join(','), '--no-end', '--describe', 'false', '-o', dirInstantanee],
      optiuni,
    );
    if (instantanee.cod !== 0) {
      throw new EroareFatala(
        eroare(
          'motor-esuat',
          'mediu.hyperframes',
          `Instantaneele schiței au eșuat: ${ultimeleRanduri(instantanee.stderr)}`,
          `Rulează din nou node nucleu/mg.mjs randeaza ${proiect} --schita; dacă eroarea se repetă, rulează node nucleu/mg.mjs doctor.`,
        ),
        COD_IESIRE.MEDIU,
      );
    }
    scrieJsonAtomic(join(dirInstantanee, 'check.json'), check);
    const { celule } = await foaieDinInstantanee({ dirInstantanee, momente, iesireJpg, iesireJson, ff, proiect });
    return { check: rezumat, celule };
  },

  /** render looks în `iesire`; la eșec, o singură reluare cu --low-memory-mode (spec 7.1). */
  async randeaza({ radacina, cai, construit, cronologie, iesire, ff, memorieTotala }) {
    const argumente = argumenteRandare({ build: cai.build, iesire, fps: cronologie.fps, motor: construit?.motor });
    const optiuni = optiuniRender(radacina, ff);
    let incercare = await ruleazaHyperframes([...argumente, ...argumenteWorkeri(memorieTotala)], optiuni);
    let reluat = false;
    if (incercare.cod !== 0 || !existaFisier(iesire)) {
      reluat = true;
      stergeRecursiv(iesire);
      // --low-memory-mode fixează singur un worker, deci reluarea nu mai trimite --workers
      incercare = await ruleazaHyperframes([...argumente, '--low-memory-mode'], optiuni);
    }
    return { ok: incercare.cod === 0 && existaFisier(iesire), reluat, stderr: incercare.stderr };
  },

  /** .cache (--frames-cache-dir al șablonului) se șterge pe orice drum al randării complete (planul H). */
  curata(cai) {
    stergeRecursiv(cai.cache);
  },
});
