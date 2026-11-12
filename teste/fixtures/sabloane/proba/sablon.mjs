// Șablonul de probă: implementarea minimă a interfeței din docs/interfete/sablon.md (harta 4.16).
// Importă doar module native, pentru că testele îl copiază într-o rădăcină temporară fără nucleu/.
// Un șablon real (reel-ilustrat) construiește erorile cu eroare() din nucleu/lib/erori.mjs;
// aici erorile au aceeași formă, iar testul verifică faptul că fiecare cod există în CODURI.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Copie intenționată a lui rotunjeste din nucleu/lib/cronologie.mjs: testele copiază șablonul într-o rădăcină temporară fără nucleu/.
// valideazaCronologie din nucleu verifică rezultatul, deci o abatere a copiei ar fi prinsă.
const rotunjeste = (x) => Math.round(x * 1000) / 1000;
const faraAccent = (rand) => rand.replaceAll('*', '');
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * Compoziția e statică: după ce textul e complet, imaginea stă pe loc până la finalul segmentului (C14 ar vedea
 * un îngheț de 2,5 s pe fiecare scenă). Ferestrele declară asta: `citire` de la complet la sfârșitul fiecărui segment,
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

/**
 * Câte implicite.scene.secunde_pe_scena (3 s) pe scenă; textul complet după complet_dupa (0,5 s); textul complet stă static (ferestreStatice).
 * ctx.sablon e SablonIncarcat (folosește meta.fps și implicite).
 */
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

/** Scrie build/index.html: o compoziție HyperFrames statică, fără timeline GSAP. */
export async function construieste(date, stil, cron, dirBuild, ctx) {
  const culoareText = stil.culori.text.valoare;
  const clipuri = cron.segmente.map((s, i) => {
    const [x, y, w, h] = s.zona_text;
    const durataClip = rotunjeste(s.sfarsit - s.start);
    const text = s.texte.map(escapeHtml).join('<br>');
    return `<p id="scena-${i + 1}" class="clip" data-start="${s.start}" data-duration="${durataClip}" data-track-index="0" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${text}</p>`;
  });
  const html = [
    '<!DOCTYPE html>',
    '<html lang="ro">',
    '<head>',
    '<meta charset="UTF-8">',
    '<style>',
    `html,body{margin:0;width:${cron.latime}px;height:${cron.inaltime}px;background:${cron.fundal}}`,
    `.clip{position:absolute;margin:0;font:700 ${ctx.sablon.implicite.titlu.px}px sans-serif;line-height:1.1;color:${culoareText}}`,
    '</style>',
    '</head>',
    '<body>',
    `<div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="${cron.durata}" data-width="${cron.latime}" data-height="${cron.inaltime}">`,
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
    texte: cron.segmente.flatMap((s) => s.texte.map((text) => ({ ref: s.ref, text, t: s.complet, zona_text: [...s.zona_text] }))),
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: cron.audio !== null, durata: cron.audio === null ? null : cron.audio.durata },
    fundal: cron.fundal,
  };
}
