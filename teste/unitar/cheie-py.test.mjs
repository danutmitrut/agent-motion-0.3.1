// nucleu/cheie.py (spec 5.9, felia 5) cu Python real, dar cu un keyring simulat pe PYTHONPATH: seiful real nu se atinge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const CHEIE_PY = fileURLToPath(new URL('../../nucleu/cheie.py', import.meta.url));
const PYTHON = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);

const KEYRING_FALS = `import json, os
F = os.path.join(os.path.dirname(__file__), "seif.json")
def _c():
    return json.load(open(F, encoding="utf-8")) if os.path.exists(F) else {}
def get_password(s, n):
    return _c().get(s + "/" + n)
def set_password(s, n, v):
    c = _c(); c[s + "/" + n] = v; json.dump(c, open(F, "w", encoding="utf-8"))
def delete_password(s, n):
    c = _c(); c.pop(s + "/" + n, None); json.dump(c, open(F, "w", encoding="utf-8"))
`;

test('cheie.py: verifica, citeste și sterge, cu numele de serviciu agent-motion; fără keyring, codul 2', { skip: !PYTHON && 'fără Python' }, () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'pylib/keyring.py': KEYRING_FALS } });
  try {
    const pylib = join(radacina, 'pylib');
    const ruleaza = (...a) => spawnSync(PYTHON, [CHEIE_PY, ...a], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: pylib, PYTHONUTF8: '1' } });
    let r = ruleaza('verifica', 'kie');
    assert.equal(r.status, 1);
    assert.equal(r.stdout.trim(), 'nu');
    assert.equal(ruleaza('citeste', 'kie').status, 1);
    // o cheie pusă de cursant (aici, direct în seiful simulat)
    spawnSync(PYTHON, ['-c', 'import keyring; keyring.set_password("agent-motion", "kie", "valoarea")'], { env: { ...process.env, PYTHONPATH: pylib } });
    r = ruleaza('verifica', 'kie');
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), 'da', 'verifica nu afișează valoarea');
    r = ruleaza('citeste', 'kie');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'valoarea');
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(pylib, 'seif.json'), 'utf8'))), ['agent-motion/kie']);
    assert.equal(ruleaza('sterge', 'kie').status, 0);
    assert.equal(ruleaza('verifica', 'kie').status, 1);
    assert.equal(ruleaza('pune', 'altceva').status, 3);
    // un seif care aruncă (sesiune SSH pe Windows, Keychain blocat) iese cu 4, nu cu 1 („lipsă”)
    writeFileSync(join(pylib, 'keyring.py'), 'def get_password(s, n):\n    raise OSError(1312, "A specified logon session does not exist")\n');
    r = ruleaza('verifica', 'kie');
    assert.equal(r.status, 4);
    assert.match(r.stderr, /Seiful sistemului n-a răspuns: OSError/);
    r = spawnSync(PYTHON, [CHEIE_PY, 'verifica', 'kie'], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: join(radacina, 'gol'), PYTHONNOUSERSITE: '1' } });
    // fără keyring instalat în Python-ul de sistem: codul 2 și trimiterea la doctor --generare
    if (spawnSync(PYTHON, ['-c', 'import keyring'], { env: { ...process.env, PYTHONNOUSERSITE: '1' } }).status !== 0) {
      assert.equal(r.status, 2);
      assert.match(r.stderr, /doctor --generare/);
    }
  } finally {
    curata();
  }
});
