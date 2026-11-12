// F18 (revizuirea finală): o eroare internă a gărzii iese ca refuz cu motiv propriu, iar stack-ul ajunge pe stderr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';

const MOTIV_INTERN = 'Garda a întâlnit o eroare internă; din siguranță, refuz.';

function motivul(r) {
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
}

// O rădăcină care nu e șir face clasificaCale să arunce; e cel mai simplu defect intern reproductibil.
const MEDIU_STRICAT = { radacina: 42, env: {}, acum: new Date('2026-10-02T10:00:00.000Z') };

test('PreToolUse Bash: excepția din decideComanda nu mai devine „scrie comanda mai simplu”', async () => {
  const intrare = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo x > note.txt' } });
  const r = await proceseazaHook(intrare, MEDIU_STRICAT);
  assert.equal(r.cod, 2);
  assert.equal(motivul(r), MOTIV_INTERN);
  assert.match(r.stderr ?? '', /clasificaCale/);
  assert.match(r.stderr ?? '', /\n\s+at /, 'stderr conține stack-ul');
});

test('PreToolUse PowerShell: același motiv și stack pe stderr', async () => {
  const intrare = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_input: { command: 'Set-Content note.txt x' } });
  const r = await proceseazaHook(intrare, MEDIU_STRICAT);
  assert.equal(r.cod, 2);
  assert.equal(motivul(r), MOTIV_INTERN);
  assert.match(r.stderr ?? '', /\n\s+at /);
});

test('PreToolUse Write: eroarea internă are motivul ei, nu „nu a putut citi cererea”', async () => {
  const intrare = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'note.txt', content: 'x' } });
  const r = await proceseazaHook(intrare, MEDIU_STRICAT);
  assert.equal(r.cod, 2);
  assert.equal(motivul(r), MOTIV_INTERN);
  assert.match(r.stderr ?? '', /\n\s+at /);
});
