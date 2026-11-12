---
nume: date-serie
motor: remotion
versiune_schema: 1
formate: [vertical]
fps: 30
teme: [noapte, hartie, curat]
durata: { min: 6, max: 60, implicita: 22 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, S01, S02, S03, S04, S05, S06, S07, S08, S09]
stadii: { S06: mp4, S07: mp4, S08: mp4, S09: mp4 }
---

# Șablonul date-serie

Video vertical 1080x1920, la 30 de cadre pe secundă, pe motorul Remotion, în două compoziții. `grafic` arată cifrele cursantului într-un MP4 de 6-60 s: 2-8 scene (titlu, cifră care numără, grafic cu bare, comparație, final), legate prin tranziții de 0,4 s. `serie` face câte un film de 6-20 s pentru fiecare rând dintr-un tabel cu testimoniale (Excel sau CSV): un card cu citatul, omul (poză sau inițiale) și îndemnul. Agentul scrie doar `date.json`; forma lui e în `schema.json`, valorile fixe în `implicite.json`, iar regulile de dincolo de schemă în `reguli.mjs` (`valideaza`).

## 1. Ce face

Transformă scenele din `date.json` într-un MP4: o scenă de titlu, o cifră care numără de la 0, un grafic cu bare care cresc decalat (coloane sau bare orizontale), două sau trei cifre mari puse față în față și un cadru final cu îndemn și siglă. `mg` măsoară fiecare text cu fontul real al temei, alege mărimea titlului, rupe subtitlul, textul cifrei și sursa, așază barele, calculează cadrele fiecărei scene și scrie `build/props.json` (tot ce desenează compoziția React) și `build/cronologie.json`, apoi verifică și randează cu Remotion. Agentul nu scrie cod și nu atinge `motoare/remotion/`.

Remotion se instalează la cerere, la primul proiect `date-serie`, cu acordul cursantului (vezi rubrica 10).

## 2. Când se alege

Când sunt adevărate toate condițiile:

1. Mesajul se sprijină pe cifre: rezultate, vânzări pe luni, înainte și după, un total. Cuvinte-semnal: „grafic”, „cifre”, „statistici”, „rezultate”, „evoluție”, „pe luni”, „față de anul trecut”, „raport”.
2. Cifrele vin de la cursant (sau dintr-un export al lui), cu sursa știută.
3. Formatul e vertical (Reels, TikTok, Shorts), iar videoul are 6-60 s și cel mult 8 scene.

| Situația | Drumul potrivit |
| --- | --- |
| O singură cifră, între texte | `text-animat` (scena `cifra`) |
| Poveste desenată, personaje | `reel-ilustrat` |
| Are filmare proprie | `overlay-filmare` |
| Grafic cu linie, inel, plăcintă | o frază despre limită (v1 are doar bare și comparație) și scena `bare` |
| Pătrat sau orizontal | o frază despre limită: v1 e doar vertical |
| Carduri cu testimoniale dintr-un tabel (Excel, CSV), câte un film pe om | `date-serie` cu `compozitie: "serie"` (rubrica 3, „Compoziția serie”) |

## 3. Câmpurile din date.json

La nivelul videoului: `sablon` (`"date-serie"`), `versiune_schema` (`1`), `compozitie` (`"grafic"`, obligatoriu), `format` (doar `vertical`, opțional), `brand` (numele unei fișe din `branduri/`), `sigla` (un `.svg` sau `.png` din `resurse/`, cel mult 2 MB; interzis cu brand, unde sigla vine din fișă), `stil`, `muzica` (`{ fisier, volum, incepe_de_la }`, fișierul în `resurse/`) și `scene` (2-8). Durata videoului rezultă din scene.

Fiecare scenă are `tip` și, opțional, `durata` (2-12 s, cu pasul de 0,1 s; implicit `titlu` 3, `cifra` 4, `bare` 7, `comparatie` 4,5, `final` 3,5) și `eticheta` (cel mult 24 de caractere, rândul mic de deasupra). Scenele `titlu`, `cifra`, `comparatie` și `final` au în plus, opțional, `marime` (`M` implicit, `L`, `XL`; rubrica 5) și `aliniere` (`stanga` implicit, `centru`: toate textele scenei, la mijloc).

| `tip` | Câmpuri | Limite |
| --- | --- | --- |
| `titlu` | `titlu`, `subtitlu` | `titlu` 1-2 rânduri, cel mult 24 de caractere pe rând; `subtitlu` cel mult 70, 2 rânduri |
| `cifra` | `valoare`, `zecimale` (0-2), `prefix` (cel mult 4), `sufix` (cel mult 8), `text` | `valoare` între -999.999.999 și 999.999.999, cu cel mult `zecimale` zecimale; `text` obligatoriu, cel mult 60, 2 rânduri |
| `bare` | `titlu`, `unitate`, `valori`, `evidentiaza`, `sursa` | `valori` 2-8 de `{ eticheta, valoare, prefix, sufix }`, eticheta cel mult 14, valoarea 0-999.999.999 și nu toate 0; `unitate` cel mult 12; `sursa` cel mult 60, 2 rânduri |
| `comparatie` | `titlu`, `valori`, `evidentiaza` | `valori` 2-3, eticheta cel mult 18 |
| `final` | `titlu`, `cta` | `titlu` ca la `titlu`; `cta` cel mult 28; sigla apare singură |

`evidentiaza` e exact eticheta valorii de pus în culoarea de accent. Barele sunt coloane când toate etichetele au cel mult 5 caractere, altfel bare orizontale; decide `mg`. Axa pornește mereu de la 0. Valorile unei scene `bare` sau `comparatie` se afișează cu aceleași zecimale (cele mai multe cerute de o valoare, cel mult 2).

### Compoziția serie

Cu `compozitie: "serie"`, `scene` lipsește (e eroare dacă apare), iar `serie` e obligatoriu. `sigla`, `brand`, `stil` și `muzica` sunt ca la `grafic` și se aplică tuturor cardurilor.

| Câmp | Ce e | Limite |
| --- | --- | --- |
| `serie.fisier` | tabelul cursantului, copiat neschimbat în `resurse/`: `resurse/testimoniale.xlsx` sau `.csv` | obligatoriu; 1-100 de rânduri |
| `serie.poze` | folderul cu poze: `resurse/poze` sau alt folder direct în `resurse/` | opțional; implicit `resurse/poze/` dacă există, altfel `resurse/` |
| `serie.eticheta` | rândul mic de sus, același pe toate cardurile („Ce spun cursanții”) | cel mult 60 de caractere |
| `serie.cta` | îndemnul de jos, același pe toate cardurile | cel mult 80, 2 rânduri |
| `serie.durata` | durata fiecărui card, dacă cursantul o cere | 6-20 s, pasul 0,1 s; fără ea, fiecare card își ia durata după citat |
| `serie.scurtari` | `{ "<nume exact din tabel>": "<citatul scurtat>" }`, doar cu acordul cursantului | vezi mai jos |

Tabelul: primul rând are numele coloanelor; `mg` le recunoaște fără diacritice și fără majuscule. Numele: `nume`, `nume și prenume`, `client`, `autor`. Rolul (al doilea rând de sub nume): `rol`, `oraș`, `localitate`, `funcție`, `firmă`. Citatul: `citat`, `text`, `testimonial`, `mesaj`, `părere`, `recenzie`. Poza: `poză`, `foto`, `imagine`. `nume` și citatul sunt obligatorii; coloanele necunoscute se ignoră, cu un avertisment. Dintr-un `.xlsx` se citește prima foaie; un CSV poate fi UTF-8 sau windows-1250 (Excel-ul românesc vechi), cu `;`, `,` sau tab. Literele cu sedilă (s și t cu sedilă, din Excel-ul vechi) se scriu pe card cu virgulă (ș, ț); fișierul cursantului nu se modifică niciodată.

Pozele nu se pun în Excel: poze lipite în foaie nu se citesc (avertisment). Cursantul dă un folder de poze, iar agentul îl copiază în `resurse/poze/`. Poza unui om se găsește după numele lui: `Ana-Maria Popescu` ia `ana-maria-popescu.jpg` (fără diacritice, cu cratimă). O coloană `poza` din tabel, cu numele fișierului, are prioritate. JPG, PNG sau WebP, latura mică de cel puțin 400 px, cel mult 8 MB; un om fără poză apare cu inițialele, pe un cerc în culoarea de accent. Două poze cu numele aceluiași om sunt o eroare (agentul întreabă care); o poză fără om e un avertisment.

Un citat are 5-350 de caractere și trebuie să se poată citi în cel mult 20 s. Un citat prea lung nu se micșorează pe ascuns și nu se rescrie: agentul îi propune cursantului o scurtare, făcută doar din tăieturi, cu „(…)” în locul fiecărei bucăți scoase (cuvintele rămase stau în ordinea lor, neschimbate; emoji se pot scoate fără marcaj). Scurtarea apare în blocul „Ce apare pe ecran” cu „(scurtat, cu acordul cursantului)”, deci intră în aprobare.

Fiecare rând dă `serie/NN-<nume>.mp4` (de exemplu `serie/03-elena-dumitrescu.mp4`), în ordinea din tabel; `serie/manifest.json` ține lista lor.

## 4. Dicționarul de stil

`stil` are doar `descriere` (cuvintele cursantului, cel mult 300 de caractere), `tema` (`noapte` implicit, `hartie`, `curat`) și `culori` (`fundal`, `text`, `accent`, în hex). Fonturile, culoarea atenuată, atmosfera și stilul etichetelor vin din temă. Ordinea: implicite < temă < brand < date.

| Ce spune cursantul | Ce scrie agentul |
| --- | --- |
| „întunecat, elegant, tehnic, premium, modern” | `stil.tema: "noapte"` |
| „cald, retro, hârtie, carte, artizanal, tradițional” | `stil.tema: "hartie"` |
| „curat, corporate, sobru, profesionist, luminos” | `stil.tema: "curat"` |
| o culoare numită („verde ca frunza”, „albastrul meu”) | `stil.culori.accent` în hex, ales de agent; dacă pică la contrast (C06), alt ton, notat |
| cuvinte fără corespondent („energic”, „TikTok”) | tema cea mai apropiată și o frază în `scenariu.md`: ritmul și tranzițiile sunt fixe în v1 |

Agentul notează traducerea în `scenariu.md` și în `jurnal.md`.

### Limitele v1

Nu se pot schimba din date: ritmul și tranzițiile (fade de 12 cadre), fontul titlului (`stil.font_titlu` și `stil.ritm` nu există), formatul (doar vertical), tipurile de grafic (fără linie sau inel), iconițele și ilustrațiile.

## 5. Tipurile de scenă și ce se vede

- `titlu`: eticheta, titlul și subtitlul intră pe rând, cu fade și o ridicare scurtă.
- `cifra`: valoarea numără de la 0 la ea, cu cifre tabulare și formatare românească (1.248; 3,5), în culoarea de accent; textul apare sub ea.
- `bare`: barele cresc de la axă, decalat, cu valoarea deasupra (la coloane) sau la capătul rândului (la bare orizontale); bara din `evidentiaza` e în accent, celelalte în culoarea atenuată; sursa stă jos.
- `comparatie`: valorile apar una sub alta, fiecare cu eticheta ei; cea din `evidentiaza` e în accent.
- `final`: titlul, îndemnul (în accent) și sigla, sub îndemn.

- cardul seriei: eticheta sus (și sigla în dreapta ei), semnul citatului în accent, citatul, care intră rând cu rând, apoi avatarul, numele și rolul, iar îndemnul jos, în accent. Citatul are cea mai mare mărime între 72 și 36 px la care încape în zona lui; un citat scurt e mare, unul lung mai mic, fără să iasă din card.

Mărimile (la `marime` `M`): titlul 110 px, coborât până la 84 px dacă nu încape; textul 44 px; cifra 220 px (cel puțin 140); valorile comparației 140 px (cel puțin 96); etichetele și valorile barelor 44 px (cel puțin 32). Sub minim nu se micșorează pe ascuns: e eroare `rand-nu-incape`.

`marime` mărește elementul principal al scenei (titlul la `titlu` și `final`, valoarea la `cifra`, valorile la `comparatie`); textul mic, etichetele și barele rămân la fel. În pixeli nu se dă nimic, doar trepte: `L` e de 1,15-1,3 ori maximul de la `M`, `XL` de 1,3-1,6 ori (cifra, până la 2 ori). `mg` alege cea mai mare mărime din treaptă care încape; dacă nici minimul treptei nu încape, e `rand-nu-incape`, cu sugestia unei trepte mai mici. La cifra `XL`, prefixul și sufixul („+”, „%”, „ lei”) sunt la jumătate din mărimea cifrelor, ca cifrele să crească. Repere măsurate, pe fontul temei `noapte`: „+54%” are 220 px la `M`, 288 px la `L` și 400 px la `XL` (aproape toată lățimea); „12.900 lei” încape doar la `M` (172 px). Pe un ecran vertical de 1080 px, lățimea e limita: o cifră nu poate ocupa jumătate din înălțimea ecranului. Când cererea cere de la început un element „mare”, agentul pune `L`; `XL` rămâne pentru corectura „și mai mare”.

## 6. Cum calculează mg timpii

`src/durata.mjs` calculează totul, același cod în `mg` și în compoziția React; agentul dă cel mult `scene[i].durata`.

1. Cadrele scenei: `durata × 30`. Între două scene, tranziția de 12 cadre (0,4 s) le suprapune: totalul e suma cadrelor minus 12 pe fiecare tranziție. Exemplul din `exemple/grafic.date.json`: 24 s de scene, 4 tranziții, 672 de cadre (22,4 s).
2. Fiecare scenă e completă (tot ce arată e pe loc) după intrarea ei: `titlu` și `final` 0,6 s, `cifra` 1,5 s, `bare` 1 s + 2 cadre pe fiecare bară în plus, `comparatie` 1 s + 0,2 s pe fiecare valoare în plus. Toate încap înaintea tranziției de ieșire, chiar și într-o scenă de 2 s.
3. În cronologie, fiecare scenă se întinde de la mijlocul tranziției dinainte până la mijlocul celei de după; textele ei trebuie să încapă la citire în fereastra asta: 0,8 s + 0,3 s pe cuvânt (C09). Cuvintele se numără pe ce apare pe ecran: eticheta, fiecare rând, unitatea, fiecare etichetă și valoare de bară (41.200 lei sunt 2 cuvinte), sursa, îndemnul.
4. Totalul trebuie să fie 6-60 s. Fundalul se mișcă lent tot filmul, deci nu există cadre înghețate.

La `serie`, fiecare card e un singur segment, „Testimonial N”, de la 0 la sfârșitul lui, fără tranziții. Durata: implicit 8 s (10 s la un citat de peste 120 de caractere), mărită cât să încapă intrarea plus timpul de citire al tuturor textelor cardului (aceeași formulă, 0,8 s + 0,3 s pe cuvânt), rotunjită în sus la 0,5 s, cel mult 20 s. Peste 20 s, `mg` cere o scurtare (`date-serie-citat-lung`).

Orice `mg randeaza` tipărește cronologia ca tabel (la serie, câte unul pe card); agentul o copiază în `jurnal.md`.

## 7. Verificările și erorile

Se aplică toate verificările comune, C01-C17, cu precizările:

- C04 numără caracterele fiecărui câmp (plafoanele de mai sus); lățimea o măsoară S04.
- C09: durata totală și timpul de citire al fiecărei scene, pe fereastra ei din cronologie.
- C10 cere un bundle Remotion reușit, compoziția `Grafic` (sau `Serie`, pe fiecare card) cu 1080x1920, 30 fps și cadrele din cronologie, și zero adrese `http`/`https` în `build/`.
- La `serie`, C09-C17 rulează pe fiecare card; în `verificare.json` (versiunea 2) codurile de pe MP4 stau la fiecare film, în `iesiri`.
- C13 măsoară fiecare rând de text în caseta lui reală, din `build/props.json`, la momentul în care scena e completă.
- C17 caută fiecare rând de text ca valoare în `build/props.json`.

| ID | Prag | Cod | Câmpul care repară |
| --- | --- | --- | --- |
| S01 | tabelul seriei se citește: `.xlsx` valid sau CSV decodat fără caractere stricate; primul rând numește coloanele nume și citat | `serie-fisier-invalid`, `serie-codificare`, `date-serie-antet` | nimic în date: cursantul dă fișierul din nou (Excel: „CSV UTF-8” sau direct `.xlsx`) |
| S02 | rândurile seriei: 1-100, fiecare cu nume (cel mult 40) și citat (5-350 de caractere, citibil în 20 s), rol cel mult 60, nume unice; scurtările sunt doar tăieturi cu „(…)” | `date-serie-randuri`, `date-serie-rand-invalid`, `date-serie-nume-duplicat`, `date-serie-citat-lung`, `date-serie-scurtare-invalida`, `date-serie-coloana-necunoscuta` (avertisment) | rândul din tabel (prin cursant) sau `serie.scurtari` |
| S03 | datele graficului: `evidentiaza` e o etichetă existentă; barele nu sunt toate 0; `final` doar ultima scenă | `date-serie-evidentiaza`, `date-serie-bare-zero`, `date-serie-final-nu-e-ultimul` | `scene[i].evidentiaza`, `scene[i].valori`, `scene[i].tip` |
| S04 | fiecare rând, măsurat cu fontkit în fontul temei la mărimea minimă, încape în 920 px (cu marja de 4%, 883 px) și în numărul maxim de rânduri; tot conținutul scenei încape între y 200 și y 1594 | `rand-nu-incape` | câmpul numit în eroare |
| S05 | sigla există, e `.svg` sau `.png`, are dimensiuni citibile și cel mult 2 MB; la serie, fiecare poză e JPG, PNG sau WebP, cu latura mică de cel puțin 400 px și cel mult 8 MB, și aparține unui singur om | `resursa-lipsa`, `valoare-invalida`, `date-serie-poza-ambigua`, `date-serie-poza-fara-om` (avertisment), `date-serie-poze-in-excel` (avertisment) | `sigla` sau fișa brandului; poza din `resurse/poze/` |
| S06 | cadrele MP4-ului = `cadreTotale` ± 1; durata 6-60 s | `date-serie-durata-mp4` | nimic în date la cadre (defect de randare); `scene[i].durata` la durată |
| S07 | MP4-ul are cel mult 100 MB | `date-serie-marime-mp4` | nimic în date: defect de randare |
| S08 | seria e întreagă: câte un MP4 verde pe fiecare rând, niciun rând eșuat, niciun `.tmp.mp4` rămas | `serie-incompleta` | ce spun erorile rândurilor; apoi `mg randeaza` din nou (rândurile bune se sar) |
| S09 | randarea completă a seriei pornește doar după o schiță verde pe datele de acum, cu verdictul TRECE al revizorului (sau plafonul rundelor de schiță atins, ori o corectură în lucru) | `serie-fara-schita` | nimic în date: `mg randeaza --schita` și revizorul |

S01-S05 verifică datele, la orice `mg randeaza`; S06 și S07, fiecare MP4 randat; S08 și S09, seria întreagă, la randarea completă. La `grafic`, S01, S02, S08 și S09 nu se aplică și ies verzi.

Fiecare eroare are `{cod, camp, mesaj, sugestie}`; sugestia e mereu o schimbare în `date.json` (sau în fișa brandului). Codurile exacte sunt în `docs/interfete/erori.md`.

### Limitele care se lovesc în practică

Măsurate cu codul lui `mg`, pe fonturile celor trei teme (inter la `noapte` și `curat`, fraunces la titlurile din `hartie`):

| Ce | Păstrează | Altfel `mg` dă |
| --- | --- | --- |
| un rând de titlu | cam 18-20 de caractere obișnuite la 84 px („pe 15 octombrie” încape, „începe pe 15 octombrie” nu: 948 px) | `rand-nu-incape` pe `scene[i].titlu[j]` |
| `cifra` | până la 999.999 cu sufix scurt („00.000 lei” are 703 px la 140 px); mai mult, în mii sau milioane | `rand-nu-incape` pe `scene[i].valoare` |
| etichetele barelor | abrevieri de 3 litere („ian”, „feb”) la 6-8 bare; altfel barele trec orizontal | `rand-nu-incape` pe `scene[i].valori[k].eticheta` |
| scena `titlu` sau `final` cu 9 cuvinte | cel puțin 3,8 s (`durata` 3 dă `prea-repede-de-citit`) | `prea-repede-de-citit` pe `scene[i].durata` |

Cum scrii o cifră mare: 1.250.000 lei devine `"valoare": 1.25, "zecimale": 2, "sufix": " mil."`. La orice `valoare` cu zecimale, pune `zecimale` cât trebuie; altfel `mg` o respinge cu `valoare-invalida` pe `scene[i].zecimale`, în loc să rotunjească.

### Erorile și reparațiile lor

Aici trimit sugestiile care nu pot numi un câmp anume (C12, C13, C14).

| Eroarea | Câmpul | Ce schimbi în `date.json` |
| --- | --- | --- |
| `cadre-goale` (C12) | `scene[i]` | o scenă cu foarte puțin pe ecran: adaugă `eticheta` sau un rând de titlu, ori scurtează `scene[i].durata` |
| `text-invizibil` (C13) | `scene[i]` | mai mult contrast între `stil.culori.text` și `stil.culori.fundal`; cu brand, culorile se schimbă în fișa brandului |
| `video-inghetat` (C14) | `scene[i]` | o `scene[i].durata` mai mică |
| `rand-nu-incape` (C04, S04) | câmpul numit | scurtează textul, mută o parte în al doilea rând al titlului sau împarte scena în două; la `cifra`, scrie valoarea în mii sau milioane |
| `prea-repede-de-citit` (C09) | `scene[i].durata` | mărește durata la minimul din mesaj sau scurtează textele scenei |
| `durata-in-afara-limitelor` (C09) | `scene` | totalul trebuie să fie 6-60 s: adaugă sau scoate scene, ori schimbă duratele |
| `stil-contrazice-brand` (C02) | `stil.tema`, `stil.culori`, `sigla` | cu brand, scoate câmpul: tema, culorile și sigla vin din fișă |

## 8. Ce verifică revizorul

Peste lista comună din `.claude/agents/revizor-cadre.md`:

- titlurile nu promit mai mult decât arată datele: o scenă care spune „s-au dublat” sau „record” e susținută de cifrele din blocul „Ce apare pe ecran”;
- graficul se citește pe telefon: bara sau valoarea evidențiată e cea care duce mesajul, etichetele și valorile nu se suprapun;
- textele sunt în română corectă și naturală;
- stilul se potrivește cu `stil.descriere` și cu brandul, dacă există;
- scena finală închide clar, iar sigla nu concurează cu îndemnul.

La `serie`, pe foaia schiței (primul, ultimul și cel mai lung card) și pe foaia rundei (toate cardurile):

- citatul e exact cuvintele omului, iar o scurtare se vede ca „(…)”;
- numele și rolul sunt ale omului de pe card, iar poza (dacă există) e întreagă în cerc, fără un chip tăiat;
- cardul cel mai lung se citește în tihnă, cel scurt nu pare gol;
- cardurile arată ca o serie: aceeași etichetă, același îndemn, același stil.

Verdictul e TRECE sau REPARĂ, cu fiecare schimbare ca modificare de câmp în `date.json`.

## 9. Ce scrie agentul și ce nu

Agentul scrie doar `date.json`, `scenariu.md` (în afara blocului „Ce apare pe ecran”), `jurnal.md` și `cerere-sablon.md`. Nu scrie `build/`, `cadre/`, `verificare.json`, `motor.lock`, MP4-uri și nimic din `motoare/`, `nucleu/`, `biblioteci/`. În plus:

- nu inventează cifre, surse sau date; dacă lipsesc, întreabă; o cifră fără sursă se notează în scenariu „de la cursant, fără sursă”;
- nu rotunjește și nu „netezește” cifrele cursantului; o valoare în mii se scrie cu sufixul care o spune („ mii”, „ mil.”);
- nu pune HTML, CSS sau JS în câmpuri;
- la `serie`, nu rescrie și nu „corectează” citatele oamenilor: le scurtează doar cu acordul cursantului, prin tăieturi cu „(…)” în `serie.scurtari`; nu modifică tabelul cursantului (un rând greșit îl corectează cursantul și dă fișierul din nou);
- când `mg` pică la o verificare care nu numește un câmp (bundle căzut, randare căzută, cadru gol), nu repară codul și nu atinge `build/`: rulează `mg doctor`, notează eroarea în `jurnal.md` și îi spune cursantului că e o problemă a șablonului sau a mașinii.

### Corectura după predare

Când cursantul cere o schimbare după ce a primit filmul, agentul urmează pasul 9 din `FLUX.md` (`mg corectura`). Cererile obișnuite și câmpul lor:

| Ce spune cursantul | Ce schimbă agentul |
| --- | --- |
| „prea repede”, „nu apuc să citesc” | `scene[i].durata` a scenei numite, cu cel puțin 1 s |
| „mai mare”, „se pierde”, „cât jumătate de ecran” | `scene[i].marime` cu o treaptă mai sus (`M` → `L` → `XL`); scena `bare` nu are `marime`, acolo merg mai puține bare sau etichete mai scurte |
| „la mijloc”, „centrat” | `scene[i].aliniere: "centru"` |
| „alte culori”, „mai luminos”, „mai închis” | `stil.tema` (`curat` e cea luminoasă) sau `stil.culori` |
| „altă cifră”, „alt text” | câmpul de text sau valoarea; cere o aprobare nouă |

| la serie, „la Ana alt text”, „scoate-l pe Mihai” | tabelul nou de la cursant, copiat peste `resurse/`, sau `serie.scurtari`; se refac doar filmele rândurilor schimbate, celelalte rămân identice, iar `mg corectura --verifica` arată care |

Ritmul, tranzițiile, fontul și formatul nu se schimbă (rubrica 4, „Limitele v1”); la o asemenea cerere, agentul spune limita și dă variantele din `mg corectura --propuneri`.

## 10. Comenzi

Toate sunt `node nucleu/mg.mjs <subcomandă>`:

- `nou <proiect> --sablon date-serie [--brand <nume>]`: copiază `exemple/minim.json` și scrie `scenariu.md`. Pentru o serie, agentul înlocuiește apoi `date.json` cu forma din `exemple/serie/date.json` și copiază tabelul și pozele cursantului în `resurse/`. Fără Remotion instalat se oprește cu `remotion-neinstalat`; agentul cere acordul cursantului pentru descărcare (~340 MB) și reia comanda cu `--instaleaza-motorul`.
- `randeaza <proiect> --doar-verificare`: validarea, stilul, așezarea, cronologia (tipărită), `build/props.json`, bundle-ul și blocul „Ce apare pe ecran”. Fără MP4.
- `randeaza <proiect> --schita`: în plus, o randare la jumătate de rezoluție și foaia ei; merge înainte de aprobare.
- `randeaza <proiect>`: cere aprobarea validă, randează, verifică MP4-ul, scrie foaia de contact și `verificare.json`.

La `serie`: `--doar-verificare` citește tabelul și pozele și tipărește cronologia fiecărui card; `--schita` randează la jumătate de rezoluție doar primul, ultimul și cel mai lung card, în `cadre/schita-N/`, cu foaia lor (obligatorie înainte de randarea completă, S09); `randeaza` face filmele pe rând, scrie progresul („03/5 elena-dumitrescu: randez…”) și, după primul, cât mai durează. Un film cu același build ca la rularea trecută și cu MP4-ul neatins se sare, deci o serie întreruptă se reia de unde a rămas. Cadrele de predare stau în `cadre/<nume>/`, iar predarea numește `serie/manifest.json`. Pe un Mac M-series, 5 carduri de 10-20 s se randează în cam 45 s.

Pe un laptop Windows cu 8 GB RAM, fără placă video dedicată, randarea exemplului (22,4 s) a durat cam 2 minute.

## 11. Capcane și abateri deliberate de la referință

- **Mărimile se calculează în Node, nu cu `fitText`.** `mg` alege mărimea, rândurile și poziția fiecărui text și le scrie în `build/props.json`; React doar desenează, deci S04, caseta lui C13 și randarea folosesc aceleași numere.
- **Cifrele** se formatează de mână (`src/comun/numere.mjs`, același modul în `mg` și în React); `toLocaleString` ar scrie 1,248 pe un Windows în engleză.
- **Fără rețea în build.** Fonturile stau în `build/fonturi/`, sigla în `build/sigla.<ext>`; Remotion nu primește cheie de licență, deci nu trimite telemetrie.
- **Licența Remotion** e gratuită pentru persoane și pentru firme de cel mult 3 oameni; de la 4 oameni, firma are nevoie de Company License. Termenii nu cer atribuire; interzic doar vânzarea unui derivat al lui Remotion și sugerarea unui parteneriat cu Remotion.

Dacă în foaie apar texte suprapuse, bare care ies din cadru sau un text tăiat, e un defect de șablon, de scris în `cerere-sablon.md`, nu de reparat în date.

## 12. Exemple și referințe

- `exemple/minim.json`: baza pentru `mg nou` (o cifră și un final).
- `exemple/grafic.date.json`: toate cele 5 tipuri, 672 de cadre; e și golden-ul șablonului.
- `exemple/serie/`: o serie de 5 testimoniale (`date.json` cu o scurtare, `resurse/testimoniale.csv` în windows-1250 cu `;` și sedile, ca din Excel-ul românesc, și `resurse/poze/` cu poze de probă abstracte; Mihai Stan nu are poză).
- `schema.json` și `implicite.json`: forma datelor și valorile fixe.
