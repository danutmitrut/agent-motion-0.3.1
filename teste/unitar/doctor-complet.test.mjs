import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { verificariComplete } from '../../nucleu/lib/doctor/complet.mjs';
import { comandaDoctor } from '../../nucleu/lib/doctor/index.mjs';
import { scrieCanar } from '../../nucleu/lib/doctor/canar.mjs';
import { scrieChitantaCanar } from '../../nucleu/lib/garda/canar.mjs';
import { citesteStare, scrieStare } from '../../nucleu/lib/stare.mjs';
import { sha256Fisier, sha256Text, stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const GIB = 1024 ** 3;

/**
 * Rădăcină temporară fără node_modules și fără motoare: verificările grele (integritate, ffmpeg, Chrome, fonturi)
 * cad repede, fără rețea, iar rezerva ffprobe e scoasă din versiuni, ca să nu se descarce nimic.
 */
function pregateste(fisiereAcasa = {}, { copiaza = [], fisiere: fisiereKit = {} } = {}) {
  const fisiere = { ...fisiereKit };
  for (const [cale, continut] of Object.entries(fisiereAcasa)) fisiere[`acasa/${cale}`] = continut;
  const temp = creeazaRadacinaTemp({ copiaza: ['nucleu/VERSIUNI.json', ...copiaza], fisiere });
  const versiuni = JSON.parse(fs.readFileSync(path.join(temp.radacina, 'nucleu', 'VERSIUNI.json'), 'utf8'));
  versiuni.ffmpeg = { ...versiuni.ffmpeg, rezerva: {} };
  const ctx = {
    radacina: temp.radacina,
    platforma: process.platform,
    arhitectura: process.arch,
    versiuneNode: process.versions.node,
    acasa: path.join(temp.radacina, 'acasa'),
    ci: true,
    memorieTotala: 16 * GIB,
    spatiuLiber: async () => 50 * GIB,
    ruleaza: async () => ({ cod: 0, stdout: '', stderr: '' }),
    versiuneClaude: async () => null,
    versiuni,
  };
  return { ...temp, ctx };
}

const dupaId = (rezultate, id) => rezultate.find((r) => r.id === id);

test('verificariComplete întoarce cele zece verificări, în ordine, chiar dacă unele cad', async () => {
  const { ctx, curata } = pregateste();
  try {
    const r = await verificariComplete(ctx);
    assert.deepEqual(r.map((x) => x.id),
      ['integritate', 'ffmpeg', 'ffprobe', 'chrome', 'fonturi', 'pluginuri-globale', 'pluginuri-hookuri', 'actualizare-hyperframes', 'parakeet', 'randare-proba']);
    assert.equal(dupaId(r, 'chrome').nivel, 'sarit');
    assert.equal(dupaId(r, 'chrome').valoare, 'fără ffmpeg valid');
    assert.equal(dupaId(r, 'chrome').eroare, null);
    assert.equal(dupaId(r, 'randare-proba').nivel, 'sarit');
  } finally {
    curata();
  }
});

test('un ~/.hyperframes/config.json cu pendingUpdate dă avertisment', async () => {
  const config = { pendingUpdate: { version: '0.9.1', command: 'npm install -g hyperframes@0.9.1', startedAt: '2026-10-01T09:00:00.000Z' } };
  const { ctx, curata } = pregateste({ '.hyperframes/config.json': JSON.stringify(config) });
  try {
    const a = dupaId(await verificariComplete(ctx), 'actualizare-hyperframes');
    assert.equal(a.nivel, 'avertisment');
    assert.equal(a.ok, true);
    assert.equal(a.eroare.cod, 'hyperframes-actualizare-pendinte');
    assert.match(a.eroare.mesaj, /0\.9\.1/);
  } finally {
    curata();
  }
});

test('fără pendingUpdate, actualizare-hyperframes e ok', async () => {
  const { ctx, curata } = pregateste({ '.hyperframes/config.json': JSON.stringify({ latestVersion: '0.9.1' }) });
  try {
    assert.equal(dupaId(await verificariComplete(ctx), 'actualizare-hyperframes').nivel, 'ok');
  } finally {
    curata();
  }
});

test('~/.claude/skills/hyperframes dă avertismentul pluginuri-globale', async () => {
  const { ctx, curata } = pregateste({ '.claude/skills/hyperframes/SKILL.md': '---\nname: hyperframes\n---\n' });
  try {
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-globale');
    assert.equal(p.nivel, 'avertisment');
    assert.equal(p.eroare.cod, 'pluginuri-globale');
    assert.match(p.eroare.mesaj, /skills\/hyperframes/);
  } finally {
    curata();
  }
});

test('pluginul remotion@remotion din installed_plugins.json dă pluginuri-globale', async () => {
  const instalate = { version: 2, plugins: { 'remotion@remotion': [{ scope: 'user', version: '1.0.0' }] } };
  const { ctx, curata } = pregateste({ '.claude/plugins/installed_plugins.json': JSON.stringify(instalate) });
  try {
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-globale');
    assert.equal(p.eroare.cod, 'pluginuri-globale');
    assert.match(p.eroare.mesaj, /remotion@remotion/);
  } finally {
    curata();
  }
});

test('integritate: un fișier modificat și unul lipsă dau integritate-kit, cu ambele căi', async () => {
  const { ctx, curata } = pregateste({}, { fisiere: { 'nucleu/a.txt': 'a\n', 'nucleu/b.txt': 'b modificat\n' } });
  try {
    ctx.versiuni.integritate = { 'nucleu/a.txt': sha256Text('a\n'), 'nucleu/b.txt': sha256Text('b\n'), 'nucleu/c.txt': sha256Text('c\n') };
    const i = dupaId(await verificariComplete(ctx), 'integritate');
    assert.equal(i.nivel, 'eroare');
    assert.equal(i.valoare, 2);
    assert.equal(i.eroare.cod, 'integritate-kit');
    assert.match(i.eroare.mesaj, /nucleu\/b\.txt, nucleu\/c\.txt \(lipsă\)/);
    assert.doesNotMatch(i.eroare.mesaj, /a\.txt/);
    ctx.versiuni.integritate = { 'nucleu/a.txt': sha256Text('a\n') };
    assert.equal(dupaId(await verificariComplete(ctx), 'integritate').nivel, 'ok');
  } finally {
    curata();
  }
});

test('fonturi: un font doar cu subsetul latin dă font-fara-diacritice, cu literele lipsă', async () => {
  const fontJson = {
    id: 'inter', familie: 'MG Inter', sursa: '@fontsource/inter@5.3.0', licenta: 'OFL-1.1',
    fisiere: [{ greutate: 700, subset: 'latin', fisier: 'inter-700-latin.woff2', sha256: '0'.repeat(64), unicode_range: 'U+0000-00FF' }],
  };
  const { ctx, curata } = pregateste({}, {
    copiaza: ['motoare/comun/fonturi/inter/inter-700-latin.woff2'],
    fisiere: { 'motoare/comun/fonturi/inter/font.json': JSON.stringify(fontJson) },
  });
  try {
    const f = dupaId(await verificariComplete(ctx), 'fonturi');
    assert.equal(f.nivel, 'eroare');
    assert.equal(f.eroare.cod, 'font-fara-diacritice');
    assert.match(f.eroare.mesaj, /inter \(ășțĂȘȚ\)/);
  } finally {
    curata();
  }
});

test('fără skilluri și pluginuri globale, pluginuri-globale e ok', async () => {
  const { ctx, curata } = pregateste({ '.claude/plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'superpowers@superpowers-marketplace': [] } }) });
  try {
    assert.equal(dupaId(await verificariComplete(ctx), 'pluginuri-globale').nivel, 'ok');
  } finally {
    curata();
  }
});

/**
 * Instalează în casa simulată pluginuri cu formatul real din ~/.claude/plugins/installed_plugins.json (versiunea 2):
 * fiecare plugin are un folder sub cache/, iar `fisiere` (căi relative la folderul pluginului) îi dă conținutul.
 * @param {{ acasa: string }} ctx
 * @param {Record<string, { fisiere?: Record<string, string>, scope?: string, projectPath?: string, faraFolder?: boolean }>} pluginuri
 */
function instaleazaPluginuri(ctx, pluginuri) {
  const plugins = {};
  for (const [nume, { fisiere = {}, scope = 'user', projectPath, faraFolder = false }] of Object.entries(pluginuri)) {
    const installPath = path.join(ctx.acasa, '.claude', 'plugins', 'cache', nume.replace('@', '-'), '1.0.0');
    if (!faraFolder) {
      fs.mkdirSync(installPath, { recursive: true });
      for (const [cale, continut] of Object.entries(fisiere)) {
        fs.mkdirSync(path.dirname(path.join(installPath, cale)), { recursive: true });
        fs.writeFileSync(path.join(installPath, cale), continut);
      }
    }
    plugins[nume] = [{ scope, ...(projectPath ? { projectPath } : {}), installPath, version: '1.0.0' }];
  }
  fs.mkdirSync(path.join(ctx.acasa, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(ctx.acasa, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
}

const HOOKURI = JSON.stringify({ description: 'x', hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo salut' }] }] } });
const CU_HOOKURI = { fisiere: { 'hooks/hooks.json': HOOKURI } };

function scrieSetari(cale, enabledPlugins) {
  fs.mkdirSync(path.dirname(cale), { recursive: true });
  fs.writeFileSync(cale, JSON.stringify({ enabledPlugins }));
}

test('pluginuri-hookuri: un plugin cu hooks/hooks.json dă avertismentul pluginuri-cu-hookuri, cu numele lui', async () => {
  const { ctx, curata } = pregateste();
  try {
    instaleazaPluginuri(ctx, { 'claude-mem@thedotmack': CU_HOOKURI, 'zernio@zernio': { fisiere: { '.mcp.json': '{}' } } });
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-hookuri');
    assert.equal(p.nivel, 'avertisment');
    assert.equal(p.valoare, 1);
    assert.equal(p.eroare.cod, 'pluginuri-cu-hookuri');
    assert.equal(p.eroare.camp, 'mediu.pluginuri-hookuri');
    assert.match(p.eroare.mesaj, /claude-mem@thedotmack/);
    assert.doesNotMatch(p.eroare.mesaj, /zernio/);
    assert.match(p.eroare.mesaj, /rulează și în folderul agentului/);
    assert.match(p.eroare.sugestie, /\.claude\/settings\.local\.json/);
    assert.match(p.eroare.sugestie, /"claude-mem@thedotmack": false/);
    assert.equal(dupaId(await verificariComplete(ctx), 'pluginuri-globale').nivel, 'ok', 'avertismentul pentru skilluri rămâne separat');
  } finally {
    curata();
  }
});

test('pluginuri-hookuri: hook-uri declarate în .claude-plugin/plugin.json (inline sau prin cale) numără; câmpul gol nu', async () => {
  const { ctx, curata } = pregateste();
  try {
    instaleazaPluginuri(ctx, {
      'inline@m': { fisiere: { '.claude-plugin/plugin.json': JSON.stringify({ name: 'inline', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } }) } },
      'cale@m': { fisiere: { '.claude-plugin/plugin.json': JSON.stringify({ name: 'cale', hooks: './altele/hooks.json' }) } },
      'gol-json@m': { fisiere: { '.claude-plugin/plugin.json': JSON.stringify({ name: 'g', hooks: {} }) } },
      'gol-hooks@m': { fisiere: { 'hooks/hooks.json': JSON.stringify({ hooks: {} }) } },
      'fara@m': { fisiere: { '.claude-plugin/plugin.json': JSON.stringify({ name: 'fara' }) } },
      'stricat@m': { fisiere: { '.claude-plugin/plugin.json': '{ nu e json' } },
    });
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-hookuri');
    assert.equal(p.valoare, 2);
    assert.match(p.eroare.mesaj, /inline@m/);
    assert.match(p.eroare.mesaj, /cale@m/);
    assert.doesNotMatch(p.eroare.mesaj, /gol-json|gol-hooks|fara@m|stricat/);
  } finally {
    curata();
  }
});

test('pluginuri-hookuri: fără pluginuri cu hook-uri e ok; fără installed_plugins.json la fel', async () => {
  const { ctx, curata } = pregateste();
  try {
    assert.equal(dupaId(await verificariComplete(ctx), 'pluginuri-hookuri').valoare, 'niciunul');
    instaleazaPluginuri(ctx, { 'zernio@zernio': { fisiere: { '.mcp.json': '{}' } }, 'lipsa@m': { faraFolder: true } });
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-hookuri');
    assert.equal(p.nivel, 'ok');
    assert.equal(p.eroare, null);
    assert.equal(p.valoare, 'niciunul');
  } finally {
    curata();
  }
});

test('pluginuri-hookuri: un plugin oprit global, de agent sau în settings.local.json nu se listează; local bate proiectul', async () => {
  const { ctx, curata } = pregateste();
  try {
    instaleazaPluginuri(ctx, { 'global@m': CU_HOOKURI, 'proiect@m': CU_HOOKURI, 'local@m': CU_HOOKURI, 'activ@m': CU_HOOKURI, 'repornit@m': CU_HOOKURI });
    scrieSetari(path.join(ctx.acasa, '.claude', 'settings.json'), { 'global@m': false, 'activ@m': true });
    scrieSetari(path.join(ctx.radacina, '.claude', 'settings.json'), { 'proiect@m': false, 'repornit@m': false });
    scrieSetari(path.join(ctx.radacina, '.claude', 'settings.local.json'), { 'local@m': false, 'repornit@m': true });
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-hookuri');
    assert.equal(p.valoare, 2);
    assert.match(p.eroare.mesaj, /activ@m/);
    assert.match(p.eroare.mesaj, /repornit@m/);
    assert.doesNotMatch(p.eroare.mesaj, /global@m|proiect@m|local@m/);
  } finally {
    curata();
  }
});

test('pluginuri-hookuri: dacă toate pluginurile cu hook-uri sunt oprite, e ok; un settings.json necitibil se ignoră', async () => {
  const { ctx, curata } = pregateste();
  try {
    instaleazaPluginuri(ctx, { 'a@m': CU_HOOKURI });
    scrieSetari(path.join(ctx.radacina, '.claude', 'settings.json'), { 'a@m': false });
    fs.writeFileSync(path.join(ctx.acasa, '.claude', 'settings.json'), '{ nu e json');
    assert.equal(dupaId(await verificariComplete(ctx), 'pluginuri-hookuri').nivel, 'ok');
    stergeRecursiv(path.join(ctx.radacina, '.claude', 'settings.json'));
    assert.equal(dupaId(await verificariComplete(ctx), 'pluginuri-hookuri').nivel, 'avertisment');
  } finally {
    curata();
  }
});

test('pluginuri-hookuri: un plugin legat de alt proiect (scope project) nu se listează, unul legat de agent da', async () => {
  const { ctx, curata } = pregateste();
  try {
    instaleazaPluginuri(ctx, {
      'altul@m': { ...CU_HOOKURI, scope: 'project', projectPath: path.join(ctx.acasa, 'alt-proiect') },
      'acesta@m': { ...CU_HOOKURI, scope: 'local', projectPath: ctx.radacina },
    });
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-hookuri');
    assert.equal(p.valoare, 1);
    assert.match(p.eroare.mesaj, /acesta@m/);
    assert.doesNotMatch(p.eroare.mesaj, /altul@m/);
  } finally {
    curata();
  }
});

test('pluginuri-hookuri: installed_plugins.json necitibil rămâne ok, cu valoarea „installed_plugins.json necitibil”', async () => {
  const { ctx, curata } = pregateste({ '.claude/plugins/installed_plugins.json': '{ nu e json' });
  try {
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-hookuri');
    assert.equal(p.nivel, 'ok');
    assert.equal(p.valoare, 'installed_plugins.json necitibil');
  } finally {
    curata();
  }
});

/** O stare verde, ca după o rulare completă fără --ci, cu canarul scris și neconfirmat. */
function stareVerde(radacina) {
  const { sha256 } = scrieCanar(radacina, new Date('2026-10-01T10:00:00.000Z'));
  const ok = (id) => ({ id, ok: true, nivel: 'ok', valoare: null, eroare: null });
  scrieStare(radacina, {
    versiune: 1,
    scris_la: '2026-10-01T10:00:00.000Z',
    platforma: 'win32-x64',
    node: '22.11.0',
    claude_code: '2.1.282',
    ok: true,
    verificari: ['node', 'platforma', 'claude', 'cale', 'spatiu', 'memorie', 'integritate', 'ffmpeg', 'ffprobe', 'chrome', 'fonturi', 'randare-proba'].map(ok),
    canar: { scris_la: '2026-10-01T10:00:00.000Z', sha256, confirmat: false, confirmat_la: null },
    versiuni_sha256: sha256Fisier(path.join(radacina, 'nucleu', 'VERSIUNI.json')),
  });
}

test('.instalat apare doar după --confirma-canar, pe o stare verde cu canarul neatins și chitanța gărzii', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['nucleu/VERSIUNI.json'] });
  try {
    stareVerde(radacina);
    // D1: garda a refuzat scrierea prin terminal pe acest canar (fără chitanță: canar-nefacut).
    scrieChitantaCanar(radacina, 'PowerShell');
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { ci: false, confirmaCanar: true, json: false } });
    assert.equal(cod, 0);
    assert.equal(raport.instalat, true);
    assert.equal(raport.faza, 'canar');
    const instalat = JSON.parse(fs.readFileSync(path.join(radacina, '.instalat'), 'utf8'));
    assert.equal(instalat.versiune, 1);
    const stare = citesteStare(radacina);
    assert.equal(stare.ok, true);
    assert.equal(stare.canar.confirmat, true);
    assert.match(stare.canar.confirmat_la, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(stare.verificari.at(-1).id, 'canar');
  } finally {
    curata();
  }
});

test('--confirma-canar cu un canar modificat dă canar-esuat, codul 2 și fără .instalat', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['nucleu/VERSIUNI.json'] });
  try {
    stareVerde(radacina);
    fs.writeFileSync(path.join(radacina, 'nucleu', '.canar'), 'scris de agent\n');
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { confirmaCanar: true } });
    assert.equal(cod, 2);
    assert.equal(raport.erori[0].cod, 'canar-esuat');
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
    assert.equal(citesteStare(radacina).canar.confirmat, false);
  } finally {
    curata();
  }
});

test('--confirma-canar pe o stare fără randarea de probă reușită nu scrie .instalat', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['nucleu/VERSIUNI.json'] });
  try {
    stareVerde(radacina);
    const stare = citesteStare(radacina);
    stare.verificari = stare.verificari.filter((r) => r.id !== 'randare-proba');
    scrieStare(radacina, stare);
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { confirmaCanar: true } });
    assert.equal(cod, 2);
    assert.equal(raport.erori[0].cod, 'canar-nefacut');
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
  } finally {
    curata();
  }
});

test('--confirma-canar fără nicio stare dă canar-nefacut', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['nucleu/VERSIUNI.json'] });
  try {
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { confirmaCanar: true } });
    assert.equal(cod, 2);
    assert.equal(raport.erori[0].cod, 'canar-nefacut');
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
  } finally {
    curata();
  }
});

test('o rulare completă cu erori în faza 2 nu scrie canarul, nici USER.md, nici .instalat', async () => {
  // linux-x64 nu are rezervă ffprobe în VERSIUNI.json, deci testul nu descarcă nimic.
  const { radacina, curata } = creeazaRadacinaTemp({
    copiaza: ['nucleu/VERSIUNI.json', 'USER.exemplu.md', 'MEMORY.exemplu.md'],
    fisiere: {
      'nucleu/package-lock.json': JSON.stringify({ name: 'n', lockfileVersion: 3, packages: { '': {} } }),
      'nucleu/node_modules/.package-lock.json': JSON.stringify({ name: 'n', lockfileVersion: 3, packages: {} }),
      'motoare/hyperframes/package-lock.json': JSON.stringify({ name: 'm', lockfileVersion: 3, packages: { '': {} } }),
      'motoare/hyperframes/node_modules/.package-lock.json': JSON.stringify({ name: 'm', lockfileVersion: 3, packages: {} }),
    },
  });
  try {
    const { cod, raport } = await comandaDoctor({
      radacina,
      optiuni: { ci: false },
      ctx: {
        platforma: 'linux', arhitectura: 'x64', versiuneNode: '22.11.0', memorieTotala: 16 * GIB,
        spatiuLiber: async () => 50 * GIB, versiuneClaude: async () => '2.1.282', acasa: path.join(radacina, 'acasa'),
      },
    });
    assert.equal(cod, 2);
    assert.equal(raport.faza, 'complet');
    assert.equal(raport.canar, null);
    assert.equal(fs.existsSync(path.join(radacina, 'nucleu', '.canar')), false);
    assert.equal(fs.existsSync(path.join(radacina, 'USER.md')), false);
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
    assert.equal(citesteStare(radacina).ok, false);
  } finally {
    curata();
  }
});

test('installed_plugins.json cu JSON invalid rămâne ok, cu valoarea „installed_plugins.json necitibil”', async () => {
  const { ctx, curata } = pregateste({ '.claude/plugins/installed_plugins.json': '{ nu e json' });
  try {
    const p = dupaId(await verificariComplete(ctx), 'pluginuri-globale');
    assert.equal(p.nivel, 'ok');
    assert.equal(p.valoare, 'installed_plugins.json necitibil');
  } finally {
    curata();
  }
});
