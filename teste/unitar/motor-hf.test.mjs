import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  checkJson,
  mediuHyperframes,
  rezolvaBinHyperframes,
  ruleazaHyperframes,
  versiuneHyperframes,
  argumenteTaskkill,
} from '../../nucleu/lib/motor-hf.mjs';
import { citesteJurnalFals, HYPERFRAMES_FALS } from '../ajutoare/binare-false.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const FF = { ffmpeg: '/fals/ffmpeg', ffprobe: '/fals/ffprobe' };
const FIXATE = {
  HYPERFRAMES_NO_TELEMETRY: '1',
  DO_NOT_TRACK: '1',
  HYPERFRAMES_NO_UPDATE_CHECK: '1',
  HYPERFRAMES_NO_AUTO_INSTALL: '1',
  HYPERFRAMES_FFMPEG_PATH: '/fals/ffmpeg',
  HYPERFRAMES_FFPROBE_PATH: '/fals/ffprobe',
};
const CHEI_SECRETE = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'HYPERFRAMES_API_KEY'];

/** Rădăcină temporară și opțiunile comune pentru simulator, în modul cerut. */
function pregateste(mod) {
  const temp = creeazaRadacinaTemp();
  const mediu = {
    ...process.env,
    MG_FALS_JURNAL: join(temp.radacina, 'jurnal-fals.jsonl'),
    MG_FALS_MOD: mod,
    GEMINI_API_KEY: 'cheie-gemini',
    GOOGLE_API_KEY: 'cheie-google',
    HYPERFRAMES_API_KEY: 'cheie-hf',
  };
  const optiuni = { radacina: temp.radacina, cwd: temp.radacina, bin: HYPERFRAMES_FALS, ff: FF, mediu, pauzaMs: 5 };
  return { ...temp, optiuni };
}

test('mediuHyperframes fixează cele 6 variabile și scoate cheile, chiar scrise cu litere mici', () => {
  const baza = { PATH: '/bin', GEMINI_API_KEY: 'a', google_api_key: 'b', HYPERFRAMES_API_KEY: 'c', DO_NOT_TRACK: '0' };
  const mediu = mediuHyperframes(baza, FF);
  for (const [cheie, valoare] of Object.entries(FIXATE)) assert.equal(mediu[cheie], valoare, cheie);
  for (const cheie of Object.keys(mediu)) assert.ok(!CHEI_SECRETE.includes(cheie.toUpperCase()), cheie);
  assert.equal(mediu.PATH, '/bin');
  assert.equal(baza.GEMINI_API_KEY, 'a', 'mediul de bază rămâne neatins');
});

test('ruleazaHyperframes pornește bin-ul cu node, fără npx, cu mediul fixat și fără chei', async () => {
  const { radacina, curata, optiuni } = pregateste('ok');
  try {
    const r = await ruleazaHyperframes(['render', 'proba', '-o', 'iesire.mp4'], optiuni);
    assert.equal(r.cod, 0);
    assert.equal(r.incercari, 1);
    const [rulare] = citesteJurnalFals(radacina);
    assert.equal(rulare.argv[0], HYPERFRAMES_FALS);
    assert.deepEqual(rulare.argv.slice(1), ['render', 'proba', '-o', 'iesire.mp4']);
    for (const [cheie, valoare] of Object.entries(FIXATE)) assert.equal(rulare.env[cheie], valoare, cheie);
    for (const cheie of CHEI_SECRETE) assert.equal(rulare.env[cheie], undefined, cheie);
  } finally {
    curata();
  }
});

test('EBUSY o dată duce la 2 încercări', async () => {
  const { radacina, curata, optiuni } = pregateste('ebusy-o-data');
  try {
    const r = await ruleazaHyperframes(['render', 'proba'], optiuni);
    assert.equal(r.cod, 0);
    assert.equal(r.incercari, 2);
    assert.equal(citesteJurnalFals(radacina).length, 2);
  } finally {
    curata();
  }
});

test('o eroare fără EBUSY nu se reia', async () => {
  const { curata, optiuni } = pregateste('esec');
  try {
    const r = await ruleazaHyperframes(['render', 'proba'], optiuni);
    assert.equal(r.cod, 1);
    assert.equal(r.incercari, 1);
    assert.match(r.stderr, /eșec simulat/);
  } finally {
    curata();
  }
});

test('snapshot primește --describe false, o singură dată', async () => {
  const { radacina, curata, optiuni } = pregateste('ok');
  try {
    await ruleazaHyperframes(['snapshot', 'proba', '--at', '0.5'], optiuni);
    await ruleazaHyperframes(['snapshot', 'proba', '--describe', 'false'], optiuni);
    const [prima, aDoua] = citesteJurnalFals(radacina);
    assert.deepEqual(prima.argv.slice(1), ['snapshot', 'proba', '--at', '0.5', '--describe', 'false']);
    assert.deepEqual(aDoua.argv.slice(1), ['snapshot', 'proba', '--describe', 'false']);
  } finally {
    curata();
  }
});

test('checkJson întoarce obiectul brut cu _meta.version și cod', async () => {
  const { radacina, curata, optiuni } = pregateste('ok');
  try {
    const r = await checkJson('proba', { ...optiuni, at: [1.5, 4], laTranzitii: true });
    assert.equal(r._meta.version, '0.8.96');
    assert.equal(r.ok, true);
    assert.equal(r.cod, 0);
    assert.deepEqual(citesteJurnalFals(radacina)[0].argv.slice(1), ['check', 'proba', '--json', '--at', '1.5,4', '--at-transitions']);
  } finally {
    curata();
  }
});

test('checkJson fără JSON pe stdout dă motor-esuat', async () => {
  const { curata, optiuni } = pregateste('esec');
  try {
    await assert.rejects(checkJson('proba', optiuni), (err) => err.eroareMg?.cod === 'motor-esuat' && err.codIesire === 2);
  } finally {
    curata();
  }
});

test('versiuneHyperframes citește primul rând', async () => {
  const { radacina, curata, optiuni } = pregateste('versiune');
  try {
    assert.equal(await versiuneHyperframes(radacina, optiuni), '0.8.96');
  } finally {
    curata();
  }
});

test('rezolvaBinHyperframes citește bin ca obiect sau ca șir și dă motor-lipsa când lipsește', () => {
  const pachet = 'motoare/hyperframes/node_modules/hyperframes';
  const obiect = creeazaRadacinaTemp({
    fisiere: {
      [`${pachet}/package.json`]: JSON.stringify({ bin: { hyperframes: './bin/hyperframes.mjs' } }),
      [`${pachet}/bin/hyperframes.mjs`]: '// fals\n',
    },
  });
  const sir = creeazaRadacinaTemp({
    fisiere: {
      [`${pachet}/package.json`]: JSON.stringify({ bin: 'cli.mjs' }),
      [`${pachet}/cli.mjs`]: '// fals\n',
    },
  });
  const gol = creeazaRadacinaTemp();
  try {
    assert.equal(rezolvaBinHyperframes(obiect.radacina), join(obiect.radacina, pachet, 'bin', 'hyperframes.mjs'));
    assert.equal(rezolvaBinHyperframes(sir.radacina), join(sir.radacina, pachet, 'cli.mjs'));
    assert.throws(() => rezolvaBinHyperframes(gol.radacina), (err) => err.eroareMg?.cod === 'motor-lipsa');
  } finally {
    obiect.curata();
    sir.curata();
    gol.curata();
  }
});

test('T9: pe Windows, la termen depășit, mg oprește tot arborele de procese (taskkill /T), nu doar procesul node', async () => {
  const { curata, optiuni } = pregateste('lung');
  try {
    const opriri = [];
    const inceput = Date.now();
    const r = await ruleazaHyperframes(['check', 'proba', '--json'], {
      ...optiuni, timeoutMs: 300, platforma: 'win32',
      opresteArbore: (copil) => { opriri.push(copil.pid); copil.kill(); },
    });
    assert.ok(Date.now() - inceput < 10000, 'simulatorul a fost oprit înainte de 30 s');
    assert.equal(opriri.length, 1);
    assert.equal(typeof opriri[0], 'number');
    assert.notEqual(r.cod, 0);
    assert.match(r.stderr, /oprit după 300 ms/);
  } finally {
    curata();
  }
});

test('T9: pe macOS și Linux, termenul rămâne al lui execFile, fără oprirea arborelui', async () => {
  const { curata, optiuni } = pregateste('lung');
  try {
    const opriri = [];
    const r = await ruleazaHyperframes(['check', 'proba', '--json'], {
      ...optiuni, timeoutMs: 300, platforma: 'darwin', opresteArbore: (copil) => opriri.push(copil.pid),
    });
    assert.deepEqual(opriri, []);
    assert.notEqual(r.cod, 0);
    assert.match(r.stderr, /oprit după 300 ms/);
  } finally {
    curata();
  }
});

test('T9: comanda care oprește arborele pe Windows e taskkill /T /F /PID <pid>', () => {
  assert.deepEqual(argumenteTaskkill(4242), ['/T', '/F', '/PID', '4242']);
});
