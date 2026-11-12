# Interfața unui șablon: `sablon.mjs`

Document de interfață al pasului 0 (spec 6.8, harta 4.16 și 5.8-5.9). Fiecare șablon stă în `motoare/<motor>/sabloane/<nume>/` și se expune nucleului numai prin `sablon.mjs`. Modulele interne (de exemplu `plan.mjs` și `compileaza.mjs` la `reel-ilustrat`) sunt libere, dar nucleul nu le cunoaște. Implementările de referință sunt `teste/fixtures/sabloane/proba/` (minimă, fără hook-uri opționale) și `teste/fixtures/sabloane/proba-elemente/` (fără `scene`, cu `blocScenariu`, `verificariBuild`, `verificariProprii` și `stadii`); orice schimbare a nucleului trebuie să le treacă pe amândouă prin toate modurile (`teste/integrare/poarta-inghetare.test.mjs`), plus reelul.

## Fișierele unui șablon

| Fișier | Rol |
| --- | --- |
| `SABLON.md` | frontmatter YAML normativ (mai jos) și descrierea pentru agent; rubrica erorilor spune ce câmpuri schimbă golurile (C12), vizibilitatea textului (C13) și mișcarea (C14), fiindcă sugestiile acestor verificări numesc doar câmpuri care există în `date.json` și trimit altfel la această rubrică |
| `schema.json` | JSON Schema 2020-12 a lui `date.json`, cu `additionalProperties: false` pe fiecare obiect, mesaje în `x-mesaj` și fără `$id` (C02) |
| `implicite.json` | valorile implicite ale șablonului (zone, timpi, jetoane); cheile sunt ale șablonului |
| `sablon.mjs` | interfața de mai jos |
| `exemple/minim.json` | datele pe care `mg nou` le copiază în `video/<proiect>/date.json` |
| `propuneri.json` | opțional (felia 2): `{ versiune: 1, propuneri: [{ cerere, camp, variante[] }] }`, ce poate cere cursantul după predare, cu câmpul și variantele; `mg corectura --propuneri` le tipărește după două încercări ratate. Lipsa lui dă o listă goală |

## Frontmatter-ul `SABLON.md`

```yaml
---
nume: reel-ilustrat
motor: hyperframes
versiune_schema: 1
formate: [vertical]
fps: 30
teme: [noapte, hartie, curat]
durata: { min: 10, max: 60, implicita: 30 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12]
verificari_partiale: { C04: plafon-brut-si-latime-card }
---
```

`verificari` citează verificările comune (C01-C17) și pe cele proprii (S01, S02, ...) prin ID. `verificari_partiale` spune care verificări rulează doar parțial în versiunea curentă și cum.

`intrare: filmare` (opțional) cere la `mg nou` opțiunea `--filmare`. Nucleul (`nucleu/lib/filmare/`) copiază originalul în `resurse/filmare-original.<ext>`, face copia de lucru `active/filmare-lucru.mp4`, foaia `cadre/verificare-1fps.jpg` și transcrierea `active/transcriere.json` (plus `transcriere.brut.json` și `raport.json`), și scrie în `motor.lock` cheia `filmare` (forma în planul H). `date.json` minim primește `format` după orientarea copiei de lucru și `filmare.fisier`. Șablonul doar citește aceste fișiere; nu le scrie niciodată. Orice altă valoare a lui `intrare` dă `sablon-invalid`.

## Verificările declarate și stadiile

`verificari` e exact ce contează pentru șablon. Un cod C nedeclarat nu intră în `verificare.json` și nu schimbă `ok` (de exemplu C15 la un șablon fără sunet), chiar dacă nucleul îl calculează. `incarcaSablon` refuză cu `sablon-invalid` o listă cu coduri invalide sau dublate.

Minimul obligatoriu, pentru orice șablon: C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C16, C17. Un frontmatter fără unul dintre ele nu se încarcă, iar mesajul numește codurile lipsă.

Fiecare cod are un stadiu, momentul la care primește rezultatul:

| Stadiu | Coduri comune | Când |
| --- | --- | --- |
| `date` | C01-C07, C09 | după stratul de date, la orice mod |
| `build` | C10, C17 | pe `build/`, la orice mod |
| `aprobare` | C08 | la randarea completă, pe blocul aprobat |
| `mp4` | C11-C16 | pe MP4, doar la randarea completă |

Codurile comune au stadiul fix (`STADII_COMUNE` din `nucleu/lib/verificari/stadii.mjs`). Un cod S își declară stadiul în `stadii:`, cu una dintre valorile `date`, `build`, `mp4`; fără intrare, stadiul e `date`. Cheile lui `stadii:` sunt doar coduri S din `verificari`:

```yaml
stadii: { S05: build, S08: mp4 }
```

Verde automat primesc doar codurile S de stadiu `date`, după ce stratul de date a trecut fără erori (regulile din `valideaza` raportează un cod S doar când pică). Un cod S de `build` primește rezultatul din `verificariBuild`, unul de `mp4` din `verificariProprii`; un cod declarat fără rezultat face `ok` fals. Un avertisment din stratul de date atribuit (cu `verificare`) unui cod de `build` sau `mp4` nu-i creează acelui cod un rezultat: rămâne doar în `avertismente`, iar codul își așteaptă rezultatul din hook.

La `--doar-verificare` și `--schita`, `obligatorii` din `verificare.json` sunt doar codurile declarate de stadiu `date` și `build`; codurile de stadiu `mp4` (C11-C16 declarate și codurile S de `mp4`) apar în `obligatorii` și în `verificari` abia după randarea completă, când `obligatorii` e toată lista `verificari`. Forma fișierului e în `docs/interfete/verificare.md`.

## `SablonIncarcat`

`incarcaSablon(radacina, nume)` din `nucleu/lib/sabloane.mjs` întoarce:

```js
{ nume, motor, dir /* absolut */, meta /* frontmatter-ul */, schema, implicite, modul /* exporturile sablon.mjs */, sha256 }
```

Dacă lipsește oricare dintre `valideaza`, `cronologie`, `construieste`, `asteptari`, nucleul aruncă `EroareFatala` cu codul `sablon-invalid` (cod de ieșire 2).

## Contextul `ctx`

```js
{
  radacina,      // rădăcina agentului, absolută
  proiect,       // numele proiectului
  dirProiect,    // video/<proiect>, absolut
  sablon,        // SablonIncarcat
  mod,           // 'doar-verificare' | 'schita' | 'complet': modul cerut de cursant
  catalog,       // catalogul bibliotecilor sau null
  brand,         // fișa de brand din citesteBrand sau null; valideaza verifică cu ea textele care vin din brand (semnătura)
  intern,        // ce a întors cronologie() în `intern`, dat înapoi la asteptari() și construieste(); null înainte de cronologie
  stil,          // stilul rezolvat (StilRezolvat); null la valideaza
  ff,            // { ffmpeg, ffprobe }, căi absolute, sau null
  ingheataActiv, // (activ: { tip, id, continut, extensie }) → { cale, sha256 }: singurul mod de a îngheța un activ (active/ și motor.lock)
}
```

Ctx-ul se construiește într-un singur loc, `creeazaCtx` din `nucleu/lib/context.mjs`. Toate cheile există la fiecare apel; `catalog`, `brand` și `ff` pot fi `null` (la `mg nou --din`, `brand` și `catalog` sunt `null`); `ff` e pus la randarea completă și, la orice mod, când `date.json` are muzică (nucleul o validează și o transcodează), iar `intern` și `stil` sunt `null` înainte de cronologie. `mod` e modul cerut de cursant (`--doar-verificare`, `--schita` sau randarea completă); la `mg nou --din`, unde cursantul nu cere niciun mod, `valideaza` primește `doar-verificare`. `valideaza` se cheamă o singură dată pe rulare, cu acest ctx; C03 și C04 se scot din rezultatul ei.

## API-ul nucleului

Șabloanele din `motoare/` importă din nucleu un singur modul, `nucleu/lib/sdk.mjs` (`teste/unitar/sdk.test.mjs` verifică regula și lista exporturilor). Lista e înghețată: un export nou e o adăugare compatibilă, unul scos sau redenumit e o schimbare de interfață. Exporturile, pe rol:

- erori: `eroare`, `avertisment`, `EroareFatala`, `COD_IESIRE`
- fișiere: `citesteText`, `scrieTextAtomic`, `scrieJsonAtomic`, `existaFisier`, `legaFisier(sursa, destinatie)` (întoarce `'hardlink'` sau `'copie'`: șterge destinația, încearcă hardlink, iar la orice eroare copiază; filmarea intră astfel în `build/`, pentru că HyperFrames nu acceptă surse din afara folderului compoziției)
- teme: `valoriStil`, `semnaturaRezolvata`
- fonturi: `cssFontFace`, `copiazaFonturi`, `incarcaCatalogFonturi`, `esteFontBrand`, `cssFontFaceBrand`, `copiazaFontBrand`, `familieCss`, `metriciFont`
- iconițe: `svgIconita`
- desene: `incarcaCatalog`, `gasestePiesa`, `caleFisierPiesa`, `normalizeazaSvg`, `cssRoluri`
- text: `verificaTexteDate`, `grafeme`, `textAfisat`, `timpCitire`; rânduri: `masuratorRand(radacina, {font, greutate, marime, spatiereEm})`, `rupeRanduri(text, {latimeMax, masoara, maxRanduri})`, `CUVINTE_SCURTE`
- timp: `rotunjeste`
- muzică: `audioCronologie(date, durata)` (`cronologie.audio` sau `null`), `elementAudio(cronologie)` (elementul `<audio id="muzica">` pentru rădăcina compoziției, `''` fără muzică)
- culoare: `hexInRgb`, `limitaIntensitate`, `STRATURI_CEATA`, `straturiCeata(culori, ceata)` (culoarea și opacitatea fiecărui strat de ceață; `ceata` e `stil.ceata`, pusă doar de un brand cu ceață, felia 4), `stopuriDegrade(culori)` (stopurile atmosferei `degrade`, aceleași pe care le măsoară C06)
- HTML: `escapeazaHtml`, `deschidereSvg`
- verificări: `secundeCuZecimala`

`rupeRanduri` rupe lacom, ca browserul, și nu lasă la capăt de rând un cuvânt din `CUVINTE_SCURTE` când mutarea lui încape pe rândul următor. Rândul se rupe doar la spațiile obișnuite: spațiul nedespărțitor (U+00A0) și cel îngust (U+202F) țin cuvintele împreună. Accentul `*...*` nu se măsoară. Fiecare rând are `text`, `latime` (px, prin `rotunjeste(x, 3)`, ca și `latime` din `cuvant-prea-lung`) și `segmente`: un segment fără accent e `{text, accent: false}`, fără cheia `nr`; unul accentuat e `{text, accent: true, nr}`, unde `nr` e indicele accentului în textul sursă (0, 1, ..., în ordinea marcajelor `*...*`). Bucățile vecine se lipesc într-un segment doar când au același `accent` și același `nr`, deci două accente alăturate (`*fără* *tine*`) rămân două segmente, iar spațiul dintre ele e neaccentuat. Un accent rupt între rânduri se închide la capătul rândului și se redeschide pe rândul următor, cu același `nr` pe ambele segmente, așa că fiecare rând se poate afișa singur, iar șablonul poate reface textul fiecărui accent din sursă. Eșecul e un obiect (`cuvant-prea-lung` sau `prea-multe-randuri`), pe care șablonul îl transformă în `rand-nu-incape` (C04) pe câmpul lui.

Înghețarea activelor nu e un export, ci serviciul `ctx.ingheataActiv(activ)`. Fișierele de test ale șabloanelor (`motoare/**/teste/`) pot importa module interne ale nucleului.

## Funcțiile

```js
export function valideaza(date, ctx) /* → { erori: EroareMg[], avertismente: EroareMg[] } */;
export function cronologie(date, stil /* StilRezolvat */, ctx) /* → { cronologie, intern, erori: EroareMg[], avertismente: EroareMg[] } */;
export async function construieste(date, stil, cronologie, dirBuild /* absolut */, ctx) /* → Promise<{ intrare: string, fisiere: string[], active?: string[], motor?: object }> */;
export function asteptari(cronologie, ctx) /* → Asteptari */;
export function blocScenariu(date, stil, cronologie, ctx) /* opțional → { texte: LinieText[], stil: string[] } */;
export function verificariBuild(dirBuild /* absolut */, ctx) /* opțional → RezultatVerificare[] | Promise<RezultatVerificare[]> */;
export async function verificariProprii(mp4 /* absolut */, ctx) /* opțional → Promise<RezultatVerificare[]> */;
```

`RezultatVerificare` are exact cheile `cod, ok, valoare, prag, camp, erori, avertismente` (`ok` boolean, `erori` și `avertismente` liste), ca rezultatul lui `rezultat()` din `nucleu/lib/verificari/index.mjs`. Nucleul validează strict ce întorc cele două hook-uri (`verificaRezultateProprii` din `nucleu/lib/verificari/stadii.mjs`):

- `cod` e un cod S declarat în `verificari` cu stadiul hook-ului (`build`, respectiv `mp4`); codurile C le dă nucleul, deci un hook nu întoarce niciun cod C, nici C10, C17 sau C11-C16;
- `ok === (erori.length === 0)`: un rezultat cu erori e roșu, unul fără erori e verde; avertismentele nu schimbă `ok`;
- fiecare element din `erori` și `avertismente` are forma `EroareMg`: exact `cod, camp, mesaj, sugestie` și, opțional, `verificare`; `cod` e din `CODURI` (`nucleu/lib/erori.mjs`), `camp`, `mesaj` și `sugestie` sunt șiruri nevide, iar `verificare`, când există, e un cod C01-C17 sau S01-S99.

O listă care încalcă oricare dintre reguli se tratează ca un hook care aruncă. Un hook care aruncă nu lasă `verificare.json` vechi: fiecare cod S declarat cu stadiul lui pică, cu o eroare `eroare-interna` pe câmpul `build`, respectiv `mp4`. Dacă șablonul nu declară niciun cod S cu stadiul hook-ului (de exemplu un `S05` întors de `verificariBuild`, dar rămas fără `stadii: { S05: build }`, deci de `date`), eroarea pică verificarea comună a stadiului: C10 la `build`, C11 la `mp4`.

Ordinea în care le apelează nucleul, la orice `mg randeaza` (`pregatesteBuild` din `nucleu/lib/randeaza/pregatire.mjs`, apoi pasul comun din `nucleu/lib/randeaza/index.mjs`):

1. Citirea (C01), schema (C02) și fișa de brand, dacă `date.json` cere una. Dacă au erori, `valideaza` nu se mai apelează.
2. `valideaza(date, ctx)`: regulile de dincolo de `schema.json` (de exemplu legături între scene). Codurile proprii au prefixul numelui șablonului (`reel-ilustrat-persistenta`); codurile comune se folosesc cu sensul lor din `docs/interfete/erori.md`. În același strat, nucleul verifică desenele cerute de date (`verificaDesene`, erorile `desen-*`, S10). Tot aici nucleul validează muzica (`muzica.fisier` în `resurse/`, `.mp3 .wav .m4a .aac`, cel mult 50 MB, citită cu ffprobe, `muzica.incepe_de_la` cu cel puțin 5 s de piesă după el), cu `resursa-lipsa` sau `valoare-invalida` pe `muzica.*`, atribuite lui C07; dacă `valideaza` a respins deja câmpul `muzica`, nucleul nu mai adaugă nimic pe el.
3. Rezolvarea stilului în nucleu (`rezolvaStil`), apoi `cronologie(date, stil, ctx)`. `cronologie` respectă `docs/interfete/cronologie.md`; nucleul o validează cu `valideazaCronologie`. `intern` e ce are nevoie șablonul mai departe (la reel, planul); nucleul îl pune în `ctx.intern` la pașii următori. Când datele au muzică, `cronologie.audio` trebuie să fie `{ fisier: "build/assets/muzica.m4a", durata: <durata videoului> }` (helperul `audioCronologie` din sdk), iar fără muzică `null`; altfel `cronologie-invalida`. O piesă mai scurtă decât videoul dă un avertisment `valoare-invalida` pe `muzica.fisier`.
4. `asteptari(cronologie, ctx)`: ce trebuie să apară în MP4, pentru C11-C17 (forma de mai jos). `ctx` are și `intern`, ca șablonul să adauge textele care nu stau într-un segment, și `stil` (stilul rezolvat), ca șablonul să calculeze caseta reală a fiecărui text.
   Opțional, `blocScenariu(date, stil, cronologie, ctx)`, chemat imediat după `asteptari`, cu același `ctx` (deci și cu `intern` și `stil`): blocul „Ce apare pe ecran” din `scenariu.md` (forma și varianta implicită mai jos). Nucleul îl scrie în `scenariu.md` doar dacă pregătirea n-a avut erori.
   `asteptari` și `blocScenariu` rulează **înainte** de `construieste`, înainte ca `build/` să fie golit și rescris: nu citesc nimic din `dirBuild` și nu se bazează pe ce face `construieste` (nici pe o stare pusă de el în `intern`).
5. `construieste(date, stil, cronologie, dirBuild, ctx)`, pe un `build/` gol: scrie în `dirBuild` tot ce are nevoie compoziția (`index.html`, GSAP copiat din `motoare/hyperframes/comun/vendor/`, fonturi, desene inline). `fisiere` are căile relative la `dirBuild`, cu `/`. `active` (opțional) are activele înghețate pe care le folosește planul curent, cu căile din `motor.lock` (`active/desen/<id>.svg`); C07 verifică doar intrările lor, iar celelalte rămân în `motor.lock` și pe disc, ca istoric. Fără `active`, C07 verifică tot `motor.lock`. După el, nucleul scrie `build/cronologie.json`. Dacă datele au muzică, nucleul pune apoi `build/assets/muzica.m4a`: piesa tăiată de la `muzica.incepe_de_la`, cu `muzica.volum` (implicit 0,4), fade-in de 0,5 s, fade-out de 1,5 s, completată cu liniște până la durata exactă, AAC 192k. Transcodarea are cache în `active/muzica/` (scris doar de `mg`, nu intră în `motor.lock`). Șablonul pune `elementAudio(cronologie)` în rădăcina compoziției. Apoi, cu sau fără muzică, dacă vreun segment are `selectori`, nucleul scrie `build/index.motion.json` din ei (`docs/interfete/cronologie.md`); `hyperframes check` îl citește, iar găsirile lui de nivel `error` pică C10, cu selectorul și mesajul lui HyperFrames în mesajul erorii.
6. Verificările pe date (C01-C07, C09 și codurile S de stadiu `date`, pe `motor.lock` recitit și pe textele blocului), apoi `hyperframes check` (C10) și textele din build (C17).
   Opțional, `verificariBuild(dirBuild, ctx)`: verificările proprii de stadiu `build`, chemate la orice mod după C10 și C17, doar dacă pregătirea n-a avut erori; dacă hook-ul aruncă, fiecare cod S de `build` declarat pică, cu o eroare `eroare-interna`.
7. Opțional, la randarea completă, `verificariProprii(mp4, ctx)`: verificările proprii de stadiu `mp4`, chemate după verificările comune pe MP4 (C11-C15) și înainte de cadrele de predare și foaie (C16), doar dacă C11 a trecut; `ctx.ff` e pus. Dacă hook-ul aruncă, fiecare cod S de `mp4` declarat pică, cu o eroare `eroare-interna`.

## `Asteptari`

Fiecare text din `texte` are, opțional, `camp`: calea câmpului din `date.json` (`scene[1].titlu[0]`, `semnatura`). Varianta implicită a blocului o folosește ca `LinieText.camp`; fără ea, ia câmpul segmentului cu același `ref`, sau `$`.

```json
{
  "texte": [ { "ref": "Scena 1", "text": "Telefonul sună", "t": 2.15, "zona_text": [96, 200, 888, 280], "caseta": [96, 261.88, 640.5, 103.68] } ],
  "momente": [2.15, 6.4],
  "audio": { "prezent": false, "durata": null },
  "fundal": "#F3EBDD"
}
```

`texte` are câte o intrare pe fiecare text din fiecare segment, fără marcajul `*`, cu `t` egal cu momentul `complet` al segmentului, plus textele afișate în afara segmentelor (la reel, semnătura, cu `ref` „Semnătura”, `t` la sfârșitul scrierii ei și zona blocului `#sig`); `momente` are momentele `complet` ale segmentelor; `audio.prezent` e `true` doar când cronologia are `audio`.

`caseta` (opțional, `[x, y, w, h]` în pixelii formatului) e caseta reală a textului pe ecran, din aceeași sursă cu stilul compoziției (la reel, CSS-ul din `sablon.html` și metricile fontului rezolvat). Când există, C13 măsoară fiecare text în caseta lui, la `t`, pe cadrul la rezoluția MP4-ului, între 1% și 50% din pixeli; fără ea, C13 măsoară fiecare segment cu texte în `zona_text`, la `complet`, pe cadrul de 270 px lățime, între 1% și 35%. Un text care nu e pe ecran la `complet` are `t` propriu: la reel, cuvintele, care se înlocuiesc în același loc, au `t` la sfârșitul intrării fiecăruia.

`transcriere` (opțional, `[{ start, end, text }]`) sunt cuvintele rostite în videoul final (inclusiv cele care nu apar în subtitrări), cu timpii pe cronologia lui (0 = începutul MP4-ului, adică `filmare.start`). Când există, nucleul scrie în fiecare celulă din `cadre/foaie-N.json` cheia `rostit` (șir): cuvintele cu `start` în [t − 1, t + 1], unite cu spațiu, sau `""` când nu e niciunul. Fără `transcriere`, celulele nu au cheia `rostit`. Instantaneele schiței nu au `rostit`.

## Blocul „Ce apare pe ecran” (`blocScenariu`)

Blocul dintre `<!-- mg:start -->` și `<!-- mg:end -->` din `scenariu.md` îl scrie nucleul la fiecare `mg randeaza`, din `{ texte, stil }`: `texte` sunt liniile zonei „Texte și cifre”, `stil` rândurile zonei „Stil și timpi” (șiruri nevide, fără `- ` în față; nucleul pune `- `).

```js
// LinieText
{ ref: 'Scena 3', camp: 'scene[2].titlu[1]', eticheta: 'titlu, rândul 2', text: 'preia rutina.', accent: true, separat: false,
  font: 'titlu' /* opțional: 'titlu' sau 'text' */, greutate: 700 /* opțional: întreg între 100 și 900 */ }
```

`font` și `greutate` spun cu ce se desenează textul pe ecran: C05 (acoperirea glifelor) verifică exact textele blocului, grupate pe (`font`, `greutate`), în ordinea primei apariții; fără ele, `titlu` și `700`. Rândurile din `text` (`\n`) se verifică ca spații. Cele două chei nu se tipăresc în bloc, deci nu intră în hash-ul aprobării.

Cheile sunt exact acestea; nucleul refuză (cu `TypeError`, o greșeală a autorului șablonului) o cheie necunoscută, un `ref`, `camp` sau `text` gol, o `eticheta` care nu e șir nevid sau `null`, un `accent` sau `separat` care nu e boolean. Formatarea, fără niciun caz special pe `ref`:

- `eticheta` șir: `- <ref>, <eticheta>: <valoare>`, cu ` (accent)` după etichetă când `accent` e `true`;
- `eticheta: null`: `- <ref>: <valoare>`, fără ` (accent)`;
- rândurile din `text` sunt despărțite prin `\n`. Cu `separat: true`, fiecare rând are ghilimelele lui (`„Mesaje.” / „Cereri.”`, cuvinte care apar pe ecran pe rând); cu `separat: false`, rândurile stau între aceleași ghilimele, despărțite prin ` / ` (`„Ana Pop, / coach de carieră”`).

Fără `blocScenariu`, nucleul derivă blocul singur: câte o linie pe fiecare text din `asteptari().texte`, `{ ref, camp: t.camp ?? camp-ul segmentului cu același ref ?? '$', eticheta: null, text, accent: false, separat: false }`, iar la „Stil și timpi” `Tema: <tema>` (dacă stilul are temă), apoi câte un rând pe segment, `<ref> (<tip>): <start>-<sfarsit> s, complet la <complet> s`, cu secundele cu virgulă și cel puțin o zecimală.

Zona „Texte și cifre” intră în hash-ul aprobării (C08): o schimbare a textelor sau a etichetelor pe care le pune un șablon (inclusiv trecerea de la varianta implicită la `blocScenariu`) schimbă hash-ul și cere o aprobare nouă de la cursant, pe proiectele deja aprobate. Zona „Stil și timpi” e informativă și nu intră în hash.

## Contractul cu motorul

Rezultatul lui `construieste` are exact una dintre aceste forme, după `meta.motor` din `SABLON.md`; nucleul o validează strict în `valideazaConstruit(rezultat, numeSablon, numeMotor)` (`nucleu/lib/randeaza/construit.mjs`) și refuză, cu `TypeError` (o greșeală a autorului șablonului), orice cheie în plus, la orice nivel.

```js
// motor: hyperframes
{
  intrare: 'index.html',            // calea compoziției, relativă la dirBuild
  fisiere: ['index.html', '…'],     // tot ce a scris construieste, relativ la dirBuild
  active: ['active/desen/a.svg'],   // opțional
  motor: {                          // opțional
    check: { argumente: ['--at', '1.5'] },
    randare: { argumente: ['--no-best-effort'] },
  },
}

// motor: remotion
{
  intrare: 'props.json',
  fisiere: ['props.json', 'fonturi/…', '…'],
  active: [],                       // opțional
  motor: { props: 'props.json', compozitie: 'Grafic' },   // obligatoriu, fără check și randare
}
```

`intrare` și fiecare cale din `fisiere`, `active` și `motor.props` sunt relative, cu `/`, fără `..` și fără `/` la început. `motor.check` și `motor.randare` sunt `{ argumente: string[] }`, iar `motor.compozitie` e un șir nevid.

Nucleul alege adaptorul după `meta.motor`, cu `adaptorMotor(nume)` din `nucleu/lib/motoare/index.mjs`. Fiecare adaptor face patru operații: verificarea build-ului (C10 și C17, la orice mod), schița, randarea completă cu o singură reluare și curățenia de după randare.

- **HyperFrames** adaugă `motor.check.argumente` și `motor.randare.argumente` după argumentele lui, la `check <build> --json [--at …] [--at-transitions]`, respectiv la `render <build> -o … --quality looks --fps <cronologie.fps> --strict --quiet`. Un argument pe care îl pune nucleul (`ARGUMENTE_FIXATE` din `nucleu/lib/randeaza/construit.mjs`: `--json` la check; `-o`, `--output`, `--fps`, `--quality`, `--json`, `--quiet`, `--workers`, `--low-memory-mode`, `--strict` la render) e refuzat cu `TypeError`, scris singur sau cu `=`. Cu argumente de check, C10 cere cod de ieșire 0. Un `--frames-cache-dir` trebuie să fie `video/<proiect>/.cache`, pe care adaptorul îl șterge după randarea completă, pe orice drum. Schița: instantanee și check la tranziții. Reluarea: `--low-memory-mode`.
- **Remotion** (`motoare/remotion`, instalat la cerere cu `mg nou ... --instaleaza-motorul`): `build/` e și folderul public (`--public-dir=<build absolut>`), deci React ia fonturile, sigla și muzica cu `staticFile()`. Bundle-ul (`remotion bundle src/index.ts`) stă în `video/<proiect>/.cache/bundle-<16 hex>/`, cu marcajul `.gata` scris doar după succes; cheia e sha256 peste `sablon.sha256`, `VERSIUNI.motoare.remotion.lockfile_sha256` și fișierele din `build/` fără `props.json`, `cronologie.json` și `randare.mp4` (după nume, la orice adâncime, deci și în `build/<id>/` la o serie); un bundle nou le șterge pe celelalte, iar randarea completă nu șterge `.cache`. C10: versiunea instalată egală cu cea din `VERSIUNI.json`, bundle reușit, `remotion compositions` găsește `motor.compozitie` cu formatul, fps-ul și cadrele cronologiei, zero adrese `http(s)` în fișierele text din `build/`. C17: fiecare text așteptat apare ca valoare șir în `motor.props`. Schița: `render ... --scale=0.5` în `cadre/schita-N/schita.mp4` (540x960), din care se face foaia; nu există check la tranziții. La ieșiri multiple, un singur bundle pentru toată seria și câte o randare pe ieșire, cu props-urile din `build/<id>/props.json` (`schitaMp4` dă schița unei ieșiri în `cadre/schita-N/<NN>-<id>.mp4`). Randarea: `render <bundle> <compozitie> <iesire> --props=<cale absolută> --codec=h264 --pixel-format=yuv420p --color-space=bt709 --concurrency=50% --log=error` (fără `--color-space=bt709` ieșirea e `yuvj420p`), cu muzica tăiată la durata cronologiei; reluarea: `--concurrency=1`. Datele intră doar prin `--props`, iar Remotion nu primește `licenseKey`.

C10 și C17 rămân verificări de stadiu `build` la orice motor.

`sha256Sablon` (`nucleu/lib/sabloane.mjs`), hash-ul care ajunge în `motor.lock.sablon.sha256` la `mg nou`, acoperă tot folderul șablonului: hash-ul sha256 al fiecărui fișier, recursiv, cu calea relativă cu `/` drept cheie, fără folderele `teste/` și `exemple/` de pe primul nivel și fără fișierele sau folderele al căror nume începe cu punct. Un fișier nou (de exemplu `lib/ajutor.mjs`) schimbă deci hash-ul. Deocamdată nimic nu compară hash-ul acesta cu cel din `motor.lock`.

## Ieșirile multiple (felia 3)

Un proiect poate avea mai multe ieșiri dintr-o singură rulare: la `date-serie`, compoziția `serie` face câte un film pe rândul unui tabel. Șablonul exportă, opțional:

```js
export function iesiri(date, ctx) /* opțional → Array<{ id: string, date: object, schita?: boolean }> | null */;
export function surse(date, ctx)  /* opțional → string[]: fișierele din care s-au făcut ieșirile, relative la proiect */;
```

`iesiri` întoarce `null` pentru un proiect cu un singur MP4 (drumul obișnuit). O listă are cel puțin o ieșire, `id`-uri din litere mici, cifre și cratimă, unice, și `date` obiect; altfel e `TypeError` (greșeală de autor). `schita: true` marchează ieșirile pe care se face `--schita` (la `date-serie`: primul, ultimul și cel mai lung rând); fără nicio ieșire marcată, schița le ia pe toate. Cu ieșiri multiple, `blocScenariu` e obligatoriu și se cheamă o singură dată, pe datele întregi, cu `cronologie` null: blocul arată toate ieșirile.

Pentru fiecare ieșire, după `valideaza` și stil, nucleul rulează `cronologie`, `asteptari` și `construieste` cu `date`-le ei și cu `ctx.iesire = { id, index }`, în `build/<id>/`; `build/<id>/cronologie.json` e scris de nucleu. Verificările pe date rulează pe fiecare ieșire și se combină pe cod (un cod trece doar dacă trece pe toate, cu valoarea pe ieșiri). C10 și C17 rulează pe fiecare `build/<id>/`, cu un singur bundle. `surse` dă fișierele de intrare (tabelul, pozele); nucleul le pune cu hash-ul lor în `verificare.json` (`surse`) și în amprenta schiței.

Randarea completă cere S09 (schița seriei, trecută de revizor) și randează ieșirile pe rând, în `video/<proiect>/serie/<NN>-<id>.tmp.mp4`, redenumit în `<NN>-<id>.mp4` doar după C11 (`NN` e poziția în listă, cu două cifre). O ieșire cu același `sha256_build` (hash-ul fișierelor din `build/<id>/` fără poziția cardului în serie, al șablonului, al versiunii motorului, al kitului și al codului din `nucleu/lib/`) și cu MP4-ul neatins se sare, cu verificările păstrate în manifest; MP4-urile și cadrele ieșirilor scoase din listă se șterg. Cadrele de predare stau în `cadre/<id>/`, foaia rundei (C16) are toate filmele. Manifestul se scrie după fiecare rând (rândurile încă neajunse își păstrează intrarea veche), ca o serie întreruptă să se reia de unde a rămas; după foaie se scrie încă o dată, cu `ok`-ul final. Verificările din manifest nu au C16, care ține de foaia rundei. Id-urile `schita`, `foaie`, `revizie` și cele care încep cu ele urmate de cratimă sunt rezervate (numele din `cadre/`); `valideazaIesiri` le refuză. `video/<proiect>/serie/manifest.json`:

```json
{ "versiune": 1, "proiect": "p", "sablon": "date-serie", "scris_la": "…", "rezumat": { "randate": 1, "sarite": 4, "esuate": 0 },
  "iesiri": [ { "id": "ana", "nn": "01", "mp4": "serie/01-ana.mp4", "sha256_build": "…", "sha256_mp4": "…", "durata": 10.5, "ok": true, "verificari": [] } ] }
```

Rezultatul verificărilor e `verificare.json` versiunea 2 (`docs/interfete/verificare.md`). `mg randeaza` primește opțional `progres(linie)`, la care scrie câte o linie pe ieșire și, după primul film, estimarea; la `--json` nu scrie nimic în afara JSON-ului.

## Reguli pentru autorii de șabloane

- Deterministe: aceleași date dau același `index.html`, byte cu byte. Fără `Date.now()`, `Math.random()` sau ordinea cheilor lăsată la voia întâmplării.
- Fără rețea: niciun `http` sau `https` în build (C10). Tot ce încarcă compoziția stă în `dirBuild`.
- Textele intră în HTML numai ca noduri de text, cu `&`, `<`, `>` și `"` neutralizate.
- O compoziție HyperFrames fără animație GSAP pune `data-no-timeline` pe elementul rădăcină; fără el, `hyperframes check` 0.8.96 dă eroarea `missing_timeline_registry`.
- Funcțiile nu scriu în afara lui `dirBuild` și nu modifică `date`. Excepția: activele se îngheață doar prin `ctx.ingheataActiv` (scrie în `active/` și în `motor.lock`, nu direct).
- Timpii trec prin `rotunjeste(x, 3)` din `nucleu/lib/cronologie.mjs`. Regula se aplică șabloanelor din `motoare/` (prin `sdk.mjs`); șablonul de probă din `teste/fixtures/` e excepția documentată: are propria copie a lui `rotunjeste`, pentru că testele îl copiază într-o rădăcină temporară fără `nucleu/`.
