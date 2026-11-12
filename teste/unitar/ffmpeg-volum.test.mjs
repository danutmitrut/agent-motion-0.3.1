import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { masoaraVolum } from '../../nucleu/lib/sdk.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

test('masoaraVolum cu durata: măsoară doar fereastra [start, start + durata]', async (t) => {
  const ff = await rezolvaFfmpeg(REPO);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-volum-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cale = path.join(dir, 'semnal.m4a');
  // 2 s de ton, apoi 2 s de liniște
  const r = await ruleazaFfmpeg(['-hide_banner', '-y', '-f', 'lavfi', '-i', "aevalsrc='if(lt(t,2),0.5*sin(2*PI*440*t),0)':d=4:s=48000", '-c:a', 'aac', cale], { ffmpeg: ff.ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  const tot = await masoaraVolum(cale, { ffmpeg: ff.ffmpeg });
  const ton = await masoaraVolum(cale, { ffmpeg: ff.ffmpeg, durata: 2 });
  const liniste = await masoaraVolum(cale, { ffmpeg: ff.ffmpeg, start: 2.2, durata: 1.5 });
  assert.ok(ton.medie > tot.medie + 2, `${ton.medie} față de ${tot.medie}`);
  assert.ok(liniste.medie < -60, String(liniste.medie));
  // fără durata, comportamentul de până acum (de la start până la capăt)
  assert.deepEqual(await masoaraVolum(cale, { ffmpeg: ff.ffmpeg, start: 0 }), tot);
});
