// Compoziția React a lui date-serie, fără motor: importurile din src/ (doar react, remotion și pachetele @remotion
// fixate, fără nucleu, fără rețea, fără fitText), fiecare tip de scenă are componenta lui, iar golden-ul lui props.json
// (I09) are exact forma din src/tipuri.ts și numerele din src/durata.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CADRE_TRANZITIE, FPS, cadreTotale, inceputuri } from '../src/durata.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(DIR, 'src');
const TIPURI = ['titlu', 'cifra', 'bare', 'comparatie', 'final'];
const PACHETE = new Set(['react', 'remotion', '@remotion/fonts', '@remotion/media', '@remotion/transitions', '@remotion/transitions/fade', '@remotion/cli/config']);
const INTERZISE = [
  [/Math\.random/, 'Math.random'], [/Date\.now|new Date\b/, 'Date'], [/toLocaleString/, 'toLocaleString'], [/\bIntl\./, 'Intl'],
  [/fitText|@remotion\/layout-utils/, 'fitText'], [/https?:\/\//, 'adresă http(s)'], [/licenseKey/, 'licenseKey'],
  [/@remotion\/google-fonts/, 'google-fonts'], [/fontFamily:\s*['"][^"'$]/, 'font de sistem scris de mână'],
];

function fisiereCod(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const cale = path.join(dir, d.name);
    if (d.isDirectory()) return fisiereCod(cale);
    return /\.(ts|tsx|mjs)$/.test(d.name) ? [cale] : [];
  });
}
const COD = [...fisiereCod(SRC), path.join(DIR, 'remotion.config.ts')];
const importuri = (text) => [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...text.matchAll(/^\s*export\s[^'"]*\sfrom\s['"]([^'"]+)['"]/gm)].map((m) => m[1]);

test('src/ și remotion.config.ts importă doar react, remotion, pachetele @remotion fixate și fișiere din src/', () => {
  for (const f of COD) {
    for (const spec of importuri(fs.readFileSync(f, 'utf8'))) {
      if (spec.startsWith('.')) {
        const tinta = path.resolve(path.dirname(f), spec);
        assert.ok(tinta.startsWith(SRC + path.sep), `${path.relative(DIR, f)} importă ${spec}, din afara lui src/`);
      } else {
        assert.ok(PACHETE.has(spec), `${path.relative(DIR, f)} importă ${spec}`);
      }
    }
  }
});

test('src/ e determinist și fără rețea: fără Math.random, Date, toLocaleString, Intl, fitText, http(s), licenseKey', () => {
  for (const f of COD) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [re, nume] of INTERZISE) assert.equal(re.test(text), false, `${path.relative(DIR, f)} folosește ${nume}`);
  }
});

test('fiecare tip de scenă are componenta lui în src/scene/ și ramura lui în Grafic.tsx', () => {
  const grafic = fs.readFileSync(path.join(SRC, 'Grafic.tsx'), 'utf8');
  for (const tip of TIPURI) {
    const nume = tip[0].toUpperCase() + tip.slice(1);
    assert.ok(fs.existsSync(path.join(SRC, 'scene', `${nume}.tsx`)), `lipsește src/scene/${nume}.tsx`);
    assert.ok(grafic.includes(`case '${tip}': return <${nume} `), `Grafic.tsx nu desenează ${tip}`);
  }
  const root = fs.readFileSync(path.join(SRC, 'Root.tsx'), 'utf8');
  assert.match(root, /id="Grafic"/);
  assert.match(root, /calculateMetadata=\{\(\{ props \}\) => \(\{ durationInFrames: cadreTotale\(props\.scene\.map\(\(s\) => s\.cadre\)\) \}\)\}/);
});

test('golden-ul props.json are forma din src/tipuri.ts și numerele din src/durata.mjs', () => {
  const props = JSON.parse(fs.readFileSync(path.join(DIR, 'teste', 'golden', 'grafic', 'props.json'), 'utf8'));
  assert.deepEqual(Object.keys(props).sort(), ['atmosfera', 'cadre', 'ceata', 'culori', 'familii', 'fonturi', 'fps', 'inaltime', 'latime', 'muzica', 'scene', 'sigla', 'tranzitie', 'versiune']);
  assert.equal(props.fps, FPS);
  assert.equal(props.tranzitie, CADRE_TRANZITIE);
  const cadre = props.scene.map((s) => s.cadre);
  assert.equal(props.cadre, cadreTotale(cadre));
  assert.equal(props.cadre, 672);
  assert.deepEqual(props.scene.map((s) => s.inceput), inceputuri(cadre));
  assert.deepEqual(Object.keys(props.culori).sort(), ['accent', 'atenuat', 'fundal', 'text']);
  for (const f of props.fonturi) assert.deepEqual(Object.keys(f).sort(), ['familie', 'greutate', 'unicodeRange', 'url']);
  for (const c of props.ceata) assert.deepEqual(Object.keys(c).sort(), ['alfa', 'culoare']);
  for (const s of props.scene) {
    assert.deepEqual(Object.keys(s).sort(), ['cadre', 'detalii', 'inceput', 'intrare', 'ref', 'texte', 'tip']);
    assert.ok(TIPURI.includes(s.tip), s.tip);
    // C13: fade-ul tranziției următoare începe la cadrul local cadre − tranzitie; la `intrare` scena trebuie să fie întreagă
    assert.ok(s.intrare <= s.cadre - props.tranzitie, `${s.ref}: intrarea (${s.intrare}) cade în tranziția de ieșire (${s.cadre - props.tranzitie})`);
    for (const t of s.texte) {
      assert.deepEqual(Object.keys(t).sort(), ['aliniere', 'culoare', 'font', 'greutate', 'id', 'inaltime', 'latime', 'marime', 'randuri', 'spatiere', 'text', 'x', 'y']);
      assert.ok(t.culoare in props.culori, `${s.ref}/${t.id}: culoarea ${t.culoare}`);
      assert.equal(t.text, t.randuri.join('\n'));
    }
    const ids = new Set(s.texte.map((t) => t.id));
    if (s.tip === 'cifra') assert.ok(ids.has(s.detalii.idText));
    if (s.tip === 'bare') {
      for (const b of s.detalii.bare) {
        assert.deepEqual(Object.keys(b).sort(), ['accent', 'idEticheta', 'idValoare', 'inaltime', 'latime', 'prefix', 'sufix', 'valoare', 'x', 'y', 'zecimale']);
        assert.ok(ids.has(b.idEticheta) && ids.has(b.idValoare), `${s.ref}: textele barei ${b.idValoare}`);
      }
    }
    if (s.tip === 'comparatie') for (const r of s.detalii.randuri) assert.ok(ids.has(r.idEticheta) && ids.has(r.idValoare));
  }
});

test('cifre tabulare: scenele trimit `cifre` exact pentru blocurile pe care asezare.mjs le măsoară cu cifrele înlocuite de 0', async () => {
  const { esteCifre } = await import('../src/comun/cifre.mjs');
  const props = JSON.parse(fs.readFileSync(path.join(DIR, 'teste', 'golden', 'grafic', 'props.json'), 'utf8'));
  const asezare = fs.readFileSync(path.join(DIR, 'asezare.mjs'), 'utf8');
  assert.match(asezare, /from '\.\/src\/comun\/cifre\.mjs'/, 'asezare.mjs nu folosește comun/cifre.mjs');
  assert.doesNotMatch(asezare, /cifre: true/, 'asezare.mjs hotărăște cifrele pe lângă comun/cifre.mjs');
  assert.match(fs.readFileSync(path.join(SRC, 'comun', 'Text.tsx'), 'utf8'), /fontVariantNumeric: cifre \? 'tabular-nums' : undefined/);
  const asteptat = { cifra: (s) => [s.detalii.idText], comparatie: (s) => s.detalii.randuri.map((r) => r.idValoare), bare: (s) => s.detalii.bare.map((b) => b.idValoare), titlu: () => [], final: () => [] };
  for (const s of props.scene) {
    const cu = s.texte.map((t) => t.id).filter((id) => esteCifre(s.tip, id)).sort();
    assert.deepEqual(cu, asteptat[s.tip](s).sort(), `${s.ref} (${s.tip})`);
    // componenta scenei trimite `cifre` din aceeași funcție
    if (s.tip !== 'titlu' && s.tip !== 'final') {
      const cod = fs.readFileSync(path.join(SRC, 'scene', `${s.tip[0].toUpperCase()}${s.tip.slice(1)}.tsx`), 'utf8');
      assert.ok(cod.includes(`cifre={esteCifre('${s.tip}',`), `${s.tip}: componenta nu trimite cifre din esteCifre`);
    }
  }
});
