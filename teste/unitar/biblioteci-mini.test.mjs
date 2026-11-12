// Biblioteca mini sintetică poartă id-urile exemplelor, cu metadatele copiate din catalogul real (D4, C01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const citeste = (...cale) => JSON.parse(fs.readFileSync(path.join(RADACINA, ...cale), 'utf8'));
const mini = citeste('teste', 'fixtures', 'biblioteci-mini', 'biblioteci', 'catalog.json');
const real = citeste('biblioteci', 'catalog.json');

const IDURI = ['op-bust-laptop', 'od-chilling', 'od-running', 'od-strolling', 'op-bust-telefon', 'op-picioare-explica-ochelari', 'op-bust-cafea'];
const poza = (id) => mini.piese.find((p) => p.id === id);
const svg = (id) => fs.readFileSync(path.join(RADACINA, 'teste', 'fixtures', 'biblioteci-mini', 'biblioteci', 'forme', `${id}.svg`), 'utf8');

for (const id of IDURI) {
  test(`mini: ${id} copiază metadatele reale, cu geometrie sintetică`, () => {
    const m = poza(id);
    const r = real.piese.find((p) => p.id === id);
    assert.ok(m, 'piesa lipsește din mini');
    assert.ok(r, 'piesa lipsește din catalogul real');
    for (const camp of ['cutie', 'noapte', 'teme_potrivite', 'roluri', 'personaj', 'acoperire_cerneala']) {
      assert.deepEqual(m[camp], r[camp], camp);
    }
    assert.deepEqual(m.etichete, r.etichete.slice(0, m.etichete.length));
    assert.ok(m.etichete.length >= 4);
    assert.notEqual(m.sha256, r.sha256, 'forma mini trebuie să fie sintetică');
  });
}

test('mini: formele Open Peeps au path.fond, iar path-urile din g.ink au data-grup', () => {
  for (const id of IDURI.filter((i) => i.startsWith('op-'))) {
    const t = svg(id);
    assert.ok((t.match(/<path class="fond"/g) ?? []).length >= 1, `${id}: fără path.fond`);
    const ink = /<g class="ink">(.*?)<\/g>/s.exec(t)[1];
    const trasee = ink.match(/<path\b[^>]*>/g);
    assert.equal(trasee.length, 3, `${id}: g.ink are 3 path-uri`);
    for (const p of trasee) assert.match(p, /data-grup="(corp|cap|fata)"/);
  }
});

// C10: pe panoul inversat (noapte), L.forma aduce silueta întâi și trasează conturul închis peste ea; „peste” vine din
// ordinea din SVG, deci path-urile fond trebuie să stea înaintea lui g.ink, în mini și în biblioteca reală.
test('Open Peeps: path-urile fond stau înaintea lui g.ink (mini și biblioteca reală)', () => {
  const formeReale = path.join(RADACINA, 'biblioteci', 'forme');
  const reale = fs.readdirSync(formeReale).filter((f) => /^op-.*\.svg$/.test(f));
  assert.ok(reale.length >= 30, `doar ${reale.length} piese Open Peeps în biblioteca reală`);
  const piese = [
    ...IDURI.filter((i) => i.startsWith('op-')).map((id) => [`mini ${id}`, svg(id)]),
    ...reale.map((f) => [f, fs.readFileSync(path.join(formeReale, f), 'utf8')]),
  ];
  for (const [nume, t] of piese) {
    const ink = t.indexOf('<g class="ink"');
    assert.ok(ink > 0, `${nume}: fără g.ink`);
    assert.ok(t.indexOf('class="fond"') > 0, `${nume}: fără fond`);
    assert.ok(t.lastIndexOf('class="fond"') < ink, `${nume}: un fond stă după g.ink`);
  }
});

test('mini: formele Open Doodles au accent și 1 path de cerneală (4 la od-strolling)', () => {
  for (const id of IDURI.filter((i) => i.startsWith('od-'))) {
    const t = svg(id);
    assert.match(t, /<path class="acc"/);
    const ink = /<g class="ink">(.*?)<\/g>/s.exec(t)[1];
    assert.equal(ink.match(/<path\b/g).length, id === 'od-strolling' ? 4 : 1, id);
  }
});

test('mini: fără trasee (C04): niciun fișier în trasee/, nicio piesă traseu, linie, lc- sau trasee-dm', () => {
  const dirTrasee = path.join(RADACINA, 'teste', 'fixtures', 'biblioteci-mini', 'biblioteci', 'trasee');
  assert.equal(fs.existsSync(dirTrasee), false, 'folderul trasee/ nu mai există');
  for (const p of mini.piese) {
    assert.notEqual(p.tip, 'traseu', p.id);
    assert.notEqual(p.familie, 'linie', p.id);
    assert.ok(!p.id.startsWith('lc-'), p.id);
    assert.notEqual(p.sursa, 'trasee-dm', p.id);
  }
  assert.equal(Object.hasOwn(mini.surse, 'trasee-dm'), false, 'sursa trasee-dm');
});
