// F4 (revizuirea finală): un symlink sau o joncțiune spre kit, spre fișierele produse de mg sau spre .claude/
// nu deschide aceste zone pentru Write, Edit și comenzi; crearea legăturilor spre ele e refuzată.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideScriere } from '../../nucleu/lib/garda/scriere.mjs';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

// Joncțiunile de pe Windows nu cer drepturi de administrator; pe Mac și Linux e un symlink obișnuit.
const leaga = (tinta, cale) => fs.symlinkSync(tinta, cale, process.platform === 'win32' ? 'junction' : 'dir');

function cuRadacina(corp) {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/mg.mjs': '// mg\n',
      'video/p/date.json': '{}\n',
      'video/p/resurse/.gitkeep': '',
      '.claude/settings.json': '{}\n',
    },
  });
  try {
    leaga(path.join(radacina, 'nucleu'), path.join(radacina, 'k'));
    leaga(path.join(radacina, 'video', 'p'), path.join(radacina, 'vp'));
    leaga(path.join(radacina, '.claude'), path.join(radacina, 'c'));
    leaga(path.join(radacina, 'video', 'p', 'resurse'), path.join(radacina, 'r'));
    corp(radacina);
  } finally {
    curata();
  }
}

test('Write și Edit printr-o legătură spre o zonă protejată sunt refuzate', () => {
  cuRadacina((radacina) => {
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'k', 'mg.mjs'), content: 'x' }, radacina).decizie, 'refuza');
    assert.equal(decideScriere('Edit', { file_path: path.join(radacina, 'k', 'mg.mjs'), old_string: 'mg', new_string: 'x' }, radacina).decizie, 'refuza');
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'vp', 'verificare.json'), content: '{}' }, radacina).decizie, 'refuza');
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'vp', 'motor.lock'), content: '{}' }, radacina).decizie, 'refuza');
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'c', 'settings.json'), content: '{}' }, radacina).decizie, 'refuza');
  });
});

test('o legătură din afara agentului spre kit e refuzată la fel', () => {
  cuRadacina((radacina) => {
    const afara = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-legatura-'));
    try {
      leaga(path.join(radacina, 'nucleu'), path.join(afara, 'k'));
      assert.equal(decideScriere('Write', { file_path: path.join(afara, 'k', 'mg.mjs'), content: 'x' }, radacina).decizie, 'refuza');
    } finally {
      fs.rmSync(afara, { recursive: true, force: true });
    }
  });
});

test('o comandă care scrie printr-o legătură spre kit e refuzată', () => {
  cuRadacina((radacina) => {
    const unealta = process.platform === 'win32' ? 'PowerShell' : 'Bash';
    assert.equal(decideComanda('echo x > k/mg.mjs', unealta, radacina).decizie, 'refuza');
    assert.equal(decideComanda('rm vp/verificare.json', unealta, radacina).decizie, 'refuza');
  });
});

test('legăturile spre zone libere și scrierile obișnuite rămân permise', () => {
  cuRadacina((radacina) => {
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'r', 'a.txt'), content: 'x' }, radacina).decizie, 'permite');
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'vp', 'date.json'), content: '{}' }, radacina).decizie, 'permite');
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'video', 'p', 'nou.txt'), content: 'x' }, radacina).decizie, 'permite');
    assert.equal(decideScriere('Write', { file_path: path.join(radacina, 'nou', 'adanc', 'x.txt'), content: 'x' }, radacina).decizie, 'permite');
  });
});

test('crearea unei legături spre kit sau cu o țintă nesigură e refuzată', () => {
  const R = '/Users/x/agent motion';
  for (const [c, u] of [
    ['ln -s "$PWD/nucleu" k', 'Bash'],
    ['ln -s $(pwd)/.claude c', 'Bash'],
    ['cmd /c mklink /j k nucleu', 'PowerShell'],
    ['mklink /j k nucleu', 'PowerShell'],
    ['New-Item -ItemType Junction -Path k -Target nucleu', 'PowerShell'],
    ['New-Item -ItemType SymbolicLink -Path k -Target $d', 'PowerShell'],
  ]) assert.equal(decideComanda(c, u, R).decizie, 'refuza', `${u}: ${c}`);
});
