// Randarea pe ieșiri (felia 3, nucleu/lib/randeaza/serie.mjs și ramura de serie din corectura.mjs): codurile pe
// niveluri, amprenta build-ului unei ieșiri, S09 (schița seriei) și --verifica pe o serie, fără motor și fără MP4 real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { caiProiect } from '../../nucleu/lib/cai.mjs';
import { amprentaSerie, sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { obligatoriiSerie, sha256Build, verificaS09 } from '../../nucleu/lib/randeaza/serie.mjs';
import { deschide, verifica } from '../../nucleu/lib/corectura.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const sablon = {
  nume: 'proba', motor: 'remotion', sha256: 'abc',
  meta: { verificari: ['C01', 'C08', 'C10', 'C11', 'C16', 'S01', 'S06', 'S08', 'S09'], stadii: { S06: 'mp4', S08: 'mp4', S09: 'mp4' } },
};

test('obligatoriile pe niveluri: sus date, build și aprobare (plus S08 și S09 la complet), jos codurile de MP4 ale unui film', () => {
  assert.deepEqual(obligatoriiSerie(sablon, 'doar-verificare'), { sus: ['C01', 'C10', 'S01'], iesire: ['C11', 'C16', 'S06'] });
  assert.deepEqual(obligatoriiSerie(sablon, 'complet'), { sus: ['C01', 'C08', 'C10', 'S01', 'S08', 'S09'], iesire: ['C11', 'C16', 'S06'] });
});

test('sha256Build: stabil, schimbat de orice fișier din build/<id>/, de șablon sau de motor, dar nu de randare.mp4', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'b/props.json': '{"a":1}', 'b/fonturi/x.woff2': 'f', 'b/randare.mp4': 'vechi' } });
  try {
    const dirBuild = path.join(t.radacina, 'b');
    const versiuni = { motoare: { remotion: '4.0.529' } };
    const h = sha256Build({ dirBuild, sablon, versiuni });
    assert.equal(sha256Build({ dirBuild, sablon, versiuni }), h);
    fs.writeFileSync(path.join(dirBuild, 'randare.mp4'), 'nou');
    assert.equal(sha256Build({ dirBuild, sablon, versiuni }), h, 'randare.mp4 nu intră');
    assert.notEqual(sha256Build({ dirBuild, sablon: { ...sablon, sha256: 'alt' }, versiuni }), h);
    assert.notEqual(sha256Build({ dirBuild, sablon, versiuni: { motoare: { remotion: '4.0.530' } } }), h);
    fs.writeFileSync(path.join(dirBuild, 'fonturi', 'x.woff2'), 'g');
    assert.notEqual(sha256Build({ dirBuild, sablon, versiuni }), h);
  } finally {
    t.curata();
  }
});

test('sha256Build nu depinde de poziția cardului în serie (card.ref, ref și eticheta din cronologie)', () => {
  const props = (ref) => JSON.stringify({ card: { ref, nume: 'Ana' }, cadre: 300 });
  const cron = (ref) => JSON.stringify({ durata: 10, segmente: [{ ref, camp: 'card', start: 0 }], momente_foaie: [{ ref, eticheta: `${ref} citat`, t: 5 }] });
  const t = creeazaRadacinaTemp({ fisiere: { 'a/props.json': props('01'), 'a/cronologie.json': cron('01'), 'b/props.json': props('03'), 'b/cronologie.json': cron('03'), 'c/props.json': JSON.stringify({ card: { ref: '01', nume: 'Radu' }, cadre: 300 }), 'c/cronologie.json': cron('01') } });
  try {
    const versiuni = { motoare: { remotion: '4.0.529' } };
    const h = (d) => sha256Build({ dirBuild: path.join(t.radacina, d), sablon, versiuni });
    assert.equal(h('a'), h('b'), 'același om pe altă poziție');
    assert.notEqual(h('a'), h('c'), 'alt conținut');
    assert.notEqual(h('a'), sha256Build({ dirBuild: path.join(t.radacina, 'a'), sablon, versiuni: { ...versiuni, integritate: { 'nucleu/lib/x.mjs': 'alt' } } }), 'codul nucleului intră');
  } finally {
    t.curata();
  }
});

test('S09: fără schiță, schiță picată, pe alte date, fără verdict, REPARĂ și TRECE', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/motor.lock': '{}' } });
  try {
    const cai = caiProiect(t.radacina, 'p');
    const s09 = () => verificaS09({ radacina: t.radacina, proiect: 'p', cai, amprentaAcum: 'A' });
    const stare = (n, x) => {
      fs.mkdirSync(path.join(cai.cadre, `schita-${n}`), { recursive: true });
      fs.writeFileSync(path.join(cai.cadre, `schita-${n}`, 'stare.json'), JSON.stringify({ versiune: 1, runda: n, ...x }));
    };
    const mesaj = () => s09().erori[0]?.mesaj ?? null;
    assert.match(mesaj(), /nu are încă o schiță/);
    stare(1, { ok: false, amprenta: 'A' });
    assert.match(mesaj(), /verificări picate/);
    stare(2, { ok: true, amprenta: 'B' });
    assert.match(mesaj(), /alte date/);
    stare(3, { ok: true, amprenta: 'A' });
    assert.match(mesaj(), /nu are încă verdictul/);
    fs.writeFileSync(path.join(cai.cadre, 'revizie-schita-3.md'), 'Verdict: REPARĂ\n- citatul e tăiat\n');
    assert.equal(s09().ok, true, 'la plafonul rundelor de schiță (3), cursantul decide');
    assert.equal(s09().avertismente.length, 1);
    fs.writeFileSync(path.join(cai.cadre, 'revizie-schita-3.md'), 'Verdict: TRECE\n');
    assert.deepEqual([s09().ok, s09().valoare], [true, { runda: 3, verdict: 'TRECE' }]);
  } finally {
    t.curata();
  }
});

test('S09: o corectură în lucru trece fără schiță nouă', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/motor.lock': '{}', 'video/p/corecturi/1/incercare-1.json': '{"incercare": 1, "verificata_la": null}' } });
  try {
    const r = verificaS09({ radacina: t.radacina, proiect: 'p', cai: caiProiect(t.radacina, 'p'), amprentaAcum: 'A' });
    assert.deepEqual([r.ok, r.valoare], [true, { corectura: 1, incercare: 1 }]);
  } finally {
    t.curata();
  }
});

/** O serie predată (verificare.json v2 și manifest), cu build-urile și MP4-urile date. */
function seriePredata(radacina, iesiri) {
  const cai = caiProiect(radacina, 'p');
  fs.mkdirSync(path.join(cai.dir, 'serie'), { recursive: true });
  const intrari = iesiri.map(([id, build, continut], k) => {
    const nn = String(k + 1).padStart(2, '0');
    const cale = path.join(cai.dir, 'serie', `${nn}-${id}.mp4`);
    fs.writeFileSync(cale, continut);
    return { id, nn, mp4: `serie/${nn}-${id}.mp4`, sha256_build: build, sha256_mp4: sha256Fisier(cale), ok: true, verificari: [] };
  });
  const manifest = path.join(cai.dir, 'serie', 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ versiune: 1, iesiri: intrari }));
  fs.writeFileSync(cai.verificare, JSON.stringify({
    versiune: 2, mod: 'complet', ok: true, sha256_date: sha256Fisier(cai.date), scris_la: '2026-10-25T10:00:00.000Z', surse: {},
    manifest: { cale: 'video/p/serie/manifest.json', sha256: sha256Fisier(manifest) },
    iesiri: intrari.map((i) => ({ id: i.id, mp4: `video/p/${i.mp4}`, sha256_mp4: i.sha256_mp4, ok: true })),
  }));
  return amprentaSerie(intrari);
}

test('corectura pe o serie: se deschide pe amprenta seriei, iar --verifica cere ca rândurile neatinse să rămână identice', async () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/motor.lock': '{}', 'video/p/date.json': '{"compozitie": "serie"}\n', 'video/p/.cache/mesaj-cursant.json': '{"la": "2026-10-25T10:30:00.000Z"}' } });
  try {
    const inainte = seriePredata(t.radacina, [['ana', 'b1', 'ana v1'], ['radu', 'b2', 'radu v1'], ['mihai', 'b3', 'mihai v1']]);
    const d = deschide({ radacina: t.radacina, proiect: 'p', cerere: 'La Radu alt oraș', acum: '2026-10-25T10:31:00.000Z' });
    assert.match(d.text, /seria predată/);
    const inc = JSON.parse(fs.readFileSync(path.join(t.radacina, 'video/p/corecturi/1/incercare-1.json'), 'utf8'));
    assert.deepEqual([inc.sha256_mp4_de_la, inc.serie], [inainte, true]);
    assert.ok(fs.existsSync(path.join(t.radacina, 'video/p/corecturi/1/inainte/manifest.json')));

    // Radu refăcut (build nou), Ana și Mihai sărite (același build, același MP4), un rând nou adăugat
    seriePredata(t.radacina, [['ana', 'b1', 'ana v1'], ['radu', 'b2x', 'radu v2'], ['mihai', 'b3', 'mihai v1'], ['ioana', 'b4', 'ioana v1']]);
    const v = await verifica({ radacina: t.radacina, proiect: 'p', acum: '2026-10-25T10:40:00.000Z' });
    assert.deepEqual(v.erori, []);
    assert.deepEqual(v.rezultat.randuri, { schimbate: ['radu'], neatinse: ['ana', 'mihai'], adaugate: ['ioana'], scoase: [] });
    assert.match(v.rezultat.text, /Filme refăcute: radu\./);
    assert.match(v.rezultat.text, /identice cu cele de dinainte: 2 din 2/);
    // a doua --verifica pe aceeași serie dă același text de serie, nu pe cel al filmului unic
    const v2 = await verifica({ radacina: t.radacina, proiect: 'p', acum: '2026-10-25T10:41:00.000Z' });
    assert.deepEqual([v2.erori, v2.rezultat.text, v2.rezultat.randuri], [[], v.rezultat.text, v.rezultat.randuri]);
  } finally {
    t.curata();
  }
});

test('corectura pe o serie: un rând cu același build și alt MP4 e corectura-atinge-altceva', async () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/motor.lock': '{}', 'video/p/date.json': '{"compozitie": "serie"}\n', 'video/p/.cache/mesaj-cursant.json': '{"la": "2026-10-25T10:30:00.000Z"}' } });
  try {
    seriePredata(t.radacina, [['ana', 'b1', 'ana v1'], ['radu', 'b2', 'radu v1']]);
    deschide({ radacina: t.radacina, proiect: 'p', cerere: 'La Radu alt oraș', acum: '2026-10-25T10:31:00.000Z' });
    seriePredata(t.radacina, [['ana', 'b1', 'ana altfel'], ['radu', 'b2x', 'radu v2']]);
    const v = await verifica({ radacina: t.radacina, proiect: 'p', acum: '2026-10-25T10:40:00.000Z' });
    assert.deepEqual(v.erori.map((e) => [e.cod, e.camp]), [['corectura-atinge-altceva', 'serie/01-ana.mp4']]);
  } finally {
    t.curata();
  }
});
