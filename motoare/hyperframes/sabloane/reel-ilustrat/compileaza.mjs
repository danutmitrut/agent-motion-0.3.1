// compileaza.mjs: plan + stil + date → build/index.html, determinist, fără rețea (spec 7.1, harta 4.16 și 5.17).
// Funcție pură: nu citește și nu scrie pe disc. Primește conținutul lui sablon.html, al runtime-ului,
// CSS-ul fonturilor și activele înghețate (desene, iconițe) și înlocuiește marcajele din sablon.html
// într-o singură trecere, ca un text inserat să nu mai fie scanat după alte marcaje.
import { hexInRgb, limitaIntensitate, straturiCeata, escapeazaHtml, deschidereSvg, cssRoluri } from '../../../../nucleu/lib/sdk.mjs';

// Marcajul → de câte ori trebuie să apară în sablon.html.
const MARCAJE = Object.freeze({
  '/*MG_FONTURI*/': 1,
  '/*MG_CULORI*/': 1,
  '/*MG_ROLURI*/': 1,
  '{{MG_ATMOSFERA}}': 1,
  '{{MG_DURATA}}': 2,
  '<!--MG_SCENA-->': 1,
  '<!--MG_CARDURI-->': 1,
  '<!--MG_SEMNATURA-->': 1,
  '/*MG_LINIA*/': 1,
  '/*MG_DATE*/': 1,
  '/*MG_REGIZOR*/': 1,
  '<!--MG_AUDIO-->': 1,
});

// Culorile originale pe rol, pentru stil.recolorare = "original" (spec 8.4.2), după prefixul piesei.
const CULORI_ORIGINALE = Object.freeze({
  'od-': { '--linie': '#000000', '--accent': '#FF5678', '--accent2': '#CF536D' },
  'op-': { '--linie': '#000000', '--fundal': '#FFFFFF', '--accent': '#4F66AF' },
});

const ETICHETE_SVG = /<(path|rect|circle|line|polyline|polygon|ellipse)\b/g;

// Valorile din atribute și din text trec toate prin escapeazaHtml (nucleu/lib/html.mjs): compileaza nu se bazează pe schema
// sau pe plan ca să le filtreze (runda 1 B11).

// JSON sigur într-un <script>: '<' devine secvența \u003c, deci nici '</script>', nici '<!--' nu pot apărea.
function jsonInScript(valoare) {
  return JSON.stringify(valoare).replace(/</g, '\\u003c');
}

function rgba(hex, alfa) {
  const [r, g, b] = hexInRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

// Desparte <svg ...>interior</svg>; întoarce viewBox-ul (4 numere) și interiorul, fără învelișul cu xmlns.
// Rădăcina se găsește cu deschidereSvg (html.mjs), aceeași regulă cu ghilimele ca în normalizeazaSvg: un `>` dintr-o
// valoare a rădăcinii nu mută începutul interiorului (revizuirea transversală B01-B13, T11).
function despacheteazaSvg(text, eticheta) {
  const t = String(text).trim();
  const deschidere = deschidereSvg(t);
  const sfarsit = /<\/svg>\s*$/.exec(t);
  if (!deschidere || !sfarsit || sfarsit.index < deschidere.index + deschidere.tag.length) {
    throw new Error(`${eticheta}: activul nu e un SVG cu <svg>...</svg>.`);
  }
  const interior = t.slice(deschidere.index + deschidere.tag.length, sfarsit.index);
  const vb = /(?:^|\s)viewBox="([^"]+)"/.exec(deschidere.atribute);
  if (!vb) throw new Error(`${eticheta}: SVG-ul nu are viewBox.`);
  const numere = vb[1].trim().split(/[\s,]+/).map(Number);
  if (numere.length !== 4 || numere.some((n) => !Number.isFinite(n))) {
    throw new Error(`${eticheta}: viewBox invalid „${vb[1]}”.`);
  }
  return { viewBox: numere, continut: interior.trim() };
}

function desenePentruRuntime(plan, desene) {
  const rezultat = {};
  for (const id of [...new Set(plan.desene.map((d) => d.id))].sort()) {
    const activ = desene[id];
    if (!activ) throw new Error(`Lipsește activul înghețat pentru desenul ${id}.`);
    if (activ.tip === 'traseu') {
      const t = JSON.parse(activ.continut);
      rezultat[id] = { w: t.w, h: t.h, paths: t.paths };
    } else if (activ.tip === 'imagine') {
      // piesă raster proprie (spec 8.6): o formă cu un singur <image>, fără recolorare; planul îi dă animatie „aparitie”
      rezultat[id] = {
        viewBox: [0, 0, activ.w, activ.h],
        // w și h vin din cutie, în proprii/catalog-propriu.json (zona liberă): trec prin escapeazaHtml (T14)
        continut: `<image href="data:${activ.mime};base64,${activ.base64}" x="0" y="0" width="${escapeazaHtml(activ.w)}" height="${escapeazaHtml(activ.h)}" preserveAspectRatio="xMidYMid meet"/>`,
      };
    } else {
      rezultat[id] = despacheteazaSvg(activ.continut, id);
    }
  }
  return rezultat;
}

function interiorIconita(svg, nume) {
  return despacheteazaSvg(svg, `iconița ${nume}`).continut.replace(ETICHETE_SVG, '<$1 class="w"');
}

function atributeDesen(d, plan, stil) {
  const clase = [];
  if (d.panou === 'inversat') clase.push('inversat');
  if ((plan.panouri ?? []).some((p) => p.pentru === d.g)) clase.push('pe-panou');
  let atribute = clase.length > 0 ? ` class="${clase.join(' ')}"` : '';
  if (stil.recolorare === 'original' && d.tip === 'forma') {
    const prefix = Object.keys(CULORI_ORIGINALE).find((p) => d.id.startsWith(p));
    if (prefix) {
      const declaratii = Object.entries(CULORI_ORIGINALE[prefix]).map(([v, c]) => `${v}: ${c}`).join('; ');
      atribute += ` style="${declaratii}"`;
    }
  }
  return atribute;
}

// Straturile scenei, în ordinea scenelor; în aceeași scenă: desene, iconițe, rețele, linii.
function scena(plan, stil, iconite) {
  const elemente = [];
  const adauga = (scenaIndex, ordine, html) => elemente.push({ scenaIndex, ordine, html, i: elemente.length });
  for (const d of plan.desene) adauga(d.scena, 0, `<g id="${escapeazaHtml(d.g)}"${atributeDesen(d, plan, stil)}></g>`);
  for (const ic of plan.iconite) {
    const grupuri = ic.nume.map((nume) => {
      if (typeof iconite[nume] !== 'string') throw new Error(`Lipsește activul înghețat pentru iconița ${nume}.`);
      return `<g data-icon="${escapeazaHtml(nume)}">${interiorIconita(iconite[nume], nume)}</g>`;
    });
    adauga(ic.scena, 1, `<g id="${escapeazaHtml(ic.g)}">${grupuri.join('')}</g>`);
  }
  for (const r of plan.retele) adauga(r.scena, 2, `<g id="${escapeazaHtml(r.g)}"></g>`);
  for (const l of plan.linii) adauga(l.scena, 3, `<path id="${escapeazaHtml(l.id)}" class="${escapeazaHtml(l.clasa)}" d="${escapeazaHtml(l.d)}"/>`);
  elemente.sort((a, b) => a.scenaIndex - b.scenaIndex || a.ordine - b.ordine || a.i - b.i);
  return elemente.map((e) => `            ${e.html}`).join('\n');
}

function carduri(plan) {
  const linii = [];
  for (const c of plan.carduri) {
    let html = `        <div class="card" id="${escapeazaHtml(c.id)}">`;
    if (c.eticheta) html += `<div class="label">${escapeazaHtml(c.eticheta)}</div>`;
    if (c.cuvinte) {
      const cuvinte = c.cuvinte.map((w) => `<div class="h word">${escapeazaHtml(w.text)}</div>`).join('');
      html += `<div class="mask gap words" id="cuvinte-${escapeazaHtml(c.id)}" data-layout-allow-overflow>${cuvinte}</div>`;
    } else {
      // un card doar cu etichetă are randuri null: rămâne doar .label (L.card verifică elementele cu querySelector)
      (c.randuri ?? []).forEach((r, i) => {
        const clasaMasca = i === 0 ? 'mask gap' : 'mask';
        const clasaRand = r.accent ? 'h accent' : 'h';
        // marime (felia 4): px-ul ales de aplicaMarimi; fără el, rândul rămâne exact ca înainte
        // un rând rupt de aplicaMarimi: liniile într-un singur nod de text, despărțite de \n, cu white-space: pre-line,
        // ca rândul să rămână un singur text static pentru C17 (un <br> l-ar împărți în două noduri)
        const linii = c.rupturi?.[i] ?? [r.text];
        const marime = c.px > 0 ? ` style="font-size: ${Number(c.px)}px${linii.length > 1 ? '; white-space: pre-line' : ''}"` : '';
        const text = linii.map(escapeazaHtml).join('\n');
        html += `<div class="${clasaMasca}" data-layout-allow-overflow><div class="${clasaRand}"${marime}>${text}</div></div>`;
      });
    }
    linii.push(`${html}</div>`);
  }
  if (plan.cta) {
    linii.push(`        <div class="card" id="cta"><div class="mask" data-layout-allow-overflow><div class="h">${escapeazaHtml(plan.cta.text)}</div></div></div>`);
  }
  return linii.join('\n');
}

/**
 * CSS-ul rolurilor formelor în reel (umplerea și conturul fiecărui rol, din nucleu/lib/desen/roluri.mjs), cu inversarea
 * pe panouri: pe `inversat` fondul ia culoarea textului și cerneala pe a fundalului, iar petele (`pata`) un gri dintre ele;
 * pe `pe-panou` cerneala ia fundalul.
 * Exportat pentru testul de runtime (teste/integrare/runtime.test.mjs), care asamblează un build fără compileaza.
 * @returns {string}
 */
export function cssRoluriReel() {
  const indentare = '      ';
  return [
    cssRoluri({ prefix: '#art ', indentare }),
    cssRoluri({ prefix: '#art .inversat ', culori: { fond: 'var(--text)', ink: 'var(--fundal)' }, indentare }),
    // petele groase ale desenelor generate (clasa pata, după ink): gri, ca să nu dispară în fundal (felia 5)
    `${indentare}#art .inversat .pata { fill: color-mix(in srgb, var(--text) 50%, var(--fundal)); }`,
    cssRoluri({ prefix: '#art .pe-panou ', culori: { ink: 'var(--fundal)' }, indentare }),
  ].join('\n');
}

function culori(plan, stil) {
  const c = stil.culori;
  // A-Î2: straturile ceții (straturiCeata, A06; din brand, felia 4) la intensitatea pe care o măsoară C06; 1 pe noapte, 0,91 pe hartie.
  const intensitate = limitaIntensitate(c, 'ceata', { ceata: stil.ceata ?? null });
  const [ceataA, ceataB] = straturiCeata(c, stil.ceata ?? null).map(({ culoare, alfa }) =>
    rgba(culoare, Math.round(alfa * intensitate * 10000) / 10000));
  return [
    '      :root {',
    `        --fundal: ${c.fundal};`,
    `        --text: ${c.text};`,
    `        --atenuat: ${c.atenuat};`,
    `        --accent: ${c.accent};`,
    `        --linie: ${c.linie};`,
    `        --granulatie: ${plan.atmosfera.granulatie};`,
    `        --ceata-a: ${ceataA};`,
    `        --ceata-b: ${ceataB};`,
    `        --eticheta-spatiere: ${stil.eticheta.spatiere}em;`,
    '      }',
  ].join('\n');
}

// Regizorul, plus mișcarea lentă pe atmosfera „plin” (runtime/miscare-plin.js) doar când planul o cere:
// fără ea, build-ul rămâne byte cu byte cel de dinainte (golden-urile pe noapte și hartie).
function regizor(plan, runtime) {
  if (!plan.atmosfera.miscare) return runtime.regizor.trimEnd();
  if (typeof runtime.miscarePlin !== 'string') throw new Error('Planul cere mișcarea pe atmosfera „plin”, dar lipsește runtime/miscare-plin.js.');
  return `${runtime.regizor.trimEnd()}\n${runtime.miscarePlin.trimEnd()}`;
}

/**
 * @param {{ plan: object, stil: object, date: object, sablonHtml: string, runtime: {linia: string, regizor: string, miscarePlin?: string},
 *   fonturiCss: string, desene: Record<string, {tip: 'traseu'|'forma', continut: string}>, iconite: Record<string, string>, audio?: string }} p
 *   stil = valoriStil(StilRezolvat) (obiect plat); desene și iconite = conținutul activelor înghețate din active/;
 *   audio = elementul <audio> din elementAudio(cronologie) (sdk), pus în rădăcina compoziției, frate cu #stage; '' fără muzică,
 *   iar atunci marcajul dispare fără urmă și HTML-ul rămâne cel de dinainte de muzică, byte cu byte
 * @returns {string} conținutul lui build/index.html
 */
export function compileaza({ plan, stil, date, sablonHtml, runtime, fonturiCss, desene, iconite, audio = '' }) {
  if (date?.sablon !== 'reel-ilustrat') throw new TypeError('compileaza primește doar date ale șablonului reel-ilustrat.');
  for (const [marcaj, numar] of Object.entries(MARCAJE)) {
    const gasite = sablonHtml.split(marcaj).length - 1;
    if (gasite !== numar) throw new Error(`sablon.html are marcajul ${marcaj} de ${gasite} ori; trebuie ${numar}.`);
  }
  const date_ = `window.__MG_PLAN = ${jsonInScript(plan)};\nwindow.__MG_DESENE = ${jsonInScript(desenePentruRuntime(plan, desene))};`;
  const valori = {
    '/*MG_FONTURI*/': fonturiCss.trimEnd(),
    '/*MG_CULORI*/': culori(plan, stil),
    '/*MG_ROLURI*/': cssRoluriReel(),
    '{{MG_ATMOSFERA}}': escapeazaHtml(plan.atmosfera.mod),
    '{{MG_DURATA}}': escapeazaHtml(plan.durata),
    '<!--MG_SCENA-->': scena(plan, stil, iconite),
    '<!--MG_CARDURI-->': carduri(plan),
    '<!--MG_SEMNATURA-->': plan.semnatura ? escapeazaHtml(plan.semnatura.text) : '',
    '/*MG_LINIA*/': runtime.linia.trimEnd(),
    '/*MG_DATE*/': date_,
    '/*MG_REGIZOR*/': regizor(plan, runtime),
    '<!--MG_AUDIO-->': audio === '' ? '' : `\n      ${audio}`,
  };
  const tipar = new RegExp(Object.keys(MARCAJE).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return sablonHtml.replace(tipar, (m) => valori[m]);
}
