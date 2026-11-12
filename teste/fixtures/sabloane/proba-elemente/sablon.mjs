// Șablonul de probă cu elemente: a doua implementare de referință a interfeței din docs/interfete/sablon.md (planul E, E10).
// Datele nu au `scene`, ci `elemente`; șablonul folosește hook-urile opționale blocScenariu, verificariBuild și
// verificariProprii, iar segmentele cronologiei au `selectori` (M9).
// Importă doar module native, pentru că testele îl copiază într-o rădăcină temporară fără nucleu/.
// Erorile și rezultatele sunt obiecte simple, cu forma lui eroare() și rezultat() din nucleu; testul verifică forma.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Copie intenționată a lui rotunjeste din nucleu/lib/cronologie.mjs (valideazaCronologie din nucleu verifică rezultatul).
const rotunjeste = (x) => Math.round(x * 1000) / 1000;
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Forma lui rezultat() din nucleu/lib/verificari/index.mjs, ca obiect simplu. */
const rezultatSimplu = (cod, ok, { valoare = null, prag = null, camp = null, erori = [] } = {}) => ({
  cod, ok, valoare, prag, camp, erori, avertismente: [],
});

/**
 * Compoziția e statică: după ce textul e complet, imaginea stă pe loc până la finalul segmentului (C14 ar vedea
 * un îngheț de 2,5 s pe fiecare element). Ferestrele declară asta: `citire` de la complet la sfârșitul fiecărui segment,
 * iar pe ultimul segment `citire` se oprește la începutul pauzei finale, care e fereastra ei, `pauza-finala`.
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
  date.elemente.forEach((element, i) => {
    if (element.text.trim() === '') {
      erori.push({
        cod: 'valoare-invalida',
        camp: `elemente[${i}].text`,
        mesaj: `Elementul ${i + 1} are textul gol.`,
        sugestie: `Scrie textul în elemente[${i}].text sau șterge elementul.`,
      });
    }
  });
  return { erori, avertismente: [] };
}

/** Câte implicite.elemente.secunde_pe_element (3 s) pe element; textul complet stă static (ferestreStatice). */
export function cronologie(date, stil, ctx) {
  const { meta, implicite } = ctx.sablon;
  const format = date.format ?? 'vertical';
  const { latime, inaltime, zona_text: zonaText } = implicite.formate[format];
  const pas = implicite.elemente.secunde_pe_element;
  const completDupa = implicite.elemente.complet_dupa;
  const durata = rotunjeste(date.elemente.length * pas);

  const segmente = date.elemente.map((element, i) => ({
    ref: `Elementul ${i + 1}`,
    camp: `elemente[${i}]`,
    tip: 'text',
    start: rotunjeste(i * pas),
    complet: rotunjeste(i * pas + completDupa),
    sfarsit: rotunjeste((i + 1) * pas),
    zona_text: [...zonaText],
    texte: [element.text],
    selectori: [`#el-${i + 1}`],
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

/** Scrie build/index.html: o compoziție HyperFrames statică, fără timeline GSAP. */
export async function construieste(date, stil, cron, dirBuild, ctx) {
  const culoareText = stil.culori.text.valoare;
  const clipuri = cron.segmente.map((s, i) => {
    const [x, y, w, h] = s.zona_text;
    const durataClip = rotunjeste(s.sfarsit - s.start);
    return `<p id="el-${i + 1}" class="clip" data-start="${s.start}" data-duration="${durataClip}" data-track-index="0" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${escapeHtml(s.texte[0])}</p>`;
  });
  const html = [
    '<!DOCTYPE html>',
    '<html lang="ro">',
    '<head>',
    '<meta charset="UTF-8">',
    '<style>',
    `html,body{margin:0;width:${cron.latime}px;height:${cron.inaltime}px;background:${cron.fundal}}`,
    `.clip{position:absolute;margin:0;font:400 ${ctx.sablon.implicite.text.px}px sans-serif;line-height:1.1;color:${culoareText}}`,
    '</style>',
    '</head>',
    '<body>',
    `<div id="root" data-composition-id="main" data-no-timeline data-proba-elemente data-start="0" data-duration="${cron.durata}" data-width="${cron.latime}" data-height="${cron.inaltime}">`,
    ...clipuri,
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  mkdirSync(dirBuild, { recursive: true });
  writeFileSync(join(dirBuild, 'index.html'), html, 'utf8');
  return { intrare: 'index.html', fisiere: ['index.html'] };
}

/** Ce trebuie să apară în MP4, pentru verificările comune (harta 5.9). */
export function asteptari(cron) {
  return {
    texte: cron.segmente.map((s, i) => ({ ref: s.ref, camp: `elemente[${i}].text`, text: s.texte[0], t: s.complet, zona_text: [...s.zona_text] })),
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: cron.audio !== null, durata: cron.audio === null ? null : cron.audio.durata },
    fundal: cron.fundal,
  };
}

/** Blocul „Ce apare pe ecran” (M1): o linie pe element, cu fontul și greutatea din construieste (M7). */
export function blocScenariu(date, stil, cron, ctx) {
  return {
    texte: date.elemente.map((element, i) => ({
      ref: `Elementul ${i + 1}`,
      camp: `elemente[${i}].text`,
      eticheta: 'text',
      text: element.text,
      accent: false,
      separat: false,
      font: 'text',
      greutate: 400,
    })),
    stil: [`Elemente: ${date.elemente.length}`],
  };
}

/** S01 (stadiul build): index.html are atributul data-proba-elemente. */
export function verificariBuild(dirBuild, ctx) {
  const cale = join(dirBuild, 'index.html');
  const ok = existsSync(cale) && readFileSync(cale, 'utf8').includes('data-proba-elemente');
  return [rezultatSimplu('S01', ok, {
    prag: 'index.html are atributul data-proba-elemente',
    camp: ok ? null : 'build',
    erori: ok ? [] : [{
      cod: 'eroare-interna',
      camp: 'build',
      mesaj: 'build/index.html nu are atributul data-proba-elemente.',
      sugestie: 'E o problemă a șablonului de probă, nu a datelor.',
    }],
  })];
}

/** S02 (stadiul mp4): fișierul MP4 are mai mult de 0 octeți. */
export async function verificariProprii(mp4, ctx) {
  const octeti = existsSync(mp4) ? statSync(mp4).size : 0;
  const ok = octeti > 0;
  return [rezultatSimplu('S02', ok, {
    valoare: { octeti },
    prag: 'MP4-ul are mai mult de 0 octeți',
    camp: ok ? null : 'mp4',
    erori: ok ? [] : [{
      cod: 'mp4-invalid',
      camp: 'mp4',
      mesaj: 'MP4-ul e gol.',
      sugestie: 'Rulează din nou randarea completă.',
    }],
  })];
}
