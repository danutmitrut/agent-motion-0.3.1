import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SDK = path.join(REPO, 'nucleu', 'lib', 'sdk.mjs');
const NUCLEU = path.join(REPO, 'nucleu') + path.sep;
const SARITE = new Set(['teste', 'node_modules', 'vendor']);

function fisiereCod(dir) {
  const iesire = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) {
      if (!SARITE.has(d.name)) iesire.push(...fisiereCod(path.join(dir, d.name)));
    } else if (/\.(mjs|js)$/.test(d.name)) iesire.push(path.join(dir, d.name));
  }
  return iesire;
}

// import ... from '...'; export ... from '...'; import '...'; import('...')
const SPECIFICATORI = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

test('M8: din motoare/, singurul import din nucleu/ e nucleu/lib/sdk.mjs', () => {
  const gresite = [];
  for (const fisier of fisiereCod(path.join(REPO, 'motoare'))) {
    const text = fs.readFileSync(fisier, 'utf8');
    for (const [, spec] of text.matchAll(SPECIFICATORI)) {
      if (!spec.startsWith('.')) continue;
      const tinta = path.resolve(path.dirname(fisier), spec);
      if (tinta.startsWith(NUCLEU) && tinta !== SDK) gresite.push(`${path.relative(REPO, fisier)} → ${spec}`);
    }
  }
  assert.deepEqual(gresite, []);
});

test('M8: lista exporturilor din sdk.mjs e cea înghețată (o schimbare aici e o schimbare de interfață)', async () => {
  const sdk = await import(pathToFileURL(SDK).href);
  assert.deepEqual(Object.keys(sdk).sort(), [
    'COD_IESIRE',
    'CUVINTE_SCURTE',
    'EroareFatala',
    'STRATURI_CEATA',
    'audioCronologie',
    'avertisment',
    'caleFisierPiesa',
    'citesteTabel',
    'citesteText',
    'copiazaFontBrand',
    'copiazaFonturi',
    'cssFontFace',
    'cssFontFaceBrand',
    'cssRoluri',
    'decupare',
    'deschidereSvg',
    'elementAudio',
    'eroare',
    'escapeazaHtml',
    'esteFontBrand',
    'existaFisier',
    'familieCss',
    'filtruDecupare',
    'gasestePiesa',
    'grafeme',
    'hexInRgb',
    'incarcaCatalog',
    'incarcaCatalogFonturi',
    'legaFisier',
    'limitaIntensitate',
    'masoaraSsim',
    'masoaraVolum',
    'masuratorRand',
    'metriciFont',
    'normalizeazaSvg',
    'probeazaMp4',
    'rotunjeste',
    'rupeRanduri',
    'scrieJsonAtomic',
    'scrieTextAtomic',
    'secundeCuZecimala',
    'semnaturaRezolvata',
    'stopuriDegrade',
    'straturiCeata',
    'svgIconita',
    'textAfisat',
    'timpCitire',
    'valoriStil',
    'verificaTexteDate',
  ]);
});

test('M8: detectorul de importuri prinde toate formele', () => {
  const text = "import a from '../x.mjs';\nexport { b } from \"../y.mjs\";\nimport '../z.mjs';\nconst c = await import('../w.mjs');";
  assert.deepEqual([...text.matchAll(SPECIFICATORI)].map((m) => m[1]), ['../x.mjs', '../y.mjs', '../z.mjs', '../w.mjs']);
});
