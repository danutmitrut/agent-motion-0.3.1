// mg corectura (felia 2): deschiderea pe filmul predat, numărarea încercărilor din fișiere, diferența de date,
// comparația scenelor neatinse și lista de propuneri. Randarea e simulată: verificare.json, MP4 și cronologia scrise de test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { deschide, dinNou, diferenteDate, momenteScena, propuneri, sceneNeatinse, verifica } from '../../nucleu/lib/corectura.mjs';
import { plafonRunde } from '../../nucleu/lib/garda/revizor.mjs';
import { noteazaMesajCursant } from '../../nucleu/lib/garda/aprobare.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { clasificaCale } from '../../nucleu/lib/garda/cai.mjs';
import { problemaCorecturii } from '../../nucleu/lib/garda/stop.mjs';

const P = 'cafea';
const DATE = {
  sablon: 'proba',
  versiune_schema: 1,
  stil: { tema: 'noapte' },
  scene: [{ tip: 'titlu', text: 'Unu' }, { tip: 'lista', puncte: ['a', 'b'] }, { tip: 'final', text: 'Gata' }],
};
const cron = (durate) => {
  let t = 0;
  const segmente = durate.map((d, i) => {
    const s = { ref: `s${i}`, camp: `scene[${i}]`, tip: 'scena', start: t, complet: t + 0.6, sfarsit: t + d, zona_text: [0, 0, 10, 10], texte: [] };
    t += d - 0.4;
    return s;
  });
  return { versiune: 1, sablon: 'proba', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata: t + 0.4, fundal: 'culoare', segmente, ferestre_statice: [], momente_foaie: [], audio: null };
};

function radacina() {
  const r = creeazaRadacinaTemp({
    sablonProba: true,
    fisiere: {
      [`video/${P}/motor.lock`]: JSON.stringify({ proiect: P, sablon: { nume: 'proba', versiune_schema: 1 } }),
      'motoare/hyperframes/sabloane/proba/propuneri.json': JSON.stringify({ versiune: 1, propuneri: [{ cerere: 'mai încet', camp: 'scene[i].durata', variante: ['+1 s', 'ritm calm'] }] }),
    },
  });
  return r;
}

/** Simulează o randare completă verde: date.json, cronologia, MP4-ul și verificare.json pe ele. */
function randeaza(rad, date, durate, continutMp4) {
  const dir = path.join(rad, 'video', P);
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'date.json'), JSON.stringify(date, null, 2));
  fs.writeFileSync(path.join(dir, 'build', 'cronologie.json'), JSON.stringify(cron(durate)));
  fs.writeFileSync(path.join(dir, `${P}.mp4`), continutMp4);
  fs.writeFileSync(path.join(dir, 'verificare.json'), JSON.stringify({
    versiune: 1, proiect: P, mod: 'complet', ok: true,
    sha256_date: sha256Fisier(path.join(dir, 'date.json')), sha256_mp4: sha256Fisier(path.join(dir, `${P}.mp4`)),
  }));
}

/** Mesajul cursantului, ca hook-ul UserPromptSubmit; cu o secundă înainte, ca să fie după orice încercare de acum. */
const mesaj = (rad) => noteazaMesajCursant(rad, new Date(Date.now() + 1000));

const FF = { ffmpeg: 'ffmpeg-fals' };
const ssimFix = (valoare, apeluri = []) => async (a, b, o) => {
  apeluri.push({ a: path.basename(a), b: path.basename(b), ...o });
  return o.momente.map(() => valoare);
};

test('fără film predat, corectura nu se deschide', () => {
  const r = radacina();
  try {
    assert.throws(() => deschide({ radacina: r.radacina, proiect: P, cerere: 'mai încet' }), (e) => e.eroareMg.cod === 'corectura-fara-predare');
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    fs.writeFileSync(path.join(r.radacina, 'video', P, 'date.json'), JSON.stringify({ ...DATE, stil: { tema: 'curat' } }));
    assert.throws(() => deschide({ radacina: r.radacina, proiect: P, cerere: 'mai încet' }), (e) => e.eroareMg.cod === 'corectura-fara-predare',
      'date.json schimbat după randare nu mai e filmul predat');
  } finally {
    r.curata();
  }
});

test('deschiderea păstrează filmul de dinainte, adaugă o rundă de revizie și nu lasă a doua corectură peste ea', () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    assert.equal(plafonRunde(r.radacina, P), 3);
    mesaj(r.radacina);
    const rez = deschide({ radacina: r.radacina, proiect: P, cerere: 'Lista merge prea repede.', acum: '2026-10-21T10:00:00.000Z' });
    assert.equal(rez.corectura, 1);
    const dir = path.join(r.radacina, 'video', P, 'corecturi', '1');
    for (const f of ['inainte/date.json', 'inainte/cronologie.json', 'inainte/film.mp4', 'cerere.md', 'incercare-1.json']) {
      assert.ok(fs.existsSync(path.join(dir, f)), f);
    }
    assert.match(fs.readFileSync(path.join(dir, 'cerere.md'), 'utf8'), /Lista merge prea repede\./);
    assert.equal(plafonRunde(r.radacina, P), 4);
    assert.equal(plafonRunde(r.radacina, P, { schita: true }), 3, 'schița nu primește runde de corectură');
    assert.throws(() => deschide({ radacina: r.radacina, proiect: P, cerere: 'altceva' }), (e) => e.eroareMg.cod === 'corectura-deschisa');
  } finally {
    r.curata();
  }
});

test('verifica cere o randare nouă și listează exact câmpurile schimbate; scenele neatinse se compară la aceleași momente relative', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'Lista merge prea repede.' });
    await assert.rejects(verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) }), (e) => e.eroareMg.cod === 'corectura-nerandata');

    const dupa = structuredClone(DATE);
    dupa.scene[1].durata = 6;
    randeaza(r.radacina, dupa, [3, 6, 3], 'mp4-2');
    const apeluri = [];
    const { erori, rezultat } = await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(0.99, apeluri) });
    assert.deepEqual(erori, []);
    assert.deepEqual(rezultat.schimbari, [{ camp: 'scene[1].durata', inainte: undefined, dupa: 6 }]);
    assert.deepEqual(rezultat.scene.map((s) => s.camp), ['scene[0]', 'scene[2]']);
    // scena 2 a pornit cu 2 s mai târziu în filmul nou: același moment relativ
    assert.equal(apeluri[1].startB, 2);
    assert.equal(apeluri[1].a, 'film.mp4');
    assert.match(rezultat.text, /scene\[1\]\.durata: lipsă → 6/);
    const inc = JSON.parse(fs.readFileSync(path.join(r.radacina, 'video', P, 'corecturi', '1', 'incercare-1.json'), 'utf8'));
    assert.ok(inc.verificata_la);
  } finally {
    r.curata();
  }
});

test('o scenă neatinsă care arată altfel dă corectura-atinge-altceva', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'titlul mai mare' });
    const dupa = structuredClone(DATE);
    dupa.scene[0].marime = 'L';
    randeaza(r.radacina, dupa, [3, 4, 3], 'mp4-2');
    const { erori } = await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(0.5) });
    assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['corectura-atinge-altceva', 'scene[1]'], ['corectura-atinge-altceva', 'scene[2]']]);
  } finally {
    r.curata();
  }
});

test('o schimbare globală sare comparația cadrelor și spune de ce', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'culori mai luminoase' });
    randeaza(r.radacina, { ...DATE, stil: { tema: 'curat' } }, [3, 4, 3], 'mp4-2');
    const apeluri = [];
    const { rezultat } = await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1, apeluri) });
    assert.equal(apeluri.length, 0);
    assert.match(rezultat.comparatie_sarita, /stil\.tema/);
  } finally {
    r.curata();
  }
});

test('două încercări, apoi corectura-plafon; propunerile arată ce s-a încercat', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'textul de 3 ori mai mare' });
    await assert.rejects(dinNou({ radacina: r.radacina, proiect: P, cerere: 'tot mic' }), (e) => e.eroareMg.cod === 'corectura-deschisa');
    const d1 = structuredClone(DATE);
    d1.scene[0].marime = 'XL';
    randeaza(r.radacina, d1, [3, 4, 3], 'mp4-2');
    await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) });

    mesaj(r.radacina);
    const rez = await dinNou({ radacina: r.radacina, proiect: P, cerere: 'tot e mic' });
    assert.equal(rez.incercare, 2);
    assert.equal(plafonRunde(r.radacina, P), 5);
    await assert.rejects(verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) }), (e) => e.eroareMg.cod === 'corectura-nerandata',
      'a doua încercare cere o randare nouă față de prima, nu doar față de filmul de dinainte');
    const d2 = structuredClone(d1);
    d2.scene[0].text = 'U';
    randeaza(r.radacina, d2, [3, 4, 3], 'mp4-3');
    const { rezultat } = await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) });
    assert.deepEqual(rezultat.schimbari.map((s) => s.camp), ['scene[0].marime', 'scene[0].text'], 'diferența e mereu față de filmul de dinainte de corectură');
    assert.match(rezultat.text, /--propuneri/);

    await assert.rejects(dinNou({ radacina: r.radacina, proiect: P, cerere: 'încă o dată' }), (e) => e.eroareMg.cod === 'corectura-plafon');
    const p = await propuneri({ radacina: r.radacina, proiect: P });
    assert.equal(p.propuneri.length, 1);
    assert.match(p.text, /textul de 3 ori mai mare/);
    assert.match(p.text, /mai încet \(scene\[i\]\.durata\): \+1 s; ritm calm/);

    // după propuneri, cursantul alege o variantă: e o corectură nouă
    mesaj(r.radacina);
    assert.equal(deschide({ radacina: r.radacina, proiect: P, cerere: 'varianta 2' }).corectura, 2);
  } finally {
    r.curata();
  }
});

test('o cerere care nu există în șablon: --propuneri închide încercarea neîncepută, fără rundă de revizie', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'textul de 3 ori mai mare' });
    assert.equal(plafonRunde(r.radacina, P), 4);
    const p = await propuneri({ radacina: r.radacina, proiect: P, acum: '2026-10-21T11:00:00.000Z' });
    assert.match(p.text, /închisă cu propunerile/);
    assert.equal(plafonRunde(r.radacina, P), 3, 'încercarea închisă înainte de randare nu adaugă rundă');
    await assert.rejects(dinNou({ radacina: r.radacina, proiect: P, cerere: 'tot mic' }), (e) => e.eroareMg.cod === 'corectura-lipsa');
    await assert.rejects(verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) }), (e) => e.eroareMg.cod === 'corectura-lipsa');
    // ce alege cursantul din listă e o corectură nouă
    mesaj(r.radacina);
    assert.equal(deschide({ radacina: r.radacina, proiect: P, cerere: 'XL pe toate' }).corectura, 2);

    // o încercare începută (date.json schimbat sau randat) nu se închide cu --propuneri
    const d = structuredClone(DATE);
    d.scene[0].marime = 'XL';
    randeaza(r.radacina, d, [3, 4, 3], 'mp4-2');
    await assert.rejects(propuneri({ radacina: r.radacina, proiect: P }), (e) => e.eroareMg.cod === 'corectura-deschisa');
    fs.writeFileSync(path.join(r.radacina, 'video', P, 'date.json'), JSON.stringify(DATE));
    await assert.rejects(propuneri({ radacina: r.radacina, proiect: P }), (e) => e.eroareMg.cod === 'corectura-deschisa');
  } finally {
    r.curata();
  }
});

test('corecturi/ e în zona scrisă doar de mg', () => {
  assert.equal(clasificaCale('video/cafea/corecturi/1/incercare-1.json', '/r').zona, 'generat');
});

test('diferenteDate, sceneNeatinse și momenteScena', () => {
  assert.deepEqual(diferenteDate({ a: [1, 2], b: { c: 1 } }, { a: [1, 3], b: { c: 1, d: 2 } }).map((s) => s.camp), ['a[1]', 'b.d']);
  assert.deepEqual(diferenteDate({ scene: [1] }, { scene: [1, 2] }).map((s) => s.camp), ['scene']);
  assert.deepEqual(sceneNeatinse([{ camp: 'scene' }], cron([3, 3]), cron([3, 3, 3])).sarita, 's-a schimbat numărul scenelor');
  assert.match(sceneNeatinse([], { segmente: [] }, { segmente: [] }).sarita, /nu are scene/);
  assert.deepEqual(momenteScena({ start: 2, complet: 2.6, sfarsit: 5 }), [0.7, 1.6]);
});

test('corectura pornește doar dintr-un mesaj al cursantului, și după plafon (I2)', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    assert.throws(() => deschide({ radacina: r.radacina, proiect: P, cerere: 'mai încet' }), (e) => e.eroareMg.cod === 'corectura-fara-mesaj');
    assert.equal(fs.existsSync(path.join(r.radacina, 'video', P, 'corecturi')), false);
    for (let k = 1; k <= 2; k += 1) {
      mesaj(r.radacina);
      if (k === 1) deschide({ radacina: r.radacina, proiect: P, cerere: 'mai încet' });
      else await dinNou({ radacina: r.radacina, proiect: P, cerere: 'tot repede' });
      randeaza(r.radacina, { ...DATE, scene: DATE.scene.map((s, i) => (i === 1 ? { ...s, durata: 4 + k } : s)) }, [3, 4 + k, 3], `mp4-${k + 1}`);
      await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) });
    }
    // agentul nu poate ocoli plafonul deschizând singur o corectură nouă pe aceeași cerere
    noteazaMesajCursant(r.radacina, new Date(Date.now() - 60 * 1000)); // ultimul mesaj, cel de dinaintea verificării
    assert.throws(() => deschide({ radacina: r.radacina, proiect: P, cerere: 'mai încet' }), (e) => e.eroareMg.cod === 'corectura-fara-mesaj');
    await assert.rejects(dinNou({ radacina: r.radacina, proiect: P, cerere: 'x' }), (e) => e.eroareMg.cod === 'corectura-plafon');
  } finally {
    r.curata();
  }
});

test('verifica: o încercare verificată nu se rescrie (I1), date.json nerandat dă corectura-nerandata (M1)', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'mai încet' });
    const d1 = structuredClone(DATE);
    d1.scene[1].durata = 6;
    fs.writeFileSync(path.join(r.radacina, 'video', P, 'date.json'), JSON.stringify(d1));
    await assert.rejects(verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) }), (e) => e.eroareMg.cod === 'corectura-nerandata');
    randeaza(r.radacina, d1, [3, 6, 3], 'mp4-2');
    await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) });
    const cale = path.join(r.radacina, 'video', P, 'corecturi', '1', 'incercare-1.json');
    const salvat = fs.readFileSync(cale, 'utf8');
    const iar = await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(0) });
    assert.deepEqual(iar.erori, [], 'același film: rezultatul salvat, fără o comparație nouă');
    assert.equal(fs.readFileSync(cale, 'utf8'), salvat);
    // a treia încercare ascunsă: alt film, același --verifica
    const d2 = structuredClone(d1);
    d2.scene[0].marime = 'L';
    randeaza(r.radacina, d2, [3, 6, 3], 'mp4-3');
    await assert.rejects(verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(1) }), (e) => e.eroareMg.cod === 'corectura-verificata');
    assert.equal(fs.readFileSync(cale, 'utf8'), salvat);
  } finally {
    r.curata();
  }
});

test('predarea după o corectură: doar filmul verificat, fără scene atinse (I3)', async () => {
  const r = radacina();
  try {
    const dir = path.join(r.radacina, 'video', P);
    const sha = () => sha256Fisier(path.join(dir, `${P}.mp4`));
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    assert.equal(problemaCorecturii(dir, `video/${P}`, sha()), null, 'fără corecturi, nimic de verificat');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'titlul mai mare' });
    assert.equal(problemaCorecturii(dir, `video/${P}`, sha()), null, 'filmul de dinainte se poate preda');
    const d1 = structuredClone(DATE);
    d1.scene[0].marime = 'L';
    randeaza(r.radacina, d1, [3, 4, 3], 'mp4-2');
    assert.match(problemaCorecturii(dir, `video/${P}`, sha()), /--verifica/);
    await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(0.5) });
    assert.match(problemaCorecturii(dir, `video/${P}`, sha()), /corectura-atinge-altceva/);
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-3');
    assert.match(problemaCorecturii(dir, `video/${P}`, sha()), /s-a schimbat după corectura 1/);
  } finally {
    r.curata();
  }
});

test('o scenă neatinsă cu altă durată nu se compară (M4); o deschidere ratată nu lasă corecturi/N (M5)', async () => {
  const r = radacina();
  try {
    randeaza(r.radacina, DATE, [3, 4, 3], 'mp4-1');
    mesaj(r.radacina);
    deschide({ radacina: r.radacina, proiect: P, cerere: 'titlul mai mare' });
    const d1 = structuredClone(DATE);
    d1.scene[0].marime = 'L';
    randeaza(r.radacina, d1, [3, 4, 5], 'mp4-2');
    const apeluri = [];
    const { erori, rezultat } = await verifica({ radacina: r.radacina, proiect: P, ff: FF, ssim: ssimFix(0.5, apeluri) });
    assert.deepEqual(erori.map((e) => e.camp), ['scene[1]']);
    assert.match(rezultat.comparatie_sarita, /scene\[2\] au altă durată/);

    const r2 = radacina();
    try {
      randeaza(r2.radacina, DATE, [3, 4, 3], 'mp4-1');
      fs.unlinkSync(path.join(r2.radacina, 'video', P, 'build', 'cronologie.json'));
      mesaj(r2.radacina);
      assert.throws(() => deschide({ radacina: r2.radacina, proiect: P, cerere: 'x' }), (e) => e.eroareMg.cod === 'corectura-fara-predare');
      assert.equal(fs.existsSync(path.join(r2.radacina, 'video', P, 'corecturi')), false);
    } finally {
      r2.curata();
    }
  } finally {
    r.curata();
  }
});
