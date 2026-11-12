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

# Șablonul reel-ilustrat

Reel vertical 1080x1920, 10-60 s, 30 de cadre pe secundă: desene care își trasează conturul, iconițe care se adună, o rețea „sistem” și un card de text pe fiecare scenă. Agentul scrie doar `date.json`; forma lui e în `schema.json`, valorile fixe în `implicite.json`, iar regulile de dincolo de schemă în `sablon.mjs` (`valideaza`).

## 1. Ce face

Construiește un reel vertical 1080x1920, de 10-60 s (implicit 30 s), la 30 de cadre pe secundă. Desenele (forme umplute Open Doodles și Open Peeps, iconițe Lucide) își trasează conturul sub ochii privitorului, se umplu, se retrag și lasă locul unei rețele „sistem”, cu un card de text pe fiecare scenă. Totul pornește din lista de scene din `date.json`; `mg` o transformă în plan (`build/plan.json`), cronologie (`build/cronologie.json`) și compoziția HyperFrames. Agentul nu scrie cod. Șablonul nu folosește filmare, transcriere sau voce. Muzica e opțională (`muzica`), pusă de `mg` sub animație.

## 2. Când se alege

Când sunt adevărate toate condițiile:

1. Cererea descrie o poveste, o situație sau o metaforă cu oameni ori obiecte (desen, ilustrat, personaj, schiță, „se desenează”, „înainte și după”, „cum arată ziua mea”, un concept explicat fără filmare).
2. Cursantul nu are o filmare proprie care să fie baza videoului.
3. Subiectul nu e o serie de cel puțin 3 numere de arătat ca grafic.
4. Cererea nu e doar text.
5. Cel mult 60 s, vertical sau format nespecificat, fără voce sincronizată.

O cerere ambiguă („fă-mi un reel despre X”), fără filmare și fără date, cu ceva de desenat, primește reel ilustrat. Anunțul, într-o frază: „Fac un reel ilustrat în HyperFrames, 30 s vertical.”

| Situația | Ce faci |
| --- | --- |
| Doar text (mesaje, liste, citate, cifre), vertical sau pătrat | `text-animat`: anunțul într-o frază și `mg nou <proiect> --sablon text-animat` |
| Filmare proprie, cu subtitrări sau text peste ea | `overlay-filmare`: anunțul într-o frază și `mg nou <proiect> --sablon overlay-filmare --filmare <cale>` |
| Serie de numere, grafic din cifre | `date-serie`: graficul din cifre, vertical, 6-60 s |
| Desene în format pătrat sau orizontal, voce sincronizată, morf între forme | o frază despre limită, varianta cea mai apropiată și `video/<proiect>/cerere-sablon.md` pentru Dănuț |

## 3. Câmpurile din date.json

Forma exactă e în `schema.json`; `mg nou` pornește de la `exemple/minim.json`.

| Câmp | Limite | Ce face |
| --- | --- | --- |
| `sablon`, `versiune_schema` | `"reel-ilustrat"`, `1` | le scrie `mg nou` |
| `format` | doar `vertical` | forma comună a datelor |
| `durata` | 10-60 s, cu pasul de 0,1 s; cu toate duratele de scenă date, suma lor ± 0,1 s | lipsă: suma scenelor sau 30 s |
| `brand` | numele unui folder din `branduri/` | cu brand, `stil.tema`, `stil.culori`, `stil.font_titlu` și `semnatura` în date sunt eroare `stil-contrazice-brand` |
| `stil.descriere` | cel mult 300 de caractere | cuvintele cursantului, pentru revizor |
| `stil.tema` | `noapte` (implicit), `hartie`, `curat` | culorile, fonturile și atmosfera |
| `stil.culori.fundal`, `.linie`, `.accent`, `.text` | `#RRGGBB`; contrast C06 | `linie` e culoarea conturului, a iconițelor și a cernelii |
| `stil.font_titlu` | `instrument-sans`, `fraunces` | fontul titlurilor |
| `stil.ritm` | `calm`, `normal` (implicit), `alert` | timpii interni (rubrica 6) |
| `stil.atmosfera` | `ceata`, `plin`; implicit din temă (`ceata` pe `noapte` și `hartie`, `plin` pe `curat`) | `plin` oprește ceața, granulația și împingerea camerei; în locul lor, desenele urcă lent (0,85 px/s) până la pauza finală |
| `stil.recolorare` | `tema` (implicit), `original` | culorile formelor umplute |
| `semnatura` | cel mult 2 rânduri de 42 de caractere | textul bătut la mașină la final |
| `muzica` | lipsă, `null` sau `{ fisier, volum, incepe_de_la }` | o piesă din `resurse/` (`.mp3`, `.wav`, `.m4a`, `.aac`, cel mult 50 MB); `volum` 0,1-1 (implicit 0,4), `incepe_de_la` în secunde (implicit 0); `mg` o taie la durata videoului, cu fade-in de 0,5 s și fade-out de 1,5 s |
| `scene` | 2-8 și cel mult `floor(durata / 3,5)` | povestea, în ordine |

Câmpuri de scenă comune: `tip` (rubrica 5); `marime` (`M` implicit, `L`, `XL`; doar pe o scenă cu `titlu`, vezi rubrica 4); `durata` (2,5-12 s, cu pasul de 0,1 s, și cel puțin minimul tipului; lipsă: timpul rămas se împarte pe ponderi); `eticheta` (cel mult 24 de caractere, fără `*`; prefixul și majusculele vin din temă); `titlu` (1-2 rânduri, cel mult 22 de caractere fiecare și cel mult 852 px în fontul folosit (al temei sau al brandului), vezi C04; accentul `*...*` doar pe un rând întreg); `cuvinte` (2-5, cel mult 16 caractere fiecare, fără `*`; nu apare împreună cu `titlu`). `sigla` și `titlu` la nivelul videoului nu există (`camp-necunoscut`).

## 4. Dicționarul de stil

Agentul aplică tabelul, păstrează cuvintele cursantului în `stil.descriere` și notează traducerea în `jurnal.md`. Fără descriere de stil rămâne `noapte`.

| Ce spune cursantul | Câmpuri |
| --- | --- |
| întunecat, elegant, tehnic, premium, modern | `stil.tema: "noapte"` |
| cald, retro, hârtie, carte, artizanal, tradițional, prietenos | `stil.tema: "hartie"` |
| curat, corporate, sobru, profesionist, luminos | `stil.tema: "curat"` |
| o culoare numită („accent verde”) | `stil.culori.accent` în hex; `mg` verifică contrastul și, la eșec, spune câmpul și raportul |
| jucăuș, colorat | `stil.recolorare: "original"` |
| rapid, energic | `stil.ritm: "alert"` |
| liniștit, calm | `stil.ritm: "calm"` |
| fără efecte, minimalist | `stil.atmosfera: "plin"` |
| linii, nu pete de culoare | pentru linii, iconițele Lucide (scenă `adunare`); pentru oameni, Open Peeps și Open Doodles (`mg desen lista`) |

Cu brand, tema, culorile, fontul titlului și semnătura vin numai din brand; `date.json` mai poate alege `ritm`, `atmosfera` și `recolorare`. Fișa de brand mai poate da `font_text` (fontul etichetei, al îndemnului și al semnăturii), `ceata` (culoarea, și opțional opacitatea, stratului de sus și a celui de jos) și `eticheta.prefix`; le vezi în `build/stil-rezolvat.json`.

Mărimea titlului: `M` e 96 px. `scene[i].marime` o urcă în trepte: `L` (110-124 px) și `XL` (126-154 px); `mg` alege cea mai mare valoare din treaptă la care fiecare rând încape pe card și cardul se termină deasupra îndemnului (la scena cu îndemn) sau a zonei desenului. Dacă un rând nu încape întreg nicăieri în treaptă, `mg` îl rupe în două linii, la un spațiu, cu aceleași cuvinte și același px (cuvintele din `date.json` nu se schimbă); un rând care încape întreg nu se rupe. Dacă nici așa nu încape (un cuvânt singur prea lat, sau cardul prea înalt), e `rand-nu-incape` pe `scene[i].marime`: o treaptă mai jos sau rânduri mai scurte. În pixeli nu se dă nimic. Când cererea vrea de la început un titlu „mare”, agentul pune `L`; `XL` rămâne pentru „și mai mare”. Cuvintele (`cuvinte`) și eticheta au mărimea fixă.

Fix în cod, fără câmp: zonele (text y 200-480, desen y 760-1500, nimic important sub y 1594), mărimea etichetei, mecanica desenării, intrarea desenelor după tipul lor, curbele, animația cardurilor, ordinea straturilor (ceață, desen, granulație, text), pauza de 0,5 s între carduri, împingerea camerei (1,04), urcarea lentă a desenelor pe `plin` (0,85 px/s), pauza finală de 1,5 s, pragurile de contrast.

## 5. Tipurile de scenă și desenele

| `tip` | Câmpuri proprii | Durată minimă | Pondere | Ce se vede |
| --- | --- | --- | --- | --- |
| `desen` | `desen` (obligatoriu) | 3,0 s | 1,0 | desenul intră, cardul apare, desenul se retrage la final (sau mai târziu, cu `ramane_pana_la`) |
| `adunare` | `iconite` (1-6), `aranjare` (`arc-sus`, `rand`) | 2,0 s + 0,5 s pe iconiță | 1,1 | iconițele se strâng, tremură și se retrag |
| `retea` | `noduri` (3-6), `scanteie` | 4,0 s (5,5 s cu `scanteie`) | 1,2 | rețeaua „sistem”; cu `scanteie`, o lumină în accent o parcurge și bifează nodurile; după o scenă `adunare` cu 3+ iconițe, nodurile se nasc din iconițe, câte una, iar `noduri` nu se folosește |
| `card` | niciunul; cere `titlu` sau `cuvinte` | 2,5 s | 0,7 | doar cardul |
| `final` | `desen` (opțional), `linie_accent`, `cta` (cel mult 28 de caractere) | 3,5 s | 1,2 | desenul final, linia de accent, titlul, îndemnul și semnătura |

Un `card` fără titlu și fără cuvinte (doar cu etichetă sau gol) e refuzat la validare (`valoare-invalida` pe `scene[i]`): pe ecran ar rămâne aproape doar fundalul. Pentru un desen lângă etichetă, scena devine `desen`. Scena `final` e doar ultima și cel mult una (`valoare-invalida` pe `scene[i].tip`), iar un reel fără niciun text (titlu, cuvinte, etichetă, îndemn, semnătură) e refuzat la validare (`valoare-invalida` pe `scene`): cursantul n-ar avea ce aproba.

Obiectul `desen`: `id` (din `biblioteci/catalog.json`, din `proprii/` sau, la un proiect cu brand, din catalogul brandului: piesele `b-`, găsite cu `mg desen cauta "<concept>" --brand <nume>`), `marime` (`mic` 55%, `mediu` 75%, `mare` 95%, implicit), `pozitie` (`centru`, `stanga`, `dreapta`), `oglindit`, `ramane_pana_la` (numărul unei scene ulterioare; între ele doar `adunare` sau `card`), `ajustare` (`dx`, `dy` între -200 și 200 px, `scara` 0,7-1,3; dă avertisment), `panou` (obligatoriu `true` pentru o piesă `evita` pe tema `noapte`).

Intrarea desenului o decide mecanica fixă, nu agentul. Formele vectoriale `od-`, `op-`, `p-` își trasează conturul pe 70% din fereastra de desenare: conturul fiecărui path pornește puțin după precedentul, durează cât să se termine toate odată, la 70%, cu accelerare și frânare lină; apoi umplerea apare prin fade, fără pauză între ele. La retragere, umplerea și accentele se sting în primele 40% din fereastra de retragere, iar conturul se retrage în rest. Pe `noapte`, la piesele Open Peeps (cele cu panou), silueta apare în primele 0,3 s ale desenării, odată cu începutul conturului, iar la retragere pleacă ultima, în ultimele 0,3 s. O piesă proprie (`p-`) care nu e recolorabilă (imagine raster sau vector cu culori fixe) intră prin apariție (fade și mărire ușoară) și iese prin fade, fără contur. Iconițele Lucide, muchiile rețelei, bifele și linia de accent se trasează cu dash, cum se trasează și conturul formelor, și se retrag la fel. Un film folosește o singură familie pentru desenele mari; iconițele merg cu oricare. La prima scenă alege sursa potrivită temei (recomandare, nu regulă): Open Doodles pe `noapte` (toate piesele OD sunt `bun` pe noapte, deci apar direct pe fundal) și Open Peeps pe `hartie` și `curat` (pe `noapte` primesc panoul inversat); Open Peeps și pe `noapte`, când cursantul vrea oameni mai diverși sau la birou, la telefon, cu notițe. Ambele sunt din familia `cerneala`, deci se pot amesteca. Pe `noapte`, piesele `autocolant` primesc panou automat, iar piesele `evita` se găsesc doar cu `--include-evita` și cer `desen.panou: true`. Iconițele vin din Lucide 1.49.0. Când nimic nu se potrivește: `mg desen cauta`, `mg desen arata`, apoi un SVG propriu cu `mg desen adauga` (prefix `p-`, licență obligatorie) sau, cu costul aprobat de cursant, un desen generat prin Kie (`mg genereaza`, pașii din CLAUDE.md), care intră în `proprii/` ca formă umplută în stilul Open Peeps și se trasează ca ele.

## 6. Cum calculează mg timpii

`plan.mjs` calculează totul; agentul dă cel mult `scene[i].durata` și `stil.ritm`. Orice `mg randeaza` tipărește cronologia ca tabel; agentul o copiază în `jurnal.md`.

1. Durata totală: `durata`, altfel suma scenelor, altfel 30 s pe ponderi.
2. Duratele lipsă: timpul rămas, pe ponderi, cu minimul fiecărui tip.
3. Ritmul:

| Ritm | Desenare | Retragere | Pas între cuvinte | Pas între iconițe |
| --- | --- | --- | --- | --- |
| `calm` | 4,0 s | 1,4 s | 1,3 s | 0,8 s |
| `normal` | 3,4 s | 1,2 s | 1,0 s | 0,6 s |
| `alert` | 2,4 s | 0,9 s | 0,8 s | 0,4 s |

4. Regulile de timp: cardul următor intră la cel puțin ieșirea celui precedent + 0,5 s; iconițele se retrag înainte să se nască rețeaua; desenul de după rețea pornește la cel puțin retragerea rețelei + 1,0 s; desenarea și retragerea încap în fereastra scenei (sau a scenei din `ramane_pana_la`).
5. Atmosfera și finalul: ceața intră la 35% din durată (47% sub 20 s); pe `plin`, fără ceață, stratul desenelor urcă de la început până la pauza finală cu 0,85 px/s (aproximativ 24 px pe 30 s), iar textele stau pe loc; semnătura pornește la `durata - 3,5 s`, se scrie în 2 s și stă întreagă pe ecran în pauza finală (se poate termina cel târziu la `durata - 0,3 s`); ultimele 1,5 s sunt pauza finală, fereastră statică permisă.
6. Timpul de citire (C09): fiecare card stă complet cel puțin 0,8 s + 0,3 s pe cuvânt; fiecare element din `cuvinte`, cel puțin 0,8 s.
7. Spațiul: scara din `marime` și cutia piesei, poziția din `pozitie` și `ajustare`; iconițele se aranjează față de cutia desenului rămas.

Când o regulă nu se poate respecta, `mg` nu mută nimic singur: dă o eroare cu schimbarea de date care o repară (de exemplu „mărește `scene[2].durata` la 5,5 s” sau „scoate `scanteie`”).

## 7. Verificările și erorile

Se aplică toate verificările comune, C01-C17, cu precizările:

- C03 și C04 verifică și semnătura, fie că vine din `date.json`, fie din brand (atunci câmpul erorii e `brand`, iar reparația e în `branduri/<nume>/vizual.md`).
- C04 cu plafoanele brute de caractere (`verificari_partiale`): titlu 22, etichetă 24, cuvânt 16, îndemn 28, semnătură 2 rânduri de 42. În plus, fiecare rând de pe card (etichetă, rând de titlu, cuvânt, îndemn), măsurat cu fontkit în fontul rezolvat, încape în lățimea cardului (888 px) minus marja de 4%, adică 852 px; altfel `rand-prea-lat` spune rândul și cu câți pixeli (cam câte caractere) trebuie scurtat. Rândurile nu se rup automat: textul se scurtează în `date.json`.
- C06 include jetonul `linie` (cel puțin 3:1).
- C07 verifică doar activele din `active/` (desene și iconițe) pe care le folosește planul de acum; un activ rămas de la o variantă veche a datelor nu oprește randarea.
- C12: niciun gol de peste 1 s cu sub 0,3% din pixeli diferiți de fundal, iar primul conținut apare până la 0,6 s. Primul conținut înseamnă orice desen vizibil, nu o anumită suprafață.
- C13: fiecare text (titlu, fiecare cuvânt din `cuvinte`, etichetă, îndemn, semnătură) se măsoară în caseta lui reală de pe ecran, la momentul lui, între 1% și 50% din pixeli diferiți de fundal (un titlu scurt și lat, ca „MM”, ocupă singur peste 40%). Peste 50%, caseta e plină de ceață: `stil.atmosfera` pe `plin` sau mai mult contrast între text și fundal; desenul nu intră în casete (S08). Casetele vin din CSS-ul lui `sablon.html` (`casete.mjs`), aceeași sursă ca stilul, nu dintr-o bandă fixă.
- C14 exceptează pauza finală. Pe `plin`, unde nu e ceață, urcarea lentă a desenelor (0,85 px/s) ține imaginea în mișcare.
- C10 include aserțiunile de mișcare din `build/index.motion.json` (scris de `mg` din cronologie): primul text al fiecărei scene apare în prima secundă, ultimul la momentul complet, scenele intră în ordine, textele rămân în cadru și imaginea nu stă pe loc mai mult de 2 s (pauza finală are 1,5 s).
- C15 cu muzică: o singură pistă AAC, la durata videoului, cu media peste −35 dB, vârful cel mult −0,5 dB și finalul stins; sugestiile trimit la `muzica.volum` și `muzica.fisier`. Fără muzică, MP4-ul nu are pistă audio.
- C16 scrie foaia rundei, `cadre/foaie-N.jpg` și `cadre/foaie-N.json`, cu același N pe care garda îl dă verdictului din `cadre/revizie-N.md`. Schița are foile ei, `cadre/foaie-schita-N.jpg`, cu verdictele în `cadre/revizie-schita-N.md`.
- C17 caută fiecare text, inclusiv semnătura din brand, ca text static în `build/index.html`.

`verificare.json` al randării complete e verde doar dacă toate rezultatele trec și fiecare dintre cele 29 de coduri din `verificari` (frontmatter-ul de sus) are un rezultat; un cod nerulat (de exemplu C12-C16 când C11 pică) apare în rezultatul comenzii, la `verificari_lipsa`. Predarea (linia „Predare:”) trece doar cu acest `verificare.json` verde, cu `date.json` și MP4-ul neschimbate de la verificare și cu `cadre/predare-1.png` și `cadre/predare-2.png` prezente. Verdictele revizorului nu intră în decizia hook-ului, ca plafonul de runde să nu blocheze predarea (P1); revizorul vine totuși înaintea predării: după o randare completă verde, întâi `revizor-cadre` pe foaia rundei (`FLUX.md`, pasul 7), apoi predarea.

| ID | Prag | Câmpul care repară |
| --- | --- | --- |
| S01 | 2-8 scene, cel mult `floor(durata / 3,5)`; scena 2,5-12 s și cel puțin minimul tipului (suma față de `durata`, ± 0,1 s, o raportează C09, cu `durata-in-afara-limitelor`) | `scene`, `scene[i].durata`, `durata` |
| S02 | `ramane_pana_la` după scena curentă, doar peste scene `adunare` sau `card` | `scene[i].desen.ramane_pana_la` |
| S03 | cardul următor la cel puțin ieșire + 0,5 s | `scene[i].durata`, `stil.ritm` |
| S04 | iconițele retrase înainte de rețea | `scene[i].durata`, `iconite` |
| S05 | desenul la cel puțin retragerea rețelei + 1,0 s | `scene[i].durata` |
| S06 | desenarea și retragerea încap în scenă | `scene[i].durata`, `stil.ritm` |
| S07 | semnătura se termină la cel mult `durata - 0,3 s` | `scene[ultima].durata`, `semnatura` |
| S08 | desenul în cadru cu marjă de 24 px, în afara zonei de text, deasupra lui y 1594 | `marime`, `pozitie`, `ajustare` |
| S09 | două desene simultane se suprapun cel mult 10%; cel mult 6 iconițe vizibile | `ramane_pana_la`, `iconite`, `marime` |
| S10 | piesele există, o singură familie mare, panourile pe `noapte`, iconițele în Lucide 1.49.0 | `scene[i].desen.id`, `scene[i].desen.panou`, `iconite`, `stil.tema` |
| S11 | `*...*` doar pe un rând întreg; fără `titlu` și `cuvinte` împreună | `scene[i].titlu`, `scene[i].cuvinte` |
| S12 | avertisment; scena intră în lista revizorului | `scene[i].desen.ajustare` |

Fiecare eroare are `{cod, camp, mesaj, sugestie}`; sugestia e mereu o schimbare în `date.json` (sau, pentru brand, în fișa brandului). Codurile exacte sunt în `docs/interfete/erori.md`.

### Erorile și reparațiile lor

Aici trimit sugestiile care nu pot numi un câmp anume („vezi în SABLON.md al șablonului rubrica erorilor”): o sugestie a lui C12, C13 sau C14 numește doar câmpuri care există în `date.json` sau pe care schema le permite, iar când nu are ce numi, reparația e una dintre cele de mai jos.

| Eroarea | Câmpul | Ce schimbi în `date.json` |
| --- | --- | --- |
| `cadre-goale` (C12), gol de peste 1 s | `scene[i]` | golul vine dintr-o scenă fără desen sau dintr-o pauză lungă între desene: pune un `desen` în scenă (sau o scenă `adunare`), mută desenul de dinainte cu `desen.ramane_pana_la` peste scena goală sau scurtează `scene[i].durata`; un `stil.ritm` mai rapid scurtează și el pauzele |
| `cadre-goale` (C12), primul conținut după 0,6 s | `scene[0]` | prima scenă începe cu un desen (`tip: "desen"` și `desen`), nu cu o rețea sau un card |
| `text-invizibil` (C13) | `scene[i]` | sub 1%: mai mult contrast între `stil.culori.text` și `stil.culori.fundal` sau o `scene[i].durata` mai mare, ca textul să apară complet; peste 50%: `stil.atmosfera: "plin"` (fără ceață în spatele textului) sau mai mult contrast; cu brand, culorile se schimbă în fișa brandului |
| `video-inghetat` (C14) | `scene[i]` | o scenă în care nu se mișcă nimic peste prag: o scenă mai scurtă (`scene[i].durata`), un desen care rămâne și se mișcă (`desen.ramane_pana_la`) sau o scenă `adunare` între două carduri; pe `ceata`, ceața ține imaginea în mișcare, pe `plin` o ține urcarea desenelor |
| `resursa-lipsa` (C07) | `muzica.fisier` | piesa nu e în proiect: copiaz-o în `video/<proiect>/resurse/` și scrie calea ei în `muzica.fisier` (de exemplu `resurse/piesa.mp3`) |
| `valoare-invalida` (C07) | `muzica.fisier` | piesa nu e în `resurse/`, are alt format decât `.mp3`, `.wav`, `.m4a`, `.aac`, are peste 50 MB sau nu se poate citi: exportă-o din nou ca MP3 și pune-o în `resurse/` |
| `valoare-invalida` (C07) | `muzica.incepe_de_la` | punctul de start e prea aproape de finalul piesei (trebuie să rămână cel puțin 5 s): alege un `muzica.incepe_de_la` mai mic |
| `valoare-invalida` (C02) | `muzica.volum` | volumul e între 0,1 și 1 |
| avertisment `valoare-invalida` (C07) | `muzica.fisier` | piesa se termină înaintea videoului; `mg` completează cu liniște după fade-out. Alege o piesă mai lungă sau un `muzica.incepe_de_la` mai mic, dacă vrei muzică până la final |
| `audio-invalid` (C15) | `muzica.volum` | muzica e prea încet (media sub −35 dB): mărește `muzica.volum` (cel mult 1) sau mută `muzica.incepe_de_la` într-un loc mai tare al piesei; prea tare (vârful peste −0,5 dB): micșorează `muzica.volum` cu 0,1 |
| `audio-invalid` (C15) | `muzica.fisier` | pista lipsește, are altă durată sau finalul nu e stins: randează din nou; dacă rămâne, mută `muzica.incepe_de_la` sau înlocuiește piesa din `muzica.fisier` |
| `check-esuat` (C10) cu `motion/...` | `build` | o aserțiune de mișcare a picat (`motion_appears_late`, `motion_off_frame`, `motion_frozen`, `motion_selector_missing` sau alta): selectorii și momentele vin din șablon, nu din date, deci e o problemă a șablonului. Nu schimba datele ca s-o ocolești: copiază mesajul din ieșirea comenzii în `video/<proiect>/cerere-sablon.md` pentru Dănuț |

## 8. Ce verifică revizorul

Peste lista comună din `.claude/agents/revizor-cadre.md`:

- Fiecare scenă din `scenariu.md` se recunoaște în celula ei: personajul și acțiunea se văd în desen, iar iconițele au legătură cu textul.
- Povestea (problemă, transformare, rezultat) se înțelege fără sunet, doar din cadre.
- Nu rămân urme după retrageri: puncte, fragmente de linie, iconițe pe jumătate.
- Desenele au mărimea potrivită și se citesc, inclusiv în primele secunde ale desenării.
- Formele recolorate arată bine pe fundal: fără zone invizibile, fără culori care se bat cu tema, fără efect de negativ.
- Scenele cu `ajustare` (avertismentele din `verificare.json`) se privesc cu atenție în plus.

Foaia de contact a randării complete (`cadre/foaie-N.jpg`) are momentul `complet` al fiecărei scene, cadre la tranziții și ultimul cadru; foaia schiței (`cadre/foaie-schita-N.jpg`) are mijlocul fiecărei scene. Exemplu de propunere: `scene[3].desen.marime`: „mediu” în loc de „mare”.

## 9. Ce scrie agentul și ce nu

Agentul scrie doar `date.json`, `scenariu.md` (în afara blocului „Ce apare pe ecran”), `jurnal.md` și `cerere-sablon.md`. Nu scrie `build/`, `cadre/`, `active/`, `verificare.json`, `motor.lock`, MP4-uri și nimic din `motoare/`, `nucleu/`, `biblioteci/`. Când e tentat să iasă din date, urcă treptele, fiecare fiind o modificare de date:

1. Desenul nu stă bine: `marime`, `pozitie`, `oglindit`; apoi `desen.ajustare`.
2. Timpii nu plac: `scene[i].durata` și `stil.ritm`. Timpii interni nu se editează; cronologia tipărită îi arată.
3. Lipsește un desen: `mg desen cauta` și `mg desen arata`; apoi un SVG propriu cu `mg desen adauga`; altfel o scenă `adunare` cu o singură iconiță Lucide, la mărimea fixă a iconițelor, nu cât un desen (`mg genereaza` e încă indisponibilă). Agentul nu inventează un desen.
4. O mecanică pe care șablonul nu o are (grafic cu numere, morf, voce, alt format): o frază despre limită, varianta cea mai apropiată în date sau alt tip de video, și `video/<proiect>/cerere-sablon.md` pentru Dănuț.

### Corectura după predare

Când cursantul cere o schimbare după ce a primit filmul, agentul urmează pasul 9 din `FLUX.md` (`mg corectura`). Cererile obișnuite și câmpul lor:

| Ce spune cursantul | Ce schimbă agentul |
| --- | --- |
| „scena e prea grăbită”, „încetinește-o” | `scene[i].durata` a scenei numite, cu cel puțin 1 s (și `durata` filmului, dacă e dată), sau `stil.ritm: "calm"` |
| „desenul e prea mic”, „mai mare” | `scene[i].desen.marime` (`mic`, `mediu`, `mare`) |
| „desenul în altă parte” | `scene[i].desen.pozitie`, `oglindit` |
| „alt desen” | `scene[i].desen.id`, ales cu `mg desen cauta` și arătat cu `mg desen arata` |
| „alte culori”, „mai luminos” | `stil.tema` (`curat` e cea luminoasă) sau `stil.culori` |
| „fără ceață”, „mai curat” | `stil.atmosfera: "plin"` |
| „alt text pe card” | câmpul de text; cere o aprobare nouă |
| „textul mai mare”, „titlul se pierde” | `scene[i].marime` a scenei numite, cu o treaptă mai sus (`M` → `L` → `XL`); la `rand-nu-incape`, rânduri mai scurte în `scene[i].titlu` sau treapta de dinainte |

Doar titlul crește; eticheta, cuvintele, îndemnul și semnătura rămân la mărimea lor. Peste `XL` nu se poate: agentul spune limita și dă variantele din `mg corectura --propuneri`.

## 10. Comenzi

Toate sunt `node nucleu/mg.mjs <subcomandă>`:

- `nou <proiect> --sablon reel-ilustrat [--brand <nume>]`: copiază `exemple/minim.json` și scrie `scenariu.md` cu o secțiune pe scenă.
- `nou <proiect-nou> --din <proiect>`: proiect nou din datele și resursele unuia vechi, validate pe schema de acum, fără aprobare; cel vechi rămâne neatins. Se folosește când `mg randeaza` refuză un proiect făcut pe altă versiune a motorului sau a schemei (`proiect-alta-versiune`).
- `desen lista | cauta | arata | verifica | adauga`: alegerea și verificarea desenelor; `desen arata` scrie o foaie cu piesele recolorate pe tema proiectului, de arătat cursantului înainte să aleagă.
- `randeaza <proiect> --doar-verificare`: validarea, stilul, planul, cronologia (tipărită), build-ul, `hyperframes check` și blocul „Ce apare pe ecran”. Fără MP4.
- `randeaza <proiect> --schita`: în plus, `check` la tranziții și instantaneele din `cadre/schita-N/`, cu foaia `cadre/foaie-schita-N.jpg`. Fără MP4; merge înainte de aprobare.
- `randeaza <proiect>`: cere aprobarea validă, randează (`--quality looks --fps 30 --strict`, o singură reluare cu `--low-memory-mode`), apoi C11 pe fișierul nou, înainte să înlocuiască filmul vechi (un MP4 stricat nu-l atinge), C12-C16, `cadre/predare-N.png` (2-3 cadre), `cadre/foaie-N.jpg` și `verificare.json`, plus câte runde de revizie s-au folosit.

Orice mod refuză întâi un proiect făcut pe altă versiune a motorului sau a schemei. Dacă `mg` e oprit în timpul unei comenzi, procesele ffmpeg și hyperframes pornite de el se opresc odată cu el.

Nu se folosesc la acest șablon: transcrierea, `--filmare`, `hyperframes beats`, `preview`, `publish`, `upgrade`, `telemetry`, `feedback`, `add`, `catalog`.

## 11. Capcane și abateri deliberate de la referință

Abateri deliberate de la `motoare/hyperframes/referinta/` (nu se „repară” după referință):

- **Retragerea e tranziția.** `motoare/hyperframes/referinta/hyperframes/references/frame-worker-core.md` interzice animațiile de ieșire în afara cadrului final („Only EXITS are banned”), pentru că acolo fiecare cadru e o sub-compoziție, iar tranziția dintre ele e ieșirea. Reelul are o singură compoziție, fără tranziții injectate: desenul care se retrage, iconițele care se strâng și rețeaua care se stinge sunt chiar mișcarea stilului.
- **Fluxul skillului `hyperframes`** (interviul de intenție, propunerile, storyboard-ul, subagenții pe cadre) nu se folosește: procesul e `FLUX.md`, iar compoziția o scrie `mg`, nu agentul.
- **Randarea** din `motoare/hyperframes/referinta/hyperframes-cli/references/preview-render.md` (`npx hyperframes render`) trece aici numai prin `mg randeaza`, cu binarul fixat în `VERSIUNI.json` și mediul fixat; calitatea e `looks` și 30 de cadre pe secundă.
- **`--strict`, nu `--strict-all`**, la randare; avertismentele lui `check` (vezi `motoare/hyperframes/referinta/hyperframes-cli/references/lint-validate-inspect.md`) nu opresc randarea și nu intră în `verificare.json`, deci nici la revizor: C10 ține doar erorile. Numărul lor apare doar la `--schita`, în ieșirea comenzii și în `cadre/schita-N/check.json`.
- **`media-use`** (subtitrări, voce) nu se folosește; muzica intră doar prin câmpul `muzica`, transcodată de `mg`, nu prin skill.
- **Fonturile** se declară cu nume proprii („MG ...”) și subseturi latin și latin-ext, pentru că fonturile împachetate de HyperFrames nu au ă, ș, ț.

Capcane cunoscute ale runtime-ului (le tratează `mg` și runtime-ul; dacă apar în foaie, sunt defect de șablon, de scris în `cerere-sablon.md`, nu de reparat în date):

- Un element afișat doar o vreme trebuie ascuns după ieșire, altfel `check` raportează texte suprapuse.
- Liniile retrase trebuie și ascunse, altfel rămân puncte (capete rotunde de lungime zero).
- Grosimea liniei se compensează cu scara desenului; un contur care nu se scalează strică desenarea.
- Lungimile se măsoară o singură dată, la construire (la forme, normalizate cu `pathLength`), niciodată în `onUpdate`, iar compoziția nu folosește valori aleatoare sau ceasul, ca randarea să fie deterministă.

## 12. Exemple și referințe

- `exemple/minim.json`: baza pentru `mg nou` (3 scene: desen, rețea, final).
- `exemple/02-programari-25s.json`: exemplul complet, 25 s (scenele `desen`, `adunare`, `retea`, `desen`, `final`; fără `card`).
- `exemple/01-rutina-preluata.json`: exemplul complet de 30 s, pe tema `noapte`, cu trei desene (`od-running`, `od-strolling`, `od-chilling`); e și testul de acceptare.
- `schema.json` și `implicite.json`: forma datelor și valorile fixe.
- Referințe HyperFrames, citite doar pentru întrebarea numită aici: `motoare/hyperframes/referinta/hyperframes-cli/references/preview-render.md` (opțiunile de randare), `motoare/hyperframes/referinta/hyperframes-cli/references/lint-validate-inspect.md` (ce raportează `check`), `motoare/hyperframes/referinta/hyperframes-cli/references/doctor-browser.md` (Chrome pentru randare), `motoare/hyperframes/referinta/hyperframes/references/frame-worker-core.md` (regula ieșirilor, rubrica 11). Licența și proveniența: `motoare/hyperframes/referinta/NOTICE`.
