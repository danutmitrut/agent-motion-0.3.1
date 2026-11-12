import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import {
  descarcaRezerva,
  parseazaFreezedetect,
  platforma,
  probeazaMp4,
  rezolvaFfmpeg,
  ruleazaFfmpeg,
  verificaBinar,
} from '../../nucleu/lib/ffmpeg.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const RADACINA = radacinaAgent(import.meta.url, 2);

/** Binarele reale; pe Mac arm64 descarcă rezerva pentru ffprobe dacă lipsește (ca mg doctor). */
async function ffReale() {
  try {
    return await rezolvaFfmpeg(RADACINA);
  } catch (err) {
    if (err?.eroareMg?.cod !== 'ffmpeg-lipsa') throw err;
    const versiuni = await citesteVersiuni(RADACINA);
    if (!versiuni.ffmpeg?.rezerva?.[platforma()]?.ffprobe) throw err;
    await descarcaRezerva(RADACINA, 'ffprobe', versiuni);
    return rezolvaFfmpeg(RADACINA);
  }
}

test('rezolvaFfmpeg alege sursa fixată pentru platformă și binarele rulează', { skip: motivSarit }, async () => {
  const ff = await ffReale();
  assert.equal(ff.surse.ffmpeg, 'ffmpeg-static');
  assert.equal(ff.surse.ffprobe, platforma() === 'darwin-arm64' ? 'rezerva' : 'ffprobe-static');
  for (const cale of [ff.ffmpeg, ff.ffprobe]) {
    const v = await verificaBinar(cale);
    assert.equal(v.ok, true, v.eroare);
    // pe win32-x64 ffprobe-static 3.1.0 e 4.0.2, iar ffmpeg-static e build-ul gyan.dev 6.1.1;
    // identitatea o dau hash-urile din VERSIUNI.json, deci pe alte platforme verificăm doar forma
    if (platforma() === 'darwin-arm64') assert.equal(v.versiune, '6.0');
    else assert.match(v.versiune, /^\d+\.\d+/, `versiune ${v.versiune}`);
  }
});

test('probeazaMp4 pe un MP4 lavfi de 2 s dă h264, 1080x1920 și durata 2', { skip: motivSarit }, async () => {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg ffmpeg Ăîș '));
  try {
    const mp4 = join(dir, 'probă 2s.mp4');
    const r = await ruleazaFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:d=2:r=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4,
    ], { ffmpeg: ff.ffmpeg });
    assert.equal(r.cod, 0, r.stderr);
    const info = await probeazaMp4(mp4, { ffprobe: ff.ffprobe });
    assert.equal(info.video.codec, 'h264');
    assert.equal(info.video.latime, 1080);
    assert.equal(info.video.inaltime, 1920);
    assert.equal(info.video.fps, 30);
    assert.ok(Math.abs(info.durata - 2) <= 1 / 30, `durata ${info.durata}`);
    assert.equal(info.audio, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('freezedetect real: 1 s mișcare, apoi 2 s înghețat', { skip: motivSarit }, async () => {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg ffmpeg Ăîș '));
  try {
    const mp4 = join(dir, 'inghetat.mp4');
    const facut = await ruleazaFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=s=540x960:d=1:r=30',
      '-f', 'lavfi', '-i', 'color=c=0x0E0F13:s=540x960:d=2:r=30',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4,
    ], { ffmpeg: ff.ffmpeg });
    assert.equal(facut.cod, 0, facut.stderr);
    const r = await ruleazaFfmpeg([
      '-hide_banner', '-nostats', '-i', mp4,
      '-vf', 'freezedetect=n=0.003:d=0.5', '-map', '0:v:0', '-f', 'null', '-',
    ], { ffmpeg: ff.ffmpeg });
    assert.equal(r.cod, 0, r.stderr);
    const intervale = parseazaFreezedetect(r.stderr);
    assert.equal(intervale.length, 1);
    assert.ok(Math.abs(intervale[0].start - 1) <= 0.05, `start ${intervale[0].start}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
