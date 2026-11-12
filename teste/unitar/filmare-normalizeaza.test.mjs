import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fpsTinta, dimensiuniTinta, argumenteNormalizare, normalizeaza, argumenteFoaieVerificare, foaieVerificare } from '../../nucleu/lib/filmare/normalizeaza.mjs';
import { probeazaSursa } from '../../nucleu/lib/filmare/sonda.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('fpsTinta: 25 sau 30', () => {
  assert.deepEqual([23.976, 24, 25, 27.4, 27.5, 29.97, 30, 50, 59.94, 60].map(fpsTinta), [25, 25, 25, 25, 30, 30, 30, 30, 30, 30]);
});

test('dimensiuniTinta: latura scurtă cel mult 1080, pare, fără mărire', () => {
  assert.deepEqual(dimensiuniTinta(1080, 1920), { latime: 1080, inaltime: 1920 });
  assert.deepEqual(dimensiuniTinta(2160, 3840), { latime: 1080, inaltime: 1920 });
  assert.deepEqual(dimensiuniTinta(3840, 2160), { latime: 1920, inaltime: 1080 });
  assert.deepEqual(dimensiuniTinta(720, 1280), { latime: 720, inaltime: 1280 });
  assert.deepEqual(dimensiuniTinta(1081, 1921), { latime: 1080, inaltime: 1918 });
  assert.deepEqual(dimensiuniTinta(1440, 1440), { latime: 1080, inaltime: 1080 });
});

test('argumenteNormalizare: codecul, GOP-ul egal cu fps-ul, audio AAC, fără metadate', () => {
  const info = { durata: 20, latime: 2160, inaltime: 3840, rotatie: 90, fps: 59.94, vfr: true, hdr: false, codec: 'hevc', audio: { codec: 'aac', canale: 1 } };
  const a = argumenteNormalizare('in.mov', 'out.mp4', info);
  const dupa = (opt) => a[a.indexOf(opt) + 1];
  assert.equal(dupa('-i'), 'in.mov');
  assert.equal(dupa('-vf'), 'scale=1080:1920:flags=lanczos,fps=30,format=yuv420p,setsar=1');
  assert.equal(dupa('-c:v'), 'libx264');
  assert.equal(dupa('-crf'), '18');
  assert.equal(dupa('-g'), '30');
  assert.equal(dupa('-keyint_min'), '30');
  assert.equal(dupa('-pix_fmt'), 'yuv420p');
  assert.equal(dupa('-c:a'), 'aac');
  assert.equal(dupa('-map_metadata'), '-1');
  assert.equal(dupa('-fps_mode'), 'cfr');
  assert.equal(a.at(-1), 'out.mp4');
  assert.ok(!a.includes('-noautorotate'), 'rotația se aplică (autorotate implicit)');
});

test('argumenteFoaieVerificare: un cadru pe secundă, 6 coloane, celule după orientare', () => {
  const v = argumenteFoaieVerificare('l.mp4', 'f.jpg', { durata: 26.4, latime: 1080, inaltime: 1920 });
  assert.equal(v[v.indexOf('-vf') + 1], 'fps=1,scale=270:-2,tile=6x5');
  const o = argumenteFoaieVerificare('l.mp4', 'f.jpg', { durata: 90, latime: 1920, inaltime: 1080 });
  assert.equal(o[o.indexOf('-vf') + 1], 'fps=1,scale=320:-2,tile=6x15');
  assert.equal(v[v.indexOf('-frames:v') + 1], '1');
});

test('normalizeaza și foaieVerificare pe un clip real (rotit, 50 fps, într-o cale cu diacritice)', async (t) => {
  const ff = await rezolvaFfmpeg(RADACINA);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg norm Ăîș '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const brut = path.join(dir, 'brut.mp4');
  const sursa = path.join(dir, 'sursă.mov');
  let r = await ruleazaFfmpeg(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=50', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', brut], { ffmpeg: ff.ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  r = await ruleazaFfmpeg(['-hide_banner', '-y', '-display_rotation', '90', '-i', brut, '-c', 'copy', sursa], { ffmpeg: ff.ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  const info = await probeazaSursa(sursa, { ffprobe: ff.ffprobe });
  assert.ok([90, 270].includes(info.rotatie), `rotația citită: ${info.rotatie}`);
  const lucru = path.join(dir, 'filmare-lucru.mp4');
  const rez = await normalizeaza(sursa, lucru, info, ff);
  assert.deepEqual(rez, { fps: 30, latime: 360, inaltime: 640 });
  const dupa = await probeazaSursa(lucru, { ffprobe: ff.ffprobe });
  assert.equal(dupa.latime, 360);
  assert.equal(dupa.inaltime, 640);
  assert.equal(dupa.rotatie, 0);
  assert.equal(dupa.fps, 30);
  assert.equal(dupa.vfr, false);
  assert.equal(dupa.audio.codec, 'aac');
  assert.ok(!fs.existsSync(`${lucru}.tmp.mp4`));
  const foaie = path.join(dir, 'verificare-1fps.jpg');
  await foaieVerificare(lucru, foaie, { durata: dupa.durata, latime: 360, inaltime: 640 }, ff);
  assert.ok(fs.statSync(foaie).size > 1000);
});
