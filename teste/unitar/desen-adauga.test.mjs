import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeazaSvg, adaugaPiesa } from '../../nucleu/lib/desen/adauga.mjs';
import { comandaDesen } from '../../nucleu/lib/desen/index.mjs';
import { principal } from '../../nucleu/mg.mjs';
import { sha256Text } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const SVG = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'svg');
const citeste = (nume) => readFileSync(join(SVG, nume), 'utf8');
const ETICHETE = ['cafea', 'cană', 'dimineață', 'pauză'];

/** Un PNG de 300x200: doar semnătura și antetul IHDR, cât citește adaugaPiesa. */
function scriePng(dir) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(300, 16);
  b.writeUInt32BE(200, 20);
  b[24] = 8;
  b[25] = 6;
  const cale = join(dir, 'sigla client.png');
  writeFileSync(cale, b);
  return cale;
}

test('un SVG cu <script> dă desen-svg-periculos', () => {
  const { svg, erori } = normalizeazaSvg(citeste('periculos-script.svg'));
  assert.equal(svg, '');
  assert.deepEqual(erori.map((e) => e.cod), ['desen-svg-periculos']);
  assert.equal(erori[0].camp, 'argumente.fisier');
});

test('un link extern dă desen-svg-periculos', () => {
  assert.deepEqual(normalizeazaSvg(citeste('link-extern.svg')).erori.map((e) => e.cod), ['desen-svg-periculos']);
});

test('un SVG fără viewBox dă desen-fara-viewbox', () => {
  assert.deepEqual(normalizeazaSvg(citeste('fara-viewbox.svg')).erori.map((e) => e.cod), ['desen-fara-viewbox']);
});

test('un SVG cu 3 culori primește clasele ink, acc și fond', () => {
  const { svg, culori, erori } = normalizeazaSvg(citeste('trei-culori.svg'));
  assert.deepEqual(erori, []);
  assert.deepEqual(culori, ['#1a1a1a', '#e4572e', '#ffffff']);
  assert.match(svg, /<rect class="fond"/);
  assert.match(svg, /<circle class="acc" cx="60" cy="50" r="30" style="opacity:0.9"\/>/);
  assert.match(svg, /<path class="ink-contur" d="M10 90/);
  assert.match(svg, /<path class="ink" d="M120 40/);
  assert.doesNotMatch(svg, /#1a1a1a|#E4572E|#FFFFFF|\sid=|<title|<desc|<!--|<\?xml/i);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 200 100">/);
});

test('peste 3 culori, piesa își păstrează culorile', () => {
  const { svg, culori } = normalizeazaSvg(citeste('patru-culori.svg'));
  assert.equal(culori.length, 4);
  assert.match(svg, /fill="#FF0000"/);
  assert.doesNotMatch(svg, /class=/);
});

test('o piesă fără licență dă desen-licenta-lipsa', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  await assert.rejects(adaugaPiesa(radacina, join(SVG, 'trei-culori.svg'), { licenta: '  ', etichete: ETICHETE }),
    (e) => e.eroareMg.cod === 'desen-licenta-lipsa' && e.codIesire === 3);
  assert.equal(existsSync(join(radacina, 'proprii', 'catalog-propriu.json')), false);
});

test('mai puțin de 4 etichete dă desen-etichete-putine', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  await assert.rejects(adaugaPiesa(radacina, join(SVG, 'trei-culori.svg'), { licenta: 'desenul meu', etichete: ['cafea', 'cană', 'cafea'] }),
    (e) => e.eroareMg.cod === 'desen-etichete-putine');
});

test('un SVG periculos nu intră în proprii/', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  await assert.rejects(adaugaPiesa(radacina, join(SVG, 'periculos-script.svg'), { licenta: 'desenul meu', etichete: ETICHETE }),
    (e) => e.eroareMg.cod === 'desen-svg-periculos' && e.codIesire === 1);
});

test('adaugă un SVG în proprii/forme și în catalog-propriu.json', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  const piesa = await adaugaPiesa(radacina, join(SVG, 'trei-culori.svg'), { licenta: 'desenul meu', etichete: ETICHETE });
  assert.equal(piesa.id, 'p-trei-culori');
  assert.equal(piesa.familie, 'proprie');
  assert.equal(piesa.fisier, 'forme/p-trei-culori.svg');
  assert.deepEqual(piesa.cutie, { w: 200, h: 100 });
  assert.deepEqual(piesa.roluri, ['ink', 'fond', 'acc']);
  assert.equal(piesa.recolorabil, true);
  const scris = readFileSync(join(radacina, 'proprii', 'forme', 'p-trei-culori.svg'), 'utf8');
  assert.equal(piesa.sha256, sha256Text(scris));
  assert.match(scris, /^<svg data-piesa="p-trei-culori" /);
  assert.ok(existsSync(join(radacina, 'proprii', 'originale', 'p-trei-culori.svg')));
  const catalog = JSON.parse(readFileSync(join(radacina, 'proprii', 'catalog-propriu.json'), 'utf8'));
  assert.deepEqual(catalog.piese.map((p) => p.id), ['p-trei-culori']);
  assert.equal(catalog.piese[0].licenta, 'desenul meu');
  await assert.rejects(adaugaPiesa(radacina, join(SVG, 'trei-culori.svg'), { licenta: 'desenul meu', etichete: ETICHETE }),
    (e) => e.eroareMg.cod === 'valoare-invalida' && e.eroareMg.camp === 'argumente.id');
});

test('cu faraMapare, SVG-ul își păstrează culorile și intră prin apariție', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  const piesa = await adaugaPiesa(radacina, join(SVG, 'trei-culori.svg'), { licenta: 'desenul meu', etichete: ETICHETE, faraMapare: true });
  assert.deepEqual(piesa.roluri, []);
  assert.equal(piesa.recolorabil, false);
  assert.equal(piesa.animatie.implicit, 'aparitie');
  const scris = readFileSync(join(radacina, 'proprii', 'forme', 'p-trei-culori.svg'), 'utf8');
  assert.match(scris, /fill:#E4572E/);
  assert.match(scris, /fill="#1a1a1a"/);
  assert.doesNotMatch(scris, /class="(ink|acc|fond)/);
  assert.deepEqual(normalizeazaSvg(citeste('trei-culori.svg'), { mapare: false }).culori, ['#1a1a1a', '#e4572e', '#ffffff']);
});

test('un PNG intră în proprii/imagini, fără recolorare', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  const piesa = await adaugaPiesa(radacina, scriePng(radacina), { licenta: 'cumpărat', etichete: ETICHETE });
  assert.equal(piesa.id, 'p-sigla-client');
  assert.equal(piesa.fisier, 'imagini/p-sigla-client.png');
  assert.deepEqual(piesa.cutie, { w: 300, h: 200 });
  assert.equal(piesa.recolorabil, false);
  assert.equal(piesa.animatie.implicit, 'aparitie');
});

test('o extensie necunoscută dă desen-format-neacceptat', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  await assert.rejects(adaugaPiesa(radacina, join(SVG, 'nu-exista.gif'), { licenta: 'x', etichete: ETICHETE }),
    (e) => e.eroareMg.cod === 'desen-format-neacceptat');
});

test('comandaDesen adauga împarte etichetele și întoarce piesa', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  const r = await comandaDesen({ radacina, sub: 'adauga', pozitionale: [join(SVG, 'trei-culori.svg')],
    optiuni: { licenta: 'desenul meu', etichete: 'cafea, cană,dimineață , pauză', id: 'p-cana' } });
  assert.equal(r.ok, true);
  assert.equal(r.rezultat.piesa.id, 'p-cana');
  assert.deepEqual(r.rezultat.piesa.etichete, ETICHETE);
  assert.equal(r.rezultat.arata, 'node nucleu/mg.mjs desen arata p-cana');
});

test('mg desen adauga prin CLI transmite --licenta, --etichete, --id și --fara-mapare', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  const cod = await principal(['desen', 'adauga', join(SVG, 'trei-culori.svg'), '--licenta', 'desenul meu',
    '--etichete', 'cafea,cană,dimineață,pauză', '--id', 'p-din-cli', '--fara-mapare', '--json'], { radacina, stdout });
  assert.equal(cod, 0, iesire);
  const json = JSON.parse(iesire);
  assert.equal(json.ok, true);
  assert.equal(json.rezultat.piesa.id, 'p-din-cli');
  assert.equal(json.rezultat.piesa.licenta, 'desenul meu');
  assert.deepEqual(json.rezultat.piesa.etichete, ETICHETE);
  assert.equal(json.rezultat.piesa.recolorabil, false);
});

test('un SVG fără închidere, sau cu BOM, e tratat fără excepție', () => {
  const trunchiat = normalizeazaSvg('<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/>');
  assert.deepEqual(trunchiat.erori.map((e) => e.cod), ['desen-format-neacceptat']);
  const cuBom = normalizeazaSvg('﻿<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="#000"/></svg>');
  assert.deepEqual(cuBom.erori, []);
  assert.match(cuBom.svg, /^<svg viewBox="0 0 10 10"><path class="ink" /);
});

const invelis = (interior, radacina = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">') => `${radacina}${interior}</svg>`;
const coduriDin = (svg) => normalizeazaSvg(svg).erori.map((e) => e.cod);

test('refuză ocolirile filtrului de SVG periculos (I1)', () => {
  const cazuri = {
    'atribut de eveniment după /': [invelis('<g/onclick="alert(1)"><path d="M0 0h1v1z"/></g>'), /onclick/],
    'atribut de eveniment după ghilimea': [invelis('<path d="M0 0h1v1z"onmouseover="alert(1)"/>'), /onmouseover/],
    'atribut de eveniment cu prefix': [invelis('<path d="M0 0h1v1z" x:onload="alert(1)"/>'), /x:onload/],
    'element cu prefix de spațiu de nume': [invelis('<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>'), /s:script/],
    'href cu alt prefix, extern': [invelis('<g x:href="https://exemplu.ro/a.svg#a"/>', '<svg xmlns:x="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'), /link extern/],
    'href fără ghilimele, extern': [invelis('<use href=https://exemplu.ro/a.svg#a />'), /link extern/],
    'url() extern într-un style': [invelis('<path d="M0 0h1v1z" style="fill:url(https://exemplu.ro/p.svg#g)"/>'), /url\(\)/],
    'url() extern într-un atribut': [invelis('<path d="M0 0h1v1z" fill="url(\'https://exemplu.ro/p.svg#g\')"/>'), /url\(\)/],
    'element img': [invelis('<img src="https://exemplu.ro/t.gif"/>'), /<img>/],
    'element a': [invelis('<a><path d="M0 0h1v1z"/></a>'), /<a>/],
    'element animate': [invelis('<path d="M0 0h1v1z"><animate attributeName="d" to="M0 0"/></path>'), /<animate>/],
    'element iframe': [invelis('<iframe src="x"></iframe>'), /<iframe>/],
    'atribut ascuns într-o valoare cu >': [invelis('<path d="M0 0h1v1z" data-x=">" onclick="alert(1)"/>'), /onclick/],
    'caracter de scăpare CSS': [invelis('<path d="M0 0h1v1z" style="fill:\\75rl(https://exemplu.ro/p.svg)"/>'), /scăpare/],
    'entitate numerică în atribut': [invelis('<path d="M0 0h1v1z" fill="&#117;rl(https://exemplu.ro/p.svg)"/>'), /referință de caracter/],
  };
  for (const [nume, [svg, motiv]] of Object.entries(cazuri)) {
    const { erori, svg: iesire } = normalizeazaSvg(svg);
    assert.deepEqual(erori.map((e) => e.cod), ['desen-svg-periculos'], nume);
    assert.match(erori[0].mesaj, motiv, nume);
    assert.equal(iesire, '', nume);
  }
});

test('un SVG de Inkscape, cu sodipodi:namedview și defs gol, trece curat', () => {
  const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
    + 'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" width="10mm" height="10mm" viewBox="0 0 10 10">'
    + '<sodipodi:namedview id="base" pagecolor="#ffffff"><inkscape:grid id="g1"/></sodipodi:namedview><defs id="defs1"/>'
    + '<metadata id="m"><rdf:RDF><rdf:Work rdf:about=""/></rdf:RDF></metadata><g id="g"><path d="M0 0h10v10H0z" fill="#112233"/></g></svg>';
  const { svg: iesire, erori, culori } = normalizeazaSvg(svg);
  assert.deepEqual(erori, []);
  assert.deepEqual(culori, ['#112233']);
  assert.doesNotMatch(iesire, /sodipodi:namedview|inkscape:grid|metadata|rdf:|\sid=|\swidth=/);
  assert.match(iesire, /<defs\/>/);
  assert.match(iesire, /<path class="ink" d="M0 0h10v10H0z"\/>/);
});

test('o referință internă, cu orice prefix de href sau url(#...), dă desen-format-neacceptat (I2)', () => {
  assert.deepEqual(coduriDin(invelis('<defs><path id="a" d="M0 0h1v1z"/></defs><use xlink:href="#a"/>')), ['desen-format-neacceptat']);
  assert.deepEqual(coduriDin(invelis('<defs><path id="a" d="M0 0h1v1z"/></defs><use href=#a />')), ['desen-format-neacceptat']);
  assert.deepEqual(coduriDin(invelis('<path d="M0 0h1v1z" fill="url(#g)"/>')), ['desen-format-neacceptat']);
  assert.deepEqual(coduriDin(invelis('<style>.a{fill:red}</style><path d="M0 0h1v1z"/>')), ['desen-format-neacceptat']);
});

test('comentariile se scot înaintea tuturor verificărilor (I3)', () => {
  const inainte = normalizeazaSvg('<!-- vechi </svg> --><svg viewBox="0 0 1 1"><path d="M0 0h1v1z" fill="#000"/></svg>');
  assert.deepEqual(inainte.erori, []);
  assert.match(inainte.svg, /^<svg viewBox="0 0 1 1"><path class="ink" d="M0 0h1v1z"\/><\/svg>\n$/);
  const inauntru = normalizeazaSvg('<svg viewBox="0 0 1 1"><!-- </svg> --><path d="M0 0h1v1z" fill="#000"/></svg>');
  assert.deepEqual(inauntru.erori, []);
  assert.match(inauntru.svg, /<path class="ink" d="M0 0h1v1z"\/><\/svg>\n$/);
  const imbricat = normalizeazaSvg('<svg viewBox="0 0 2 2"><svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg><path d="M1 1h1v1z"/></svg>');
  assert.deepEqual(imbricat.erori, []);
  assert.match(imbricat.svg, /M1 1h1v1z/);
  assert.deepEqual(coduriDin('<!-- <svg viewBox="0 0 1 1"></svg> -->'), ['desen-format-neacceptat']);
  assert.deepEqual(coduriDin('</svg><svg viewBox="0 0 1 1">'), ['desen-format-neacceptat']);
  assert.deepEqual(coduriDin('<svg viewBox="0 0 1 1"><path d="M0 0"/>'), ['desen-format-neacceptat']);
});

test('un fișier care lipsește dă fisier-necitibil, nu eroare internă (I4)', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  for (const nume of ['nu-exista.svg', 'nu-exista.png']) {
    await assert.rejects(adaugaPiesa(radacina, join(radacina, nume), { licenta: 'x', etichete: ETICHETE }),
      (e) => e.eroareMg.cod === 'fisier-necitibil' && e.codIesire === 1, nume);
  }
  assert.equal(existsSync(join(radacina, 'proprii', 'catalog-propriu.json')), false);
});

test('un SVG salvat în UTF-16 dă fisier-utf16, prin citesteText (I4)', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true });
  t.after(curata);
  const cale = join(radacina, 'utf16.svg');
  writeFileSync(cale, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<svg viewBox="0 0 1 1"></svg>', 'utf16le')]));
  await assert.rejects(adaugaPiesa(radacina, cale, { licenta: 'x', etichete: ETICHETE }), (e) => e.eroareMg.cod === 'fisier-utf16');
});

// Revizuirea transversală B01-B13, T11: un „>” într-o valoare între ghilimele a rădăcinii nu mai iese ca marcaj.
const SVG_RADACINA_OSTILA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" aria-label="><image href=x onerror=alert(1)>">'
  + '<path d="M0 0 L10 10" fill="#000"/></svg>';

test('T11: valorile atributelor ies escapate cu escapeazaHtml, deci „>” din rădăcină nu deschide un tag', () => {
  const { svg, erori } = normalizeazaSvg(SVG_RADACINA_OSTILA);
  assert.deepEqual(erori, []);
  assert.ok(svg.includes(' aria-label="&gt;&lt;image href=x onerror=alert(1)&gt;"'), svg);
  assert.ok(!svg.includes('<image'), svg);
  // o entitate permisă din sursă nu se escapează a doua oară, iar apostroful iese și el neutralizat
  const entitati = normalizeazaSvg(`<svg viewBox="0 0 1 1" aria-label="a &amp; b" data-x='c"d'><path d="M0 0h1v1z"/></svg>`);
  assert.deepEqual(entitati.erori, []);
  assert.ok(entitati.svg.includes(' aria-label="a &amp; b" data-x="c&quot;d"'), entitati.svg);
});

// T15: textul dintr-un desen propriu ar ajunge pe ecran fără C03, C05 și fără aprobarea cursantului (C08).
for (const [nume, svg] of [
  ['text', '<svg viewBox="0 0 100 100"><path d="M0 0 L10 10"/><text x="10" y="50">Ofertă</text></svg>'],
  ['tspan', '<svg viewBox="0 0 100 100"><text x="10" y="50"><tspan>Ofertă</tspan></text></svg>'],
  ['textPath', '<svg viewBox="0 0 100 100"><textPath>Ofertă</textPath></svg>'],
]) {
  test(`T15: un SVG cu <${nume}> e refuzat cu desen-format-neacceptat și cu sfatul de a-l transforma în contururi`, () => {
    const r = normalizeazaSvg(svg);
    assert.equal(r.svg, '');
    assert.equal(r.erori.length, 1);
    assert.equal(r.erori[0].cod, 'desen-format-neacceptat');
    assert.match(r.erori[0].mesaj, /conține text/);
    assert.match(r.erori[0].mesaj, /date\.json/);
    assert.match(r.erori[0].sugestie, /contururi/);
  });
}
