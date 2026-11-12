import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseazaSursa, probeazaSursa, poartaFilmare, EXTENSII_FILMARE, LIMITE_FILMARE } from '../../nucleu/lib/filmare/sonda.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function flux(extra) {
  return { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', avg_frame_rate: '30/1', ...extra };
}
const AUDIO = { codec_type: 'audio', codec_name: 'aac', channels: 2 };

test('parseazaSursa: dimensiuni, fps, audio, fără rotație', () => {
  const info = parseazaSursa({ streams: [flux(), AUDIO], format: { duration: '26.4' } });
  assert.deepEqual(info, {
    durata: 26.4, latime: 1920, inaltime: 1080, rotatie: 0, fps: 30, vfr: false, hdr: false, codec: 'h264',
    audio: { codec: 'aac', canale: 2 },
  });
});

test('parseazaSursa: rotația din display matrix inversează dimensiunile', () => {
  const info = parseazaSursa({
    streams: [flux({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] }), AUDIO],
    format: { duration: '10' },
  });
  assert.equal(info.rotatie, 90);
  assert.equal(info.latime, 1080);
  assert.equal(info.inaltime, 1920);
});

test('parseazaSursa: rotația din eticheta veche rotate', () => {
  const info = parseazaSursa({ streams: [flux({ tags: { rotate: '270' } }), AUDIO], format: { duration: '10' } });
  assert.equal(info.rotatie, 270);
  assert.equal(info.latime, 1080);
});

test('parseazaSursa: VFR când fps-ul mediu diferă cu peste 1% de cel nominal', () => {
  const info = parseazaSursa({ streams: [flux({ r_frame_rate: '30/1', avg_frame_rate: '2987/100' }), AUDIO], format: { duration: '10' } });
  assert.equal(info.vfr, true);
  assert.equal(info.fps, 29.87);
});

test('parseazaSursa: HDR din transfer (HLG, PQ) și din Dolby Vision', () => {
  for (const extra of [{ color_transfer: 'arib-std-b67' }, { color_transfer: 'smpte2084' },
    { side_data_list: [{ side_data_type: 'DOVI configuration record', dv_profile: 8 }] }]) {
    assert.equal(parseazaSursa({ streams: [flux(extra), AUDIO], format: { duration: '10' } }).hdr, true);
  }
  assert.equal(parseazaSursa({ streams: [flux({ color_transfer: 'bt709' }), AUDIO], format: { duration: '10' } }).hdr, false);
});

test('parseazaSursa: fără pistă audio, audio e null; fără video, aruncă', () => {
  assert.equal(parseazaSursa({ streams: [flux()], format: { duration: '10' } }).audio, null);
  assert.throws(() => parseazaSursa({ streams: [AUDIO], format: { duration: '10' } }), /flux video/);
});

test('poartaFilmare: refuzurile, cu coduri și câmpul argumente.filmare', () => {
  const bun = { durata: 20, latime: 1080, inaltime: 1920, rotatie: 0, fps: 30, vfr: false, hdr: false, codec: 'h264', audio: { codec: 'aac', canale: 1 } };
  assert.deepEqual(poartaFilmare(bun), []);
  const coduri = (info) => poartaFilmare(info).map((e) => e.cod);
  assert.deepEqual(coduri({ ...bun, audio: null }), ['filmare-fara-audio']);
  assert.deepEqual(coduri({ ...bun, durata: 4.9 }), ['filmare-durata']);
  assert.deepEqual(coduri({ ...bun, durata: 90.5 }), ['filmare-durata']);
  assert.deepEqual(coduri({ ...bun, durata: 5 }), []);
  assert.deepEqual(coduri({ ...bun, durata: 90 }), []);
  assert.deepEqual(coduri({ ...bun, hdr: true }), ['filmare-hdr']);
  for (const e of poartaFilmare({ ...bun, hdr: true, audio: null })) assert.equal(e.camp, 'argumente.filmare');
  assert.match(poartaFilmare({ ...bun, hdr: true })[0].sugestie, /SDR/);
});

test('poartaFilmare: durata din mesaj nu cade pe limită când filmarea e în afara ei (90,03 s, 4,96 s)', () => {
  const bun = { durata: 20, latime: 1080, inaltime: 1920, rotatie: 0, fps: 30, vfr: false, hdr: false, codec: 'h264', audio: { codec: 'aac', canale: 1 } };
  const mesaj = (durata) => poartaFilmare({ ...bun, durata })[0].mesaj;
  assert.equal(mesaj(90.03), 'Filmarea are 90,03 s; șablonul acceptă între 5 și 90 s.');
  assert.equal(mesaj(4.96), 'Filmarea are 4,96 s; șablonul acceptă între 5 și 90 s.');
  assert.equal(mesaj(90.004), 'Filmarea are 90,004 s; șablonul acceptă între 5 și 90 s.');
  // departe de limite rămâne o zecimală
  assert.equal(mesaj(90.5), 'Filmarea are 90,5 s; șablonul acceptă între 5 și 90 s.');
  assert.equal(mesaj(124.27), 'Filmarea are 124,3 s; șablonul acceptă între 5 și 90 s.');
  assert.equal(mesaj(3.2), 'Filmarea are 3,2 s; șablonul acceptă între 5 și 90 s.');
});

test('constantele din spec', () => {
  assert.deepEqual(EXTENSII_FILMARE, ['.mp4', '.mov', '.m4v', '.webm']);
  assert.deepEqual(LIMITE_FILMARE, { min: 5, max: 90 });
});

test('probeazaSursa pe un clip real, generat cu ffmpeg (2 s, 640x360, cu sunet)', async (t) => {
  const ff = await rezolvaFfmpeg(RADACINA);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg sonda Ăîș '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clip = path.join(dir, 'clip.mp4');
  const r = await ruleazaFfmpeg(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip], { ffmpeg: ff.ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  const info = await probeazaSursa(clip, { ffprobe: ff.ffprobe });
  assert.equal(info.latime, 640);
  assert.equal(info.inaltime, 360);
  assert.equal(info.fps, 25);
  assert.equal(info.hdr, false);
  assert.ok(Math.abs(info.durata - 2) < 0.1, String(info.durata));
  assert.equal(info.audio.codec, 'aac');
});
