// M4: forma rezultatului lui construieste, validată strict (fără chei în plus, la niciun nivel).
// Cheia motor: la HyperFrames, argumentele în plus pentru check și render (planul H); la Remotion, props și compozitie (planul I).

function esteObiect(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function cheiFaraExtra(obiect, permise, unde, numeSablon) {
  const extra = Object.keys(obiect).filter((k) => !permise.includes(k));
  if (extra.length > 0) {
    throw new TypeError(`Șablonul „${numeSablon}”: ${unde} are chei necunoscute: ${extra.join(', ')}.`);
  }
}

function caleRelativa(valoare, unde, numeSablon) {
  const ok = typeof valoare === 'string' && valoare !== '' && !valoare.startsWith('/') && !valoare.includes('\\')
    && !/^[A-Za-z]:/.test(valoare) && !valoare.split('/').includes('..');
  if (!ok) {
    throw new TypeError(`Șablonul „${numeSablon}”: ${unde} trebuie să fie o cale relativă, cu /, fără .. și fără / la început (primit: ${JSON.stringify(valoare)}).`);
  }
}

function listaDeCai(valoare, unde, numeSablon) {
  if (!Array.isArray(valoare)) throw new TypeError(`Șablonul „${numeSablon}”: ${unde} trebuie să fie o listă de căi.`);
  valoare.forEach((c, i) => caleRelativa(c, `${unde}[${i}]`, numeSablon));
}

function argumente(valoare, unde, numeSablon) {
  if (!esteObiect(valoare)) throw new TypeError(`Șablonul „${numeSablon}”: ${unde} trebuie să fie un obiect { argumente: string[] }.`);
  cheiFaraExtra(valoare, ['argumente'], unde, numeSablon);
  if (!Array.isArray(valoare.argumente) || valoare.argumente.some((a) => typeof a !== 'string')) {
    throw new TypeError(`Șablonul „${numeSablon}”: ${unde}.argumente trebuie să fie o listă de șiruri.`);
  }
}

/** Argumentele pe care nucleul le pune singur la check și la render (decizia 13 din planul H); un șablon nu le dă. */
export const ARGUMENTE_FIXATE = Object.freeze({
  check: Object.freeze(['--json']),
  randare: Object.freeze(['-o', '--output', '--fps', '--quality', '--json', '--quiet', '--workers', '--low-memory-mode', '--strict']),
});

function faraFixate(lista, fixate, unde, numeSablon) {
  const gasit = lista.find((a) => fixate.some((f) => a === f || a.startsWith(`${f}=`)));
  if (gasit !== undefined) {
    throw new TypeError(`Șablonul „${numeSablon}”: ${unde}.argumente conține ${gasit}, pe care îl pune nucleul (${fixate.join(', ')}).`);
  }
}

// Id-urile de compoziție acceptate de Remotion: litere, cifre și cratimă.
const ID_COMPOZITIE = /^[A-Za-z0-9-]+$/;

/** Planul I: la Remotion, motor e obligatoriu și are exact { props, compozitie }; props e unul dintre fisiere. */
function motorRemotion(rezultat, numeSablon) {
  const motor = rezultat.motor;
  if (!esteObiect(motor)) throw new TypeError(`Șablonul „${numeSablon}”: motor trebuie să fie un obiect { props, compozitie } (motorul Remotion).`);
  cheiFaraExtra(motor, ['props', 'compozitie'], 'motor', numeSablon);
  caleRelativa(motor.props, 'motor.props', numeSablon);
  if (!rezultat.fisiere.includes(motor.props)) {
    throw new TypeError(`Șablonul „${numeSablon}”: motor.props (${motor.props}) nu e în fisiere.`);
  }
  if (typeof motor.compozitie !== 'string' || !ID_COMPOZITIE.test(motor.compozitie)) {
    throw new TypeError(`Șablonul „${numeSablon}”: motor.compozitie trebuie să fie id-ul compoziției Remotion (litere, cifre, cratimă; primit: ${JSON.stringify(motor.compozitie)}).`);
  }
}

/**
 * @param {unknown} rezultat ce a întors construieste
 * @param {string} numeSablon
 * @param {'hyperframes'|'remotion'} [numeMotor] motorul șablonului (sablon.motor)
 * @returns {object} același rezultat, validat
 * @throws {TypeError} când forma nu e { intrare, fisiere, active?, motor? } (la Remotion, motor e obligatoriu)
 */
export function valideazaConstruit(rezultat, numeSablon, numeMotor = 'hyperframes') {
  if (!esteObiect(rezultat)) throw new TypeError(`Șablonul „${numeSablon}”: construieste trebuie să întoarcă un obiect.`);
  cheiFaraExtra(rezultat, ['intrare', 'fisiere', 'active', 'motor'], 'rezultatul lui construieste', numeSablon);
  caleRelativa(rezultat.intrare, 'intrare', numeSablon);
  listaDeCai(rezultat.fisiere, 'fisiere', numeSablon);
  if (rezultat.active !== undefined) listaDeCai(rezultat.active, 'active', numeSablon);
  if (numeMotor === 'remotion') {
    motorRemotion(rezultat, numeSablon);
    return rezultat;
  }
  if (rezultat.motor !== undefined) {
    const motor = rezultat.motor;
    if (!esteObiect(motor)) throw new TypeError(`Șablonul „${numeSablon}”: motor trebuie să fie un obiect.`);
    cheiFaraExtra(motor, ['check', 'randare', 'props', 'compozitie'], 'motor', numeSablon);
    if (motor.check !== undefined) {
      argumente(motor.check, 'motor.check', numeSablon);
      faraFixate(motor.check.argumente, ARGUMENTE_FIXATE.check, 'motor.check', numeSablon);
    }
    if (motor.randare !== undefined) {
      argumente(motor.randare, 'motor.randare', numeSablon);
      faraFixate(motor.randare.argumente, ARGUMENTE_FIXATE.randare, 'motor.randare', numeSablon);
    }
    if (motor.props !== undefined) caleRelativa(motor.props, 'motor.props', numeSablon);
    if (motor.compozitie !== undefined && (typeof motor.compozitie !== 'string' || motor.compozitie === '')) {
      throw new TypeError(`Șablonul „${numeSablon}”: motor.compozitie trebuie să fie un șir nevid.`);
    }
  }
  return rezultat;
}
