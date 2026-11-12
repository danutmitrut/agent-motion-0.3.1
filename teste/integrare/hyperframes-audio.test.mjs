// Proba planului F (F1): cum pune HyperFrames 0.8.96 un <audio> al compoziției în MP4.
// Rămâne în suită ca regresie: elementAudio (nucleu/lib/muzica.mjs) scrie exact atributele de aici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { descarcaRezerva, platforma, rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { checkJson, ruleazaHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const RADACINA = radacinaAgent(import.meta.url, 2);
const DURATA = 2;
const AUDIO = `<audio id="muzica" src="assets/muzica.m4a" data-start="0" data-duration="${DURATA}" data-track-index="10" data-volume="1"></audio>`;

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

function fluxuri(ffprobe, cale) {
  const iesire = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', cale], { encoding: 'utf8', windowsHide: true });
  return JSON.parse(iesire).streams;
}

async function medie(ffmpeg, cale) {
  const r = await ruleazaFfmpeg(['-hide_banner', '-nostdin', '-i', cale, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  const m = /mean_volume:\s*(-?[0-9.]+) dB/.exec(r.stderr);
  assert.ok(m, r.stderr);
  return Number(m[1]);
}

test('F1: un <audio id> în rădăcină dă exact o pistă AAC de durata compoziției, la același nivel', { skip: motivSarit, timeout: 10 * 60 * 1000 }, async (t) => {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg audio Ăîș '));
  try {
    const dirProba = join(dir, 'proba');
    mkdirSync(join(dirProba, 'assets'), { recursive: true });
    copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), join(dirProba, 'gsap.min.js'));
    const html = readFileSync(join(RADACINA, 'motoare', 'hyperframes', 'proba', 'index.html'), 'utf8');
    const cuAudio = html.replace('</div></div></div>', `</div></div>${AUDIO}</div>`);
    assert.notEqual(cuAudio, html, 'proba nu mai are forma așteptată (</div></div></div> la capătul rădăcinii)');
    writeFileSync(join(dirProba, 'index.html'), cuAudio);

    const m4a = join(dirProba, 'assets', 'muzica.m4a');
    let r = await ruleazaFfmpeg(['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', `aevalsrc=0.3*sin(2*PI*440*t):s=48000:d=${DURATA}`,
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2', m4a], { ffmpeg: ff.ffmpeg });
    assert.equal(r.cod, 0, r.stderr);

    await ruleazaHyperframes(['browser', 'ensure'], { radacina: RADACINA, ff });
    const check = await checkJson(dirProba, { radacina: RADACINA, ff });
    const erori = ['lint', 'runtime', 'layout', 'motion', 'contrast']
      .flatMap((k) => (check?.[k]?.findings ?? []).filter((f) => f.severity === 'error').map((f) => `${k}/${f.code}`));
    assert.deepEqual(erori, [], JSON.stringify(check.lint?.findings ?? []));
    t.diagnostic(`check: ok ${check.ok}, avertismente lint ${(check.lint?.findings ?? []).map((f) => f.code).join(', ') || 'niciunul'}`);

    const mp4 = join(dir, 'probă cu sunet.mp4');
    r = await ruleazaHyperframes(['render', dirProba, '-o', mp4, '--quality', 'draft', '--fps', '30', '--strict', '--quiet'], { radacina: RADACINA, ff });
    assert.equal(r.cod, 0, r.stderr);

    const audio = fluxuri(ff.ffprobe, mp4).filter((f) => f.codec_type === 'audio');
    t.diagnostic(`piste audio: ${JSON.stringify(audio)}`);
    assert.equal(audio.length, 1, 'exact o pistă audio');
    assert.equal(audio[0].codec_name, 'aac');
    assert.ok(Math.abs(Number(audio[0].duration) - DURATA) <= 0.05, `durata pistei ${audio[0].duration}`);

    const sursa = await medie(ff.ffmpeg, m4a);
    const randat = await medie(ff.ffmpeg, mp4);
    t.diagnostic(`nivel mediu: sursa ${sursa} dB, MP4 ${randat} dB`);
    assert.ok(Math.abs(sursa - randat) <= 1.5, `HyperFrames a schimbat nivelul: ${sursa} → ${randat} dB`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('F1: fără <audio>, MP4-ul nu are pistă audio', { skip: motivSarit, timeout: 10 * 60 * 1000 }, async () => {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg audio Ăîș '));
  try {
    const dirProba = join(dir, 'proba');
    mkdirSync(dirProba, { recursive: true });
    copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), join(dirProba, 'gsap.min.js'));
    copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'proba', 'index.html'), join(dirProba, 'index.html'));
    const mp4 = join(dir, 'probă mută.mp4');
    const r = await ruleazaHyperframes(['render', dirProba, '-o', mp4, '--quality', 'draft', '--fps', '30', '--strict', '--quiet'], { radacina: RADACINA, ff });
    assert.equal(r.cod, 0, r.stderr);
    assert.equal(fluxuri(ff.ffprobe, mp4).filter((f) => f.codec_type === 'audio').length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
