// mg nou pe un șablon Remotion (planul I, I05): motorul se instalează doar cu acordul cursantului (--instaleaza-motorul),
// înainte să se scrie ceva; pe un șablon HyperFrames opțiunea e greșită. Serviciile false înlocuiesc npm ci și descărcarea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { COD_IESIRE, EroareFatala } from '../../nucleu/lib/erori.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { principal } from '../../nucleu/mg.mjs';
import { copiazaDosar } from '../ajutoare/copiaza.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
const ACUM = new Date('2026-10-20T10:00:00.000Z');

/** Rădăcină cu proba (HyperFrames) și proba-remotion, fără Remotion instalat. */
function radacina() {
  const r = creeazaRadacinaTemp({ sablonProba: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });
  copiazaDosar(path.join(REPO, 'teste', 'fixtures', 'sabloane', 'proba-remotion'), path.join(r.radacina, 'motoare', 'remotion', 'sabloane', 'proba-remotion'));
  return r;
}

/** stare și instaleaza false; `instalari` numără apelurile. */
function serviciiFalse(instalat) {
  const s = { instalari: 0 };
  s.stare = () => ({ instalat, lipsa: instalat ? [] : ['pachete', 'browser'] });
  s.instaleaza = async () => {
    s.instalari += 1;
    return { instalat: true, lipsa: [] };
  };
  return s;
}

const esteEroarea = (cod, camp, codIesire) => (e) => {
  assert.ok(e instanceof EroareFatala, String(e));
  assert.deepEqual([e.eroareMg.cod, e.eroareMg.camp, e.codIesire], [cod, camp, codIesire]);
  return true;
};

test('Remotion neinstalat, fără --instaleaza-motorul: remotion-neinstalat, cu acordul cerut, și nimic scris', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = serviciiFalse(false);
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'serie', sablon: 'proba-remotion', serviciiMotor: s, acum: ACUM }), (e) => {
    esteEroarea('remotion-neinstalat', 'mediu.remotion', COD_IESIRE.MEDIU)(e);
    assert.match(e.eroareMg.mesaj, /~340 MB/);
    assert.equal(e.eroareMg.sugestie,
      'Întreabă cursantul dacă e de acord cu descărcarea (~340 MB); dacă da, rulează aceeași comandă cu --instaleaza-motorul.');
    return true;
  });
  assert.equal(s.instalari, 0);
  assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'serie')));
});

test('Remotion neinstalat, cu --instaleaza-motorul: se instalează o dată, apoi proiectul se creează pe Remotion', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = serviciiFalse(false);
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'serie', sablon: 'proba-remotion', instaleazaMotorul: true, serviciiMotor: s, acum: ACUM });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  assert.equal(s.instalari, 1);
  assert.equal(rez.rezultat.motor, 'remotion');
  const lock = JSON.parse(fs.readFileSync(path.join(r.radacina, 'video', 'serie', 'motor.lock'), 'utf8'));
  assert.deepEqual(lock.motor, { nume: 'remotion', versiune: '4.0.529' });
});

test('Remotion deja instalat: nu se instalează nimic, cu sau fără opțiune', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = serviciiFalse(true);
  assert.equal((await comandaNou({ radacina: r.radacina, proiect: 'unu', sablon: 'proba-remotion', serviciiMotor: s, acum: ACUM })).ok, true);
  assert.equal((await comandaNou({ radacina: r.radacina, proiect: 'doi', sablon: 'proba-remotion', instaleazaMotorul: true, serviciiMotor: s, acum: ACUM })).ok, true);
  assert.equal(s.instalari, 0);
});

test('șablon HyperFrames: --instaleaza-motorul e argument-necunoscut; fără opțiune, serviciile Remotion nu se ating', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = serviciiFalse(false);
  await assert.rejects(
    comandaNou({ radacina: r.radacina, proiect: 'hf', sablon: 'proba', instaleazaMotorul: true, serviciiMotor: s, acum: ACUM }),
    esteEroarea('argument-necunoscut', 'argumente.instaleaza-motorul', COD_IESIRE.UTILIZARE),
  );
  assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'hf')));
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'hf', sablon: 'proba', serviciiMotor: s, acum: ACUM });
  assert.equal(rez.ok, true);
  assert.equal(s.instalari, 0);
});

test('--din dintr-un proiect Remotion: aceeași regulă a acordului', async (t) => {
  const r = radacina();
  t.after(r.curata);
  assert.equal((await comandaNou({ radacina: r.radacina, proiect: 'vechi', sablon: 'proba-remotion', serviciiMotor: serviciiFalse(true), acum: ACUM })).ok, true);
  const s = serviciiFalse(false);
  await assert.rejects(
    comandaNou({ radacina: r.radacina, proiect: 'nou', din: 'vechi', serviciiMotor: s, acum: ACUM }),
    esteEroarea('remotion-neinstalat', 'mediu.remotion', COD_IESIRE.MEDIU),
  );
  assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'nou')));
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'nou', din: 'vechi', instaleazaMotorul: true, serviciiMotor: s, acum: ACUM });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  assert.equal(s.instalari, 1);
});

test('principal: --instaleaza-motorul e o opțiune a lui nou; fără Remotion, JSON-ul are remotion-neinstalat și codul 2', async (t) => {
  const r = radacina();
  t.after(r.curata);
  let iesire = '';
  const stdout = { write: (x) => { iesire += x; } };
  let cod = await principal(['nou', 'serie', '--sablon', 'proba-remotion', '--json'], { radacina: r.radacina, stdout });
  assert.equal(cod, COD_IESIRE.MEDIU, iesire);
  const json = JSON.parse(iesire);
  assert.equal(json.ok, false);
  assert.equal(json.erori[0].cod, 'remotion-neinstalat');

  iesire = '';
  cod = await principal(['nou', 'hf', '--sablon', 'proba', '--instaleaza-motorul', '--json'], { radacina: r.radacina, stdout });
  assert.equal(cod, COD_IESIRE.UTILIZARE, iesire);
  assert.equal(JSON.parse(iesire).erori[0].camp, 'argumente.instaleaza-motorul');
});
