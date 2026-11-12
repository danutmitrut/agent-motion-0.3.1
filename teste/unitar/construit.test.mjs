import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valideazaConstruit } from '../../nucleu/lib/randeaza/construit.mjs';

test('M4: forma rezultatului lui construieste', () => {
  assert.doesNotThrow(() => valideazaConstruit({ intrare: 'index.html', fisiere: ['index.html'] }, 't'));
  assert.doesNotThrow(() => valideazaConstruit({
    intrare: 'index.html', fisiere: ['index.html'], active: ['active/desen/a.svg'],
    motor: { check: { argumente: ['--at', '1.5'] }, randare: { argumente: ['--no-best-effort'] }, props: 'props.json', compozitie: 'Grafic' },
  }, 't'));
  for (const gresit of [
    { fisiere: ['index.html'] },
    { intrare: '../index.html', fisiere: [] },
    { intrare: 'index.html', fisiere: ['/abs.html'] },
    { intrare: 'index.html', fisiere: [], altceva: 1 },
    { intrare: 'index.html', fisiere: [], motor: { check: { argumente: [1] } } },
    { intrare: 'index.html', fisiere: [], motor: { stil: 'x' } },
  ]) assert.throws(() => valideazaConstruit(gresit, 't'), TypeError, JSON.stringify(gresit));
});

test('M4: căile și formele greșite mai rar întâlnite', () => {
  const baza = { intrare: 'index.html', fisiere: ['index.html'] };
  for (const gresit of [
    null, [], 'index.html',
    { ...baza, intrare: 'a\\b.html' },
    { ...baza, fisiere: ['a/../b.html'] },
    { ...baza, fisiere: 'index.html' },
    { ...baza, active: ['../x.svg'] },
    { ...baza, motor: [] },
    { ...baza, motor: { check: { argumente: [], extra: 1 } } },
    { ...baza, motor: { randare: {} } },
    { ...baza, motor: { props: '/abs.json' } },
    { ...baza, motor: { compozitie: '' } },
  ]) assert.throws(() => valideazaConstruit(gresit, 't'), TypeError, JSON.stringify(gresit));
  assert.equal(valideazaConstruit(baza, 't'), baza);
});
