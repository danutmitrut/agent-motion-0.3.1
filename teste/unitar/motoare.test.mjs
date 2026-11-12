// Adaptorul de motor (planul I, I01): forma adaptorului HyperFrames, lansarea fără shell, mediul fără chei,
// scanarea de rețea comună și exporturile vechi din randeaza/index.mjs păstrate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adaptorMotor } from '../../nucleu/lib/motoare/index.mjs';
import * as hf from '../../nucleu/lib/motoare/hyperframes.mjs';
import { executaNode, mediuFaraChei } from '../../nucleu/lib/motoare/lansare.mjs';
import { mediuHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { argumenteRandare, argumenteWorkeri, optiuniRender } from '../../nucleu/lib/randeaza/index.mjs';
import { scaneazaRetea, spatii } from '../../nucleu/lib/verificari/build.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

test('adaptorMotor: hyperframes are forma comună; un motor necunoscut dă TypeError', () => {
  const a = adaptorMotor('hyperframes');
  assert.deepEqual(
    { nume: a.nume, eticheta: a.eticheta, camp: a.camp, descriereReluare: a.descriereReluare },
    { nume: 'hyperframes', eticheta: 'HyperFrames', camp: 'mediu.hyperframes', descriereReluare: '--low-memory-mode' },
  );
  for (const f of ['verificaBuild', 'schita', 'randeaza', 'curata']) assert.equal(typeof a[f], 'function', f);
  assert.ok(Object.isFrozen(a));
  assert.throws(() => adaptorMotor('blender'), TypeError);
  assert.throws(() => adaptorMotor('toString'), TypeError);
});

test('mediuFaraChei scoate cheile indiferent de majuscule și pune valorile fixate', () => {
  const m = mediuFaraChei({ PATH: '/bin', gemini_api_key: 'x', Google_Api_Key: 'y', DO_NOT_TRACK: '0' }, ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], { DO_NOT_TRACK: '1' });
  assert.deepEqual(m, { PATH: '/bin', DO_NOT_TRACK: '1' });
  assert.deepEqual(mediuFaraChei(undefined, [], { A: '1' }), { A: '1' });
});

test('mediuHyperframes dă același mediu ca înainte de mutare', () => {
  const m = mediuHyperframes({ PATH: '/bin', hyperframes_api_key: 'k', HYPERFRAMES_FFMPEG_PATH: 'vechi' }, { ffmpeg: '/f', ffprobe: '/p' });
  assert.deepEqual(m, {
    PATH: '/bin',
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_NO_AUTO_INSTALL: '1',
    HYPERFRAMES_FFMPEG_PATH: '/f',
    HYPERFRAMES_FFPROBE_PATH: '/p',
  });
});

test('executaNode rulează un script Node fără shell, cu diacritice și spații, și întoarce codul, stdout și stderr', async (t) => {
  const r = creeazaRadacinaTemp({
    fisiere: { 'scr ipt ș.mjs': "process.stdout.write('ieșire ' + process.argv.slice(2).join('|'));\nprocess.stderr.write('eroare');\nprocess.exit(3);\n" },
  });
  t.after(r.curata);
  const rez = await executaNode(path.join(r.radacina, 'scr ipt ș.mjs'), ['a b', 'ț'], { cwd: r.radacina, env: process.env, timeoutMs: 30000 });
  assert.deepEqual(rez, { cod: 3, stdout: 'ieșire a b|ț', stderr: 'eroare' });
});

test('scaneazaRetea: adresele din fișierele text ale build-ului, fără spațiile de nume SVG; spatii comprimă', (t) => {
  const r = creeazaRadacinaTemp({
    fisiere: {
      'build/index.html': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      'build/fonturi/a.css': '@import url(https://exemplu.ro/x.css);',
      'build/props.json': '{"a":"http://x"}',
      'build/poza.png': 'http://nu-e-text',
    },
  });
  t.after(r.curata);
  const { erori, fisiere } = scaneazaRetea(path.join(r.radacina, 'build'), { gsap: { sha256: '0'.repeat(64) } });
  assert.equal(fisiere, 3);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['build-cu-retea', 'fisier:build/fonturi/a.css'], ['build-cu-retea', 'fisier:build/props.json']]);
  assert.equal(spatii('  Ăî \n  ș '), 'Ăî ș');
});

test('argumentele HyperFrames rămân exportate din randeaza/index.mjs, aceleași funcții ca în adaptor', () => {
  assert.equal(argumenteRandare, hf.argumenteRandare);
  assert.equal(argumenteWorkeri, hf.argumenteWorkeri);
  assert.equal(optiuniRender, hf.optiuniRender);
});

test('curata al adaptorului HyperFrames șterge .cache al proiectului', (t) => {
  const r = creeazaRadacinaTemp({ fisiere: { 'video/p/.cache/x/cadru.png': 'x' } });
  t.after(r.curata);
  adaptorMotor('hyperframes').curata({ cache: path.join(r.radacina, 'video', 'p', '.cache') });
  assert.equal(fs.existsSync(path.join(r.radacina, 'video', 'p', '.cache')), false);
});
