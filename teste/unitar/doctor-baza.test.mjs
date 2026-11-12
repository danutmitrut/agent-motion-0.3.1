import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { verificariBaza } from '../../nucleu/lib/doctor/baza.mjs';
import { comandaDoctor } from '../../nucleu/lib/doctor/index.mjs';
import { citesteStare, scrieStare } from '../../nucleu/lib/stare.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const GIB = 1024 ** 3;
const VERSIUNI = { node: { minim: '22.0.0' }, claude_code: { minim: '2.1.271' } };

function ctxBaza(peste = {}) {
  return {
    radacina: 'C:\\agent-motion',
    platforma: 'win32',
    arhitectura: 'x64',
    versiuneNode: '24.11.0',
    acasa: 'C:\\Users\\ana',
    ci: false,
    memorieTotala: 16 * GIB,
    spatiuLiber: async () => 50 * GIB,
    ruleaza: async () => { throw new Error('verificariBaza nu rulează procese'); },
    versiuneClaude: async () => '2.1.282',
    versiuni: VERSIUNI,
    ...peste,
  };
}

const ids = (rezultate) => rezultate.map((r) => r.id);
const dupaId = (rezultate, id) => rezultate.find((r) => r.id === id);

test('totul în regulă: șase verificări, în ordinea fixă, toate ok', async () => {
  const r = await verificariBaza(ctxBaza());
  assert.deepEqual(ids(r), ['node', 'platforma', 'claude', 'cale', 'spatiu', 'memorie']);
  assert.ok(r.every((x) => x.nivel === 'ok' && x.ok === true && x.eroare === null));
  assert.equal(dupaId(r, 'claude').valoare, '2.1.282');
});

test('Node 20 dă node-vechi și oprește faza 1 la prima eroare', async () => {
  const r = await verificariBaza(ctxBaza({ versiuneNode: 'v20.11.0' }));
  assert.deepEqual(ids(r), ['node']);
  assert.equal(r[0].nivel, 'eroare');
  assert.equal(r[0].ok, false);
  assert.equal(r[0].eroare.cod, 'node-vechi');
  assert.equal(r[0].eroare.camp, 'mediu.node');
});

test('Node 22 pe Windows dă avertismentul node-22-windows și merge mai departe', async () => {
  const r = await verificariBaza(ctxBaza({ versiuneNode: '22.23.3' }));
  assert.equal(r.length, 6);
  const n = dupaId(r, 'node');
  assert.equal(n.nivel, 'avertisment');
  assert.equal(n.ok, true);
  assert.equal(n.valoare, '22.23.3');
  assert.equal(n.eroare.cod, 'node-22-windows');
  assert.equal(n.eroare.camp, 'mediu.node');
  assert.match(n.eroare.mesaj, /diacritice/);
  assert.match(n.eroare.sugestie, /Node 24/);
});

test('Node 22 pe Mac rămâne ok: problema cu diacriticele e doar pe Windows', async () => {
  const r = await verificariBaza(ctxBaza({ platforma: 'darwin', arhitectura: 'arm64', radacina: '/Users/ana/agent-motion', versiuneNode: '22.23.3' }));
  assert.equal(dupaId(r, 'node').nivel, 'ok');
});

test('win32-arm64 dă platforma-nesuportata', async () => {
  const r = await verificariBaza(ctxBaza({ arhitectura: 'arm64' }));
  assert.deepEqual(ids(r), ['node', 'platforma']);
  assert.equal(r[1].eroare.cod, 'platforma-nesuportata');
  assert.match(r[1].eroare.mesaj, /ARM64/);
});

test('darwin-x64 dă avertismentul platforma-netestata și merge mai departe', async () => {
  const r = await verificariBaza(ctxBaza({ platforma: 'darwin', arhitectura: 'x64', radacina: '/Users/ana/agent-motion' }));
  assert.equal(r.length, 6);
  const p = dupaId(r, 'platforma');
  assert.equal(p.nivel, 'avertisment');
  assert.equal(p.ok, true);
  assert.equal(p.eroare.cod, 'platforma-netestata');
});

test('darwin-arm64 e platformă suportată', async () => {
  const r = await verificariBaza(ctxBaza({ platforma: 'darwin', arhitectura: 'arm64', radacina: '/Users/ana/agent-motion' }));
  assert.equal(dupaId(r, 'platforma').nivel, 'ok');
});

test('Claude Code mai vechi de 2.1.271 dă claude-vechi', async () => {
  const r = await verificariBaza(ctxBaza({ versiuneClaude: async () => '2.1.200' }));
  assert.equal(r.at(-1).id, 'claude');
  assert.equal(r.at(-1).eroare.cod, 'claude-vechi');
});

test('versiunea Claude Code necitibilă dă tot claude-vechi', async () => {
  const r = await verificariBaza(ctxBaza({ versiuneClaude: async () => null }));
  assert.equal(r.at(-1).eroare.cod, 'claude-vechi');
});

test('cu --ci, claude e sărit și versiunea nu se citește', async () => {
  let citita = false;
  const r = await verificariBaza(ctxBaza({ ci: true, versiuneClaude: async () => { citita = true; return '1.0.0'; } }));
  const c = dupaId(r, 'claude');
  assert.equal(c.nivel, 'sarit');
  assert.equal(c.ok, true);
  assert.equal(citita, false);
  assert.equal(r.length, 6);
});

test('o cale care conține OneDrive dă cale-onedrive (avertisment)', async () => {
  const r = await verificariBaza(ctxBaza({ radacina: 'C:\\Users\\ana\\OneDrive\\Documente\\agent-motion' }));
  const c = dupaId(r, 'cale');
  assert.equal(c.nivel, 'avertisment');
  assert.equal(c.eroare.cod, 'cale-onedrive');
  assert.equal(r.length, 6);
});

test('o cale lungă dă cale-lunga', async () => {
  const r = await verificariBaza(ctxBaza({ radacina: `C:\\${'a'.repeat(150)}\\agent-motion` }));
  assert.equal(dupaId(r, 'cale').eroare.cod, 'cale-lunga');
});

test('spații sau diacritice în cale dau cale-cu-spatii-sau-diacritice', async () => {
  const r1 = await verificariBaza(ctxBaza({ radacina: 'C:\\Users\\Ștefan\\agent-motion' }));
  assert.equal(dupaId(r1, 'cale').eroare.cod, 'cale-cu-spatii-sau-diacritice');
  const r2 = await verificariBaza(ctxBaza({ radacina: 'C:\\Proiecte noi\\agent-motion' }));
  assert.equal(dupaId(r2, 'cale').eroare.cod, 'cale-cu-spatii-sau-diacritice');
});

test('1 GiB liber dă spatiu-insuficient și oprește faza 1', async () => {
  const r = await verificariBaza(ctxBaza({ spatiuLiber: async () => 1 * GIB }));
  assert.deepEqual(ids(r), ['node', 'platforma', 'claude', 'cale', 'spatiu']);
  assert.equal(r.at(-1).eroare.cod, 'spatiu-insuficient');
  assert.match(r.at(-1).eroare.mesaj, /1,0 GB/);
});

test('sub 12 GiB RAM dă avertismentul memorie-putina', async () => {
  const r = await verificariBaza(ctxBaza({ memorieTotala: 8 * GIB }));
  const m = dupaId(r, 'memorie');
  assert.equal(m.nivel, 'avertisment');
  assert.equal(m.eroare.cod, 'memorie-putina');
});

test('comandaDoctor cu Node 20 iese cu codul 2, nu rulează npm și scrie .stare.json', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['nucleu/VERSIUNI.json'] });
  try {
    let apeluri = 0;
    const { cod, raport } = await comandaDoctor({
      radacina,
      optiuni: { ci: false, confirmaCanar: false, json: false },
      ctx: { versiuneNode: '20.11.0', ruleaza: async () => { apeluri += 1; return { cod: 0, stdout: '', stderr: '' }; } },
    });
    assert.equal(cod, 2);
    assert.equal(apeluri, 0);
    assert.equal(raport.ok, false);
    assert.equal(raport.faza, 'baza');
    assert.equal(raport.erori[0].cod, 'node-vechi');
    assert.match(raport.mesaj, /node: EROARE/);
    const stare = citesteStare(radacina);
    assert.equal(stare.versiune, 1);
    assert.equal(stare.ok, false);
    assert.equal(stare.verificari[0].eroare.cod, 'node-vechi');
    assert.match(stare.versiuni_sha256, /^[0-9a-f]{64}$/);
  } finally {
    curata();
  }
});

test('citesteStare întoarce null fără fișier și citește înapoi ce scrie scrieStare', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    assert.equal(citesteStare(radacina), null);
    const stare = {
      versiune: 1, scris_la: '2026-10-01T10:00:00.000Z', platforma: 'win32-x64', node: '22.11.0', claude_code: '2.1.282',
      ok: true, verificari: [{ id: 'node', ok: true, nivel: 'ok', valoare: '22.11.0', eroare: null }], canar: null, versiuni_sha256: 'a'.repeat(64),
    };
    scrieStare(radacina, stare);
    assert.deepEqual(citesteStare(radacina), stare);
    assert.ok(fs.readFileSync(path.join(radacina, 'nucleu', '.stare.json'), 'utf8').endsWith('}\n'));
    fs.writeFileSync(path.join(radacina, 'nucleu', '.stare.json'), '{ stricat');
    assert.equal(citesteStare(radacina), null);
  } finally {
    curata();
  }
});
