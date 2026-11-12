// Formatul comun build/cronologie.json (harta 5.4, docs/interfete/cronologie.md):
// rotunjirea timpilor, validatorul și tabelul tipărit de mg randeaza.
import { eroare } from './erori.mjs';
import { numarRo } from './format.mjs';

const DIMENSIUNI_FORMAT = Object.freeze({
  vertical: [1080, 1920],
  patrat: [1080, 1080],
  orizontal: [1920, 1080],
});
const CHEI_CRONOLOGIE = ['versiune', 'sablon', 'format', 'latime', 'inaltime', 'fps', 'durata', 'fundal', 'segmente', 'ferestre_statice', 'momente_foaie', 'audio'];
// Planul H: sursa_video (obligatorie cu fundal „filmare”, interzisă altfel); banda segmentului (C09 caută suprapunerea doar în aceeași bandă).
const CHEI_CRONOLOGIE_OPTIONALE = ['sursa_video'];
const CHEI_SURSA_VIDEO = ['fisier', 'start', 'latime', 'inaltime', 'focus_x'];
const CHEI_SEGMENT = ['ref', 'camp', 'tip', 'start', 'complet', 'sfarsit', 'zona_text', 'texte'];
// M9 (planul E): câmpuri opționale, pentru detaliile proprii ale șablonului (de exemplu ancora overlay-ului) și
// pentru selectorii DOM ai textelor din build/index.html (index.motion.json). Nucleul nu le interpretează.
const CHEI_SEGMENT_OPTIONALE = ['detalii', 'selectori', 'banda'];
const CHEI_FEREASTRA = ['start', 'sfarsit', 'motiv'];
const CHEI_MOMENT = ['t', 'ref', 'eticheta'];
const CHEI_AUDIO = ['fisier', 'durata'];
const DISTANTA_MOMENTE = 0.1;
const TOLERANTA = 1e-9;
const SUGESTIE = 'Cronologia o produce șablonul, nu date.json: trimite eroarea, împreună cu date.json, celui care întreține șablonul.';

/**
 * Rotunjirea unică a timpilor: Math.round(x * 10^zecimale) / 10^zecimale.
 * @param {number} x @param {number} [zecimale]
 * @returns {number}
 */
export function rotunjeste(x, zecimale = 3) {
  const factor = 10 ** zecimale;
  return Math.round(x * factor) / factor;
}

const esteObiect = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esteSirNevid = (v) => typeof v === 'string' && v.trim() !== '';
const esteTimp = (v) => typeof v === 'number' && Number.isFinite(v) && rotunjeste(v, 3) === v;

/**
 * Validează o cronologie față de formatul comun. Fiecare problemă devine o eroare
 * 'cronologie-invalida' cu camp 'cronologie' sau 'cronologie.<cale JSON>'.
 * @param {unknown} cron
 * @returns {import('./erori.mjs').EroareMg[]}
 */
export function valideazaCronologie(cron) {
  const erori = [];
  const adauga = (cale, mesaj) => erori.push(eroare('cronologie-invalida', `cronologie${cale}`, `Cronologia: ${mesaj}`, SUGESTIE));

  const verificaChei = (obiect, permise, cale, optionale = []) => {
    for (const cheie of permise) {
      if (!Object.hasOwn(obiect, cheie)) adauga(`${cale}.${cheie}`, `lipsește câmpul ${cheie}.`);
    }
    for (const cheie of Object.keys(obiect)) {
      if (!permise.includes(cheie) && !optionale.includes(cheie)) adauga(`${cale}.${cheie}`, `câmpul ${cheie} nu face parte din format.`);
    }
  };
  const verificaTimp = (obiect, cheie, cale) => {
    if (!Object.hasOwn(obiect, cheie)) return false;
    if (!esteTimp(obiect[cheie])) {
      adauga(`${cale}.${cheie}`, `${cheie} trebuie să fie un număr de secunde cu cel mult 3 zecimale (are ${String(obiect[cheie])}).`);
      return false;
    }
    return true;
  };

  if (!esteObiect(cron)) {
    adauga('', 'nu e un obiect JSON.');
    return erori;
  }
  verificaChei(cron, CHEI_CRONOLOGIE, '', CHEI_CRONOLOGIE_OPTIONALE);

  if (Object.hasOwn(cron, 'versiune') && cron.versiune !== 1) adauga('.versiune', 'versiune trebuie să fie 1.');
  if (Object.hasOwn(cron, 'sablon') && !(typeof cron.sablon === 'string' && /^[a-z0-9-]+$/.test(cron.sablon))) {
    adauga('.sablon', 'sablon trebuie să fie numele șablonului, cu litere mici, cifre și cratimă.');
  }

  const dimensiuni = DIMENSIUNI_FORMAT[cron.format];
  if (Object.hasOwn(cron, 'format') && !Object.hasOwn(DIMENSIUNI_FORMAT, cron.format)) {
    adauga('.format', `formatul ${String(cron.format)} nu există (vertical, patrat sau orizontal).`);
  }
  for (const [cheie, index] of [['latime', 0], ['inaltime', 1]]) {
    if (!Object.hasOwn(cron, cheie)) continue;
    if (!Number.isInteger(cron[cheie]) || cron[cheie] <= 0) adauga(`.${cheie}`, `${cheie} trebuie să fie un număr întreg de pixeli, pozitiv.`);
    else if (Object.hasOwn(DIMENSIUNI_FORMAT, cron.format) && cron[cheie] !== dimensiuni[index]) {
      adauga(`.${cheie}`, `${cheie} e ${cron[cheie]}, dar formatul ${cron.format} are ${dimensiuni[index]}.`);
    }
  }
  const fpsBun = Number.isInteger(cron.fps) && cron.fps >= 1 && cron.fps <= 120;
  if (Object.hasOwn(cron, 'fps') && !fpsBun) adauga('.fps', 'fps trebuie să fie un număr întreg între 1 și 120.');

  let durataBuna = verificaTimp(cron, 'durata', '');
  if (durataBuna && cron.durata <= 0) {
    adauga('.durata', 'durata trebuie să fie mai mare decât 0.');
    durataBuna = false;
  }
  if (Object.hasOwn(cron, 'fundal') && !(cron.fundal === 'filmare' || (typeof cron.fundal === 'string' && /^#[0-9A-Fa-f]{6}$/.test(cron.fundal)))) {
    adauga('.fundal', 'fundal trebuie să fie o culoare #RRGGBB sau „filmare”.');
  }
  if (cron.fundal === 'filmare' && !Object.hasOwn(cron, 'sursa_video')) adauga('.sursa_video', 'cu fundal „filmare”, cronologia are sursa_video.');
  if (Object.hasOwn(cron, 'sursa_video')) {
    const sv = cron.sursa_video;
    if (cron.fundal !== 'filmare') adauga('.sursa_video', 'sursa_video există doar cu fundal „filmare”.');
    else if (!esteObiect(sv)) adauga('.sursa_video', 'sursa_video trebuie să fie un obiect.');
    else {
      verificaChei(sv, CHEI_SURSA_VIDEO, '.sursa_video');
      const cale = typeof sv.fisier === 'string' && sv.fisier !== '' && !sv.fisier.startsWith('/') && !sv.fisier.includes('\\') && !/^[A-Za-z]:/.test(sv.fisier) && !sv.fisier.split('/').includes('..');
      if (Object.hasOwn(sv, 'fisier') && !cale) adauga('.sursa_video.fisier', 'fisier trebuie să fie o cale relativă la proiect, cu /, fără ..');
      if (verificaTimp(sv, 'start', '.sursa_video') && sv.start < 0) adauga('.sursa_video.start', 'start nu poate fi negativ.');
      for (const k of ['latime', 'inaltime']) {
        if (Object.hasOwn(sv, k) && (!Number.isInteger(sv[k]) || sv[k] <= 0)) adauga(`.sursa_video.${k}`, `${k} trebuie să fie un număr întreg de pixeli, pozitiv.`);
      }
      if (Object.hasOwn(sv, 'focus_x') && !(typeof sv.focus_x === 'number' && sv.focus_x >= 0 && sv.focus_x <= 100)) adauga('.sursa_video.focus_x', 'focus_x trebuie să fie un procent între 0 și 100.');
    }
  }

  // Segmentele
  const segmenteBune = [];
  if (Object.hasOwn(cron, 'segmente')) {
    if (!Array.isArray(cron.segmente) || cron.segmente.length === 0) {
      adauga('.segmente', 'segmente trebuie să fie o listă cu cel puțin un segment.');
    } else {
      cron.segmente.forEach((seg, i) => {
        const cale = `.segmente[${i}]`;
        if (!esteObiect(seg)) {
          adauga(cale, `segmentul ${i + 1} nu e un obiect.`);
          return;
        }
        verificaChei(seg, CHEI_SEGMENT, cale, CHEI_SEGMENT_OPTIONALE);
        if (Object.hasOwn(seg, 'detalii') && !esteObiect(seg.detalii)) {
          adauga(`${cale}.detalii`, 'detalii trebuie să fie un obiect JSON.');
        }
        if (Object.hasOwn(seg, 'selectori')) {
          const s = seg.selectori;
          if (!Array.isArray(s) || !s.every(esteSirNevid) || new Set(s).size !== s.length) {
            adauga(`${cale}.selectori`, 'selectori trebuie să fie o listă de selectori CSS nevizi, fără dubluri.');
          } else if (Array.isArray(seg.texte) && s.length !== seg.texte.length) {
            adauga(`${cale}.selectori`, `selectori are ${s.length} elemente, iar texte ${seg.texte.length}: trebuie câte un selector pentru fiecare text, în aceeași ordine.`);
          }
        }
        if (Object.hasOwn(seg, 'banda') && !esteSirNevid(seg.banda)) adauga(`${cale}.banda`, 'banda trebuie să fie un text nevid.');
        for (const cheie of ['ref', 'camp', 'tip']) {
          if (Object.hasOwn(seg, cheie) && !esteSirNevid(seg[cheie])) adauga(`${cale}.${cheie}`, `${cheie} trebuie să fie un text nevid.`);
        }
        const nume = esteSirNevid(seg.ref) ? `segmentul „${seg.ref}”` : `segmentul ${i + 1}`;
        const timpiBuni = ['start', 'complet', 'sfarsit'].map((cheie) => verificaTimp(seg, cheie, cale)).every(Boolean);
        if (timpiBuni) {
          if (seg.start < 0) adauga(`${cale}.start`, `${nume}: start (${numarRo(seg.start)}) e negativ.`);
          if (seg.complet < seg.start) adauga(`${cale}.complet`, `${nume}: complet (${numarRo(seg.complet)}) e înainte de start (${numarRo(seg.start)}).`);
          if (seg.sfarsit < seg.complet) adauga(`${cale}.sfarsit`, `${nume}: sfarsit (${numarRo(seg.sfarsit)}) e înainte de complet (${numarRo(seg.complet)}).`);
          else if (durataBuna && seg.sfarsit > cron.durata) adauga(`${cale}.sfarsit`, `${nume}: sfarsit (${numarRo(seg.sfarsit)}) e după durata videoului (${numarRo(cron.durata)}).`);
          segmenteBune.push(seg);
        }
        if (Object.hasOwn(seg, 'zona_text')) {
          const z = seg.zona_text;
          const forma = Array.isArray(z) && z.length === 4 && z.every((v) => typeof v === 'number' && Number.isFinite(v));
          if (!forma || z[0] < 0 || z[1] < 0 || z[2] <= 0 || z[3] <= 0) {
            adauga(`${cale}.zona_text`, `${nume}: zona_text trebuie să fie [x, y, w, h], cu x, y ≥ 0 și w, h > 0.`);
          } else if (Number.isInteger(cron.latime) && Number.isInteger(cron.inaltime) && (z[0] + z[2] > cron.latime || z[1] + z[3] > cron.inaltime)) {
            adauga(`${cale}.zona_text`, `${nume}: zona_text iese din cadrul de ${cron.latime}x${cron.inaltime}.`);
          }
        }
        if (Object.hasOwn(seg, 'texte')) {
          if (!Array.isArray(seg.texte)) {
            adauga(`${cale}.texte`, `${nume}: texte trebuie să fie o listă.`);
          } else {
            seg.texte.forEach((text, k) => {
              if (!esteSirNevid(text)) adauga(`${cale}.texte[${k}]`, `${nume}: textul ${k + 1} e gol.`);
              else if (text.includes('*')) adauga(`${cale}.texte[${k}]`, `${nume}: textul ${k + 1} conține marcajul *; texte are textul exact de pe ecran.`);
            });
          }
        }
      });
    }
  }

  // Ferestrele statice
  if (Object.hasOwn(cron, 'ferestre_statice')) {
    if (!Array.isArray(cron.ferestre_statice)) {
      adauga('.ferestre_statice', 'ferestre_statice trebuie să fie o listă (poate fi goală).');
    } else {
      cron.ferestre_statice.forEach((f, i) => {
        const cale = `.ferestre_statice[${i}]`;
        if (!esteObiect(f)) {
          adauga(cale, `fereastra statică ${i + 1} nu e un obiect.`);
          return;
        }
        verificaChei(f, CHEI_FEREASTRA, cale);
        if (Object.hasOwn(f, 'motiv') && !esteSirNevid(f.motiv)) adauga(`${cale}.motiv`, 'motiv trebuie să fie un text nevid.');
        const startBun = verificaTimp(f, 'start', cale);
        const sfarsitBun = verificaTimp(f, 'sfarsit', cale);
        if (startBun && f.start < 0) adauga(`${cale}.start`, `fereastra statică ${i + 1} începe la un timp negativ.`);
        if (startBun && sfarsitBun && f.sfarsit < f.start) adauga(`${cale}.sfarsit`, `fereastra statică ${i + 1} se termină înainte să înceapă.`);
        else if (sfarsitBun && durataBuna && f.sfarsit > cron.durata) adauga(`${cale}.sfarsit`, `fereastra statică ${i + 1} trece de durata videoului.`);
      });
    }
  }

  // Momentele foii de contact
  if (Object.hasOwn(cron, 'momente_foaie')) {
    if (!Array.isArray(cron.momente_foaie) || cron.momente_foaie.length === 0) {
      adauga('.momente_foaie', 'momente_foaie trebuie să fie o listă nevidă.');
    } else {
      const timpi = [];
      cron.momente_foaie.forEach((m, i) => {
        const cale = `.momente_foaie[${i}]`;
        if (!esteObiect(m)) {
          adauga(cale, `momentul ${i + 1} nu e un obiect.`);
          return;
        }
        verificaChei(m, CHEI_MOMENT, cale);
        for (const cheie of ['ref', 'eticheta']) {
          if (Object.hasOwn(m, cheie) && !esteSirNevid(m[cheie])) adauga(`${cale}.${cheie}`, `${cheie} trebuie să fie un text nevid.`);
        }
        if (!verificaTimp(m, 't', cale)) return;
        if (m.t < 0 || (durataBuna && m.t > cron.durata)) {
          adauga(`${cale}.t`, `momentul ${i + 1} (${numarRo(m.t)}) e în afara videoului.`);
          return;
        }
        const anterior = timpi.at(-1);
        if (anterior !== undefined && m.t < anterior) {
          adauga(`${cale}.t`, `momentele nu sunt sortate: ${numarRo(m.t)} vine după ${numarRo(anterior)}.`);
        } else if (anterior !== undefined && m.t - anterior < DISTANTA_MOMENTE - TOLERANTA) {
          adauga(`${cale}.t`, `momentul ${numarRo(m.t)} e la mai puțin de 0,1 s de ${numarRo(anterior)} (dublură).`);
        }
        timpi.push(m.t);
      });
      const acoperit = (t) => timpi.some((x) => Math.abs(x - t) <= DISTANTA_MOMENTE + TOLERANTA);
      for (const seg of segmenteBune) {
        if (!acoperit(seg.complet)) adauga('.momente_foaie', `lipsește momentul complet (${numarRo(seg.complet)}) al segmentului „${seg.ref}”.`);
      }
      if (durataBuna && fpsBun) {
        const ultimulCadru = rotunjeste(cron.durata - 1 / cron.fps);
        if (!acoperit(ultimulCadru)) adauga('.momente_foaie', `lipsește ultimul cadru (${numarRo(ultimulCadru)}).`);
      }
    }
  }

  // Audio
  if (Object.hasOwn(cron, 'audio') && cron.audio !== null) {
    if (!esteObiect(cron.audio)) {
      adauga('.audio', 'audio trebuie să fie null sau {fisier, durata}.');
    } else {
      verificaChei(cron.audio, CHEI_AUDIO, '.audio');
      if (Object.hasOwn(cron.audio, 'fisier') && !esteSirNevid(cron.audio.fisier)) adauga('.audio.fisier', 'fisier trebuie să fie o cale nevidă.');
      if (verificaTimp(cron.audio, 'durata', '.audio') && cron.audio.durata <= 0) adauga('.audio.durata', 'durata audio trebuie să fie mai mare decât 0.');
    }
  }

  return erori;
}

/**
 * Tabelul cronologiei, tipărit de mg randeaza și copiat de agent în jurnal.md.
 * Primește o cronologie validă (valideazaCronologie fără erori).
 * @param {object} cron
 * @returns {string}
 */
export function tabelCronologie(cron) {
  const celula = (v) => String(v).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const linii = [
    `Durata ${numarRo(cron.durata)} s, ${cron.fps} fps, ${cron.format} ${cron.latime}x${cron.inaltime}, fundal ${cron.fundal}.`,
    '',
    '| Ref | Tip | Start | Complet | Sfârșit | Texte |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const s of cron.segmente) {
    linii.push(`| ${celula(s.ref)} | ${celula(s.tip)} | ${numarRo(s.start)} | ${numarRo(s.complet)} | ${numarRo(s.sfarsit)} | ${celula(s.texte.join(' / '))} |`);
  }
  return `${linii.join('\n')}\n`;
}
