// F8 (revizuirea finală): pe Mac, aceeași cale cu diacritice poate veni în NFC sau în NFD; garda le tratează la fel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificaCale } from '../../nucleu/lib/garda/cai.mjs';
import { decideScriere } from '../../nucleu/lib/garda/scriere.mjs';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const RADACINA = '/Users/ion/Desktop/Învățare/agent-motion';
const NFC = RADACINA.normalize('NFC');
const NFD = RADACINA.normalize('NFD');

test('cele două forme ale rădăcinii chiar diferă ca șir', () => {
  assert.notEqual(NFC, NFD);
});

for (const [numeRad, rad, numeCale, baza] of [['NFD', NFD, 'NFC', NFC], ['NFC', NFC, 'NFD', NFD]]) {
  test(`rădăcina ${numeRad}, calea ${numeCale}: zonele protejate rămân protejate`, () => {
    assert.equal(clasificaCale(`${baza}/nucleu/mg.mjs`, rad).zona, 'kit');
    assert.equal(clasificaCale(`${baza}/.claude/settings.json`, rad).zona, 'configuratie');
    assert.equal(clasificaCale(`${baza}/video/x/build/a.html`, rad).zona, 'generat');
    assert.equal(clasificaCale(`${baza}/video/x/verificare.json`, rad).zona, 'generat');
    assert.equal(clasificaCale(`${baza}/video/x/date.json`, rad).zona, 'liber');
  });
  test(`rădăcina ${numeRad}, calea ${numeCale}: Write în kit e refuzat`, () => {
    assert.equal(decideScriere('Write', { file_path: `${baza}/nucleu/mg.mjs`, content: 'x' }, rad).decizie, 'refuza');
  });
  test(`rădăcina ${numeRad}, calea ${numeCale}: o comandă cu cale absolută în kit e refuzată`, () => {
    assert.equal(decideComanda(`echo x > "${baza}/nucleu/mg.mjs"`, 'Bash', rad).decizie, 'refuza');
  });
}
