// Regula Stop pentru verificare.json versiunea 2 (felia 3, docs/interfete/verificare.md): o serie se predă doar
// întreagă verde, prin manifest, folderul serie/ sau unul dintre MP4-urile ei; corectura se urmărește pe amprenta seriei.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { amprentaSerie, sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const P = 'video/rutina';
const verde = (cod) => ({ cod, ok: true, valoare: null, prag: null, camp: null, erori: [], avertismente: [] });

/** O serie de două filme, verificată; `strica(v, dir)` schimbă verificare.json sau fișierele înainte de scriere. */
function serieVerificata(strica = () => {}) {
  const tmp = creeazaRadacinaTemp({
    fisiere: {
      [`${P}/date.json`]: '{"sablon": "date-serie"}\n',
      [`${P}/serie/01-ana.mp4`]: 'mp4 fals ana\n',
      [`${P}/serie/02-radu.mp4`]: 'mp4 fals radu\n',
      [`${P}/serie/manifest.json`]: '{"versiune": 1}\n',
      [`${P}/cadre/ana/predare-1.png`]: 'png\n',
      [`${P}/cadre/ana/predare-2.png`]: 'png\n',
      [`${P}/cadre/radu/predare-1.png`]: 'png\n',
      [`${P}/cadre/radu/predare-2.png`]: 'png\n',
    },
  });
  const dir = path.join(tmp.radacina, ...P.split('/'));
  const iesire = (id, nn) => ({
    id, mp4: `${P}/serie/${nn}-${id}.mp4`, sha256_mp4: sha256Fisier(path.join(dir, 'serie', `${nn}-${id}.mp4`)), ok: true,
    obligatorii: ['C11', 'C16'], verificari: [verde('C11'), verde('C16')],
  });
  const v = {
    versiune: 2, proiect: 'rutina', sablon: 'date-serie', mod: 'complet', scris_la: '2026-10-25T10:00:00.000Z',
    sha256_date: sha256Fisier(path.join(dir, 'date.json')), surse: {},
    manifest: { cale: `${P}/serie/manifest.json`, sha256: sha256Fisier(path.join(dir, 'serie', 'manifest.json')) },
    ok: true, ok_pentru_aprobare: true, obligatorii: ['C01', 'C08'], verificari: [verde('C01'), verde('C08')],
    iesiri: [iesire('ana', '01'), iesire('radu', '02')], avertismente: [],
  };
  strica(v, dir);
  fs.writeFileSync(path.join(dir, 'verificare.json'), `${JSON.stringify(v, null, 2)}\n`);
  return { ...tmp, dir, v };
}

const stop = (mesaj) => ({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: mesaj });
function motiv(raspuns) {
  assert.equal(raspuns.cod, 0);
  return raspuns.stdout === '' ? null : JSON.parse(raspuns.stdout).reason;
}
function cu(strica, mesaj) {
  const t = serieVerificata(strica);
  try {
    return motiv(decideStop(stop(mesaj), t.radacina));
  } finally {
    t.curata();
  }
}

test('o serie verde se predă prin manifest, prin folderul serie/ sau printr-un MP4 al ei', () => {
  for (const linie of [`${P}/serie/manifest.json`, `${P}/serie`, `${P}/serie/`, `${P}/serie/02-radu.mp4`]) {
    assert.equal(cu(() => {}, `Gata.\nPredare: ${linie}`), null, linie);
  }
});

test('altă cale decât seria e refuzată, iar mesajul cere linia manifestului', () => {
  const m = cu(() => {}, `Predare: ${P}/rutina.mp4`);
  assert.match(m, /nu e manifestul seriei/);
  assert.match(m, /Predare: video\/rutina\/serie\/manifest\.json/);
});

test('fiecare condiție a regulii v2 blochează, cu motivul ei', () => {
  const cazuri = [
    [(v) => { v.ok = false; }, /verificări picate/],
    [(v) => { v.mod = 'schita'; }, /nu din randarea completă/],
    [(v, dir) => { fs.writeFileSync(path.join(dir, 'date.json'), '{}\n'); }, /date\.json s-a schimbat/],
    [(v) => { v.verificari = [verde('C01')]; }, /nu are rezultate verzi pentru C08/],
    [(v, dir) => { fs.writeFileSync(path.join(dir, 'serie', 'manifest.json'), '{"alt": 1}\n'); }, /manifest\.json s-a schimbat/],
    [(v) => { v.manifest = null; }, /nu numește manifestul/],
    [(v, dir) => { fs.writeFileSync(path.join(dir, 'serie', '01-ana.mp4'), 'alt mp4\n'); }, /01-ana\.mp4 s-a schimbat/],
    [(v, dir) => { fs.rmSync(path.join(dir, 'serie', '02-radu.mp4')); }, /lipsește video\/rutina\/serie\/02-radu\.mp4/],
    [(v) => { v.iesiri[1].ok = false; }, /02-radu\.mp4 are verificări picate/],
    [(v) => { v.iesiri[0].verificari = [verde('C11')]; }, /nu are rezultate verzi pentru C16/],
    [(v, dir) => { fs.rmSync(path.join(dir, 'cadre', 'radu', 'predare-2.png')); }, /cadre\/radu\/predare-2\.png/],
    [(v) => { v.iesiri = []; }, /nu are ieșirile seriei/],
    [(v, dir) => { fs.writeFileSync(path.join(dir, 't.csv'), 'nou\n'); v.surse = { 't.csv': 'hash-vechi' }; }, /video\/rutina\/t\.csv s-a schimbat/],
    [(v) => { v.surse = { 'resurse/t.csv': null }; v.surse['poza.jpg'] = 'x'; }, /poza\.jpg s-a schimbat/],
    [(v) => { v.surse = null; }, /lista surselor/],
    [(v) => { v.iesiri[0].mp4 = `${P}/alt/01-ana.mp4`; }, /nu are un MP4 în video\/rutina\/serie\//],
  ];
  for (const [strica, asteptat] of cazuri) assert.match(cu(strica, `Predare: ${P}/serie/manifest.json`) ?? '(trece)', asteptat, String(asteptat));
});

test('după o corectură pe serie, predarea cere încercarea verificată pe amprenta seriei de acum', () => {
  const t = serieVerificata();
  try {
    const dirC = path.join(t.dir, 'corecturi', '1');
    fs.mkdirSync(dirC, { recursive: true });
    const amprenta = amprentaSerie(t.v.iesiri);
    fs.writeFileSync(path.join(dirC, 'incercare-1.json'), JSON.stringify({ incercare: 1, sha256_mp4_de_la: 'vechi', verificata_la: null, serie: true }));
    assert.match(motiv(decideStop(stop(`Predare: ${P}/serie/manifest.json`), t.radacina)), /corectura 1 nu e verificată/);
    fs.writeFileSync(path.join(dirC, 'incercare-1.json'), JSON.stringify({ incercare: 1, sha256_mp4_de_la: 'vechi', verificata_la: '2026-10-25T11:00:00.000Z', sha256_mp4_dupa: amprenta, ok: true, serie: true }));
    assert.equal(motiv(decideStop(stop(`Predare: ${P}/serie/manifest.json`), t.radacina)), null);
  } finally {
    t.curata();
  }
});
