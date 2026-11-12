# Formatul `build/cronologie.json`

Document de interfață al pasului 0 (spec 6.8, harta 5.4). Cronologia e produsă de funcția `cronologie()` a fiecărui șablon (`docs/interfete/sablon.md`), scrisă de nucleu în `video/<proiect>/build/cronologie.json` și citită de verificările comune (C09, C12, C13, C14, C16) și de foaia de contact. Validatorul e `valideazaCronologie` din `nucleu/lib/cronologie.mjs`; orice abatere de la acest document e o eroare `cronologie-invalida`.

## Exemplu

```json
{
  "versiune": 1,
  "sablon": "reel-ilustrat",
  "format": "vertical",
  "latime": 1080,
  "inaltime": 1920,
  "fps": 30,
  "durata": 25,
  "fundal": "#F3EBDD",
  "segmente": [
    {
      "ref": "Scena 1",
      "camp": "scene[0]",
      "tip": "desen",
      "start": 0,
      "complet": 2.15,
      "sfarsit": 4,
      "zona_text": [96, 200, 888, 280],
      "texte": ["Luni, 8:30", "Telefonul sună", "din nou."]
    }
  ],
  "ferestre_statice": [ { "start": 23.5, "sfarsit": 25, "motiv": "pauza-finala" } ],
  "momente_foaie": [ { "t": 2.15, "ref": "Scena 1", "eticheta": "Scena 1, complet" } ],
  "audio": null
}
```

(Un fișier real are și momentul ultimului cadru, aici `24.967`; vezi regulile.)

## La text-animat

Un segment pe scenă: `ref` „Scena N”, `camp` `scene[i]`, `tip` tipul scenei (`titlu`, `fraza`, `cuvinte`, `lista`, `cifra`, `citat`, `final`). `complet` e momentul la care tot textul scenei a intrat; `texte` are fiecare bucată de text de pe ecran (cuvintele frazei, segmentele rândurilor), iar `selectori` câte un `#tN-k` pentru fiecare. Scenele nu se suprapun: `sfarsit` e `start`-ul scenei următoare. `ferestre_statice` e mereu goală (deriva scenelor și împingerea compoziției țin imaginea în mișcare). `momente_foaie`: `complet`-ul fiecărei scene, `start`-ul fiecărei scene de după prima („Tranziția spre scena N”) și ultimul cadru, sortate, la cel puțin 0,1 s unul de altul.

## La overlay-filmare

`fundal` e `"filmare"`, deci `sursa_video` e obligatorie (`fisier` `build/filmare.mp4`, `start` = `filmare.start`, lățimea și înălțimea copiei de lucru, `focus_x`), iar `audio` e `null`: sunetul e vocea din filmare, nu muzica. Un segment pe element, sortate după `start` (nu în ordinea din date): `ref` = id-ul elementului (`elemente[i].id`, implicit `eN`, cu N = poziția în `date.json`; unic, altfel `overlay-filmare-id-dublu`), același nume ca în blocul „Ce apare pe ecran” și în așteptări, `camp` `elemente[i]`, `tip` tipul elementului, `banda` (`sus`, `centru` sau `nume`), `zona_text` = cardul, `texte` și `selectori` (`#tN-k`) pe fiecare rând de text, `detalii.ancora` = `{ fraza, aparitia, t }` (fraza găsită și timpul ei) sau `null` la un element pornit cu `la`. Elementele din benzi diferite se pot suprapune în timp: C09 compară doar segmentele din aceeași bandă. Fără elemente, un singur segment „Filmarea” (`tip` `filmare`, `banda` `filmare`, fără texte, `zona_text` = banda subtitrărilor). `ferestre_statice` e goală (C14 compară cu filmarea). `momente_foaie`: `complet`-ul fiecărui element, câte un moment la 3 s („Secunda N”) și ultimul cadru, sortate, la cel puțin 0,1 s unul de altul.

## La date-serie

Un segment pe scenă: `ref` „Scena N”, `camp` `scene[i]`, `tip` tipul scenei (`titlu`, `cifra`, `bare`, `comparatie`, `final`). Scenele se leagă prin tranziții fade de 12 cadre, iar cadrele vin din `src/durata.mjs`, aceleași pentru cronologie, pentru `props.json` și pentru `calculateMetadata` din `Root.tsx`: `cadre[i] = round(durata × 30)`, `inceput[i] = Σ_{j<i} cadre[j] − 12 × i`, totalul `Σ cadre − 12 × (n − 1)`. Segmentele sunt lipite, tăiate la mijlocul fiecărei tranziții: `start = 0` la prima scenă, altfel `(inceput[i] + 6) / 30`; `sfarsit = (inceput[i + 1] + 6) / 30`, iar la ultima scenă `total / 30`; C09 nu vede suprapuneri. `complet = (inceput[i] + cadreIntrare(scena)) / 30`: `titlu` și `final` 18 cadre, `cifra` 45, `bare` 30 + 2 × (n − 1), `comparatie` 30 + 6 × (n − 1); la acel cadru fiecare text și fiecare bară stau în caseta din `props.json`, iar `zona_text` și casetele textelor sunt chiar acelea. `intrare` trebuie să cadă înainte de tranziția de ieșire (cel mult `cadre − 12`). Toți timpii se rotunjesc cu `rotunjeste`. `audio` e `null` fără muzică; cu muzică, forma comună. `fundal` e culoarea temei, fără `sursa_video`. `momente_foaie`: `complet`-ul fiecărei scene, mijlocul fiecărei tranziții („Tranziția spre scena N”) și ultimul cadru.

La compoziția `serie` (felia 3), fiecare card are cronologia lui, în `build/<id>/cronologie.json`: un singur segment, `ref` „Testimonial N” (poziția rândului, de la 1), `camp` `serie`, `tip` `testimonial`, `start` 0, `sfarsit` durata cardului (6-20 s), `complet` momentul în care avatarul, numele, rolul și îndemnul au intrat (citatul intră rând cu rând, la 4 cadre unul de altul), `zona_text` caseta tuturor textelor și a avatarului, `texte` eticheta, rândurile citatului, numele, rolul și îndemnul, în ordinea de citire. Fără tranziții și fără `ferestre_statice`; după `complet` cardul crește lent cu 2%, deci nu există cadre înghețate. `momente_foaie`: `complet` și ultimul cadru.

## Câmpurile

Toate câmpurile sunt obligatorii; un câmp în plus e o eroare, în afara câmpului opțional `sursa_video` al cronologiei și a celor trei câmpuri opționale ale segmentului (`detalii`, `selectori` și `banda`, descrise mai jos).

| Câmp | Tip | Regula |
| --- | --- | --- |
| `versiune` | integer | `1` |
| `sablon` | string | numele șablonului (`[a-z0-9-]+`) |
| `format` | string | `vertical`, `patrat` sau `orizontal` |
| `latime`, `inaltime` | integer | pixelii formatului: `vertical` 1080x1920, `patrat` 1080x1080, `orizontal` 1920x1080 |
| `fps` | integer | 1-120: 30 la reel-ilustrat și text-animat; la `overlay-filmare`, fps-ul copiei normalizate, 25 sau 30 |
| `durata` | number | secunde, > 0 |
| `fundal` | string | `#RRGGBB` (fundalul rezolvat) sau `"filmare"` |
| `segmente` | listă nevidă | segmentele, în ordinea din date (la `overlay-filmare`, sortate după `start`) |
| `ferestre_statice` | listă | intervalele în care imaginea are voie să stea pe loc (C14); poate fi goală |
| `momente_foaie` | listă nevidă | momentele foii de contact (C16) |
| `audio` | `null` sau obiect | `{ "fisier": "build/assets/muzica.m4a", "durata": 25 }` |
| `sursa_video` | obiect, opțional | obligatoriu cu `fundal: "filmare"`, interzis altfel (planul H): `{ "fisier": "build/filmare.mp4", "start": 0.4, "latime": 1080, "inaltime": 1920, "focus_x": 50 }`. `fisier` e o cale relativă la proiect, cu `/`, fără `..`; `start` e începutul filmării folosite, în secunde, cel puțin 0; `latime` și `inaltime` sunt pixelii copiei de lucru (întregi, pozitivi); `focus_x` e procentul 0-100 al decupării. Nucleul îl folosește la C12-C14 (modul comparat cu sursa, H07). |

`audio` e `null` fără muzică; cu muzică, exact `{ "fisier": "build/assets/muzica.m4a", "durata": <durata> }`, din `audioCronologie`.

Un segment: `ref` (numele segmentului, unic în cronologie: „Scena N”, numărat de la 1, la reel-ilustrat și text-animat; id-ul elementului, implicit `eN`, la overlay-filmare), `camp` (calea JSON a scenei în date, de la 0), `tip` (tipul scenei), `start`, `complet` (momentul în care tot textul segmentului e pe ecran), `sfarsit`, `zona_text` (`[x, y, w, h]` în pixelii formatului) și `texte` (lista textelor exact cum apar pe ecran; poate fi goală la un segment fără text).

Un segment mai poate avea două câmpuri opționale (M9). `detalii` e un obiect JSON liber al șablonului (nu listă, nu `null`; overlay-filmare: `{ ancora: { fraza, aparitia, t } }` sau `{ ancora: null }`), scris în `build/cronologie.json` și necitit de nucleu. `selectori` e o listă de selectori CSS nevizi, fără dubluri, câte unul pentru fiecare text din `texte`, în aceeași ordine, folosită pentru `index.motion.json`. Valorile greșite dau `cronologie-invalida` pe `cronologie.segmente[i].detalii` sau `cronologie.segmente[i].selectori`.

Un segment mai poate avea cheia opțională `banda`, un text nevid (de exemplu `sus`, `centru`, `nume`). C09 caută suprapunerea în timp a segmentelor cu text doar între segmente cu aceeași `banda`; segmentele fără `banda` se compară toate între ele, deci șabloanele care nu o scriu se comportă ca înainte. Regula „cel mult două blocuri de text deodată” nu e a nucleului: o aplică șablonul (overlay-filmare, S04).

Din segmentele cu `selectori`, nucleul scrie `build/index.motion.json` (`nucleu/lib/asertiuni-miscare.mjs`, numele vine din intrarea întoarsă de `construieste`): `appearsBy` pe primul selector la `min(start + 1, complet)` și pe ultimul la `complet`, fiecare cu un pas de eșantionare al lui HyperFrames în plus (`durata / (n − 1)`, `n = min(300, max(2, ⌈durata · 20⌉ + 1))`), plafonat la `durata`; `before` între primii selectori ai segmentelor consecutive; `staysInFrame` pe fiecare selector; `keepsMoving` pe toată compoziția, cel mult 2 s statice (nu se scrie când `fundal` e `"filmare"`: HyperFrames nu vede mișcarea videoului; înghețarea filmării o prind C14 (cadrul întreg, comparat cu sursa) și S10, la randarea completă); când `ferestre_statice` permit o porțiune statică mai lungă (ferestrele unite peste golurile de cel mult 2 s, lipite de început sau de sfârșit când golul de acolo are cel mult 2 s), pragul devine lungimea ei plus un pas de eșantionare, ca un șablon care își declară imaginea statică să nu pice C10 pentru asta. Fiecare selector trebuie să găsească exact un element (altfel `motion_selector_missing` sau `motion_selector_ambiguous`, adică C10). Fără niciun segment cu `selectori`, fișierul nu se scrie.

O fereastră statică: `start`, `sfarsit`, `motiv` (text scurt, de exemplu `pauza-finala`). Un moment: `t`, `ref`, `eticheta`.

## Reguli

1. Toți timpii sunt în secunde, rotunjiți la 3 zecimale cu `rotunjeste(x, 3)` (`Math.round(x * 1000) / 1000`). Un timp cu mai multe zecimale e o eroare: înseamnă că șablonul a uitat să rotunjească.
2. În fiecare segment: `0 ≤ start ≤ complet ≤ sfarsit ≤ durata`.
3. `texte` are textul de pe ecran: fără marcajul `*` al accentului, cu prefixul și majusculele etichetei deja aplicate.
4. `zona_text` are `x, y ≥ 0`, `w, h > 0` și stă în cadru (`x + w ≤ latime`, `y + h ≤ inaltime`).
5. La o fereastră statică: `0 ≤ start ≤ sfarsit ≤ durata`.
6. `momente_foaie` e sortată crescător după `t`, cu cel puțin 0,1 s între două momente vecine (dublurile se elimină la producere), și conține, la cel mult 0,1 s distanță, momentul `complet` al fiecărui segment și ultimul cadru, `rotunjeste(durata - 1 / fps)`. Șablonul poate adăuga momente proprii.
7. Ordinea segmentelor e ordinea din date; nucleul nu o reordonează.

## Câmpul `camp` al erorilor

Fiecare problemă dă o eroare `cronologie-invalida` cu `camp` egal cu `cronologie` urmat de calea JSON a valorii greșite:

| Problema | `camp` |
| --- | --- |
| cronologia nu e obiect | `cronologie` |
| câmp lipsă sau în plus | `cronologie.<câmp>`, de exemplu `cronologie.fps`, `cronologie.segmente[0].texte` |
| timp care nu e număr sau are peste 3 zecimale | câmpul timpului, de exemplu `cronologie.segmente[0].complet` |
| `start` negativ | `cronologie.segmente[i].start` |
| `complet < start` | `cronologie.segmente[i].complet` |
| `sfarsit < complet` sau `sfarsit > durata` | `cronologie.segmente[i].sfarsit` |
| un text gol sau cu `*` | `cronologie.segmente[i].texte[k]` |
| moment ieșit din ordine sau la sub 0,1 s de cel dinainte | `cronologie.momente_foaie[i].t` |
| lipsește momentul unui segment sau ultimul cadru | `cronologie.momente_foaie` |

Mesajul începe cu „Cronologia: ”. Sugestia spune că eroarea e a șablonului, nu a datelor.

## Tabelul tipărit

`tabelCronologie(cron)` întoarce textul pe care `mg randeaza` îl tipărește și pe care agentul îl copiază în `jurnal.md`: un rând de rezumat, apoi un tabel Markdown cu coloanele `Ref | Tip | Start | Complet | Sfârșit | Texte`. Timpii sunt scriși cu virgulă zecimală (`2,15`), textele unui segment sunt despărțite de ` / `, iar `|` din text devine `\|`.

```
Durata 25 s, 30 fps, vertical 1080x1920, fundal #F3EBDD.

| Ref | Tip | Start | Complet | Sfârșit | Texte |
| --- | --- | --- | --- | --- | --- |
| Scena 1 | desen | 0 | 2,15 | 4 | Luni, 8:30 / Telefonul sună / din nou. |
```
