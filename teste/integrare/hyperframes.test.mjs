import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { descarcaRezerva, platforma, probeazaMp4, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { checkJson, ruleazaHyperframes, versiuneHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const RADACINA = radacinaAgent(import.meta.url, 2);

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

/**
 * Copiază proba într-un folder temporar, lângă copia ei de GSAP:
 * check 0.8.96 respinge căile cu '../' (invalid_parent_traversal_in_asset_path),
 * deci gsap.min.js trebuie să stea în același folder cu index.html.
 */
function copiazaProba(dir) {
  const dirProba = join(dir, 'proba');
  mkdirSync(dirProba, { recursive: true });
  copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'proba', 'index.html'), join(dirProba, 'index.html'));
  copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), join(dirProba, 'gsap.min.js'));
  return dirProba;
}

test('hyperframes --version e 0.8.96', { skip: motivSarit }, async () => {
  const ff = await ffReale();
  assert.equal(await versiuneHyperframes(RADACINA, { ff }), '0.8.96');
});

test('check --json pe probă: _meta.version 0.8.96, fără erori', { skip: motivSarit }, async () => {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg hf Ăîș '));
  try {
    const dirProba = copiazaProba(dir);
    await ruleazaHyperframes(['browser', 'ensure'], { radacina: RADACINA, ff });
    const r = await checkJson(dirProba, { radacina: RADACINA, ff });
    assert.equal(r._meta.version, '0.8.96');
    assert.equal(r.ok, true, JSON.stringify(r.lint.findings));
    assert.equal(r.cod, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render pe probă dă un MP4 de 2 s, 1080x1920, h264', { skip: motivSarit }, async () => {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg hf Ăîș '));
  try {
    const dirProba = copiazaProba(dir);
    const mp4 = join(dir, 'probă randată.mp4');
    const r = await ruleazaHyperframes(
      ['render', dirProba, '-o', mp4, '--quality', 'draft', '--fps', '30', '--quiet'],
      { radacina: RADACINA, ff },
    );
    assert.equal(r.cod, 0, r.stderr);
    const info = await probeazaMp4(mp4, { ffprobe: ff.ffprobe });
    assert.equal(info.video.codec, 'h264');
    assert.equal(info.video.latime, 1080);
    assert.equal(info.video.inaltime, 1920);
    assert.ok(Math.abs(info.durata - 2) <= 1 / 30, `durata ${info.durata}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
