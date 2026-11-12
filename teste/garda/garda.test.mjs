import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';
import { refuza, intreaba, blocheazaStop, context } from '../../nucleu/lib/garda/raspuns.mjs';
import { clasificaCale } from '../../nucleu/lib/garda/cai.mjs';
import { gasesteCheie } from '../../nucleu/lib/garda/chei.mjs';
import { decideScriere } from '../../nucleu/lib/garda/scriere.mjs';
import { ruleazaGarda } from '../ajutoare/garda.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const ACUM = new Date('2026-10-01T10:00:00.000Z');
const cazuri = JSON.parse(fs.readFileSync(new URL('./cazuri.json', import.meta.url), 'utf8'));
const fixture = (nume) => JSON.parse(fs.readFileSync(new URL(`../fixtures/hook/${nume}`, import.meta.url), 'utf8'));

/** @param {{cod: number, stdout: string}} r */
function rezumat(r) {
  let json = null;
  try {
    json = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  } catch {
    json = null;
  }
  return {
    cod: r.cod,
    decizie: json?.hookSpecificOutput?.permissionDecision ?? null,
    block: json?.decision === 'block',
    stdoutGol: r.stdout.trim() === '',
    context: json?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit' && typeof json.hookSpecificOutput.additionalContext === 'string',
  };
}

function verifica(asteptat, r) {
  const s = rezumat(r);
  assert.equal(s.cod, asteptat.cod, `cod; stdout: ${r.stdout}; stderr: ${r.stderr ?? ''}`);
  assert.equal(s.decizie, asteptat.decizie, `decizie; stdout: ${r.stdout}`);
  assert.equal(s.block, asteptat.block, `block; stdout: ${r.stdout}`);
  if (asteptat.context === true) {
    assert.ok(s.context, `trebuia un context UserPromptSubmit: ${r.stdout}`);
  } else if (asteptat.cod === 0 && asteptat.decizie === null && !asteptat.block) {
    assert.ok(s.stdoutGol, `stdout trebuia gol: ${r.stdout}`);
  }
  if (s.decizie === 'deny') {
    const motiv = JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
    assert.ok(typeof motiv === 'string' && motiv.length > 10, 'refuzul are motiv în română');
  }
}

/** Rulează aceeași intrare direct și ca subproces și verifică ambele rezultate. */
async function ambele(intrare, radacina, asteptat) {
  const text = typeof intrare === 'string' ? intrare : JSON.stringify(intrare);
  verifica(asteptat, await proceseazaHook(text, { radacina, env: {}, acum: ACUM }));
  verifica(asteptat, await ruleazaGarda(intrare, { radacina }));
}

describe('cazurile din teste/garda/cazuri.json', () => {
  for (const caz of cazuri) {
    const text = typeof caz.intrare === 'string' ? caz.intrare : JSON.stringify(caz.intrare);
    test(`${caz.nume} (direct)`, async () => {
      verifica(caz.asteptat, await proceseazaHook(text, { radacina: caz.radacina, env: {}, acum: ACUM }));
    });
    test(`${caz.nume} (subproces)`, async () => {
      verifica(caz.asteptat, await ruleazaGarda(caz.intrare, { radacina: caz.radacina }));
    });
  }
});

describe('fixture-urile de hook, în forma din documentație', () => {
  test('pretooluse-write-win.json: Write în nucleu/mg.mjs cu cale Windows e refuzat cu exit 2', async () => {
    await ambele(fixture('pretooluse-write-win.json'), 'C:\\agent-motion', { cod: 2, decizie: 'deny', block: false });
  });
  test('pretooluse-write-posix.json: Write în nucleu/mg.mjs cu cale Mac e refuzat cu exit 2', async () => {
    await ambele(fixture('pretooluse-write-posix.json'), '/Users/x/agent motion', { cod: 2, decizie: 'deny', block: false });
  });
});

describe('garda.mjs ca proces', () => {
  test('cu stdin lăsat deschis, garda refuză după 5 s (exit 2)', { timeout: 15000 }, async () => {
    const garda = fileURLToPath(new URL('../../nucleu/garda.mjs', import.meta.url));
    const inceput = Date.now();
    const r = await new Promise((rezolva) => {
      const p = spawn(process.execPath, [garda], { env: { ...process.env, CLAUDE_PROJECT_DIR: 'C:\\agent-motion' }, windowsHide: true });
      let stdout = '';
      p.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
      p.on('close', (cod) => rezolva({ cod, stdout }));
      p.stdin.write('{"hook_event_name": "PreToolUse", ');
    });
    assert.equal(r.cod, 2);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(Date.now() - inceput >= 4500);
  });
});

const SCENARIU = [
  '# Scenariu: p',
  '',
  '## Scena 1',
  'Ce se vede: un laptop și o cafea',
  'Text: Luni, 8:30',
  'Durată estimată: 4 s',
  '',
  '<!-- mg:start -->',
  '## Ce apare pe ecran',
  '',
  '### Texte și cifre',
  '- Scena 1, eticheta: „LUNI, 8:30”',
  '- Scena 1, titlu, rândul 1: „Telefonul sună”',
  '',
  '### Stil și timpi',
  '- Ritm: normal; atmosferă: ceață',
  '<!-- mg:end -->',
  '',
].join('\n');

describe('blocul mg din scenariu.md (cu fișierul real pe disc)', () => {
  /** @param {(caleScenariu: string, radacina: string) => Promise<void>} corp */
  async function cuScenariu(corp) {
    const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'video/p/scenariu.md': SCENARIU } });
    try {
      await corp(path.join(radacina, 'video', 'p', 'scenariu.md'), radacina);
    } finally {
      curata();
    }
  }
  const editare = (file_path, old_string, new_string, replace_all = false) => ({
    hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path, old_string, new_string, replace_all },
  });
  const scriere = (file_path, content) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path, content } });

  test('un Edit care schimbă un text din blocul mg e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(f, '„Telefonul sună”', '„Telefonul tace”'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Edit care șterge marcajul de sfârșit e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(f, '<!-- mg:end -->\n', ''), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Edit în afara blocului mg e permis (exit 0, stdout gol)', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(f, 'Ce se vede: un laptop și o cafea', 'Ce se vede: un birou aglomerat'), r, { cod: 0, decizie: null, block: false });
    });
  });
  test('un Edit cu replace_all care atinge și blocul e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(f, 'Scena 1', 'Scena 2', true), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Edit fără replace_all schimbă doar prima apariție, din afara blocului, deci e permis', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(f, 'Scena 1', 'Scena 2'), r, { cod: 0, decizie: null, block: false });
    });
  });
  test('un Edit al cărui old_string nu există nu schimbă nimic, deci e permis', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(f, 'text care nu e în fișier', 'altceva'), r, { cod: 0, decizie: null, block: false });
    });
  });
  test('un Write care păstrează blocul identic și schimbă restul e permis', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(scriere(f, SCENARIU.replace('Durată estimată: 4 s', 'Durată estimată: 5 s')), r, { cod: 0, decizie: null, block: false });
    });
  });
  test('un Write care păstrează blocul, dar cu CRLF, e permis', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(scriere(f, SCENARIU.replace(/\n/g, '\r\n')), r, { cod: 0, decizie: null, block: false });
    });
  });
  test('un Write care schimbă blocul e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(scriere(f, SCENARIU.replace('„LUNI, 8:30”', '„MARȚI, 9:00”')), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Write care scoate tot blocul e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(scriere(f, '# Scenariu: p\n\n## Scena 1\n'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Write care adaugă un al doilea bloc e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(scriere(f, `${SCENARIU}\n<!-- mg:start -->\nx\n<!-- mg:end -->\n`), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Edit cu cale relativă la rădăcină, care schimbă blocul, e refuzat', async () => {
    await cuScenariu(async (_f, r) => {
      await ambele(editare('video/p/scenariu.md', '„Telefonul sună”', '„Telefonul tace”'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Write cu cale relativă și conținut fără bloc e refuzat', async () => {
    await cuScenariu(async (_f, r) => {
      await ambele(scriere('video/p/scenariu.md', '# Scenariu: p\n\n## Scena 1\n'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Write cu cale relativă care păstrează blocul identic e permis', async () => {
    await cuScenariu(async (_f, r) => {
      await ambele(scriere('video/p/scenariu.md', SCENARIU.replace('Durată estimată: 4 s', 'Durată estimată: 5 s')), r, { cod: 0, decizie: null, block: false });
    });
  });
  test('un Write pe calea absolută cu punct final și conținut fără bloc e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(scriere(`${f}.`, '# Scenariu: p\n\n## Scena 1\n'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Edit pe calea cu punct final, care schimbă blocul, e refuzat', async () => {
    await cuScenariu(async (f, r) => {
      await ambele(editare(`${f}.`, '„Telefonul sună”', '„Telefonul tace”'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
  test('un Edit pe calea /c/... care schimbă blocul e refuzat (doar pe Windows)', { skip: process.platform !== 'win32' }, async () => {
    await cuScenariu(async (f, r) => {
      const mingw = f.replace(/^([A-Za-z]):\\/, (_m, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/');
      await ambele(editare(mingw, '„Telefonul sună”', '„Telefonul tace”'), r, { cod: 2, decizie: 'deny', block: false });
    });
  });
});

describe('raspuns.mjs', () => {
  test('refuza, intreaba, blocheazaStop și context au forma documentată', () => {
    assert.deepEqual(JSON.parse(refuza('motiv')), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'motiv' } });
    assert.deepEqual(JSON.parse(intreaba('cost')), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'cost' } });
    assert.deepEqual(JSON.parse(blocheazaStop('lipsă')), { decision: 'block', reason: 'lipsă' });
    assert.deepEqual(JSON.parse(context('UserPromptSubmit', 'text')), { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'text' } });
  });
  test('niciun fișier al gărzii nu întoarce permissionDecision allow', () => {
    const dir = new URL('../../nucleu/lib/garda/', import.meta.url);
    const fisiere = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => new URL(f, dir));
    fisiere.push(new URL('../../nucleu/garda.mjs', import.meta.url));
    for (const f of fisiere) {
      assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /['"]allow['"]/, `${f.pathname} conține 'allow'`);
    }
  });
});

describe('cai.mjs: clasificaCale', () => {
  const W = 'C:\\agent-motion';
  test('zonele, pe căi Windows', () => {
    assert.equal(clasificaCale(`${W}\\nucleu\\mg.mjs`, W).zona, 'kit');
    assert.equal(clasificaCale(`${W}\\video\\p\\build\\index.html`, W).zona, 'generat');
    assert.equal(clasificaCale(`${W}\\video\\p\\scenariu.md`, W).zona, 'scenariu');
    assert.equal(clasificaCale(`${W}\\video\\p\\date.json`, W).zona, 'liber');
    assert.equal(clasificaCale(`${W}\\.claude\\settings.json`, W).zona, 'configuratie');
    assert.equal(clasificaCale(`${W}\\.claude\\settings.local.json`, W).zona, 'configuratie');
    assert.equal(clasificaCale(`${W}\\.claude\\agents\\revizor-cadre.md`, W).zona, 'configuratie');
    assert.equal(clasificaCale(`${W}\\.claude\\agents`, W).zona, 'configuratie');
    assert.equal(clasificaCale('C:\\altceva\\nucleu\\mg.mjs', W).zona, 'in-afara');
    assert.equal(clasificaCale('C:\\altceva\\nucleu\\mg.mjs', W).relativ, null);
  });
  test('relativ e calea curată, cu / și minuscule', () => {
    assert.deepEqual(clasificaCale('/c/AGENT-MOTION/Nucleu./MG.mjs', W), {
      zona: 'kit', relativ: 'nucleu/mg.mjs', motiv: 'motoare/, nucleu/ și biblioteci/ sunt kitul agentului și nu se modifică',
    });
  });
  test('o cale relativă se rezolvă față de rădăcină', () => {
    assert.equal(clasificaCale('nucleu/mg.mjs', '/Users/x/agent motion').zona, 'kit');
    assert.equal(clasificaCale('video/p/date.json', '/Users/x/agent motion').zona, 'liber');
  });
  test('pe Mac, majusculele diferite ale rădăcinii nu scot calea din agent', () => {
    assert.equal(clasificaCale('/Users/x/Agent Motion/nucleu/mg.mjs', '/Users/x/agent motion').zona, 'kit');
  });
  test('rădăcina însăși e liberă, iar un folder cu nume asemănător e în afară', () => {
    assert.equal(clasificaCale(W, W).zona, 'liber');
    assert.equal(clasificaCale('C:\\agent-motion-vechi\\nucleu\\mg.mjs', W).zona, 'in-afara');
  });
});

describe('chei.mjs: gasesteCheie', () => {
  test('recunoaște tiparele', () => {
    assert.deepEqual(gasesteCheie(`x sk-ant-${'a'.repeat(24)} y`), { tip: 'anthropic' });
    assert.deepEqual(gasesteCheie(`sk-${'A1'.repeat(20)}`), { tip: 'openai' });
    assert.deepEqual(gasesteCheie(`AIza${'B'.repeat(35)}`), { tip: 'google' });
    assert.deepEqual(gasesteCheie(`ghp_${'c'.repeat(36)}`), { tip: 'github' });
    assert.deepEqual(gasesteCheie(`github_pat_${'d'.repeat(60)}`), { tip: 'github-pat' });
    assert.deepEqual(gasesteCheie('xoxb-1234567890-abc'), { tip: 'slack' });
    assert.deepEqual(gasesteCheie('AKIAABCDEFGHIJKLMNOP'), { tip: 'aws' });
    assert.deepEqual(gasesteCheie('KIE_API_KEY = "abcdefghijklmnopqrstuvwxyz"'), { tip: 'generic' });
    assert.deepEqual(gasesteCheie('cheie: abcdefghijklmnopqrstuvwxyz'), { tip: 'generic' });
  });
  test('textul obișnuit nu e cheie', () => {
    assert.equal(gasesteCheie('Telefonul sună din nou. Scrie „AGENT” în comentarii.'), null);
    assert.equal(gasesteCheie('const cheie = gasesteCheie(text);'), null);
    assert.equal(gasesteCheie(''), null);
    assert.equal(gasesteCheie(undefined), null);
  });
});

describe('scriere.mjs: decideScriere', () => {
  test('cheia e refuzată înaintea oricărei căi, chiar și în afara agentului', () => {
    const d = decideScriere('Write', { file_path: 'C:\\altceva\\note.txt', content: `sk-ant-${'a'.repeat(24)}` }, 'C:\\agent-motion');
    assert.equal(d.decizie, 'refuza');
    assert.match(d.motiv, /cheie API \(anthropic\)/);
  });
  test('zona kit dă refuz cu motiv în română', () => {
    const d = decideScriere('Edit', { file_path: 'C:\\agent-motion\\nucleu\\mg.mjs', old_string: 'a', new_string: 'b' }, 'C:\\agent-motion');
    assert.equal(d.decizie, 'refuza');
    assert.match(d.motiv, /^nucleu\/mg\.mjs: /);
  });
  test('zona configuratie dă refuz care trimite la cursant (A-Î3)', () => {
    const d = decideScriere('Write', { file_path: '/Users/x/agent motion/.claude/settings.local.json', content: '{}' }, '/Users/x/agent motion');
    assert.equal(d.decizie, 'refuza');
    assert.match(d.motiv, /^\.claude\/settings\.local\.json: /);
    assert.match(d.motiv, /le modifică doar cursantul/);
    assert.match(d.motiv, /spune-i cursantului ce să modifice/);
  });
  test('zona liberă e permisă', () => {
    assert.deepEqual(decideScriere('Write', { file_path: 'C:\\agent-motion\\video\\p\\date.json', content: '{}' }, 'C:\\agent-motion'), { decizie: 'permite', motiv: '' });
  });
});
