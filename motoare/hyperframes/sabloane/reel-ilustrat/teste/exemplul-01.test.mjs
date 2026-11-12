import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planificaTimpi } from '../plan.mjs';
import { cronologie } from '../sablon.mjs';
import { valideazaCronologie, rotunjeste } from '../../../../../nucleu/lib/cronologie.mjs';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const citeste = (cale) => JSON.parse(readFileSync(cale, 'utf8'));
const implicite = citeste(path.join(AICI, '..', 'implicite.json'));
const exemplu = citeste(path.join(AICI, '..', 'exemple', '01-rutina-preluata.json'));

// StilRezolvat al temei noapte, cum îl dă rezolvaStil (5.5)
const stil = {
  tema: { valoare: 'noapte', sursa: 'date' },
  culori: {
    fundal: { valoare: '#0E0F13', sursa: 'tema' },
    text: { valoare: '#F2EFEA', sursa: 'tema' },
    atenuat: { valoare: '#9A9AA3', sursa: 'tema' },
    accent: { valoare: '#FF7A59', sursa: 'tema' },
    linie: { valoare: '#F2EFEA', sursa: 'implicit' },
  },
  // fonturile intră în cronologie prin regula de lățime a rândurilor din C04 (2026-10-06)
  font_titlu: { valoare: 'inter', sursa: 'tema' },
  font_text: { valoare: 'inter', sursa: 'tema' },
  ritm: { valoare: 'normal', sursa: 'date' },
  atmosfera: { valoare: 'ceata', sursa: 'tema' },
  granulatie: { valoare: 0.1, sursa: 'tema' },
  eticheta: { valoare: { majuscule: true, spatiere: 0.16, prefix: '' }, sursa: 'tema' },
  semnatura: { valoare: 'Ana Pop,\ncoach de carieră', sursa: 'date' },
};

test('exemplul 01 se planifică fără erori', () => {
  const { erori } = planificaTimpi(exemplu, stil, implicite);
  assert.deepEqual(erori, []);
});

test('cardurile nu se suprapun: pauza e cel puțin 0,5 s', () => {
  const { plan } = planificaTimpi(exemplu, stil, implicite);
  for (let i = 1; i < plan.carduri.length; i++) {
    const anterior = plan.carduri[i - 1];
    const curent = plan.carduri[i];
    assert.notEqual(anterior.iese, null);
    assert.ok(curent.intra - anterior.iese >= 0.5 - 1e-9, `${anterior.id} iese la ${anterior.iese}, ${curent.id} intră la ${curent.intra}`);
  }
});

test('desenul de după rețea vine la retrag + 1,0 s sau mai târziu', () => {
  const { plan } = planificaTimpi(exemplu, stil, implicite);
  const retea = plan.retele[0];
  const dupa = plan.desene.filter((d) => d.draw[0] > retea.nastere);
  assert.ok(dupa.length >= 1);
  for (const d of dupa) assert.ok(d.draw[0] >= retea.retrag + 1.0 - 1e-9, `${d.g} pornește la ${d.draw[0]}`);
});

test('semnătura pornește la durata - 3,5 s și se termină la durata - 1,5 s', () => {
  const { plan } = planificaTimpi(exemplu, stil, implicite);
  assert.equal(plan.semnatura.t, rotunjeste(plan.durata - 3.5));
  assert.equal(rotunjeste(plan.semnatura.t + plan.semnatura.dur), rotunjeste(plan.durata - 1.5));
  assert.equal(plan.semnatura.text, 'Ana Pop,\ncoach de carieră');
});

test('două rulări dau planuri și cronologii identice byte cu byte, iar cronologia e validă', () => {
  // motoare/comun: fonturile, pentru regula de lățime a rândurilor din C04 (fontkit, 2026-10-06)
  const tmp = creeazaRadacinaTemp({ copiaza: ['motoare/comun'], biblioteciMini: true });
  try {
    const ctx = { radacina: tmp.radacina, proiect: 'exemplul-01', sablon: { nume: 'reel-ilustrat', implicite }, mod: 'doar-verificare' };
    const a = cronologie(exemplu, stil, ctx);
    const b = cronologie(structuredClone(exemplu), structuredClone(stil), ctx);
    assert.deepEqual(a.erori, []);
    assert.equal(JSON.stringify(a.intern, null, 2), JSON.stringify(b.intern, null, 2));
    assert.equal(JSON.stringify(a.cronologie, null, 2), JSON.stringify(b.cronologie, null, 2));
    assert.deepEqual(valideazaCronologie(a.cronologie), []);
    assert.equal(a.cronologie.durata, 30);
    assert.deepEqual(a.cronologie.ferestre_statice, [{ start: 28.5, sfarsit: 30, motiv: 'pauza-finala' }]);
    assert.deepEqual(a.cronologie.segmente[0].texte, ['VINERI SEARA, TOT AICI', 'Ții totul minte.']);
  } finally {
    tmp.curata();
  }
});

test('cronologie nu produce cronologie din date invalide ca timp (valideaza rulează întâi)', () => {
  const ctx = { sablon: { nume: 'reel-ilustrat', implicite }, mod: 'doar-verificare' };
  const prea = structuredClone(exemplu);
  prea.durata = 20; // scenele însumează 30 s
  const a = cronologie(prea, stil, ctx);
  assert.equal(a.cronologie, null);
  assert.ok(a.erori.length > 0);
  const goale = { ...structuredClone(exemplu), scene: [] };
  const b = cronologie(goale, stil, ctx);
  assert.equal(b.cronologie, null);
  assert.ok(b.erori.length > 0);
});
