// index.motion.json din cronologie (planul F, F7). Pasul eșantionării e cel din HyperFrames 0.8.96 (MOTION_FPS 20, cel mult 300).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genereazaMotion, pasEsantionare, staticPermis } from '../../nucleu/lib/asertiuni-miscare.mjs';

const seg = (ref, start, complet, selectori) => ({ ref, camp: ref, tip: 'card', start, complet, sfarsit: complet + 2, zona_text: [0, 0, 10, 10], texte: selectori.map((s) => `text ${s}`), selectori });

test('pasEsantionare: 2 s → 2/40 (n = 41), 30 s și 60 s → durata/299 (n = 300), 0,01 s → n = 2', () => {
  assert.equal(pasEsantionare(2), 2 / 40);
  assert.equal(pasEsantionare(30), 30 / 299);
  assert.equal(pasEsantionare(60), 60 / 299);
  assert.equal(pasEsantionare(0.01), 0.01 / 1);
});

test('fără segmente cu selectori: null (șablonul nu cere aserțiuni)', () => {
  assert.equal(genereazaMotion({ durata: 10, segmente: [{ ...seg('A', 0, 2, ['#a']), selectori: undefined }] }), null);
  assert.equal(genereazaMotion({ durata: 10, segmente: [seg('A', 0, 2, [])] }), null);
});

test('appearsBy pe primul text (start + 1, plafonat la complet) și pe ultimul (complet), plus un pas de eșantionare', () => {
  const durata = 30;
  const pas = pasEsantionare(durata);
  const m = genereazaMotion({ durata, segmente: [seg('A', 0, 2.5, ['#a1', '#a2', '#a3']), seg('B', 5, 5.6, ['#b1'])] });
  const r3 = (x) => Math.round(x * 1000) / 1000;
  assert.deepEqual(m.assertions.filter((a) => a.kind === 'appearsBy'), [
    { kind: 'appearsBy', selector: '#a1', bySec: r3(1 + pas) },
    { kind: 'appearsBy', selector: '#a3', bySec: r3(2.5 + pas) },
    { kind: 'appearsBy', selector: '#b1', bySec: r3(5.6 + pas) },
  ]);
});

test('before între primele texte ale segmentelor consecutive cu selectori; staysInFrame pe toate; keepsMoving pe toată compoziția', () => {
  const m = genereazaMotion({ durata: 20, segmente: [seg('A', 0, 2, ['#a1', '#a2']), { ...seg('fără', 4, 5, []), selectori: undefined }, seg('C', 8, 9, ['#c1'])] });
  assert.equal(m.version, 1);
  assert.deepEqual(m.assertions.filter((a) => a.kind === 'before'), [{ kind: 'before', a: '#a1', b: '#c1' }]);
  assert.deepEqual(m.assertions.filter((a) => a.kind === 'staysInFrame').map((a) => a.selector), ['#a1', '#a2', '#c1']);
  assert.deepEqual(m.assertions.filter((a) => a.kind === 'keepsMoving'), [{ kind: 'keepsMoving', maxStaticSec: 2 }]);
});

test('bySec nu trece de durata videoului; același selector la primul și la ultimul text nu se dublează', () => {
  const m = genereazaMotion({ durata: 10, segmente: [seg('A', 9.5, 9.99, ['#x'])] });
  assert.deepEqual(m.assertions.filter((a) => a.kind === 'appearsBy'), [{ kind: 'appearsBy', selector: '#x', bySec: 10 }]);
});

test('determinist: aceeași cronologie dă același JSON', () => {
  const c = { durata: 25, segmente: [seg('A', 0, 2, ['#a1', '#a2']), seg('B', 4, 6, ['#b1', '#b2'])] };
  assert.equal(JSON.stringify(genereazaMotion(c)), JSON.stringify(genereazaMotion(structuredClone(c))));
});

test('staticPermis: ferestrele unite peste goluri de cel mult 2 s, lipite de capete când golul e scurt', () => {
  assert.equal(staticPermis({ durata: 20, ferestre_statice: [] }), 0);
  // pauza finală a reelului: doar ea, lipită de sfârșit
  assert.equal(staticPermis({ durata: 20, ferestre_statice: [{ start: 18.5, sfarsit: 20 }] }), 1.5);
  // proba-elemente (2 elemente de 3 s, complet la 0,5 s, pauza finală 0,5 s): tot videoul
  assert.equal(staticPermis({ durata: 6, ferestre_statice: [{ start: 0.5, sfarsit: 3 }, { start: 3.5, sfarsit: 5.5 }, { start: 5.5, sfarsit: 6 }] }), 6);
  // un gol de 2,5 s desparte blocurile
  assert.equal(staticPermis({ durata: 30, ferestre_statice: [{ start: 5, sfarsit: 8 }, { start: 10.5, sfarsit: 11 }] }), 3);
});

test('keepsMoving: 2 s fără ferestre lungi; cu ferestre statice lungi, porțiunea permisă plus un pas', () => {
  const s = seg('A', 0, 0.5, ['#a']);
  const scurta = genereazaMotion({ durata: 20, segmente: [s], ferestre_statice: [{ start: 18.5, sfarsit: 20, motiv: 'pauza-finala' }] });
  assert.deepEqual(scurta.assertions.at(-1), { kind: 'keepsMoving', maxStaticSec: 2 });
  const ferestre = [{ start: 0.5, sfarsit: 3, motiv: 'citire' }, { start: 3.5, sfarsit: 5.5, motiv: 'citire' }, { start: 5.5, sfarsit: 6, motiv: 'pauza-finala' }];
  const lunga = genereazaMotion({ durata: 6, segmente: [s], ferestre_statice: ferestre });
  assert.deepEqual(lunga.assertions.at(-1), { kind: 'keepsMoving', maxStaticSec: Math.round((6 + pasEsantionare(6)) * 1000) / 1000 });
});

test('fundal "filmare": fără keepsMoving (HyperFrames nu vede pixelii videoului, iar C14 compară MP4-ul cu sursa)', () => {
  const s = seg('A', 0, 0.5, ['#a']);
  const m = genereazaMotion({ durata: 20, fundal: 'filmare', segmente: [s] });
  assert.equal(m.assertions.some((a) => a.kind === 'keepsMoving'), false);
  assert.ok(m.assertions.some((a) => a.kind === 'appearsBy') && m.assertions.some((a) => a.kind === 'staysInFrame'));
  assert.ok(genereazaMotion({ durata: 20, fundal: '#000000', segmente: [s] }).assertions.some((a) => a.kind === 'keepsMoving'));
});
