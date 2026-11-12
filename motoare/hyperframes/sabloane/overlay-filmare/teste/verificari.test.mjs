import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rezolvaFfmpeg, ruleazaFfmpeg, probeazaMp4 } from '../../../../../nucleu/lib/ffmpeg.mjs';
import { verificariProprii, evalueazaAudio, evalueazaBandaLibera, momenteSsim, filtreBandaLibera } from '../verificari.mjs';
import { IMPLICITE, REPO } from './ajutoare.mjs';

const P = IMPLICITE.verificari;
const SCURT = path.join(REPO, 'teste', 'fixtures', 'filmare', 'scurt.mp4');
const coduri = (r) => r.erori.map((e) => [e.cod, e.camp]);
const info = (audio, durata = 10) => ({ durata, video: {}, audio });

test('momenteSsim: n puncte la mijlocul intervalelor egale', () => {
  assert.deepEqual(momenteSsim(20, 6), [1.667, 5, 8.333, 11.667, 15, 18.333]);
});

test('filtreBandaLibera: banda din MP4 și aceeași bandă din filmarea decupată ca în compoziție', () => {
  const plan = { latime: 1080, inaltime: 1920, focus_x: 30, sursa: { latime: 1920, inaltime: 1080 } };
  assert.deepEqual(filtreBandaLibera(plan, [0, 560, 1080, 140]), {
    filtruA: 'crop=1080:140:0:560',
    filtruB: 'scale=3413:1920:flags=bicubic,crop=1080:1920:700:0,crop=1080:140:0:560',
    latime: 1080, inaltime: 140,
  });
});

test('evalueazaAudio: pista AAC, durata ± 0,05 s, volumul peste -45 dB și cel mult 1 dB sub copia de lucru', () => {
  const bun = { info: info({ codec: 'aac', durata: 10.04 }), volumMp4: { medie: -20.5 }, volumLucru: { medie: -20 } };
  const r = evalueazaAudio(bun, P);
  assert.equal(r.ok, true);
  assert.equal(r.cod, 'S09');
  assert.deepEqual(r.valoare, { codec: 'aac', durata_audio: 10.04, durata_video: 10, volum_mp4: -20.5, volum_lucru: -20 });
  assert.deepEqual(coduri(evalueazaAudio({ info: info(null), volumMp4: null, volumLucru: null }, P)), [['overlay-filmare-audio', 'mp4.audio']]);
  assert.equal(evalueazaAudio({ ...bun, info: info({ codec: 'mp3', durata: 10 }) }, P).erori.length, 1);
  assert.match(evalueazaAudio({ ...bun, info: info({ codec: 'aac', durata: 9.9 }) }, P).erori[0].mesaj, /9,9 s, iar videoul 10,0 s/);
  assert.equal(evalueazaAudio({ ...bun, info: info({ codec: 'aac', durata: null }) }, P).erori.length, 1);
  assert.match(evalueazaAudio({ ...bun, volumMp4: { medie: -50 }, volumLucru: { medie: -49.5 } }, P).erori[0].mesaj, /prea încet/);
  assert.match(evalueazaAudio({ ...bun, volumMp4: { medie: -21.2 } }, P).erori[0].mesaj, /are -21,2 dB în medie, cu 1,2 dB sub copia de lucru pe același interval \(maximum 1 dB\)/);
  assert.equal(evalueazaAudio({ ...bun, volumMp4: { medie: -Infinity } }, P).ok, false);
});

test('evalueazaAudio: compară cu durata așteptată, nu cu format.duration (care e maximul fluxurilor)', () => {
  // ffprobe dă durata = max(video, audio): cu audio lung, info.durata ar fi chiar durata audio
  const baza = { volumMp4: { medie: -20 }, volumLucru: { medie: -20 }, durata: 10 };
  const lung = evalueazaAudio({ ...baza, info: info({ codec: 'aac', durata: 10.3 }, 10.3) }, P);
  assert.equal(lung.ok, false);
  assert.match(lung.erori[0].mesaj, /Pista audio are 10,3 s, iar videoul 10,0 s/);
  assert.equal(evalueazaAudio({ ...baza, info: info({ codec: 'aac', durata: 9.7 }, 10) }, P).ok, false);
  assert.equal(evalueazaAudio({ ...baza, info: info({ codec: 'aac', durata: 10.04 }, 10.04) }, P).ok, true);
});

test('evalueazaBandaLibera: o singură eroare, cu fiecare moment sub prag', () => {
  assert.equal(evalueazaBandaLibera({ momente: [1, 2], ssim: [0.99, 0.95] }, P).ok, true);
  const r = evalueazaBandaLibera({ momente: [1, 2, 3], ssim: [0.99, 0.5, 0.94] }, P);
  assert.deepEqual(coduri(r), [['overlay-filmare-filmare-atinsa', 'mp4']]);
  assert.match(r.erori[0].mesaj, /2,0 s \(SSIM 0,5\), 3,0 s \(SSIM 0,94\); minimul e 0,95\./);
});

// Hook-ul pe MP4-uri reale: copia de lucru e scurt.mp4 (360x640), iar „randarea” e filmarea scalată la 1080x1920,
// cu defectele puse de ffmpeg.
let ff;
let dir;
let durata;
before(async () => {
  ff = await rezolvaFfmpeg(REPO);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-overlay-s09-'));
  fs.mkdirSync(path.join(dir, 'active'));
  fs.copyFileSync(SCURT, path.join(dir, 'active', 'filmare-lucru.mp4'));
  durata = Math.floor((await probeazaMp4(SCURT, { ffprobe: ff.ffprobe })).durata * 10) / 10;
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

async function randare(nume, { vf = '', af = null, start = 0 } = {}) {
  const iesire = path.join(dir, `${nume}.mp4`);
  const audio = af === 'fara' ? ['-an'] : ['-c:a', 'aac', ...(af ? ['-af', af] : [])];
  const r = await ruleazaFfmpeg(['-hide_banner', '-y', '-ss', String(start), '-t', String(durata - start), '-i', SCURT,
    '-vf', `scale=1080:1920${vf ? `,${vf}` : ''}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', ...audio, iesire], { ffmpeg: ff.ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  return iesire;
}

const plan = (start = 0) => ({ sablon: 'overlay-filmare', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata: Math.round((durata - start) * 1000) / 1000, start, focus_x: 50, sursa: { latime: 360, inaltime: 640 } });
const ruleaza = (mp4, start = 0) => verificariProprii(mp4, { dirProiect: dir, intern: plan(start), sablon: { implicite: IMPLICITE }, ff });

test('hook: randarea corectă trece S09 și S10', { timeout: 300000 }, async () => {
  const [s09, s10] = await ruleaza(await randare('bun'));
  assert.deepEqual([s09.cod, s09.erori, s10.cod, s10.erori], ['S09', [], 'S10', []]);
  assert.equal(s10.valoare.momente.length, 6);
});

test('hook: o bandă colorată peste banda liberă pică S10, nu S09', { timeout: 300000 }, async () => {
  const [s09, s10] = await ruleaza(await randare('acoperit', { vf: 'drawbox=x=0:y=560:w=1080:h=140:color=red:t=fill' }));
  assert.equal(s09.ok, true);
  assert.deepEqual(coduri(s10), [['overlay-filmare-filmare-atinsa', 'mp4']]);
});

test('hook: fără sunet sau cu vocea mai încet cu 6 dB pică S09', { timeout: 300000 }, async () => {
  const [fara] = await ruleaza(await randare('fara-sunet', { af: 'fara' }));
  assert.match(fara.erori[0].mesaj, /nu are pistă audio/);
  const [incet, s10] = await ruleaza(await randare('incet', { af: 'volume=0.5' }));
  assert.match(incet.erori.map((e) => e.mesaj).join('\n'), /sub copia de lucru/);
  assert.equal(s10.ok, true);
});

test('hook: filmare.start mută comparația pe copia de lucru', { timeout: 300000 }, async () => {
  const mp4 = await randare('decalat', { start: 1 });
  const [s09, s10] = await ruleaza(mp4, 1);
  assert.deepEqual([s09.erori, s10.erori], [[], []]);
  // aceeași randare comparată fără decalaj: filmarea nu se mai potrivește
  const [, gresit] = await ruleaza(mp4, 0).catch(() => [null, { ok: false }]);
  assert.equal(gresit.ok, false);
});

// Limita semnalată la H07: C12 comparat cu sursa nu prinde un video neîncărcat (negru sau înghețat) când peste el stau
// subtitrări sau un card, pentru că cadrul nu mai e uniform. S10 nu depinde de uniformitate: compară banda liberă, pe
// care nu stă niciun element, cu aceeași bandă din sursă.
const CARD = 'drawbox=x=72:y=1240:w=858:h=300:color=white@0.9:t=fill';

test('hook: video negru cu subtitrări deasupra (cadrul nu mai e uniform) pică S10', { timeout: 300000 }, async () => {
  const mp4 = await randare('negru-cu-card', { vf: `drawbox=x=0:y=0:w=1080:h=1920:color=black:t=fill,${CARD}` });
  const [s09, s10] = await ruleaza(mp4);
  assert.equal(s09.ok, true);
  assert.deepEqual(coduri(s10), [['overlay-filmare-filmare-atinsa', 'mp4']]);
  assert.ok(s10.valoare.ssim.every((x) => x < 0.95), JSON.stringify(s10.valoare.ssim));
});

test('hook: video înghețat pe primul cadru cu un card deasupra pică S10 în momentele în care filmarea s-a mișcat', { timeout: 300000 }, async () => {
  const mp4 = await randare('inghetat-cu-card', { vf: `trim=end_frame=1,tpad=stop_mode=clone:stop=2000,${CARD}` });
  const [, s10] = await ruleaza(mp4);
  assert.equal(s10.ok, false, JSON.stringify(s10.valoare));
  assert.ok(s10.valoare.ssim.some((x) => x < 0.95));
});
