import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AJUTOR, OPTIUNI, OPTIUNI_ACTUALIZEAZA, OPTIUNI_DESEN, OPTIUNI_RANDEAZA, principal } from '../../nucleu/mg.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const MG = fileURLToPath(new URL('../../nucleu/mg.mjs', import.meta.url));

function iesire() {
  let text = '';
  return { stdout: { write: (s) => { text += s; return true; } }, text: () => text };
}

/** Prima linie JSON de după antetul „Erori (N):”. */
function primaEroare(text) {
  const linie = text.split('\n').find((l) => l.startsWith('{'));
  return linie ? JSON.parse(linie) : null;
}

const radacinaCuProba = () => creeazaRadacinaTemp({ sablonProba: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });

test('mg nou test --sablon proba creează proiectul și iese cu 0', async () => {
  const { radacina, curata } = radacinaCuProba();
  const out = iesire();
  try {
    const cod = await principal(['nou', 'test', '--sablon', 'proba'], { radacina, stdout: out.stdout });
    assert.equal(cod, 0, out.text());
    const dir = join(radacina, 'video', 'test');
    for (const f of ['date.json', 'scenariu.md', 'jurnal.md', 'motor.lock', 'resurse']) assert.ok(existsSync(join(dir, f)), f);
    assert.equal(JSON.parse(readFileSync(join(dir, 'motor.lock'), 'utf8')).motor.versiune, '0.8.96');
    assert.match(out.text(), /Proiectul „test” e creat în video\/test\//);
  } finally {
    curata();
  }
});

test('mg nou cu --json scrie o singură ieșire JSON', async () => {
  const { radacina, curata } = radacinaCuProba();
  const out = iesire();
  try {
    const cod = await principal(['nou', 'test', '--sablon', 'proba', '--json'], { radacina, stdout: out.stdout });
    assert.equal(cod, 0);
    const json = JSON.parse(out.text());
    assert.equal(json.ok, true);
    assert.equal(json.comanda, 'nou');
    assert.deepEqual(json.erori, []);
    assert.equal(json.rezultat.proiect, 'test');
  } finally {
    curata();
  }
});

test('un nume cu majuscule dă proiect-nume-invalid și codul 3', async () => {
  const { radacina, curata } = radacinaCuProba();
  const out = iesire();
  try {
    const cod = await principal(['nou', 'Test', '--sablon', 'proba'], { radacina, stdout: out.stdout });
    assert.equal(cod, 3);
    assert.match(out.text(), /^Erori \(1\):/);
    const e = primaEroare(out.text());
    assert.equal(e.cod, 'proiect-nume-invalid');
    assert.equal(e.camp, 'argumente.proiect');
  } finally {
    curata();
  }
});

test('mg actualizeaza: --verifica cu --inapoi și un argument în plus dau argument-necunoscut (cod 3)', async () => {
  let out = iesire();
  assert.equal(await principal(['actualizeaza', '--verifica', '--inapoi'], { radacina: '/nu/conteaza', stdout: out.stdout }), 3);
  assert.equal(primaEroare(out.text()).cod, 'argument-necunoscut');
  out = iesire();
  assert.equal(await principal(['actualizeaza', 'acum'], { radacina: '/nu/conteaza', stdout: out.stdout }), 3);
  assert.equal(primaEroare(out.text()).cod, 'argument-necunoscut');
});

test('mg genereaza fără subcomandă dă argument-necunoscut (cod 3), fără să citească nimic', async () => {
  const out = iesire();
  assert.equal(await principal(['genereaza'], { radacina: '/nu/conteaza', stdout: out.stdout }), 3);
  assert.equal(primaEroare(out.text()).cod, 'argument-necunoscut');
  assert.match(AJUTOR, /^ {2}genereaza desen <p-nume> "<subiectul>" --etichete "<e1,e2,e3,e4>" --estimeaza/m);
  assert.match(AJUTOR, /^ {2}doctor --generare \[--instaleaza-keyring\]/m);
});

test('o opțiune necunoscută dă argument-necunoscut și codul 3', async () => {
  const { radacina, curata } = radacinaCuProba();
  const out = iesire();
  try {
    const cod = await principal(['nou', 'test', '--sablon', 'proba', '--culoare', 'rosu'], { radacina, stdout: out.stdout });
    assert.equal(cod, 3);
    const e = primaEroare(out.text());
    assert.equal(e.cod, 'argument-necunoscut');
    assert.equal(e.camp, 'argumente.culoare');
    assert.equal(existsSync(join(radacina, 'video', 'test')), false);
  } finally {
    curata();
  }
});

test('--sablon fără valoare și o comandă inexistentă dau codul 3', async () => {
  let out = iesire();
  assert.equal(await principal(['nou', 'test', '--sablon'], { radacina: '/nu/conteaza', stdout: out.stdout }), 3);
  assert.equal(primaEroare(out.text()).cod, 'argument-necunoscut');
  out = iesire();
  assert.equal(await principal(['zboara'], { radacina: '/nu/conteaza', stdout: out.stdout }), 3);
  assert.equal(primaEroare(out.text()).cod, 'comanda-necunoscuta');
});

test('help iese cu 0, fără argumente iese cu 3; amândouă afișează comenzile', async () => {
  let out = iesire();
  assert.equal(await principal(['help'], { radacina: '/nu/conteaza', stdout: out.stdout }), 0);
  assert.match(out.text(), /nou <proiect> --sablon <nume>/);
  out = iesire();
  assert.equal(await principal([], { radacina: '/nu/conteaza', stdout: out.stdout }), 3);
  assert.match(out.text(), /doctor/);
});

test('help e la zi cu comenzile reale: fiecare comandă, subcomandă desen, mod randeaza și opțiune apare în text', () => {
  assert.doesNotMatch(AJUTOR, /sarcinile următoare/);
  for (const comanda of [...Object.keys(OPTIUNI), 'desen', 'randeaza', 'actualizeaza']) assert.match(AJUTOR, new RegExp(`^  ${comanda} `, 'm'), comanda);
  for (const tabel of [OPTIUNI.doctor, OPTIUNI.nou, OPTIUNI_DESEN, OPTIUNI_RANDEAZA, OPTIUNI_ACTUALIZEAZA]) {
    for (const optiune of Object.keys(tabel)) assert.ok(AJUTOR.includes(`--${optiune}`), `--${optiune}`);
  }
  // subcomenzile din dispecerul lui desen (lib/desen/index.mjs) sunt exact cele din help
  const dispecer = readFileSync(fileURLToPath(new URL('../../nucleu/lib/desen/index.mjs', import.meta.url)), 'utf8');
  const reale = [...dispecer.matchAll(/sub === '([a-z]+)'/g)].map((m) => m[1]).sort();
  const dinAjutor = [...new Set([...AJUTOR.matchAll(/^ {2}desen ([a-z]+)/gm)].map((m) => m[1]))].sort();
  assert.deepEqual(dinAjutor, reale);
  // cele trei moduri ale lui randeaza: --doar-verificare, --schita și randarea completă (fără opțiune)
  assert.match(AJUTOR, /^ {2}randeaza <proiect> --doar-verificare /m);
  assert.match(AJUTOR, /^ {2}randeaza <proiect> --schita /m);
  assert.match(AJUTOR, /^ {2}randeaza <proiect> \[--json\]$/m);
});

test('rulat ca proces, mg.mjs pune codul de ieșire', () => {
  const r = spawnSync(process.execPath, [MG, 'zboara'], { encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stdout, /comanda-necunoscuta/);
  const ajutor = spawnSync(process.execPath, [MG, '--help'], { encoding: 'utf8' });
  assert.equal(ajutor.status, 0);
});

test('C05: help-ul nu mai cunoaște traseele și familia linie', () => {
  assert.doesNotMatch(AJUTOR, /traseu/);
  assert.doesNotMatch(AJUTOR, /linie/);
  assert.doesNotMatch(AJUTOR, /lc-/);
});

test('mg randeaza: --doar-verificare cu --schita, --schita pe un proiect lipsă și un proiect lipsă dau codul 3', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const cazuri = [
      [['randeaza', 'p', '--doar-verificare', '--schita'], 'argument-necunoscut', 'argumente.schita'],
      [['randeaza', 'nu-exista', '--schita'], 'proiect-lipsa', 'argumente.proiect'],
      [['randeaza', 'nu-exista', '--doar-verificare'], 'proiect-lipsa', 'argumente.proiect'],
      [['randeaza', 'p', 'q', '--doar-verificare'], 'argument-necunoscut', 'argumente.pozitional'],
    ];
    for (const [argumente, cod, camp] of cazuri) {
      const out = iesire();
      assert.equal(await principal(argumente, { radacina, stdout: out.stdout }), 3, out.text());
      const e = primaEroare(out.text());
      assert.deepEqual([e.cod, e.camp], [cod, camp], argumente.join(' '));
    }
  } finally {
    curata();
  }
});
