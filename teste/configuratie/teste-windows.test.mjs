// Scriptul de pe laptopul de teste (unelte/teste-windows/ruleaza.ps1) rulează aceleași comenzi node ca jobul windows
// din ci.yml, plus pașii lui text-animat, overlay-filmare și date-serie (decizia din 2026-10-17: testele Windows pe
// laptop până la resetarea minutelor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const YAML = createRequire(join(REPO, 'nucleu', 'package.json'))('yaml');
const script = readFileSync(join(REPO, 'unelte', 'teste-windows', 'ruleaza.ps1'), 'utf8');
const ci = YAML.parse(readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8'));

/** Argumentele unei comenzi „node ...” ca listă PowerShell: @('a', 'b'). */
function caListaPs(comanda) {
  const parti = comanda.replace(/^node\s+/, '').match(/"[^"]*"|\S+/g).map((p) => p.replace(/^"|"$/g, ''));
  return `@(${parti.map((p) => `'${p}'`).join(', ')})`;
}

test('ruleaza.ps1 are fiecare comandă node din jobul windows al lui ci.yml', () => {
  const comenzi = ci.jobs.windows.steps.map((p) => String(p.run ?? '').trim()).filter((c) => c.startsWith('node '));
  assert.ok(comenzi.length >= 6, comenzi.join('\n'));
  for (const c of comenzi) assert.ok(script.includes(caListaPs(c)), `lipsește din ruleaza.ps1: ${c}`);
});

test('ruleaza.ps1 rulează testele șablonului text-animat și acceptarea lui, cu MG_TESTE_INTEGRARE=1 la acceptare', () => {
  assert.ok(script.includes("@('--test', 'motoare/hyperframes/sabloane/text-animat/teste/*.test.mjs')"));
  assert.match(script, /nume = 'acceptare-text'; argumente = @\('--test', '--test-concurrency=1', 'teste\/acceptare-text\/acceptare-text\.test\.mjs'\); env = @\{ MG_TESTE_INTEGRARE = '1' \}/);
});

test('ruleaza.ps1 rulează testele lui overlay-filmare (cu motorul real) și acceptarea lui, cu MG_TESTE_INTEGRARE=1', () => {
  assert.match(script, /nume = 'sablon-overlay'; argumente = @\('--test', '--test-concurrency=1', 'motoare\/hyperframes\/sabloane\/overlay-filmare\/teste\/\*\.test\.mjs'\); env = @\{ MG_TESTE_INTEGRARE = '1' \}/);
  assert.match(script, /nume = 'acceptare-overlay'; argumente = @\('--test', '--test-concurrency=1', 'teste\/acceptare-overlay\/acceptare-overlay\.test\.mjs'\); env = @\{ MG_TESTE_INTEGRARE = '1' \}/);
});

test('ruleaza.ps1 rulează testele lui date-serie (cu Remotion real) și acceptarea Grafic, cu MG_TESTE_INTEGRARE=1', () => {
  assert.match(script, /nume = 'sablon-date-serie'; argumente = @\('--test', '--test-concurrency=1', 'motoare\/remotion\/sabloane\/date-serie\/teste\/\*\.test\.mjs'\); env = @\{ MG_TESTE_INTEGRARE = '1' \}/);
  assert.match(script, /nume = 'acceptare-grafic'; argumente = @\('--test', '--test-concurrency=1', 'teste\/acceptare-grafic\/acceptare-grafic\.test\.mjs'\); env = @\{ MG_TESTE_INTEGRARE = '1' \}/);
});

test('ruleaza.ps1 e ASCII (PowerShell 5.1 citește fără BOM ca ANSI)', () => {
  assert.equal(/[^\x09\x0a\x0d\x20-\x7e]/.test(script), false);
});

test('rezumat.json se scrie fără BOM (Set-Content -Encoding UTF8 din PowerShell 5.1 pune BOM)', () => {
  assert.equal(script.includes('Set-Content -Path $rezumat'), false);
  assert.ok(script.includes('[IO.File]::WriteAllText($rezumat, $json, (New-Object System.Text.UTF8Encoding($false)))'));
  assert.equal((script.match(/WriteAllText\(\$rezumat/g) ?? []).length, 1, 'o singură funcție scrie rezumatul');
});
