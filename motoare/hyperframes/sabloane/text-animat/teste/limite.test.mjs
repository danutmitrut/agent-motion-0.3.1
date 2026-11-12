// Limitele reale pe care SABLON.md (secțiunea 7, „Limitele care se lovesc în practică”) le dă agentului, măsurate cu codul
// real (valideaza, rezolvaStil, cronologie: așezarea cu fontkit și timpii) pe cele 4 fonturi de titlu și ambele formate.
// Dacă un prag din cod se mută, testul pică și documentul trebuie corectat împreună cu el. Plus starterul exemple/minim.json,
// care trebuie să treacă pe toate temele, fonturile și formatele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const DIR_EXEMPLE = fileURLToPath(new URL('../exemple/', import.meta.url));
const sablon = await incarcaSablon(REPO, 'text-animat');
const FONTURI = ['instrument-sans', 'inter', 'montserrat', 'playfair-display'];
const TEME = ['noapte', 'hartie', 'curat', 'contrast'];
const FORMATE = ['vertical', 'patrat'];
const sablonMd = fs.readFileSync(fileURLToPath(new URL('../SABLON.md', import.meta.url)), 'utf8');

/** Erorile (codurile) unei scene puse peste o scenă de umplutură, pe drumul valideaza → stil → cronologie. */
function erori(scena, { format = 'vertical', font, tema = 'noapte', ritm = 'normal', scene = null } = {}) {
  const stil = { tema, ritm, ...(font ? { font_titlu: font } : {}) };
  const date = { sablon: 'text-animat', versiune_schema: 1, format, stil, scene: scene ?? [scena, { tip: 'titlu', titlu: ['Pauză'], durata: 5 }] };
  const ctx = { radacina: REPO, proiect: 'limite', dirProiect: DIR_EXEMPLE, sablon, mod: 'doar-verificare', catalog: null, brand: null, intern: null, stil: null, ff: null };
  const s = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
  if (s.erori.length > 0) return s.erori;
  const v = sablon.modul.valideaza(date, ctx);
  if (v.erori.length > 0) return v.erori;
  return sablon.modul.cronologie(date, s.stil, ctx).erori;
}
const coduri = (e) => e.map((x) => x.cod);

test('starterul exemple/minim.json trece pe toate temele, fonturile de titlu și formatele (valideaza și așezarea)', () => {
  const minim = JSON.parse(fs.readFileSync(`${DIR_EXEMPLE}minim.json`, 'utf8'));
  assert.deepEqual(minim.scene[2].titlu, ['Hai să construim', '*împreună*.']);
  for (const format of FORMATE) {
    for (const tema of TEME) {
      for (const font of [undefined, ...FONTURI]) {
        const e = erori(null, { format, tema, font, scene: minim.scene });
        assert.deepEqual(e, [], `${format}, ${tema}, ${font ?? 'fontul temei'}: ${JSON.stringify(e)}`);
      }
    }
  }
});

test('cuvinte: 4 cuvinte încap la orice ritm, cu și fără titlu (cel mult 7,6 s); al cincilea nu mai încape în 8 s', () => {
  const patru = ['Rapid', 'Simplu', 'Clar', 'Direct'];
  for (const ritm of ['calm', 'normal', 'alert']) {
    for (const titlu of [undefined, ['Un agent le face']]) {
      assert.deepEqual(erori({ tip: 'cuvinte', cuvinte: patru, ...(titlu ? { titlu } : {}) }, { ritm }), [], `${ritm}, ${titlu ? 'cu titlu' : 'fără titlu'}`);
    }
  }
  const e = erori({ tip: 'cuvinte', titlu: ['Un agent le face'], cuvinte: [...patru, 'Final'] }, { ritm: 'normal' });
  assert.deepEqual(coduri(e), ['prea-repede-de-citit']);
  assert.match(e[0].mesaj, /8,7 s/);
});

test('citat: citatul, autorul și rolul împreună au cel mult 23 de cuvinte (la orice ritm, format și font)', () => {
  const cuvinte = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${'abcd'[i % 4]}`).join(' ');
  for (const [autor, rol] of [[2, 0], [2, 3], [3, 5], [6, 7]]) {
    const incape = 23 - autor - rol;
    for (const format of FORMATE) {
      for (const ritm of ['calm', 'alert']) {
        const scena = (n) => ({ tip: 'citat', text: cuvinte(n, 'cuvant'), autor: cuvinte(autor, 'Ab'), ...(rol ? { rol: cuvinte(rol, 'Rol') } : {}) });
        assert.deepEqual(erori(scena(incape), { format, ritm }), [], `${autor}+${rol} autor+rol, ${incape} cuvinte, ${format}, ${ritm}`);
        assert.deepEqual(coduri(erori(scena(incape + 1), { format, ritm })), ['prea-repede-de-citit'], `${incape + 1} cuvinte, ${format}, ${ritm}`);
      }
    }
  }
});

/** Cele mai multe cifre (9, 99, 999...) care încap pe un rând la cel puțin 160 px, pe fiecare font de titlu. */
function cifreCareIncap(format, font, extra) {
  let ok = 0;
  for (let d = 1; d <= 9; d++) {
    if (erori({ tip: 'cifra', valoare: Number('9'.repeat(d)), text: 'din timp', ...extra }, { format, font }).length > 0) break;
    ok = d;
  }
  return ok;
}

test('cifra: câte cifre încap (cel mai prost font, pe ambele formate) și ce se întâmplă de la 8 cifre în sus', () => {
  const garantat = [
    [{}, 6], [{ prefix: '€' }, 6], [{ sufix: '%' }, 5], [{ sufix: ' lei' }, 4], [{ sufix: ' mil.' }, 3], [{ prefix: '€', sufix: ' lei' }, 3],
  ];
  for (const [extra, asteptat] of garantat) {
    const cel = Math.min(...FORMATE.flatMap((format) => FONTURI.map((font) => cifreCareIncap(format, font, extra))));
    assert.equal(cel, asteptat, `${JSON.stringify(extra)}: garantat ${asteptat} cifre`);
  }
  // 7 cifre (milioane): vertical pe orice font; pătrat doar pe inter și playfair-display
  for (const font of FONTURI) assert.equal(cifreCareIncap('vertical', font, {}), 7, `vertical, ${font}`);
  assert.deepEqual(FONTURI.map((font) => cifreCareIncap('patrat', font, {})), [6, 7, 6, 7]);
  // 8 cifre (10.000.000 și peste) nu încap nicăieri
  for (const format of FORMATE) for (const font of FONTURI) assert.ok(cifreCareIncap(format, font, {}) < 8, `${format}, ${font}`);
  const e = erori({ tip: 'cifra', valoare: 12500000, text: 'din timp' }, { format: 'vertical' });
  assert.deepEqual(coduri(e), ['rand-nu-incape']);
  assert.equal(e[0].camp, 'scene[0].valoare');
});

test('cifra: sugestia din eroare (valoare 1,25, zecimale 2, sufix „ mil.”) încape, cu excepția prefixului € pe montserrat', () => {
  for (const format of FORMATE) {
    for (const font of FONTURI) {
      assert.deepEqual(erori({ tip: 'cifra', valoare: 1.25, zecimale: 2, sufix: ' mil.', text: 'cifra de afaceri' }, { format, font }), [], `${format}, ${font}`);
      const cuPrefix = erori({ tip: 'cifra', valoare: 1.25, zecimale: 2, sufix: ' mil.', prefix: '€', text: 'cifra de afaceri' }, { format, font });
      assert.deepEqual(coduri(cuPrefix), font === 'montserrat' ? ['rand-nu-incape'] : [], `€, ${format}, ${font}`);
    }
  }
});

test('sursa: la 36 px încap ~53 de caractere cu litere mici pe pătrat (37 cu majuscule); schema permite 60', () => {
  const mici = 'Institutul Național de Statistică, Anuarul statistic al României, ediția 2025';
  const mari = 'SONDAJ INTERN IMM ROMÂNIA CERCETARE ANUALĂ 2025 RAPORT FINAL AL ECHIPEI';
  const cifra = (sursa) => ({ tip: 'cifra', valoare: 12, text: 'din timp', sursa });
  assert.deepEqual(erori(cifra(mici.slice(0, 53)), { format: 'patrat' }), []);
  assert.deepEqual(coduri(erori(cifra(mici.slice(0, 54)), { format: 'patrat' })), ['rand-nu-incape']);
  assert.deepEqual(erori(cifra(mici.slice(0, 54)), { format: 'vertical' }), []);
  assert.deepEqual(erori(cifra(mari.slice(0, 37)), { format: 'patrat' }), []);
  assert.deepEqual(coduri(erori(cifra(mari.slice(0, 38)), { format: 'patrat' })), ['rand-nu-incape']);
  const e = erori(cifra(mari.slice(0, 60)), { format: 'vertical' });
  assert.deepEqual([e[0].cod, e[0].camp], ['rand-nu-incape', 'scene[0].sursa']);
});

test('SABLON.md dă agentului exact aceste limite (și nu mai spune 2-5 cuvinte la scena cuvinte)', () => {
  const sectiune = sablonMd.slice(sablonMd.indexOf('### Limitele care se lovesc în practică'));
  assert.ok(sectiune.length > 0 && sablonMd.includes('### Limitele care se lovesc în practică'));
  for (const fragment of ['cel mult 4 cuvinte', '23 de cuvinte', '999.999', '10.000.000', '1,25', 'zecimale', '50 de caractere', 'mil.']) {
    assert.ok(sectiune.includes(fragment), `lipsește din secțiunea limitelor: ${fragment}`);
  }
  assert.match(sablonMd, /\| `cuvinte` \| `titlu` \(opțional, un rând\), `cuvinte` \| 2-4 cuvinte/);
  assert.doesNotMatch(sablonMd, /2-5 cuvinte/);
});
