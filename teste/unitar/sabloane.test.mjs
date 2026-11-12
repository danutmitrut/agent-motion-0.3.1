// incarcaSablon: validarea listei verificari și a stadiilor din frontmatter (planul E, M2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/** Rădăcina temporară cu proba, al cărei rând `verificari:` din SABLON.md trece prin `schimba`. */
function radacinaCu(schimba) {
  const t = creeazaRadacinaTemp({ sablonProba: true });
  const cale = path.join(t.radacina, 'motoare', 'hyperframes', 'sabloane', 'proba', 'SABLON.md');
  const text = fs.readFileSync(cale, 'utf8');
  const rand = /^verificari: \[.*\]$/m.exec(text)[0];
  fs.writeFileSync(cale, text.replace(rand, () => schimba(rand)));
  return t;
}

test('M2: incarcaSablon refuză un frontmatter fără minimul de verificări, cu coduri invalide sau cu stadii greșite', async () => {
  const cazuri = [
    ['fără C10', (v) => v.replace('C10, ', '')],
    ['cod invalid', (v) => v.replace('C01,', 'C01, X99,')],
    ['cod dublat', (v) => v.replace('C01,', 'C01, C01,')],
    ['stadiu pe un cod nedeclarat', (v) => `${v}\nstadii: { S05: build }`],
    ['stadiu necunoscut', (v) => v.replace(/verificari: \[(.*)\]/, 'verificari: [$1, S01]') + '\nstadii: { S01: randare }'],
    ['stadiu pe un cod C', (v) => `${v}\nstadii: { C05: build }`],
    ['stadii care nu e obiect', (v) => v.replace(/verificari: \[(.*)\]/, 'verificari: [$1, S01]') + '\nstadii: [S01]'],
    ['verificari care nu e listă', () => 'verificari: C01'],
  ];
  for (const [nume, schimba] of cazuri) {
    const { radacina, curata } = radacinaCu(schimba);
    try {
      await assert.rejects(incarcaSablon(radacina, 'proba'), (e) => e.eroareMg?.cod === 'sablon-invalid', nume);
    } finally {
      curata();
    }
  }
});

test('M2: mesajul pentru minimul lipsă numește codurile lipsă', async () => {
  const { radacina, curata } = radacinaCu((v) => v.replace('C10, ', '').replace('C16, ', ''));
  try {
    await assert.rejects(incarcaSablon(radacina, 'proba'), (e) => /C10, C16/.test(e.eroareMg?.mesaj));
  } finally {
    curata();
  }
});

test('M2: reelul și proba (cu stadii valide) se încarcă', async () => {
  const reel = await incarcaSablon(REPO, 'reel-ilustrat');
  assert.equal(reel.meta.verificari.length, 29);
  const { radacina, curata } = creeazaRadacinaTemp({ sablonProba: true });
  try {
    const proba = await incarcaSablon(radacina, 'proba');
    assert.deepEqual(proba.meta.verificari, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17']);
  } finally {
    curata();
  }
  const cuStadii = radacinaCu((v) => v.replace(/verificari: \[(.*)\]/, 'verificari: [$1, S01, S02]') + '\nstadii: { S01: build, S02: mp4 }');
  try {
    const proba = await incarcaSablon(cuStadii.radacina, 'proba');
    assert.deepEqual(proba.meta.stadii, { S01: 'build', S02: 'mp4' });
  } finally {
    cuStadii.curata();
  }
});
