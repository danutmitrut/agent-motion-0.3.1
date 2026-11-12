// compileaza.mjs: plan + stil → build/index.html, determinist, fără rețea (spec 7.2, docs/interfete/sablon.md).
// Funcție pură: nu citește și nu scrie pe disc. Primește conținutul lui index.src.html, al runtime-ului, CSS-ul fonturilor
// și sigla, și înlocuiește marcajele într-o singură trecere, ca un text inserat să nu mai fie scanat după alte marcaje.
// Pozițiile, mărimile și piesele vin din plan (asezare.mjs); aici doar se scriu, cu fiecare text prin escapeazaHtml.
import { hexInRgb, limitaIntensitate, straturiCeata, stopuriDegrade, escapeazaHtml } from '../../../../nucleu/lib/sdk.mjs';

// Marcajul → de câte ori trebuie să apară în index.src.html.
const MARCAJE = Object.freeze({
  '/*MG_FONTURI*/': 1,
  '/*MG_VARIABILE*/': 1,
  '/*MG_ROLURI*/': 1,
  '{{MG_CLASE}}': 1,
  '{{MG_DURATA}}': 2,
  '{{MG_LATIME}}': 4,
  '{{MG_INALTIME}}': 4,
  '<!--MG_SCENE-->': 1,
  '<!--MG_AUDIO-->': 1,
  '/*MG_MISCARI*/': 1,
  '/*MG_DATE*/': 1,
  '/*MG_REGIZOR*/': 1,
});

const BIFA = 'M4 12.5L9.5 18L20 6.5';

// JSON sigur într-un <script>: '<' devine \u003c, deci nici '</script>', nici '<!--' nu pot apărea.
function jsonInScript(valoare) {
  return JSON.stringify(valoare).replace(/</g, '\\u003c');
}

function rgba(hex, alfa) {
  const [r, g, b] = hexInRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

const alfa4 = (x) => Math.round(x * 10000) / 10000;

function variabile(plan, stil) {
  const c = stil.culori;
  // ceața și degradeul la intensitatea pe care o măsoară C06 (limitaIntensitate), ca în reel (A-Î2)
  const intensitateCeata = limitaIntensitate(c, 'ceata', { ceata: stil.ceata ?? null });
  const [ceataA, ceataB] = straturiCeata(c, stil.ceata ?? null).map(({ culoare, alfa }) => rgba(culoare, alfa4(alfa * intensitateCeata)));
  const stopuri = stopuriDegrade(c);
  const intensitateDegrade = limitaIntensitate(c, 'degrade', { stopuri });
  const [degradeA, degradeB] = stopuri.map((s) => rgba(s, alfa4(intensitateDegrade)));
  return [
    '      :root {',
    `        --w: ${plan.latime}px;`,
    `        --h: ${plan.inaltime}px;`,
    `        --fundal: ${c.fundal};`,
    `        --text: ${c.text};`,
    `        --atenuat: ${c.atenuat};`,
    `        --accent: ${c.accent};`,
    `        --granulatie: ${plan.atmosfera.granulatie};`,
    `        --ceata-a: ${ceataA};`,
    `        --ceata-b: ${ceataB};`,
    `        --degrade-a: ${degradeA};`,
    `        --degrade-b: ${degradeB};`,
    `        --eticheta-spatiere: ${stil.eticheta?.spatiere ?? 0}em;`,
    '      }',
  ].join('\n');
}

/**
 * CSS-ul rolurilor de mărime, din implicite.json: fontul, greutatea, înălțimea rândului, spațierea și culoarea fiecărui rol.
 * font-size nu stă aici: e scris pe fiecare bloc (spec 7.2, „font-size scris explicit în HTML”).
 */
export function cssRoluriText(implicite, greutateTitlu) {
  const linii = [];
  for (const [nume, R] of Object.entries(implicite.roluri)) {
    const font = R.font === 'titlu' ? 'var(--font-titlu)' : 'var(--font-text)';
    const greutate = R.font === 'titlu' ? greutateTitlu : R.greutate;
    const culoare = nume === 'cifra' ? 'var(--accent)' : nume === 'mic' ? 'var(--atenuat)' : 'var(--text)';
    const cifre = nume === 'cifra' ? ' font-variant-numeric: tabular-nums;' : '';
    linii.push(`      .${nume} { font-family: ${font}; font-weight: ${greutate}; line-height: ${R.inaltime_rand}; letter-spacing: ${R.spatiere}em; color: ${culoare};${cifre} }`);
  }
  linii.push(
    '      .eticheta { letter-spacing: var(--eticheta-spatiere); }',
    '      .cta { color: var(--accent); }',
    `      .punct + .punct { margin-top: ${implicite.spatii.puncte}px; }`,
  );
  return linii.join('\n');
}

// `suprapus`: cuvintele blocului „cuvinte” stau în același loc și se schimbă pe loc, deci verificatorul de layout al
// HyperFrames (care citește atributul doar de pe elementul cu text) trebuie să știe că suprapunerea e intenționată.
function htmlParti(parti, suprapus = false) {
  const atribut = suprapus ? ' data-layout-allow-overlap' : '';
  return parti.map((p) => (p.tip === 'spatiu'
    ? escapeazaHtml(p.text)
    : `<span class="p${p.accent ? ' accent' : ''}" id="${escapeazaHtml(p.id)}"${atribut}>${escapeazaHtml(p.text)}</span>`)).join('');
}

function htmlRand(r, masca, suprapus = false) {
  const rand = `<div class="rand" id="${escapeazaHtml(r.id)}">${htmlParti(r.parti, suprapus)}</div>`;
  return masca ? `<div class="masca" data-layout-allow-overflow>${rand}</div>` : rand;
}

function htmlPunct(r, bloc) {
  const marcaj = bloc.marcaj === 'bife'
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path id="${escapeazaHtml(r.marcajId)}" pathLength="1" d="${BIFA}"/></svg>`
    : `${r.punct}.`;
  return `<div class="punct" id="${escapeazaHtml(r.id)}"><span class="marcaj" style="width:${bloc.marcajW}px;margin-right:${bloc.gol}px">${marcaj}</span><span class="rand">${htmlParti(r.parti)}</span></div>`;
}

function htmlBloc(b, sigla) {
  if (b.fel === 'sigla') {
    if (!sigla) throw new Error('Planul are sigla, dar compileaza nu a primit conținutul ei.');
    return `<img id="sigla" class="bloc" src="data:${escapeazaHtml(sigla.mime)};base64,${sigla.base64}" width="${b.w}" height="${b.h}" style="left:${b.x}px;top:${b.y}px" alt="">`;
  }
  const clase = ['bloc', b.rol];
  if (b.fel === 'eticheta' || b.fel === 'cta' || b.fel === 'lista' || b.fel === 'cuvinte') clase.push(b.fel);
  let stil = `left:${b.x}px;top:${b.y}px;width:${b.w}px;font-size:${b.marime}px`;
  if (b.fel === 'cuvinte') stil += `;height:${b.h}px`;
  const interior = b.fel === 'lista'
    ? b.randuri.map((r) => htmlPunct(r, b)).join('')
    : b.randuri.map((r) => htmlRand(r, b.masca, b.fel === 'cuvinte')).join('');
  return `<div class="${clase.join(' ')}" id="${escapeazaHtml(b.id)}" style="${stil}">${interior}</div>`;
}

function htmlScene(plan, sigla) {
  return plan.scene.map((s) => [
    `          <div class="scena" id="${escapeazaHtml(s.id)}">`,
    ...s.blocuri.map((b) => `            ${htmlBloc(b, sigla)}`),
    '          </div>',
  ].join('\n')).join('\n');
}

/**
 * @param {{ plan: object, stil: object, date: object, sablonHtml: string, runtime: {miscari: string, regizor: string},
 *   fonturiCss: string, implicite: object, greutateTitlu: number, sigla?: {mime: string, base64: string}|null, audio?: string }} p
 *   stil = valoriStil(StilRezolvat); audio = elementAudio(cronologie) din sdk ('' fără muzică: marcajul dispare fără urmă)
 * @returns {string} conținutul lui build/index.html
 */
export function compileaza({ plan, stil, date, sablonHtml, runtime, fonturiCss, implicite, greutateTitlu, sigla = null, audio = '' }) {
  if (date?.sablon !== 'text-animat') throw new TypeError('compileaza primește doar date ale șablonului text-animat.');
  for (const [marcaj, numar] of Object.entries(MARCAJE)) {
    const gasite = sablonHtml.split(marcaj).length - 1;
    if (gasite !== numar) throw new Error(`index.src.html are marcajul ${marcaj} de ${gasite} ori; trebuie ${numar}.`);
  }
  const valori = {
    '/*MG_FONTURI*/': fonturiCss.trimEnd(),
    '/*MG_VARIABILE*/': variabile(plan, stil),
    '/*MG_ROLURI*/': cssRoluriText(implicite, greutateTitlu),
    '{{MG_CLASE}}': escapeazaHtml(`${plan.atmosfera.mod} ${plan.aliniere}`),
    '{{MG_DURATA}}': escapeazaHtml(plan.durata),
    '{{MG_LATIME}}': escapeazaHtml(plan.latime),
    '{{MG_INALTIME}}': escapeazaHtml(plan.inaltime),
    '<!--MG_SCENE-->': htmlScene(plan, sigla),
    '<!--MG_AUDIO-->': audio === '' ? '' : `\n      ${audio}`,
    '/*MG_MISCARI*/': runtime.miscari.trimEnd(),
    '/*MG_DATE*/': `window.__MG_PLAN = ${jsonInScript(plan)};`,
    '/*MG_REGIZOR*/': runtime.regizor.trimEnd(),
  };
  const tipar = new RegExp(Object.keys(MARCAJE).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return sablonHtml.replace(tipar, (m) => valori[m]);
}
