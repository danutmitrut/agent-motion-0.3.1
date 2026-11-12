// Escaparea HTML comună (nucleu/lib/html.mjs): o singură variantă pentru compileaza.mjs, desen/arata.mjs și iconite.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeazaHtml, decodeazaHtml } from '../../nucleu/lib/html.mjs';

test('escapeazaHtml neutralizează & < > " și apostroful, în text și în atribute', () => {
  assert.equal(escapeazaHtml(`</script><img src=x onerror="alert('1')">&`),
    '&lt;/script&gt;&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
  assert.equal(escapeazaHtml('&amp;'), '&amp;amp;', '& se escapează primul, deci nimic nu e escapat de două ori greșit');
});

test('escapeazaHtml lasă neatinse textele obișnuite și transformă în șir orice valoare', () => {
  assert.equal(escapeazaHtml('Ții totul minte. M0 0 L10 10'), 'Ții totul minte. M0 0 L10 10');
  assert.equal(escapeazaHtml(30), '30');
  assert.equal(escapeazaHtml(null), 'null');
});

test('decodeazaHtml e inversa lui escapeazaHtml (dus-întors), cu diacritice, ghilimele românești și apostrof', () => {
  for (const text of [`Ții „totul” minte & <alege> "acum" l'ai`, 'Scrie „AGENT” în comentarii', '&amp; deja scris', 'ĂÎȘȚÂ ăîșțâ']) {
    assert.equal(decodeazaHtml(escapeazaHtml(text)), text);
  }
});

test('decodeazaHtml citește și entitățile numerice și pe cele cu nume, iar pe cele necunoscute le lasă', () => {
  assert.equal(decodeazaHtml('&#238;n &#x219;i &apos;x&apos; &lt;b&gt;'), "în și 'x' <b>");
  assert.equal(decodeazaHtml('&necunoscut; &'), '&necunoscut; &');
});
