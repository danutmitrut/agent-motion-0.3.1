import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { EroareFatala, eroare } from '../../nucleu/lib/erori.mjs';
import { parseazaFfprobe } from '../../nucleu/lib/ffmpeg.mjs';
import { verificaFormatMp4, verificariMp4 } from '../../nucleu/lib/verificari/mp4.mjs';

const DIR = path.join(radacinaAgent(import.meta.url, 2), 'teste', 'fixtures', 'ffmpeg');
const CRON = { versiune: 1, sablon: 'reel-ilustrat', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata: 3, fundal: '#0E0F13', segmente: [] };

function info(nume) {
  return parseazaFfprobe(fs.readFileSync(path.join(DIR, nume), 'utf8'));
}

// Un ffmpeg care nu există: dacă C12-C14 pornesc, extragerea cadrelor dă EroareFatala ffmpeg-lipsa (nu ffmpeg-ul sistemului).
const FFMPEG_LIPSA = path.join(DIR, 'nu-exista', 'ffmpeg');

function apel(probeaza) {
  return verificariMp4({ mp4: 'x.mp4', cronologie: CRON, asteptari: null, stil: null, ff: { ffmpeg: FFMPEG_LIPSA, ffprobe: 'ffprobe' }, format: 'vertical', probeaza });
}

test('parseazaFfprobe citește ieșirea salvată în forma InfoMp4', () => {
  const i = info('ffprobe-yuv420p.txt');
  assert.equal(i.durata, 3);
  assert.equal(i.video.codec, 'h264');
  assert.equal(i.video.pix_fmt, 'yuv420p');
  assert.equal(i.video.latime, 1080);
  assert.equal(i.video.inaltime, 1920);
  assert.equal(i.video.fps, 30);
  assert.equal(i.audio, null);
});

test('C11: h264, yuv420p, 1080x1920, 30 fps, 3 s trece', () => {
  const r = verificaFormatMp4(info('ffprobe-yuv420p.txt'), CRON);
  assert.equal(r.cod, 'C11');
  assert.equal(r.ok, true);
  assert.equal(r.camp, null);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.valoare, { codec: 'h264', pix_fmt: 'yuv420p', latime: 1080, inaltime: 1920, fps: 30, durata: 3 });
  assert.deepEqual(r.prag, { codec: 'h264', pix_fmt: 'yuv420p', latime: 1080, inaltime: 1920, fps: 30, durata: '3 ± 0,033 s' });
});

test('C11: un MP4 yuv444p dă mp4-invalid pe mp4.pix_fmt', () => {
  const r = verificaFormatMp4(info('ffprobe-yuv444p.txt'), CRON);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['mp4-invalid', 'mp4.pix_fmt']]);
  assert.equal(r.camp, 'mp4.pix_fmt');
});

test('C11: o durată decalată cu 0,1 s dă mp4-invalid pe mp4.durata', () => {
  const r = verificaFormatMp4(info('ffprobe-decalat.txt'), CRON);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['mp4-invalid', 'mp4.durata']]);
  assert.match(r.erori[0].mesaj, /3,1/);
});

test('C11: o abatere sub un cadru trece', () => {
  const i = info('ffprobe-yuv420p.txt');
  assert.equal(verificaFormatMp4({ ...i, durata: 3.033 }, CRON).ok, true);
  assert.equal(verificaFormatMp4({ ...i, durata: 3.034 }, CRON).ok, false);
});

test('C11: rezoluția, fps-ul și codecul greșite au fiecare eroarea lor', () => {
  const i = info('ffprobe-yuv420p.txt');
  const r = verificaFormatMp4({ ...i, video: { ...i.video, codec: 'hevc', latime: 1920, inaltime: 1080, fps: 25 } }, CRON);
  assert.deepEqual(r.erori.map((e) => e.camp), ['mp4.codec', 'mp4.rezolutie', 'mp4.fps']);
  assert.ok(r.erori.every((e) => e.cod === 'mp4-invalid'));
});

test('C11: info fără pistă video dă mp4-invalid pe mp4.video', () => {
  const r = verificaFormatMp4({ durata: 3, video: null, audio: null }, CRON);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['mp4-invalid', 'mp4.video']]);
});

test('verificariMp4: un ffprobe fără flux video (parseazaFfprobe aruncă Error) dă C11 mp4-invalid pe mp4.video, nu eroare-interna', async () => {
  const [r, ...rest] = await apel(async () => parseazaFfprobe('{"streams":[],"format":{"duration":"3.0"}}'));
  assert.equal(rest.length, 0);
  assert.equal(r.cod, 'C11');
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['mp4-invalid', 'mp4.video']]);
  assert.match(r.erori[0].mesaj, /flux video/);
});

test('verificariMp4: un fișier pe care ffprobe nu-l poate citi dă mp4-invalid pe mp4', async () => {
  const [r] = await apel(async () => {
    throw new Error('ffprobe nu poate citi x.mp4: Invalid data found when processing input');
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['mp4-invalid', 'mp4']]);
  assert.match(r.erori[0].mesaj, /Invalid data/);
});

test('verificariMp4: lipsa lui ffprobe (EroareFatala) nu e înghițită de C11', async () => {
  const lipsa = new EroareFatala(eroare('ffmpeg-lipsa', 'mediu.ffprobe', 'ffprobe nu a pornit.', 'Rulează doctor.'), 2);
  await assert.rejects(apel(async () => { throw lipsa; }), (e) => e === lipsa);
});

test('verificariMp4: după un C11 verde pornesc C12-C14, iar lipsa lui ffmpeg (EroareFatala) nu e înghițită', async () => {
  await assert.rejects(apel(async () => info('ffprobe-yuv420p.txt')), (e) => {
    assert.ok(e instanceof EroareFatala);
    assert.equal(e.eroareMg.cod, 'ffmpeg-lipsa');
    return true;
  });
});

test('verificariMp4: un MP4 care pică C11 pe format nu mai e măsurat pe pixeli (doar C11)', async () => {
  const rez = await apel(async () => info('ffprobe-yuv444p.txt'));
  assert.deepEqual(rez.map((r) => [r.cod, r.ok]), [['C11', false]]);
});
