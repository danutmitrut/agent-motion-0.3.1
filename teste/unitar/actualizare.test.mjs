// mg actualizeaza (felia 6), pe un depozit git temporar cu două versiuni: sursa (origin, ramura stabil) și clona
// agentului, într-o cale cu spațiu și diacritice. Zonele cursantului trebuie să rămână identice byte cu byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comandaActualizeaza, notaDupaActualizare, videoInLucru, ZONE_CURSANT, FISIERE_CURSANT, FISIER_ISTORIC } from '../../nucleu/lib/actualizare/index.mjs';
import { calculeazaIntegritate } from '../../nucleu/lib/versiuni.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDENTITATE = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false'];

function g(dir, ...argumente) {
  return execFileSync('git', [...IDENTITATE, ...argumente], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function scrie(dir, relativ, continut) {
  const cale = path.join(dir, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(cale), { recursive: true });
  fs.writeFileSync(cale, continut);
}

/** O versiune pe sursă: fișierele date, apoi VERSIUNI.json cu integritatea lor, într-un commit. */
function versiune(sursa, versiuneKit, fisiere, mesaj, { integritateStricata = false, fortat = [] } = {}) {
  for (const [relativ, continut] of Object.entries(fisiere)) scrie(sursa, relativ, continut);
  g(sursa, 'add', '-A');
  for (const relativ of fortat) g(sursa, 'add', '-f', relativ);
  const integritate = calculeazaIntegritate(sursa);
  if (integritateStricata) integritate['nucleu/a.txt'] = '0'.repeat(64);
  scrie(sursa, 'nucleu/VERSIUNI.json', `${JSON.stringify({ versiune_kit: versiuneKit, integritate }, null, 2)}\n`);
  g(sursa, 'add', '-A');
  g(sursa, 'commit', '-q', '-m', mesaj);
  return g(sursa, 'rev-parse', 'HEAD');
}

/** Sursa cu versiunea 0.2.0, clona agentului și lucrul cursantului în clonă. */
function pregateste() {
  const baza = fs.mkdtempSync(path.join(os.tmpdir(), 'mg actualizare Ăîș '));
  const sursa = path.join(baza, 'sursa');
  const agent = path.join(baza, 'agent Ăîș');
  fs.mkdirSync(sursa);
  g(sursa, 'init', '-q', '-b', 'stabil');
  scrie(sursa, '.gitignore', fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8'));
  // ca în kit: LF peste tot, și pe un Windows cu core.autocrlf=true (altfel integritatea pică la clonă)
  scrie(sursa, '.gitattributes', fs.readFileSync(path.join(REPO, '.gitattributes'), 'utf8'));
  const v1 = versiune(sursa, '0.2.0', { 'nucleu/a.txt': 'unu\n', 'motoare/m.txt': 'motor\n', 'CLAUDE.md': '# agent\n' }, 'Versiunea de plecare');
  execFileSync('git', ['clone', '-q', sursa, agent], { stdio: 'ignore' });
  // lucrul cursantului: un film terminat, un brand, un desen propriu, fișierele lui
  scrie(agent, 'video/gata/motor.lock', JSON.stringify({ aprobare: { sha256_texte: 'x', aprobat_la: '2026-10-01T10:00:00.000Z' } }));
  scrie(agent, 'video/gata/gata.mp4', Buffer.from([0, 1, 2, 3, 250]));
  scrie(agent, 'video/gata/date.json', '{"text":"Î"}');
  scrie(agent, 'branduri/eu/brand.json', '{}');
  scrie(agent, 'proprii/p-x.svg', '<svg/>');
  scrie(agent, 'USER.md', 'cursantul\n');
  scrie(agent, '.instalat', '{}');
  return { baza, sursa, agent, v1, curata: () => fs.rmSync(baza, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }) };
}

/** sha256 pentru fiecare fișier din zonele cursantului. */
function amprentaCursant(agent) {
  const rezultat = {};
  const parcurge = (relativ) => {
    const abs = path.join(agent, relativ);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      for (const n of fs.readdirSync(abs)) parcurge(`${relativ}/${n}`);
    } else {
      rezultat[relativ] = sha256Fisier(abs);
    }
  };
  for (const z of ['video', 'branduri', 'proprii', 'USER.md']) parcurge(z);
  return rezultat;
}

const head = (agent) => g(agent, 'rev-parse', 'HEAD');

test('--verifica aduce versiunea nouă fără s-o aplice și dă subiectele commit-urilor', async () => {
  const t = pregateste();
  try {
    versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n' }, 'Textul de final poate fi mai mare');
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'verifica' });
    assert.equal(rez.ok, true);
    assert.equal(rez.rezultat.disponibila, true);
    assert.equal(rez.rezultat.de_la.versiune_kit, '0.2.0');
    assert.equal(rez.rezultat.la.versiune_kit, '0.2.1');
    assert.equal(rez.rezultat.noutati.total, 1);
    assert.equal(rez.rezultat.noutati.lista[0].subiect, 'Textul de final poate fi mai mare');
    assert.match(rez.rezultat.text, /Textul de final poate fi mai mare/);
    assert.equal(rez.avertismente.length, 0);
    assert.equal(head(t.agent), t.v1);
    assert.equal(fs.readFileSync(path.join(t.agent, 'nucleu', 'a.txt'), 'utf8'), 'unu\n');
  } finally {
    t.curata();
  }
});

test('--verifica pe ultima versiune spune că nu e nimic nou', async () => {
  const t = pregateste();
  try {
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'verifica' });
    assert.equal(rez.rezultat.disponibila, false);
    assert.match(rez.rezultat.text, /deja ultima versiune: 0\.2\.0/);
  } finally {
    t.curata();
  }
});

test('actualizarea și revenirea lasă video/, branduri/, proprii/ și USER.md identice byte cu byte', async () => {
  const t = pregateste();
  try {
    const v2 = versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n', 'motoare/nou.txt': 'nou\n' }, 'Un fișier nou în motoare');
    const inainte = amprentaCursant(t.agent);
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
    assert.equal(rez.ok, true, JSON.stringify(rez.erori));
    assert.equal(rez.rezultat.schimbat, true);
    assert.equal(head(t.agent), v2);
    assert.equal(fs.readFileSync(path.join(t.agent, 'nucleu', 'a.txt'), 'utf8'), 'doi\n');
    assert.deepEqual(amprentaCursant(t.agent), inainte);
    assert.equal(fs.existsSync(path.join(t.agent, '.instalat')), false, '.instalat se șterge, ca agentul să refacă instalarea');
    assert.match(rez.rezultat.text, /închidă Claude Code/);
    assert.match(notaDupaActualizare(t.agent), /de la 0\.2\.0 .* la 0\.2\.1 .*--inapoi/);
    const istoric = JSON.parse(fs.readFileSync(path.join(t.agent, ...FISIER_ISTORIC.split('/')), 'utf8')).istoric;
    assert.equal(istoric.length, 1);
    assert.equal(istoric[0].de_la.commit, t.v1);
    assert.equal(g(t.agent, 'status', '--porcelain'), '', 'fișierul de istoric e ignorat de git');

    const inapoi = await comandaActualizeaza({ radacina: t.agent, mod: 'inapoi' });
    assert.equal(inapoi.ok, true, JSON.stringify(inapoi.erori));
    assert.equal(head(t.agent), t.v1);
    assert.equal(fs.existsSync(path.join(t.agent, 'motoare', 'nou.txt')), false);
    assert.deepEqual(amprentaCursant(t.agent), inainte);
    await assert.rejects(comandaActualizeaza({ radacina: t.agent, mod: 'inapoi' }), (e) => e.eroareMg?.cod === 'actualizare-fara-istoric');

    // după revenire, versiunea nouă se poate aplica din nou
    const iar = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
    assert.equal(iar.ok, true);
    assert.equal(head(t.agent), v2);
    fs.writeFileSync(path.join(t.agent, '.instalat'), '{}');
    assert.equal(notaDupaActualizare(t.agent), null, 'cu .instalat refăcut, doctorul nu mai pomenește revenirea');
  } finally {
    t.curata();
  }
});

test('un video în lucru oprește actualizarea; --chiar-daca-e-in-lucru o lasă să treacă', async () => {
  const t = pregateste();
  try {
    const v2 = versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n' }, 'Doi');
    scrie(t.agent, 'video/lucru/motor.lock', JSON.stringify({ aprobare: { sha256_texte: 'y', aprobat_la: new Date().toISOString() } }));
    // o corectură aprobată după film, încă nerandată
    scrie(t.agent, 'video/corectat/corectat.mp4', 'mp4');
    fs.utimesSync(path.join(t.agent, 'video/corectat/corectat.mp4'), new Date('2026-10-01'), new Date('2026-10-01'));
    scrie(t.agent, 'video/corectat/motor.lock', JSON.stringify({ aprobare: { sha256_texte: 'z', aprobat_la: '2026-10-20T00:00:00.000Z' } }));
    assert.deepEqual(videoInLucru(t.agent), ['corectat', 'lucru']);

    const verificat = await comandaActualizeaza({ radacina: t.agent, mod: 'verifica' });
    assert.equal(verificat.ok, true);
    assert.deepEqual(verificat.avertismente.map((a) => a.cod), ['actualizare-video-in-lucru']);

    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
    assert.equal(rez.ok, false);
    assert.deepEqual(rez.erori.map((e) => e.cod), ['actualizare-video-in-lucru']);
    assert.match(rez.erori[0].mesaj, /corectat, lucru/);
    assert.equal(head(t.agent), t.v1);
    assert.equal(fs.existsSync(path.join(t.agent, ...FISIER_ISTORIC.split('/'))), false);

    const fortat = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica', chiarDacaInLucru: true });
    assert.equal(fortat.ok, true);
    assert.equal(head(t.agent), v2);
  } finally {
    t.curata();
  }
});

test('un fișier al kitului schimbat local oprește actualizarea, fără să-l atingă', async () => {
  const t = pregateste();
  try {
    versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n' }, 'Doi');
    fs.writeFileSync(path.join(t.agent, 'CLAUDE.md'), '# agentul meu\n');
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
    assert.deepEqual(rez.erori.map((e) => e.cod), ['actualizare-kit-modificat']);
    assert.match(rez.erori[0].mesaj, /CLAUDE\.md/);
    assert.equal(head(t.agent), t.v1);
    assert.equal(fs.readFileSync(path.join(t.agent, 'CLAUDE.md'), 'utf8'), '# agentul meu\n');
  } finally {
    t.curata();
  }
});

test('o versiune care aduce fișiere în zona cursantului e refuzată înainte de orice scriere', async () => {
  const t = pregateste();
  try {
    versiune(t.sursa, '0.2.1', { 'video/gata/gata.mp4': 'peste filmul cursantului' }, 'Greșeală', { fortat: ['video/gata/gata.mp4'] });
    const inainte = amprentaCursant(t.agent);
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
    assert.deepEqual(rez.erori.map((e) => e.cod), ['actualizare-atinge-cursant']);
    assert.match(rez.erori[0].mesaj, /video\/gata\/gata\.mp4/);
    assert.equal(head(t.agent), t.v1);
    assert.deepEqual(amprentaCursant(t.agent), inainte);
  } finally {
    t.curata();
  }
});

test('o versiune care nu trece integritatea e retrasă singură', async () => {
  const t = pregateste();
  try {
    versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n' }, 'Stricată', { integritateStricata: true });
    await assert.rejects(comandaActualizeaza({ radacina: t.agent, mod: 'aplica' }), (e) => e.eroareMg?.cod === 'actualizare-integritate'
      && /revenit singur/.test(e.eroareMg.sugestie));
    assert.equal(head(t.agent), t.v1);
    assert.equal(fs.readFileSync(path.join(t.agent, 'nucleu', 'a.txt'), 'utf8'), 'unu\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(t.agent, ...FISIER_ISTORIC.split('/')), 'utf8')).istoric.length, 0);
    assert.equal(fs.existsSync(path.join(t.agent, '.instalat')), true);
  } finally {
    t.curata();
  }
});

test('un folder fără git și o sursă inaccesibilă dau actualizare-sursa', async () => {
  const t = pregateste();
  const faraGit = fs.mkdtempSync(path.join(os.tmpdir(), 'mg fara git '));
  try {
    await assert.rejects(comandaActualizeaza({ radacina: faraGit, mod: 'verifica' }), (e) => e.eroareMg?.cod === 'actualizare-sursa');
    g(t.agent, 'remote', 'set-url', 'origin', path.join(t.baza, 'nu-exista'));
    await assert.rejects(comandaActualizeaza({ radacina: t.agent, mod: 'aplica' }), (e) => e.eroareMg?.cod === 'actualizare-sursa'
      && /nu s-a putut aduce/.test(e.eroareMg.mesaj));
    assert.equal(head(t.agent), t.v1);
  } finally {
    fs.rmSync(faraGit, { recursive: true, force: true });
    t.curata();
  }
});

test('zonele cursantului din actualizare sunt exact cele din .gitignore', () => {
  const text = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  const sectiune = text.split(/\n\s*\n/).find((b) => b.includes('/video/'));
  const ignorate = sectiune.split('\n').filter((l) => l.startsWith('/')).map((l) => l.slice(1)).sort();
  assert.deepEqual([...ZONE_CURSANT, ...FISIERE_CURSANT].sort(), ignorate);
});

test('căile care ar cădea peste fișierele ignorate ale cursantului sunt refuzate (review felia 6)', async () => {
  const insensibil = (() => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mg majuscule '));
    try {
      fs.writeFileSync(path.join(d, 'a'), '');
      return fs.existsSync(path.join(d, 'A'));
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  })();
  const cazuri = [['video', 'un fișier peste folderul video/'], ['USER.md/x', 'un folder peste USER.md'], ['unelte/python/x.py', 'zona din unelte/']];
  if (insensibil) cazuri.push(['Video/gata/scenariu.md', 'altă scriere a lui video/'], ['user.md', 'altă scriere a lui USER.md']);
  for (const [cale, ce] of cazuri) {
    const t = pregateste();
    try {
      versiune(t.sursa, '0.2.1', { [cale]: 'KIT\n' }, ce, { fortat: [cale] });
      const inainte = amprentaCursant(t.agent);
      const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
      assert.deepEqual(rez.erori.map((e) => e.cod), ['actualizare-atinge-cursant'], ce);
      assert.equal(head(t.agent), t.v1, ce);
      assert.deepEqual(amprentaCursant(t.agent), inainte, ce);
    } finally {
      t.curata();
    }
  }
});

test('un fișier nou al kitului într-un folder nou trece de plasă', async () => {
  const t = pregateste();
  try {
    const v2 = versiune(t.sursa, '0.2.1', { 'nucleu/lib/nou/x.mjs': 'x\n', 'docs/y.md': 'y\n' }, 'Fișiere noi');
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' });
    assert.equal(rez.ok, true, JSON.stringify(rez.erori));
    assert.equal(head(t.agent), v2);
  } finally {
    t.curata();
  }
});

test('git oprit la jumătatea trecerii: kitul se readuce întreg pe versiunea de dinainte', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
  const t = pregateste();
  const blocat = path.join(t.agent, 'motoare');
  try {
    versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n', 'motoare/m.txt': 'motor nou\n' }, 'Doi');
    fs.chmodSync(blocat, 0o555);
    await assert.rejects(comandaActualizeaza({ radacina: t.agent, mod: 'aplica' }), (e) => e.eroareMg?.cod === 'actualizare-esuata'
      && /rămas pe versiunea de dinainte/.test(e.eroareMg.sugestie));
    assert.equal(head(t.agent), t.v1);
    assert.equal(fs.readFileSync(path.join(t.agent, 'nucleu', 'a.txt'), 'utf8'), 'unu\n');
    assert.equal(g(t.agent, 'status', '--porcelain', '--untracked-files=no'), '');
  } finally {
    fs.chmodSync(blocat, 0o755);
    t.curata();
  }
});

test('hook-urile depozitului nu rulează la --verifica', async () => {
  const t = pregateste();
  try {
    versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n' }, 'Doi');
    const urma = path.join(t.baza, 'hook-a-rulat');
    scrie(t.agent, '.git/hooks/reference-transaction', `#!/bin/sh\ntouch "${urma}"\n`);
    fs.chmodSync(path.join(t.agent, '.git/hooks/reference-transaction'), 0o755);
    const rez = await comandaActualizeaza({ radacina: t.agent, mod: 'verifica' });
    assert.equal(rez.rezultat.disponibila, true);
    assert.equal(fs.existsSync(urma), false);
  } finally {
    t.curata();
  }
});

test('o versiune retrasă de Dănuț (stabil mutat înapoi) ajunge și la cursant', async () => {
  const t = pregateste();
  try {
    const v2 = versiune(t.sursa, '0.2.1', { 'nucleu/a.txt': 'doi\n' }, 'Versiune stricată');
    assert.equal((await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' })).ok, true);
    assert.equal(head(t.agent), v2);
    g(t.sursa, 'reset', '-q', '--hard', t.v1);
    const ver = await comandaActualizeaza({ radacina: t.agent, mod: 'verifica' });
    assert.equal(ver.rezultat.disponibila, true);
    assert.equal(ver.rezultat.retrasa, true);
    assert.match(ver.rezultat.text, /retras.*\n- .* Versiune stricată/);
    assert.equal((await comandaActualizeaza({ radacina: t.agent, mod: 'aplica' })).ok, true);
    assert.equal(head(t.agent), t.v1);
  } finally {
    t.curata();
  }
});
