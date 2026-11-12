import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADACINA = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const YAML = createRequire(join(RADACINA, 'nucleu', 'package.json'))('yaml');
const text = readFileSync(join(RADACINA, '.github', 'workflows', 'pas0-vectorizare.yml'), 'utf8');
const flux = YAML.parse(text);
const job = flux.jobs.vectorizare;
const tot = job.steps.map((s) => String(s.run ?? '')).join('\n');

test('pas0-vectorizare.yml: pornește doar manual, pe windows-latest, din calea cu diacritice', () => {
  assert.deepEqual(Object.keys(flux.on), ['workflow_dispatch']);
  assert.deepEqual(flux.permissions, { contents: 'read' });
  assert.equal(job['runs-on'], 'windows-latest');
  assert.equal(job.defaults.run.shell, 'pwsh');
  assert.equal(job.defaults.run['working-directory'], 'Proiecte Ăîș test/agent-motion');
  const checkout = job.steps.find((s) => String(s.uses).startsWith('actions/checkout@'));
  assert.equal(checkout.with.path, 'Proiecte Ăîș test/agent-motion');
});

test('pas0-vectorizare.yml: verifică release-ul autotrace și sha256 înainte de orice', () => {
  assert.match(tot, /gh api repos\/autotrace\/autotrace\/releases\/latest/);
  assert.match(tot, /-ne '0\.31\.10'/);
  assert.match(tot, /autotrace-20240129-win64-setup\.exe/);
  assert.match(tot, /07ac6a0f6b776714d0f35ce9a1ff59ad545dafe7c35678e373fb1215651124c1/);
});

test('pas0-vectorizare.yml: rulează ca mgtest, fără drepturi de administrator, cu sonda înainte', () => {
  assert.match(tot, /net user mgtest \$parola \/add/);
  assert.doesNotMatch(tot, /localgroup Administrators mgtest/i);
  assert.match(tot, /-RunLevel Limited/);
  assert.match(tot, /::add-mask::\$parola/);
  const iSonda = tot.indexOf("'sonda'");
  const iToate = tot.indexOf("'toate'");
  assert.ok(iSonda > 0 && iToate > iSonda, 'sonda trebuie să ruleze înaintea testului');
  assert.match(tot, /in_grup_administratori/);
  assert.match(tot, /'--unelte', \(Join-Path \$aici 'unelte\/vectorizare'\)/);
});

test('pas0-vectorizare.yml: sarcina programată poate porni, iar o pornire eșuată se oprește repede și lasă diagnostic', () => {
  // dreptul de logon batch, acordat doar lui mgtest și verificat cu un logon real de tip 4
  assert.match(tot, /SeBatchLogonRight = \*\$sid/);
  assert.match(tot, /secedit \/configure /);
  // exportul secedit scrie conturile locale după nume, deci verificarea acceptă și mgtest și <MAȘINĂ>\mgtest
  assert.match(tot, /\$eu = @\("\*\$sid", 'mgtest', "\$env:COMPUTERNAME\\mgtest"\)/);
  assert.match(tot, /LogonUser\('mgtest', '\.', \$parola, 4, 0, \[ref\]\$jeton\)/);
  assert.doesNotMatch(tot, /localgroup ['"]?(Performance Log Users|Backup Operators)/i);
  // node pornit direct, dintr-o copie din workspace
  assert.match(tot, /New-ScheduledTaskAction -Execute \$env:MG_NODE /);
  assert.match(tot, /"MG_NODE=\$nodeMgtest" >> \$env:GITHUB_ENV/);
  assert.match(tot, /-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries/);
  // jurnalul Operational pornit înainte de Register-ScheduledTask
  const iJurnal = tot.indexOf('wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true');
  const iRegister = tot.indexOf('Register-ScheduledTask -TaskName');
  assert.ok(iJurnal > 0 && iRegister > iJurnal, 'jurnalul Operational trebuie pornit înainte de Register-ScheduledTask');
  // eșec rapid după 90 s și diagnosticul în pas0-lucru
  assert.match(tot, /TotalSeconds -ge 90/);
  assert.match(tot, /throw "Sarcina programată nu a pornit/);
  assert.match(tot, /pas0-lucru\/diagnostic-\$Nume\.txt/);
  for (const parte of ['Get-WinEvent', 'Get-ScheduledTaskInfo -TaskName $Nume', '.Principal', '.Settings', 'icacls $env:MG_NODE', 'icacls $aici', 'SeDenyBatchLogonRight']) {
    assert.ok(tot.includes(parte), `diagnosticul trebuie să conțină ${parte}`);
  }
});

test('pas0-vectorizare.yml: raportul ajunge în artefact, utilizatorul e șters, nimic nu se publică', () => {
  const artefact = job.steps.find((s) => String(s.uses).startsWith('actions/upload-artifact@'));
  assert.equal(artefact.with.name, 'raport-vectorizare');
  assert.equal(artefact.if, 'always()');
  assert.match(String(artefact.with.path), /pas0-lucru\//, 'artefactul include pas0-lucru, deci și jurnalele *.log');
  assert.match(tot, /net user mgtest \/delete/);
  // jurnalul scris de node (pas0-lucru/<comanda>.log) apare în jurnalul job-ului, înaintea throw
  assert.match(tot, /Afiseaza-Jurnal 'sonda'; throw "Sonda a ieșit cu \$cod\."/);
  assert.match(tot, /Afiseaza-Jurnal 'toate'; throw "Testul a ieșit cu \$cod\."/);
  assert.match(tot, /Get-Content \$jurnal/);
  assert.doesNotMatch(text, /secrets\./);
  assert.doesNotMatch(text, /git push|npm publish/);
});

test('docs/teste/pas0-vectorizare.md are marcajele de rezultate și secțiunea de decizie', () => {
  const md = readFileSync(join(RADACINA, 'docs', 'teste', 'pas0-vectorizare.md'), 'utf8');
  assert.ok(md.includes('<!-- rezultate:inceput -->'));
  assert.ok(md.includes('<!-- rezultate:sfarsit -->'));
  assert.ok(md.includes('## Decizia'));
});

test('docs/teste/pas0-vectorizare.md: Metoda spune că diagnosticul autotrace rulează doar la eșec și nu contează la eligibilitate', () => {
  const md = readFileSync(join(RADACINA, 'docs', 'teste', 'pas0-vectorizare.md'), 'utf8');
  const metoda = md.slice(md.indexOf('## Metoda'), md.indexOf('## Rezultatele'));
  assert.match(metoda, /câmpul `diagnostic` al candidatului/);
  assert.match(metoda, /rulează doar la eșecul lui autotrace și nu contează la eligibilitate/);
});
