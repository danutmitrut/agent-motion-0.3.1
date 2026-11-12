import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clasificaCale } from '../../nucleu/lib/garda/cai.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
const deny = settings.permissions.deny;
const allow = settings.permissions.allow;

// O cale reprezentativă pentru fiecare zonă protejată din nucleu/lib/garda/cai.mjs (harta 4.13).
const ZONE_PROTEJATE = [
  'motoare/hyperframes/package.json',
  'nucleu/mg.mjs',
  'nucleu/.canar',
  'biblioteci/catalog.json',
  'video/p/build/index.html',
  'video/p/active/desen.svg',
  'video/p/cadre/foaie-1.jpg',
  'video/p/cadre/revizie-1.md',
  'video/p/cadre/revizie-schita-1.md',
  'video/p/serie/manifest.json',
  'video/p/corecturi/1/incercare-1.json',
  'video/p/.cache/mesaj-cursant.json',
  'video/p/verificare.json',
  'video/p/motor.lock',
  'video/p/p.mp4',
  'video/p/serie/01-ana.mp4',
];

function globLaRegex(tipar) {
  let sursa = '';
  for (let i = 0; i < tipar.length; i += 1) {
    const c = tipar[i];
    if (c === '*' && tipar[i + 1] === '*') {
      if (tipar[i + 2] === '/') { sursa += '(?:.*/)?'; i += 2; } else { sursa += '.*'; i += 1; }
    } else if (c === '*') {
      sursa += '[^/]*';
    } else {
      sursa += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${sursa}$`);
}

function acoperita(unealta, rel) {
  return deny.some((regula) => {
    const m = /^(\w+)\((.*)\)$/.exec(regula);
    if (!m || m[1] !== unealta || !m[2].startsWith('/')) return false;
    return globLaRegex(m[2].slice(1)).test(rel);
  });
}

test('settings.json e exact forma din harta 6.1', () => {
  // Fără cheia env, deci fără CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: plafonul de 8 refuzuri al hook-ului Stop
  // se tratează doar prin regula din FLUX.md, pasul 8 (decizia A-Î6).
  const garda = { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/nucleu/garda.mjs'] };
  assert.deepEqual(settings, {
    permissions: {
      allow: [
        'Bash(node nucleu/mg.mjs *)',
        'Bash(node ./nucleu/mg.mjs *)',
        'PowerShell(node nucleu/mg.mjs *)',
        'PowerShell(node ./nucleu/mg.mjs *)',
        'PowerShell(node nucleu\\mg.mjs *)',
        'PowerShell(node .\\nucleu\\mg.mjs *)',
      ],
      deny: [
        'Edit(/motoare/**)',
        'Edit(/nucleu/**)',
        'Edit(/biblioteci/**)',
        'Edit(/video/*/build/**)',
        'Edit(/video/*/active/**)',
        'Edit(/video/*/cadre/**)',
        'Edit(/video/*/serie/**)',
        'Edit(/video/*/corecturi/**)',
        'Edit(/video/*/.cache/**)',
        'Edit(/video/*/verificare.json)',
        'Edit(/video/*/motor.lock)',
        'Edit(/video/**/*.mp4)',
        'Bash(git push:*)', 'Bash(npm publish:*)',
        'PowerShell(git push:*)', 'PowerShell(npm publish:*)',
      ],
    },
    hooks: {
      PreToolUse: [{ matcher: 'Bash|PowerShell|Write|Edit', hooks: [garda] }],
      PostToolUse: [{ matcher: 'SubagentHandback', hooks: [garda] }],
      Stop: [{ hooks: [garda] }],
      UserPromptSubmit: [{ hooks: [{ ...garda, timeout: 20 }] }],
      SubagentStop: [{ matcher: 'revizor-cadre', hooks: [garda] }],
    },
    autoMemoryEnabled: false,
    enabledPlugins: { 'hyperframes@hyperframes': false, 'remotion@remotion': false },
  });
});

test('fiecare hook pornește node în forma exec, cu un args[0] care există', () => {
  const evenimente = Object.keys(settings.hooks);
  assert.deepEqual(evenimente.sort(), ['PostToolUse', 'PreToolUse', 'Stop', 'SubagentStop', 'UserPromptSubmit']);
  for (const eveniment of evenimente) {
    for (const grup of settings.hooks[eveniment]) {
      for (const hook of grup.hooks) {
        assert.equal(hook.type, 'command', eveniment);
        assert.equal(hook.command, 'node', eveniment);
        assert.ok(Array.isArray(hook.args) && hook.args.length === 1, eveniment);
        const cale = hook.args[0].replace('${CLAUDE_PROJECT_DIR}', REPO);
        assert.ok(fs.statSync(cale).isFile(), `${eveniment}: ${cale}`);
      }
    }
  }
});

test('deny conține git push și npm publish pe Bash și pe PowerShell', () => {
  for (const regula of ['Bash(git push:*)', 'Bash(npm publish:*)', 'PowerShell(git push:*)', 'PowerShell(npm publish:*)']) {
    assert.ok(deny.includes(regula), regula);
  }
});

test('allow acoperă doar node nucleu/mg.mjs, în formele de cale ale cursantului (G2)', () => {
  // code.claude.com/docs/en/permissions: regulile Bash și PowerShell au aceeași formă, `*` la final potrivește și comanda goală,
  // iar la PowerShell potrivirea ignoră majusculele. Documentația nu spune nimic despre `./` sau `\` în reguli, deci fiecare
  // formă de cale are regula ei, iar Bash (Git Bash, unde `\` e escape) primește doar formele cu slash.
  const tipar = /^(Bash|PowerShell)\(node (?:\.[\\/])?nucleu[\\/]mg\.mjs \*\)$/;
  for (const regula of allow) assert.match(regula, tipar, regula);
  assert.equal(new Set(allow).size, allow.length, 'reguli duplicate');
  assert.ok(allow.every((r) => !/^Bash\(.*\\/.test(r)), 'Bash nu primește reguli cu backslash');
  // Nimic mai larg: nicio regulă fără cale, nicio regulă goală pe unealtă.
  for (const larg of ['Bash', 'PowerShell', 'Bash(*)', 'PowerShell(*)', 'Bash(node *)', 'PowerShell(node *)']) {
    assert.equal(allow.includes(larg), false, larg);
  }
  // Fiecare regulă allow are corespondentul ei pe cealaltă unealtă acolo unde forma există în ambele shell-uri.
  for (const forma of ['node nucleu/mg.mjs *', 'node ./nucleu/mg.mjs *']) {
    assert.ok(allow.includes(`Bash(${forma})`) && allow.includes(`PowerShell(${forma})`), forma);
  }
});

test('regulile de cale sunt ancorate cu / la rădăcina proiectului', () => {
  for (const regula of deny.filter((r) => /^Edit\(/.test(r))) {
    assert.match(regula, /^Edit\(\//, regula);
  }
});

test('fiecare zonă protejată din clasificaCale are o regulă Edit în deny', () => {
  for (const rel of ZONE_PROTEJATE) {
    const zona = clasificaCale(rel, REPO).zona;
    assert.ok(zona === 'kit' || zona === 'generat', `${rel} ar trebui să fie protejată, e ${zona}`);
    assert.ok(acoperita('Edit', rel), `lipsește Edit(...) pentru ${rel}`);
  }
  for (const rel of ['video/p/date.json', 'video/p/scenariu.md', 'video/p/jurnal.md', 'video/p/resurse/a.png', 'USER.md']) {
    assert.equal(acoperita('Edit', rel), false, `${rel} trebuie să rămână scriibil`);
  }
});

test('nicio regulă de cale pentru Write, NotebookEdit sau MultiEdit (Claude Code nu le consultă)', () => {
  // code.claude.com/docs/en/permissions: „Claude Code checks file permissions against `Edit(path)` and `Read(path)` rules only.
  // If you write a path rule for `Write`, `NotebookEdit`, `Glob`, or the legacy `MultiEdit` tool instead, Claude Code accepts
  // the rule but never consults it, and warns at startup”; „`Edit` rules apply to all built-in tools that edit files”.
  const ignorate = deny.filter((r) => /^(Write|NotebookEdit|MultiEdit|Glob)\(/.test(r));
  assert.deepEqual(ignorate, []);
});
