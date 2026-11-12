---
nume: text-animat
motor: hyperframes
versiune_schema: 1
formate: [vertical, patrat]
fps: 30
teme: [noapte, hartie, curat, contrast]
durata: { min: 5, max: 60, implicita: 15 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, S01, S02, S03, S04, S05, S06, S07, S09]
stadii: { S05: build, S06: build, S07: build, S09: build }
---

# Șablonul text-animat

Video de text animat, vertical 1080x1920 sau pătrat 1080x1080, de 5-60 s, la 30 de cadre pe secundă: 1-12 scene scurte de text pe fundal plin, în degradeu sau cu ceață, opțional cu muzica cursantului pe fundal. Agentul scrie doar `date.json`; forma lui e în `schema.json`, valorile fixe în `implicite.json`, iar regulile de dincolo de schemă în `reguli.mjs` (`valideaza`).

## 1. Ce face

Transformă scenele din `date.json` (titlu, frază construită cuvânt cu cuvânt, cuvinte care se schimbă pe loc, listă, cifră care numără, citat cu autor, cadru final) într-un MP4. `mg` măsoară fiecare rând cu fontul real, alege mărimea, rupe automat fraza și citatul, calculează durata fiecărei scene, scrie planul (`build/plan.json`), cronologia (`build/cronologie.json`) și compoziția HyperFrames, apoi verifică și randează. Șablonul nu folosește desene, iconițe, fotografii, filmare, transcriere sau generare de imagini; bifele și numerele listei sunt desenate din cod. Agentul nu scrie cod.

## 2. Când se alege

Când sunt adevărate toate condițiile:

1. Conținutul e doar text: mesaje, întrebări, liste, citate, cifre separate, cu unități sau subiecte diferite. Cuvinte-semnal: „text animat”, „kinetic typography”, „doar text”, „citat”, „listă”, „statistică”, „anunț”, „mesaj pe muzică”.
2. Nu cere personaje, oameni, desene, ilustrații, iconițe sau fotografii.
3. Nu are filmare proprie peste care să pună textul.
4. Nu cere grafic sau evoluție în timp (3 sau mai multe valori de aceeași unitate, pe aceeași axă).
5. Formatul e vertical (Reels, TikTok, Shorts) sau pătrat (feed LinkedIn sau Instagram).
6. Durata e de cel mult 60 s, iar mesajul încape în cel mult 12 scene (în practică 3-8 idei).

E și alegerea de rezervă când cererea e vagă („fă-mi un reel cu mesajul ăsta”) și nu există imagini.

| Situația | Drumul potrivit |
| --- | --- |
| Cere personaje, desene, iconițe | `reel-ilustrat` |
| Are filmare proprie | `overlay-filmare`: anunțul într-o frază și `mg nou <proiect> --sablon overlay-filmare --filmare <cale>` |
| Grafic, sau cel puțin 3 valori de aceeași unitate, pe aceeași axă | `date-serie`: graficul din cifre, vertical, 6-60 s |
| Orizontal 16:9 | o frază despre limită și propunerea formatului pătrat |
| Scene sincronizate pe bătăile muzicii | o frază: muzica stă doar pe fundal |
| Glitch, emoji, iconițe, alt fundal pe o scenă, două culori de accent | o frază despre limită, tipul sau tema cea mai apropiată; `cerere-sablon.md` dacă cursantul insistă |

## 3. Câmpurile din date.json

La nivelul videoului: `sablon` (`"text-animat"`), `versiune_schema` (`1`), `format` (`vertical` implicit sau `patrat`), `brand` (numele unei fișe din `branduri/`), `sigla` (un `.svg` sau `.png` din `resurse/`, cel mult 2 MB; interzis cu brand, unde sigla vine din fișă), `stil`, `muzica` (`{ fisier, volum, incepe_de_la }`, fișierul în `resurse/`) și `scene` (1-12). Nu există durată la nivelul videoului: rezultă din scene.

Fiecare scenă are `tip` și, opțional, `durata` (1,5-8 s; `final` 2,5-10 s) și `marime` (`M` implicit, `L`, `XL`; rubrica 5). `eticheta` (cel mult 28 de caractere, fără `*`) există la toate tipurile, în afară de `citat` și `final`.

| `tip` | Câmpuri | Limite |
| --- | --- | --- |
| `titlu` | `titlu` | 1-3 rânduri, cel mult 28 de caractere pe rând |
| `fraza` | `text` | 2-10 cuvinte, cel mult 70 de caractere; `mg` o rupe în cel mult 3 rânduri |
| `cuvinte` | `titlu` (opțional, un rând), `cuvinte` | 2-4 cuvinte, cel mult 24 de caractere fiecare (cu 5 nu mai încape în 8 s) |
| `lista` | `titlu` (opțional, un rând), `puncte`, `marcaj` (`bife` implicit sau `numere`) | 2-5 puncte, cel mult 40 de caractere fiecare |
| `cifra` | `valoare`, `zecimale` (0-2), `prefix` (cel mult 4), `sufix` (cel mult 6), `text`, `sursa` | `valoare` 0-999.999.999 (cu cel mult `zecimale` zecimale); `text` cel mult 40 de caractere, 2 rânduri; `sursa` cel mult 60 (încap ~50, vezi limitele de mai jos) |
| `citat` | `text`, `autor`, `rol` | `text` 20-160 de caractere, fără ghilimele la capete, cel mult 6 rânduri; `autor` cel mult 32; `rol` cel mult 40; împreună cel mult 23 de cuvinte |
| `final` | `titlu`, `cta`, `detaliu` | `titlu` 1-2 rânduri; `cta` cel mult 32; `detaliu` cel mult 40; sigla apare singură |

Accentul `*...*` (culoarea de accent): perechi închise, cel mult 2 bucăți pe scenă, doar în `titlu`, `text` și `cuvinte`.

## 4. Dicționarul de stil

`stil` are: `descriere` (cuvintele cursantului, cel mult 300 de caractere), `tema` (`noapte` implicit, `hartie`, `curat`, `contrast`), `culori` (`fundal`, `text`, `accent`, în hex), `font_titlu` (`instrument-sans`, `inter`, `montserrat`, `playfair-display`), `ritm` (`calm`, `normal`, `alert`), `atmosfera` (`plin`, `degrade`, `ceata`) și `aliniere` (`centru`, `stanga`). Granulația, fontul textului mic, culoarea atenuată și stilul etichetelor vin din temă. Ordinea: implicite < temă < brand < date; valoarea finală și sursa ei ajung în `build/stil-rezolvat.json`.

| Ce spune cursantul | Câmpuri |
| --- | --- |
| „minimalist, elegant, premium” | `hartie` sau `noapte`, `font_titlu: "playfair-display"`, `ritm: "calm"`, `atmosfera: "plin"` |
| „energic, TikTok, puternic” | `contrast`, `ritm: "alert"` |
| „tech, curat” | `noapte`, `font_titlu: "inter"`, `atmosfera: "degrade"` |
| „cald, prietenos” | `hartie`, accent portocaliu sau auriu |
| o culoare numită („auriu”, „verde închis”) | hex în `stil.culori`; `mg` verifică contrastul (C06) și, la eșec, spune câmpul și raportul |

Agentul notează traducerea în `jurnal.md`.

## 5. Tipurile de scenă și ce se vede

- `titlu`: fiecare rând intră printr-o mască, de jos în sus, cu decalaj.
- `fraza`: fraza se construiește cuvânt cu cuvânt.
- `cuvinte`: titlul stă, iar cuvântul de dedesubt se schimbă pe loc; fiecare cuvânt stă complet pe ecran cel puțin 0,8 s.
- `lista`: punctele apar pe rând, cu bifă desenată sau cu număr în culoarea accentului, și rămân până la ieșirea scenei.
- `cifra`: valoarea numără de la 0, cu cifre tabulare și formatare românească (1.250.000; 3,5); textul și sursa apar după ea.
- `citat`: șablonul pune singur „ și ”; autorul se tastează după citat, rolul apare sub el.
- `final`: titlul, îndemnul, detaliul tastat și sigla (din brand sau din `sigla`).

Mărimile (la `marime` `M`): textul mare 104 px (cel puțin 90), cifra 220 px (cel puțin 160), textul mediu (puncte, citat, textul cifrei, îndemnul) 60 px (cel puțin 48), textul mic (etichetă, autor, rol, sursă, detaliu) 36 px. Sub minim nu se micșorează pe ascuns: e eroare.

`marime` mărește elementul principal al scenei: textul mare (titlu, frază, cuvinte), cifra, punctele listei și textul citatului; textul mic și îndemnul rămân la fel. În pixeli nu se dă nimic, doar trepte: `L` e de 1,15-1,3 ori baza rolului, `XL` de 1,3-1,6 ori (cifra, până la 2 ori). `mg` alege cea mai mare mărime din treaptă care încape; dacă nici minimul treptei nu încape pe lățime sau pe înălțime, e `rand-nu-incape`, cu sugestia unei trepte mai mici. O listă de 5 puncte lungi nu încape la `XL`. Când cererea cere de la început un element „mare”, agentul pune `L`; `XL` rămâne pentru corectura „și mai mare”.

## 6. Cum calculează mg timpii

`plan.mjs` calculează totul; agentul dă cel mult `scene[i].durata` și `stil.ritm`. Orice `mg randeaza` tipărește cronologia ca tabel; agentul o copiază în `jurnal.md`.

1. Durata implicită a scenei, la ritmul normal: `titlu` 1,4 + 0,3 × cuvinte [2,2-5 s]; `fraza` 1,2 + 0,45 × cuvinte [2,5-6 s]; `cuvinte` 1,0 + 0,9 × cuvinte variabile [2,8-6,5 s]; `lista` 1,2 + 0,9 × puncte, + 0,5 cu titlu [3-7 s]; `cifra` 3,2, + 0,6 cu sursă; `citat` 1,6 + 0,3 × cuvinte [3,5-8 s]; `final` 3,5 s.
2. Ritmul înmulțește formula (`calm` ×1,2, `alert` ×0,85) înaintea limitelor tipului.
3. Minimul: tot textul intrat, plus 0,8 s de citire, plus ieșirea de 0,45 s (fără ieșire la ultima scenă), și cel puțin 0,8 s + cuvinte / 3,3. Durata se rotunjește în sus la 0,1 s și rămâne în 1,5-8 s (`final` 2,5-10 s).
4. Scenele nu se suprapun: fiecare iese complet (0,45 s), apoi intră următoarea. Totalul e suma și trebuie să fie 5-60 s.
5. Fiecare scenă derivă lent în sus (12 px pe fereastra ei), iar toată compoziția se apropie lent (scara 1 → 1,03 pe tot filmul), așa că imaginea nu stă niciodată pe loc.

Când o regulă nu se poate respecta, `mg` nu mută nimic singur: dă o eroare cu schimbarea de date care o repară.

## 7. Verificările și erorile

Se aplică toate verificările comune, C01-C17, cu precizările:

- C04 măsoară fiecare rând cu fontkit, la mărimea rolului, în zona sigură a formatului, cu marja de 4%; fraza, citatul și textul cifrei se rup automat.
- C06 verifică și culoarea atenuată; în degradeu și cu ceață, față de punctul cel mai deschis al fundalului.
- C07 acoperă muzica și sigla.
- C13 măsoară fiecare bucată de text în caseta ei reală, la momentul ei (cuvintele din `cuvinte`, fiecare la sfârșitul intrării lui).
- C14: deriva scenelor și împingerea compoziției țin imaginea în mișcare; șablonul nu declară ferestre statice.

| ID | Prag | Cod | Câmpul care repară |
| --- | --- | --- | --- |
| S01 | `final` cel mult una, pe ultima poziție | `text-animat-final-nu-e-ultimul` | `scene` |
| S02 | scena 1,5-8 s (`final` 2,5-10 s) și cel puțin minimul ei; totalul 5-60 s | `prea-repede-de-citit`, `durata-in-afara-limitelor` | `scene[i].durata`, `stil.ritm`, textul scenei |
| S03 | `fraza` în cel mult 3 rânduri, `citat` în 6, textul cifrei în 2; tot blocul scenei încape pe înălțimea zonei sigure | `rand-nu-incape` | textul scenei, împărțirea în scene |
| S04 | citatul nu începe și nu se termină cu ghilimele | `text-animat-ghilimele-in-citat` | `scene[i].text` |
| S05 | valoarea cifrei scrisă static în build, în format românesc | `text-animat-cifra` | `valoare`, `zecimale`, `prefix`, `sufix` |
| S06 | bucățile `.accent` din build conțin exact textele marcate cu `*` | `text-animat-accent` | textul scenei |
| S07 | sigla din build are fișierul și raportul de aspect ale sursei | `text-animat-sigla` | `sigla` sau brandul |
| S09 | textul fiecărei bucăți din build e textul din `date.json` | `text-animat-text-in-build` | nimic în date: e o eroare de șablon |

S05, S06, S07 și S09 rulează pe `build/` la orice `mg randeaza`, după `hyperframes check`; S04 verifică datele, iar ghilimelele citatului din build le prinde S09.

Fiecare eroare are `{cod, camp, mesaj, sugestie}`; sugestia e mereu o schimbare în `date.json` (sau în fișa brandului). Codurile exacte sunt în `docs/interfete/erori.md`.

### Limitele care se lovesc în practică

Valorile de mai jos sunt măsurate cu codul lui `mg` (așezarea cu fontkit la mărimea minimă a rolului și formulele de timp), pe cele 4 fonturi de titlu și pe ambele formate, nu estimate. Agentul le aplică înainte să scrie `date.json`, ca prima rulare să nu pice; cele care depășesc sunt respinse oricum de `mg`, cu eroarea din ultima coloană.

| Scena | Păstrează | Altfel `mg` dă |
| --- | --- | --- |
| `cuvinte` | cel mult 4 cuvinte (cu 4, scena durează 6,5-7,6 s la orice ritm; cu 5 ar avea nevoie de 8,2-9,3 s, peste cele 8 s ale unei scene; doar ritmul `alert` fără titlu ajunge la fix 8,0 s) | `valoare-invalida` pe `scene[i].cuvinte` (schema) |
| `citat` | `text`, `autor` și `rol` împreună: cel mult 23 de cuvinte, la orice ritm, format și font. Reperele: 21 de cuvinte cu autor de 2; 18 cu autor de 2 și rol de 3; 15 cu autor de 3 și rol de 5 (~76 de caractere) | `prea-repede-de-citit` pe `scene[i]`, cu sugestia să scurtezi textul |
| `cifra` | cifrele din `valoare` (fără punctele de separare), la mărimea minimă de 160 px, garantat pe toate fonturile și formatele: doar numărul 6 (999.999), cu prefix € 6, cu sufix `%` 5, cu sufix ` lei` 4, cu sufix ` mil.` 3, cu prefix € și sufix ` lei` 3 | `rand-nu-incape` pe `scene[i].valoare` |
| `cifra`, 7 cifre (1.250.000) | încap pe vertical cu orice font; pe pătrat doar cu `inter` și `playfair-display` (cu `instrument-sans` are 830 px față de 829 px utili, cu `montserrat` 849 px) | `rand-nu-incape` pe `scene[i].valoare` |
| `cifra`, 8 cifre sau mai mult (10.000.000 și peste) | nu încap nicăieri, cu niciun font: scrie valoarea în milioane | `rand-nu-incape` pe `scene[i].valoare` |
| `cifra`, `sursa` | sub 50 de caractere (la 36 px încap 53 de caractere obișnuite pe pătrat, 54 pe vertical; cu majuscule doar 37), deși schema permite 60 | `rand-nu-incape` pe `scene[i].sursa` |

Cum scrii o cifră mare: în mii sau milioane, nu cu toate cifrele. 1.250.000 € devine `"valoare": 1.25, "zecimale": 2, "sufix": " mil."` (apare „1,25 mil.”, 672-729 px, încape pe orice font și format); 12.500.000 devine `"valoare": 12.5, "zecimale": 1, "sufix": " mil."`. Cu prefixul € în față, „€1,25 mil.” încape peste tot, în afară de `montserrat` (857 px): acolo pune moneda în `text`. La orice `valoare` cu zecimale, pune `zecimale` (0-2) cât trebuie; altfel `mg` o respinge cu `valoare-invalida` pe `scene[i].zecimale`, în loc să rotunjească. Mesajul erorii de lățime propune singur varianta în mii sau milioane.

Finalul e unic: când textul lui nu încape (titlu, îndemn, detaliu), se scurtează; `mg` nu propune împărțirea în două scene.

### Erorile și reparațiile lor

Aici trimit sugestiile care nu pot numi un câmp anume (C12, C13, C14).

| Eroarea | Câmpul | Ce schimbi în `date.json` |
| --- | --- | --- |
| `cadre-goale` (C12) | `scene[i]` | o scenă cu foarte puțin text pe un ecran mare: adaugă `eticheta` sau un al doilea rând de titlu, ori scurtează `scene[i].durata` |
| `text-invizibil` (C13), sub 1% | `scene[i]` | mai mult contrast între `stil.culori.text` și `stil.culori.fundal`, sau o `scene[i].durata` mai mare |
| `text-invizibil` (C13), peste 50% | `scene[i]` | `stil.atmosfera: "plin"` sau mai mult contrast; cu brand, culorile se schimbă în fișa brandului |
| `video-inghetat` (C14) | `scene[i]` | o scenă mai scurtă (`scene[i].durata`) sau un `stil.ritm` mai rapid |
| `rand-nu-incape` (C04, S03) | câmpul numit | scurtează textul, mută o parte într-un rând nou (la titlu) sau împarte scena în două (la `final` doar scurtezi: există un singur final); la `cifra`, scrie valoarea în mii sau milioane |
| `prea-repede-de-citit` (S02) | `scene[i].durata` sau `scene[i]` | cu `scene[i].durata`: mărește durata la minimul din mesaj sau scoate-o, ca `mg` s-o calculeze; cu `scene[i]` (nici 8 s nu ajung): scurtează textul scenei sau împarte-l în două scene (la `final`, scurtează) |
| `valoare-invalida` pe `scene[i].zecimale` (reguli) | `scene[i].zecimale` | `valoare` are mai multe zecimale decât `zecimale` (implicit 0): pune `zecimale` cât trebuie (`mg` nu rotunjește pe tăcute) |
| `resursa-lipsa`, `valoare-invalida` (C07) | `sigla`, `muzica.*` | pune fișierul în `resurse/` (`.svg` sau `.png` pentru siglă; `.mp3`, `.wav`, `.m4a`, `.aac` pentru muzică) sau scoate câmpul |
| `audio-invalid` (C15) | `muzica.volum` | prea încet: mărește `muzica.volum`; prea tare: micșorează-l cu 0,1 |
| `check-esuat` (C10) cu `motion/...` | `build` | selectorii și momentele vin din șablon, nu din date: copiază mesajul în `video/<proiect>/cerere-sablon.md` pentru Dănuț |

## 8. Ce verifică revizorul

Peste lista comună din `.claude/agents/revizor-cadre.md`:

- Ierarhia se citește dintr-o privire: textul mare domină, eticheta, autorul și sursa sunt vizibil secundare.
- Rupturile de rând sunt firești în română: fără prepoziție, conjuncție sau „și” singure la capăt de rând, fără cuvânt orfan pe ultimul rând.
- Accentul colorat cade pe cuvintele care poartă sensul și nu obosește ochiul.
- Textul rămâne ușor de citit peste degradeu sau ceață, chiar dacă C06 a trecut.
- Blocul de text nu pare lipit sus sau jos; lista e aliniată curat.
- Cifra are sens împreună cu textul ei, iar sursa e prezentă dacă scenariul o pomenește.
- Scena finală arată ca un final; sigla nu concurează cu textul.

Verdictul e TRECE sau REPARĂ, cu fiecare schimbare ca modificare de câmp în `date.json`. Ritmul și muzica nu se judecă din foaia de contact.

## 9. Ce scrie agentul și ce nu

Agentul scrie doar `date.json`, `scenariu.md` (în afara blocului „Ce apare pe ecran”), `jurnal.md` și `cerere-sablon.md`. Nu scrie `build/`, `cadre/`, `verificare.json`, `motor.lock`, MP4-uri și nimic din `motoare/`, `nucleu/`, `biblioteci/`. În plus:

- nu inventează cifre, surse, citate, autori sau adrese; dacă lipsesc, întreabă; o cifră fără sursă se notează în scenariu „de la cursant, fără sursă”;
- un citat real intră doar cu acordul autorului, notat în `jurnal.md`;
- nu pune HTML, CSS sau JS în câmpuri;
- nu ocolește limitele de mărime: reformulează sau împarte scena;
- când `mg` pică la o verificare care nu numește un câmp (eroare la `hyperframes check`, randare căzută, cadru gol), nu repară codul și nu atinge `build/`: rulează `mg doctor`, notează eroarea în `jurnal.md` și îi spune cursantului că e o problemă a șablonului sau a mașinii.

### Corectura după predare

Când cursantul cere o schimbare după ce a primit filmul, agentul urmează pasul 9 din `FLUX.md` (`mg corectura`). Cererile obișnuite și câmpul lor:

| Ce spune cursantul | Ce schimbă agentul |
| --- | --- |
| „merge prea repede”, „nu apuc să citesc” | `scene[i].durata` a scenei numite, cu cel puțin 1 s (sau `stil.ritm: "calm"`, dacă e tot filmul) |
| „mai mare”, „se pierde” | `scene[i].marime` cu o treaptă mai sus (`M` → `L` → `XL`) |
| „alte culori”, „mai luminos”, „mai închis” | `stil.tema` (`curat` și `hartie` sunt luminoase) sau `stil.culori` |
| „la stânga”, „centrat” | `stil.aliniere` |
| „alt font” | `stil.font_titlu` |
| „altă muzică”, „mai încet muzica” | `muzica.fisier`, `muzica.volum` |
| „alt text” | câmpul de text; cere o aprobare nouă |

Ce nu se poate (glitch, emoji, alt fundal pe o scenă, rubrica 2): agentul spune limita și dă variantele din `mg corectura --propuneri`.

## 10. Comenzi

Toate sunt `node nucleu/mg.mjs <subcomandă>`:

- `nou <proiect> --sablon text-animat [--brand <nume>]`: copiază `exemple/minim.json` și scrie `scenariu.md`; formatul pătrat se pune apoi în `date.json` (`"format": "patrat"`).
- `randeaza <proiect> --doar-verificare`: validarea, stilul, măsurarea rândurilor (`build/masuratori.json`), cronologia (tipărită), build-ul, `hyperframes check` și blocul „Ce apare pe ecran”. Fără MP4. Se rulează după fiecare editare a lui `date.json`.
- `randeaza <proiect> --schita`: în plus, instantaneele și foaia de schiță; merge înainte de aprobare.
- `randeaza <proiect>`: cere aprobarea validă, randează, verifică MP4-ul, scrie foaia de contact și `verificare.json`.

Nu se folosesc la acest șablon: `mg desen`, generarea de imagini, transcrierea, `hyperframes beats`, `preview`, `publish`, `upgrade`, `telemetry`, `feedback`, `add`, `catalog`.

## 11. Capcane și abateri deliberate de la referință

- **Ieșirea scenei e tranziția.** Compoziția e una singură, fără tranziții injectate: fiecare scenă iese (0,45 s, `autoAlpha 0` după ieșire) înainte să intre următoarea.
- **Fluxul skillului `hyperframes`** nu se folosește: procesul e `FLUX.md`, iar compoziția o scrie `mg`.
- **Fonturile** se declară cu nume proprii („MG …”) și subseturi latin și latin-ext, pentru că fonturile împachetate de HyperFrames nu au ă, ș, ț.
- **Cifrele** se formatează de mână; `toLocaleString` ar scrie 1,250 pe un Windows în engleză.
- **Numărarea, tastarea și granulația** se calculează din timpul cadrului, nu din ceas, ca randarea să fie deterministă.

Dacă în foaie apar texte suprapuse, urme după ieșire sau un text tăiat de mască, e un defect de șablon, de scris în `cerere-sablon.md`, nu de reparat în date.

## 12. Exemple și referințe

- `exemple/minim.json`: baza pentru `mg nou` (3 scene: titlu, listă, final).
- `exemple/complet.json`: toate cele 7 tipuri, cu muzică, vertical.
- `exemple/patrat.json`: formatul pătrat, tema hârtie, ceață și siglă.
- `schema.json` și `implicite.json`: forma datelor și valorile fixe.
