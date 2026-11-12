import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeazaSursa } from '../../nucleu/lib/filmare/sonda.mjs';
import { rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { cuvinteSrt } from '../../unelte/exemple-filmare/genereaza.mjs';
import { raportTranscriere } from '../../nucleu/lib/filmare/transcriere.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EX = path.join(RADACINA, 'motoare', 'hyperframes', 'sabloane', 'overlay-filmare', 'exemple');
const FIX = path.join(RADACINA, 'teste', 'fixtures', 'filmare');
const MB = 1024 * 1024;

function transcrierea(cale) {
  const t = JSON.parse(fs.readFileSync(cale, 'utf8'));
  assert.equal(t.versiune, 1);
  assert.equal(t.sursa, 'parakeet');
  assert.equal(t.limba, 'ro');
  t.cuvinte.forEach((c, i) => {
    assert.equal(c.id, `w${i}`);
    assert.ok(c.end > c.start, `${c.id}: end > start`);
    if (i > 0) assert.ok(c.start >= t.cuvinte[i - 1].start, `${c.id}: în ordine`);
    assert.doesNotMatch(c.text, /[\u015f\u0163\u015e\u0162]/, 'fără sedile');
  });
  return t;
}

// pragul lui overlay-filmare e 15% (implicite.transcriere.functionale_ro); exemplele țin o marjă
const functionaleExemplu = (t) => assert.ok(raportTranscriere(t).procent_functionale >= 0.18, `cuvinte uzuale: ${raportTranscriere(t).procent_functionale}`);

test('exemplul vertical: 1080x1920, 20-25 s, cu sunet, sub 8 MB, transcriere românească', async () => {
  const ff = await rezolvaFfmpeg(RADACINA);
  const clip = path.join(EX, 'vertical', 'filmare.mp4');
  assert.ok(fs.statSync(clip).size < 8 * MB);
  const info = await probeazaSursa(clip, { ffprobe: ff.ffprobe });
  assert.deepEqual([info.latime, info.inaltime], [1080, 1920]);
  assert.ok(info.durata >= 20 && info.durata <= 25, String(info.durata));
  assert.ok(info.audio);
  const t = transcrierea(path.join(EX, 'vertical', 'transcriere.json'));
  assert.ok(t.cuvinte.length >= 40, String(t.cuvinte.length));
  const text = t.cuvinte.map((c) => c.text.toLowerCase()).join(' ');
  for (const f of ['ore', 'agentul', 'ofertele']) assert.match(text, new RegExp(f));
  functionaleExemplu(t);
});

test('exemplul orizontal: 1920x1080, 10-20 s, transcriere și .srt', async () => {
  const ff = await rezolvaFfmpeg(RADACINA);
  const info = await probeazaSursa(path.join(EX, 'orizontal', 'filmare.mp4'), { ffprobe: ff.ffprobe });
  assert.deepEqual([info.latime, info.inaltime], [1920, 1080]);
  assert.ok(info.durata >= 10 && info.durata <= 20, String(info.durata));
  const t = transcrierea(path.join(EX, 'orizontal', 'transcriere.json'));
  assert.equal(fs.readFileSync(path.join(EX, 'orizontal', 'transcriere.srt'), 'utf8'), cuvinteSrt(t.cuvinte));
  functionaleExemplu(t);
});

test('fixture-urile: scurt.mp4 (6-8 s, vertical mic), fara-audio.mp4, scurt.srt', async () => {
  const ff = await rezolvaFfmpeg(RADACINA);
  const scurt = await probeazaSursa(path.join(FIX, 'scurt.mp4'), { ffprobe: ff.ffprobe });
  assert.deepEqual([scurt.latime, scurt.inaltime], [360, 640]);
  assert.ok(scurt.durata >= 6 && scurt.durata <= 8, String(scurt.durata));
  assert.ok(scurt.audio);
  assert.equal((await probeazaSursa(path.join(FIX, 'fara-audio.mp4'), { ffprobe: ff.ffprobe })).audio, null);
  const t = transcrierea(path.join(FIX, 'scurt.transcriere.json'));
  assert.equal(fs.readFileSync(path.join(FIX, 'scurt.srt'), 'utf8'), cuvinteSrt(t.cuvinte));
});

test('cuvinteSrt: replici pe propoziție, cel mult 7 cuvinte, timpi SRT', () => {
  const c = (text, start, end) => ({ id: 'w', text, start, end });
  const srt = cuvinteSrt([c('Bună,', 0, 0.48), c('sunt', 0.64, 0.8), c('Andreea.', 0.96, 1.6), c('Lucrez', 1.8, 2.1), c('aici.', 2.2, 2.65)]);
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:01,600\nBună, sunt Andreea.\n\n2\n00:00:01,800 --> 00:00:02,650\nLucrez aici.\n');
});
