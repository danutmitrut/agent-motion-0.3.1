// index.motion.json cu hyperframes check real (planul F, F7): aserțiunile bune trec, un selector greșit dă motion_selector_missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { descarcaRezerva, platforma, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { checkJson, ruleazaHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { genereazaMotion } from '../../nucleu/lib/asertiuni-miscare.mjs';
import { verificaBuild } from '../../nucleu/lib/verificari/build.mjs';
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

// proba: #t intră prin opacitate în 0,5 s și stă până la 2 s; „mișcarea” e chiar intrarea, apoi 1,5 s statice (sub 2 s)
const CRON = { durata: 2, segmente: [{ ref: 'Proba', camp: '$', tip: 'card', start: 0, complet: 0.5, sfarsit: 2, zona_text: [96, 200, 888, 120], texte: ['Șir de probă'], selectori: ['#t'] }] };

async function verifica(t, cronologie) {
  const ff = await ffReale();
  const dir = mkdtempSync(join(tmpdir(), 'mg mișcare Ăîș '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dirProba = join(dir, 'proba');
  mkdirSync(dirProba, { recursive: true });
  copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'proba', 'index.html'), join(dirProba, 'index.html'));
  copyFileSync(join(RADACINA, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), join(dirProba, 'gsap.min.js'));
  writeFileSync(join(dirProba, 'index.motion.json'), `${JSON.stringify(genereazaMotion(cronologie), null, 2)}\n`);
  await ruleazaHyperframes(['browser', 'ensure'], { radacina: RADACINA, ff });
  return { check: await checkJson(dirProba, { radacina: RADACINA, ff }), dirProba };
}

test('aserțiunile generate pe probă trec în hyperframes check', { skip: motivSarit, timeout: 10 * 60 * 1000 }, async (t) => {
  const { check } = await verifica(t, CRON);
  t.diagnostic(JSON.stringify(check.motion));
  assert.deepEqual((check.motion?.findings ?? []).filter((f) => f.severity === 'error').map((f) => f.code), []);
});

test('un selector greșit dă motion_selector_missing, iar C10 numește selectorul', { skip: motivSarit, timeout: 10 * 60 * 1000 }, async (t) => {
  const gresit = structuredClone(CRON);
  gresit.segmente[0].selectori = ['#nu-exista'];
  const { check, dirProba } = await verifica(t, gresit);
  const coduri = (check.motion?.findings ?? []).filter((f) => f.severity === 'error').map((f) => f.code);
  assert.ok(coduri.includes('motion_selector_missing'), JSON.stringify(check.motion));
  assert.equal(check.ok, false);
  const [c10] = verificaBuild({ dirBuild: dirProba, asteptari: { texte: [] }, check, versiuni: citesteVersiuni(RADACINA) });
  const e = c10.erori.find((x) => x.cod === 'check-esuat');
  assert.match(e.mesaj, /motion\/motion_selector_missing \(#nu-exista: /);
});
