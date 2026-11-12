import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADACINA = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const YAML = createRequire(join(RADACINA, 'nucleu', 'package.json'))('yaml');
const CALE_CI = 'Proiecte Ăîș test/agent-motion';
const textCi = readFileSync(join(RADACINA, '.github', 'workflows', 'ci.yml'), 'utf8');
const ci = YAML.parse(textCi);
const job = ci.jobs.windows;

test('ci.yml: rulează la push pe stabil, la pull request și la cerere', () => {
  assert.deepEqual(Object.keys(ci.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(ci.on.push.branches, ['stabil']);
  assert.deepEqual(ci.permissions, { contents: 'read' });
});

test('ci.yml: job pe windows-latest, din calea cu spațiu și diacritice, cu Node 22', () => {
  assert.equal(job['runs-on'], 'windows-latest');
  assert.equal(job.defaults.run.shell, 'pwsh');
  assert.equal(job.defaults.run['working-directory'], CALE_CI);
  const checkout = job.steps.find((s) => String(s.uses).startsWith('actions/checkout@'));
  assert.equal(checkout.with.path, CALE_CI);
  const node = job.steps.find((s) => String(s.uses).startsWith('actions/setup-node@'));
  assert.equal(String(node.with['node-version']), '22');
});

test('ci.yml: pașii obligatorii, în ordine', () => {
  const comenzi = job.steps.map((s) => String(s.run ?? ''));
  const asteptate = [
    "git ls-files -s | Select-String -Pattern '^120000'",
    'node nucleu/mg.mjs doctor --ci',
    'node --test "teste/unitar/*.test.mjs"',
    'node --test teste/garda/garda.test.mjs',
    'node --test "teste/configuratie/*.test.mjs"',
    'node --test --test-concurrency=1 "teste/integrare/*.test.mjs"',
  ];
  let ultim = -1;
  for (const a of asteptate) {
    const i = comenzi.findIndex((c, k) => k > ultim && c.includes(a));
    assert.ok(i > ultim, `pasul lipsește sau e în altă ordine: ${a}`);
    ultim = i;
  }
  const integrare = job.steps.find((s) => String(s.run ?? '').includes('teste/integrare'));
  assert.equal(integrare.env.MG_TESTE_INTEGRARE, '1');
});

test('ci.yml: termenul Windows e 150 de minute, iar jobul normal sare mereu părțile grele B-E', () => {
  assert.equal(job['timeout-minutes'], 150);
  assert.equal(job.if, undefined, 'jobul normal rulează la orice eveniment');
  const integrare = job.steps.find((s) => String(s.run ?? '').includes('teste/integrare'));
  assert.equal(String(integrare.env.MG_TESTE_PIXELI_TEME), '0');
});

test('ci.yml: părțile grele B-E rulează doar la pornire manuală, în jobul lor de pe Windows', () => {
  const grele = ci.jobs['windows-pixeli-teme'];
  assert.ok(grele, 'lipsește jobul windows-pixeli-teme');
  assert.equal(grele.if, "github.event_name == 'workflow_dispatch'");
  assert.equal(grele['runs-on'], 'windows-latest');
  assert.equal(grele['timeout-minutes'], 150);
  assert.equal(grele.defaults.run.shell, 'pwsh');
  assert.equal(grele.defaults.run['working-directory'], CALE_CI);
  const checkout = grele.steps.find((s) => String(s.uses).startsWith('actions/checkout@'));
  assert.equal(checkout.with.path, CALE_CI);
  const node = grele.steps.find((s) => String(s.uses).startsWith('actions/setup-node@'));
  assert.equal(String(node.with['node-version']), '22');
  const comenzi = grele.steps.map((s) => String(s.run ?? ''));
  const iDefender = comenzi.findIndex((c) => c.includes('DisableRealtimeMonitoring $false'));
  const iDoctor = comenzi.findIndex((c) => c.includes('node nucleu/mg.mjs doctor --ci'));
  const iPixeli = comenzi.findIndex((c) => c.includes('node --test --test-concurrency=1 teste/integrare/pixeli-teme.test.mjs'));
  assert.ok(iDefender >= 0 && iDoctor > iDefender && iPixeli > iDoctor, 'Defender, doctor, apoi pixeli-teme');
  assert.deepEqual(grele.steps[iPixeli].env, { MG_TESTE_INTEGRARE: '1', MG_TESTE_PIXELI_TEME: '1' });
});

test('ci.yml: integrarea pe Windows rulează doar la pornire manuală', () => {
  const integrare = job.steps.find((s) => String(s.run ?? '').includes('teste/integrare'));
  assert.equal(integrare.if, "github.event_name == 'workflow_dispatch'");
  const rapide = job.steps.filter((s) => /teste\/(unitar|garda|configuratie)/.test(String(s.run ?? '')));
  assert.equal(rapide.length, 3);
  for (const pas of rapide) assert.equal(pas.if, undefined, `pasul rapid trebuie să ruleze la push: ${pas.name}`);
});

test('ci.yml: Defender nu e oprit de noi, ci repornit', () => {
  assert.doesNotMatch(textCi, /DisableRealtimeMonitoring\s+\$true/i);
  assert.match(textCi, /DisableRealtimeMonitoring \$false/);
});

test('ci.yml: nu publică nimic și nu folosește secrete', () => {
  assert.doesNotMatch(textCi, /secrets\./);
  assert.doesNotMatch(textCi, /git push|npm publish/);
});

test('protocolul manual de pe Windows acoperă pluginurile, garda, canarul și T1', () => {
  const md = readFileSync(join(RADACINA, 'teste', 'manual', 'windows-t1-canar.md'), 'utf8');
  for (const titlu of ['## 1. Pregătirea', '## 2. Pluginurile și skillurile globale', '## 3. Garda', '## 4. Canarul', '## 5. T1: verdictul revizorului', '## 6. Raportul']) {
    assert.ok(md.includes(titlu), `lipsește secțiunea „${titlu}”`);
  }
  for (const termen of ['SubagentStop', 'SubagentHandback', '--confirma-canar', 'revizie-1.md', 'revizie-schita-1.md', 'enabledPlugins', 'is not matched by file permission checks', '.claude/settings.local.json']) {
    assert.ok(md.includes(termen), `protocolul nu pomenește ${termen}`);
  }
});

test('biblioteci.yml: filtrele paths prind fiecare modul din nucleu/lib importat de verificator (B07 M4)', () => {
  const wf = YAML.parse(readFileSync(join(RADACINA, '.github', 'workflows', 'biblioteci.yml'), 'utf8'));
  const sursa = readFileSync(join(RADACINA, 'unelte', 'import-biblioteci', 'verifica.mjs'), 'utf8');
  const module = [...sursa.matchAll(/from '\.\.\/\.\.\/(nucleu\/lib\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(module.length >= 5, module.join(', '));
  const prinde = (filtre, cale) => filtre.some((f) => f === cale || (f.endsWith('/**') && cale.startsWith(f.slice(0, -2))));
  for (const eveniment of ['push', 'pull_request']) {
    for (const m of module) assert.ok(prinde(wf.on[eveniment].paths, m), `${eveniment}: ${m}`);
  }
});

test('biblioteci.yml: unealta traseelor a ieșit din repo (C09), fără filtru și fără pas pentru ea', () => {
  const text = readFileSync(join(RADACINA, '.github', 'workflows', 'biblioteci.yml'), 'utf8');
  assert.ok(!text.includes('unelte/trasee'), 'biblioteci.yml mai pomenește unelte/trasee');
  const wf = YAML.parse(text);
  for (const eveniment of ['push', 'pull_request']) {
    assert.ok(!wf.on[eveniment].paths.some((f) => f.includes('trasee')), `${eveniment}: filtru de trasee`);
  }
  assert.ok(!existsSync(join(RADACINA, 'unelte', 'trasee')), 'unelte/trasee/ încă există');
});
