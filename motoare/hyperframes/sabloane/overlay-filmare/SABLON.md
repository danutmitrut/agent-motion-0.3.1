---
nume: overlay-filmare
motor: hyperframes
versiune_schema: 1
intrare: filmare
formate: [vertical, orizontal]
teme: [noapte, hartie, curat]
durata: { min: 5, max: 90, implicita: 30 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C16, C17, S01, S02, S03, S04, S05, S06, S09, S10]
stadii: { S09: mp4, S10: mp4 }
---

# Șablonul overlay-filmare

Subtitrări sincronizate și 0-12 elemente grafice ancorate de frazele rostite, peste filmarea cursantului: vertical 1080x1920 sau orizontal 1920x1080, de 5-90 s, la fps-ul copiei de lucru (25 sau 30). Agentul scrie doar `date.json`; forma lui e în `schema.json`, valorile fixe în `implicite.json`, iar regulile de dincolo de schemă în `reguli.mjs` (`valideaza`).

## 1. Ce face

Ia filmarea cursantului (o singură persoană, un singur cadru continuu), o transcrie local, cu timpi pe cuvânt, și pune peste ea subtitrări și câteva elemente: `titlu`, `nume` (numele și rolul, jos în stânga), `cifra`, `citat`, `lista` și `final`. Imaginea și sunetul rămân neatinse, cel mult tăiate la capete (`filmare.start`, `filmare.sfarsit`). `mg nou` face copia de lucru și transcrierea; `mg randeaza` grupează subtitrările cu fontul real, calculează momentul fiecărui element din fraza la care e ancorat, scrie planul (`build/plan.json`), cronologia (`build/cronologie.json`) și compoziția HyperFrames, apoi verifică și randează. Transcrierea se repară numai prin `corecturi`. Șablonul nu are muzică, siglă, desene, tăieturi interne, zoom-uri sau B-roll. Agentul nu scrie cod.

## 2. Când se alege

Când sunt adevărate toate condițiile:

1. Cererea vine cu un fișier video (`.mp4`, `.mov`, `.m4v`, `.webm`) sau pomenește „filmarea mea”, „clipul meu”, „m-am filmat”, „video-ul meu”.
2. În filmare vorbește o singură persoană, într-un cadru continuu. După `mg nou`, agentul se uită pe `cadre/verificare-1fps.jpg` (un cadru pe secundă) și confirmă că e un singur vorbitor, fără tăieturi de cadru și fără subtitrări arse în imagine.
3. Cursantul vrea ceva pus peste filmare: „subtitrări”, „subtitrează”, „pune text sau titluri peste”, „lower third”, „nume și rol jos”, „cifre pe ecran”, „citat”, „îndemn la final”.
4. Filmarea rămâne cum e, cel mult tăiată la capete.

Doar subtitrări înseamnă tot acest șablon, cu `"elemente": []`. Anunțul, într-o frază: „Pun subtitrări și trei elemente peste filmarea ta, cu șablonul overlay-filmare (HyperFrames).”

| Situația | Ce faci |
| --- | --- |
| Nu există filmare | `reel-ilustrat` (desene) sau `text-animat` (doar text) |
| Tăieturi interne, scoaterea pauzelor, zoom-uri, B-roll, muzică, reordonare | o frază că șablonul nu le are, varianta cea mai apropiată în date, apoi `video/<proiect>/cerere-sablon.md` pentru Dănuț |
| Mai mulți vorbitori sau tăieturi de cadru (pe `cadre/verificare-1fps.jpg`) | ceri o bucată continuă, cu un singur vorbitor |
| Subtitrări deja arse în imagine | refuzi, cu explicația: subtitrările noi s-ar suprapune peste cele vechi |
| Doar fișierul `.srt`, fără video | nu se livrează separat în v1 |
| Text „în spatele” vorbitorului | nu există în v1 |
| Format pătrat | o frază despre limită și propunerea formatului vertical |
| Filmare HDR (iPhone cu HLG sau Dolby Vision) | `mg nou` refuză cu `filmare-hdr` și instrucțiunea de reexport în SDR |
| Filmare sub 5 s, peste 90 s sau fără sunet | `mg nou` refuză (`filmare-durata`, `filmare-fara-audio`); peste 90 s, cursantul taie bucata înainte |

### Ghidul de filmare

Agentul i-l explică cursantului înainte să filmeze:

- telefonul pe verticală pentru Reels, TikTok și Shorts, pe orizontală pentru YouTube; formatul videoului urmează orientarea filmării;
- lumina din față (o fereastră în fața ta, nu în spate);
- telefonul la 30-50 cm, ca vocea să fie aproape de microfon; fără muzică sau televizor pe fundal;
- o singură bucată continuă, de cel mult 90 s (ideal 20-60 s), cu o secundă de liniște la început și la sfârșit;
- fața în treimea de sus a cadrului, ca subtitrările și cardurile să nu o acopere;
- fără HDR: pe iPhone, „Video HDR” oprit în setările camerei, la înregistrarea video.

## 3. Câmpurile din date.json

`mg nou` scrie minimul: `sablon` (`"overlay-filmare"`), `versiune_schema` (`1`), `format` (după orientarea filmării) și `filmare.fisier` (`"active/filmare-lucru.mp4"`, fix; agentul nu-l schimbă).

| Câmp | Limite | Ce face |
| --- | --- | --- |
| `limba` | `ro` implicit; `en es fr de bg hr cs da nl et fi el hu it lv lt mt pl pt ro sk sl sv ru uk` | limba verificată de S05; transcrierea s-a făcut deja la `mg nou --limba` |
| `filmare.start` | ≥ 0, implicit 0 | taie începutul; toți timpii din date se măsoară de aici |
| `filmare.sfarsit` | secunde sau `null` (până la capăt); durata rezultată 5-90 s | taie coada |
| `filmare.focus_x` | 0-100, implicit 50 | centrul decupării laterale, când orientarea filmării diferă de format (fața) |
| `brand` | numele unei fișe din `branduri/` | culorile și fontul din fișă |
| `stil` | rubrica 4 | tema, culorile, fontul, ritmul |
| `subtitrari.activ` | implicit `true` | subtitrări verbatim, după corecturi |
| `subtitrari.animatie` | `cuvant-activ` (implicit) sau `grup` | cuvântul rostit în accent sau grupul întreg; la o transcriere importată, mereu `grup` |
| `subtitrari.pozitie` | `jos` (implicit), `mijloc` sau `jos-de-tot` | banda subtitrărilor; `jos-de-tot` e lipită de limita interfeței Reels, pentru o filmare cu fața jos în cadru |
| `subtitrari.marime` | `S`, `M` (implicit), `L`: vertical 52 / 64 / 76 px, orizontal 42 / 48 / 56 px | mărimea de pornire; `mg` coboară în pași de 2 px până la 42 px, până când grupul încape în 2 rânduri |
| `subtitrari.cuvinte_max` | 2-6; implicit după ritm (5 / 4 / 3) | cuvinte pe grup |
| `subtitrari.evidentiaza` | cel mult 12 expresii, fiecare 1-3 cuvinte și cel mult 30 de caractere, găsite în transcrierea corectată | scrise în accent, nerupte între grupuri; numerele se evidențiază singure |
| `subtitrari.majuscule` | implicit `false` | subtitrări cu majuscule |
| `corecturi[]` | cel mult 60; `{cuvinte, din, in}` | rubrica 6, „Corecturile” |
| `elemente[]` | 0-12 și cel mult ceil(durata / 3); `citat`, `lista`, `nume` cel mult 2; `final` cel mult 1 | grafica peste filmare |

Fiecare element are `tip`, opțional `id` (`^[a-z0-9-]{1,24}$`, unic, implicit `e1`, `e2`… după poziție; e numele elementului în scenariu, în foaia de contact și în verdict, de exemplu „cifra-ore, complet”), exact unul dintre `la` (secunda de intrare) și `ancora` (`{ fraza, aparitia }`), și opțional `durata`. La `final`, amândouă pot lipsi.

| `tip` | Câmpuri | Limite | Durata (implicit) |
| --- | --- | --- | --- |
| `titlu` | `eticheta`, `titlu` | `eticheta` cel mult 24; `titlu` 1-2 rânduri, fiecare cel mult 42 | 1,5-5 s (2,5) |
| `nume` | `nume`, `rol` | `nume` cel mult 28; `rol` cel mult 40 | 2-5 s (3,5) |
| `cifra` | `valoare`, `prefix`, `sufix`, `zecimale`, `text` | `prefix` cel mult 4; `sufix` cel mult 8; `zecimale` 0-2; `text` cel mult 40 | 1,5-5 s (2,5) |
| `citat` | `text`, `autor` | `text` cel mult 120, fără ghilimele (le pune șablonul); `autor` cel mult 40 | 2,5-8 s (4) |
| `lista` | `titlu`, `puncte` | `titlu` un rând de cel mult 28; 2-4 puncte `{ text, ancora }`, `text` cel mult 32 | 3-8 s (ultimul punct + 1,5 s) |
| `final` | `cta`, `detaliu` | `cta` cel mult 48; `detaliu` cel mult 40 | 2-6 s (ultimele 3 s) |

## 4. Dicționarul de stil

`stil` are: `descriere` (cuvintele cursantului, cel mult 300 de caractere), `tema` (`noapte` implicit, `hartie`, `curat`), `culori` (`fundal`, `text`, `accent`, în hex; `fundal` e al cardurilor și al subtitrărilor, nu al filmării), `opacitate_fundal` (0,45-1; implicit 0,78 la `noapte`, 0,86 la `hartie`, 0,72 la `curat`), `font_titlu` (`fraunces`, `instrument-sans`, `inter`, `montserrat`, `playfair-display`) și `ritm` (`calm`, `normal`, `alert`). Fontul textului mic, culoarea atenuată și eticheta vin din temă. Ordinea: implicite < temă < brand < date. Cu brand, `stil.tema`, `stil.culori` și `stil.font_titlu` dau `stil-contrazice-brand`; `ritm`, `opacitate_fundal` și subtitrările rămân libere.

| Ce spune cursantul | Câmpuri |
| --- | --- |
| „minimalist, curat, profesionist” | `tema: "curat"`, `ritm: "calm"`, `subtitrari.animatie: "grup"` |
| „energic, TikTok, dinamic” | `tema: "curat"`, `ritm: "alert"`, `subtitrari.majuscule: true`, `subtitrari.animatie: "cuvant-activ"`, `subtitrari.marime: "L"` |
| „elegant, editorial, premium” | `tema: "hartie"` (Fraunces pe titluri), `ritm: "calm"` |
| „modern, tech” | `tema: "curat"`, `font_titlu: "montserrat"` |
| „jucăuș, scris de mână” | o frază că fontul scris de mână nu există în v1, apoi `tema: "curat"`, `font_titlu: "instrument-sans"` |
| o culoare numită („violet cald”, „verdele meu”) | `stil.culori.accent` în hex; `mg` verifică contrastul (C06) |
| „nu se citește” (de la revizor) | întâi `stil.opacitate_fundal` mai mare, apoi `subtitrari.pozitie` |

Agentul notează traducerea în `jurnal.md`.

## 5. Elementele și ce se vede

Fiecare tip stă în banda lui, fixă în cod: `titlu` și `cifra` sus, `nume` jos în stânga, `citat`, `lista` și `final` în centru. Fiecare element e un card cu fundalul `stil.culori.fundal` la `stil.opacitate_fundal`.

- `titlu`: eticheta (cu majusculele temei), apoi rândurile titlului, câte unul pe rând.
- `nume`: numele și rolul, în colțul din stânga-jos al benzii de nume.
- `cifra`: valoarea numără de la 0 în 0,8 s, cu formatare românească (1.250.000; 3,5), apoi textul.
- `citat`: textul între „ și ”, puse de șablon, apoi autorul; centrat.
- `lista`: titlul, apoi fiecare punct exact când e rostit; punctele rămân până iese lista.
- `final`: îndemnul și detaliul, centrate; nu iese, se termină odată cu videoul.

Cardul intră de la 16 px mai jos, în durata de intrare a ritmului (0,5 / 0,35 / 0,2 s); rândurile intră după el, la 0,08 s unul de altul; elementul iese în 0,25 s. Subtitrările stau într-o pastilă cu aceeași culoare de fundal, cel mult 2 rânduri, centrată în banda ei; la `cuvant-activ`, cuvântul rostit se colorează în accent.

Mărimile: fiecare text are mărimea rolului (de exemplu titlul 84 px, cel puțin 60; cifra 180 px, cel puțin 120; citatul 58 px, cel puțin 44; pe orizontal, toate × 0,75) și coboară în pași de 2 px până încape în lățimea benzii; sub minim nu se micșorează pe ascuns: e `rand-nu-incape`.

Benzile pe vertical (în pixeli): sus y 220-560, centru y 700-1150, nume y 1060-1220 la stânga, subtitrări jos y 1240-1540, mijloc y 900-1150 sau jos-de-tot y 1384-1590 (cu `marime` `L`, grupul are cel mult 2 rânduri și încape); nimic sub y 1594 (interfața Reels) și nimic în banda liberă y 560-700, păstrată pentru S10. Pe orizontal, benzile stau în zona sigură de 10% (x 192-1728, y 108-972), cu banda liberă y 308-368. Pe orizontal nu există `jos-de-tot`: `jos` stă deja la marginea de jos a zonei sigure (decizia 9 din planul H).

## 6. Cum calculează mg timpii

`plan.mjs` calculează totul; toți timpii sunt pe videoul final (0 = `filmare.start`). Orice `mg randeaza` tipărește cronologia ca tabel; agentul o copiază în `jurnal.md`.

1. **Ancora.** `ancora.fraza` are 1-6 cuvinte, scrise cum se aud; căutarea ignoră diacriticele, majusculele și punctuația. Cratima nu e însă un spațiu: un cuvânt cu cratimă din transcriere (`e-mailuri`, `într-o`) se scrie cu cratimă în `fraza`, pentru că „e mailuri” are două cuvinte și nu se potrivește cu „e-mailuri”. Elementul intră cu avansul ritmului (0,25 / 0,15 / 0,1 s) înaintea primului cuvânt al frazei, la a N-a apariție (`aparitia`, implicit 1). Punctele unei liste se caută în ordine, fiecare după precedentul.
2. **`la`.** Secunda de intrare, pe videoul final.
3. **Durata.** `durata` din date se respectă. Fără ea, durata e cea implicită a tipului sau timpul de citire, dacă e mai mare (0,8 s + 0,3 s pe cuvânt), cel mult maximul tipului. `lista` ține până la ultimul punct + 1,5 s (cel mult 8 s); `final` pornește implicit cu 3 s înainte de sfârșit și se termină odată cu videoul. O `durata` mai scurtă decât timpul de citire dă `prea-repede-de-citit`.
4. **Benzile.** Două elemente din aceeași bandă, sau din benzi care se ating (banda de nume atinge centrul și banda de mijloc a subtitrărilor), au între ele cel puțin 0,3 s. Cel mult un element în centru. Cel mult două blocuri de text pe ecran deodată, subtitrările incluse: un `titlu` și un `nume` stau împreună doar cât subtitrările sunt suspendate sau oprite.
5. **Suspendarea.** Subtitrările dispar cât stă pe ecran un element din centru sau unul a cărui bandă atinge banda subtitrărilor; cuvintele rostite atunci nu apar.
6. **Grupurile de subtitrare.** Un grup se rupe la `cuvinte_max`, la o pauză de cel puțin 0,5 s, la `.`, `?`, `!` și la virgulă urmată de o pauză de cel puțin 0,25 s. Un număr nu se rupe de unitatea lui, iar o expresie din `evidentiaza` sau o corectură pe interval nu se rup. Fiecare grup stă cel puțin 0,5 s, apare cu cel mult 80 ms înaintea primului cuvânt și dispare după ultimul; două grupuri nu sunt niciodată pe ecran deodată. Umpluturile (ă, ăă, îî, mm, hm, ee) nu apar niciodată.

Când o regulă nu se poate respecta, `mg` nu mută nimic singur: dă o eroare cu câmpul care o repară.

### Corecturile

Transcrierea (`active/transcriere.json`) are câte o intrare pe cuvânt, cu id-ul lui (`w0`, `w1`…). Agentul o citește ca să afle id-urile, dar n-o modifică niciodată: garda blochează scrierea în `active/`. O corectură numește cuvintele (`"w21"` sau `"w21-w22"`, cel mult 4), textul lor de acum (`din`, verificat de `mg`; majusculele și punctuația nu contează) și textul nou (`in`, cel mult 40 de caractere):

```json
{ "cuvinte": "w21-w22", "din": "cloud cod", "in": "Claude Code" }
```

Un interval devine un singur cuvânt, cu începutul primului și sfârșitul ultimului; `"in": ""` ascunde cuvântul. Timpii nu se schimbă niciodată. Agentul corectează numele proprii, termenii tehnici și cifrele auzite greșit, nu stilul vorbitorului. O corectură schimbă blocul „Ce apare pe ecran”, deci cere o aprobare nouă.

## 7. Verificările și erorile

Se aplică verificările comune C01-C14, C16 și C17, cu precizările:

- C05 acoperă și subtitrările: fiecare caracter din transcrierea corectată trebuie să existe în fontul titlului (`glifa-lipsa`; repari cu `corecturi` sau `stil.font_titlu`).
- C09 caută suprapunerea doar în aceeași bandă; regula celor două blocuri o verifică S04.
- C10 rulează `hyperframes check` cu banda subtitrărilor (`--caption-zone`), `--frame-check` și `--strict`: orice avertisment al motorului pică.
- C12, C13 și C14 compară MP4-ul cu filmarea, decupată la fel: un cadru gol sau înghețat care există și în filmare nu e eroare; C13 cere ca în caseta fiecărui text cel puțin 1% din pixeli să difere de filmare.
- C15 nu se aplică (nu există muzică); sunetul îl verifică S09.
- C16: foaia de contact are, pe lângă momentele elementelor, un cadru la fiecare 3 s, iar `cadre/foaie-N.json` are lângă fiecare cadru cuvintele rostite atunci (`rostit`).

| ID | Prag | Cod | Câmpul care repară |
| --- | --- | --- | --- |
| S01 | filmarea originală și copia de lucru au sha256-ul din `motor.lock` | `overlay-filmare-sursa-schimbata` | nimic în date: proiect nou cu `mg nou --filmare` |
| S02 | fiecare `ancora.fraza` se găsește la a N-a apariție; punctele listei, în ordine, după ancora listei | `overlay-filmare-ancora` | `elemente[i].ancora.fraza`, `aparitia`, `elemente[i].la` |
| S03 | `din` e textul actual al cuvintelor; cel mult 4 cuvinte; intervalele nu se suprapun | `overlay-filmare-corectura` | `corecturi[i].din`, `corecturi[i].cuvinte` |
| S04 | elementul în video și în limitele tipului; benzile și cele două blocuri; numărul elementelor; `final` până la sfârșit | `overlay-filmare-ocupare` | `elemente[i].la`, `ancora`, `durata`; `elemente` |
| S05 | 1,0-5,5 cuvinte pe secundă; cel mult 2% simboluri; cel mult 10% cuvinte sub 0,05 s; niciun cuvânt peste 2,5 s; la `ro`, cel puțin 15% cuvinte uzuale românești | `overlay-filmare-transcriere-slaba` | `limba`, sau proiect nou cu `--limba` ori `--transcriere` |
| S05 | emoji, linii de pauză sau caractere de cod în transcriere (avertisment) | `overlay-filmare-transcriere-text` | `corecturi` |
| S06 | gruparea de la rubrica 6; cel puțin 95% din cuvinte apar în subtitrări, în afara suspendărilor; fiecare grup încape la 42 px | `overlay-filmare-subtitrari`, `overlay-filmare-evidentiaza` | `subtitrari.*`, `corecturi` |
| S09 | pistă AAC, cu durata videoului ± 0,05 s, peste −45 dB și cel mult 1 dB sub copia de lucru | `overlay-filmare-audio` | nimic în date: defect de randare |
| S10 | în banda liberă, la 6 momente, SSIM ≥ 0,95 față de filmarea decupată | `overlay-filmare-filmare-atinsa` | nimic în date: defect de șablon |

Durata (`filmare.start`, `filmare.sfarsit`) în afara intervalului 5-90 s sau a filmării dă `overlay-filmare-durata` (C09). S01-S06 rulează la orice `mg randeaza`, pe date; S09 și S10 doar la randarea completă, pe MP4.

Fiecare eroare are `{cod, camp, mesaj, sugestie}`; sugestia e o schimbare în `date.json`. Codurile exacte sunt în `docs/interfete/erori.md`.

### Erorile și reparațiile lor

| Eroarea | Ce schimbi în `date.json` |
| --- | --- |
| `overlay-filmare-ancora` | mesajul dă cele mai apropiate 3 potriviri și timpii lor: copiază fraza cum apare acolo, schimbă `aparitia` sau treci la `la` |
| `overlay-filmare-corectura` pe `.din` | scrie în `din` cuvintele exact cum sunt în `active/transcriere.json`, nu cum ar trebui să fie |
| `overlay-filmare-id-dublu` (C02) | dă-i elementului din câmp alt id sau scoate-i id-ul; atenție la un id dat care ia numele implicit al altui element (`e2` pe primul element) |
| `overlay-filmare-ocupare` | mută elementul (altă `ancora.fraza` sau `la`), scurtează `durata` sau scoate un element; mesajul numește elementul cu care se ciocnește |
| `prea-repede-de-citit` pe `elemente[i].durata` | mărește `durata` sau scoate-o, ca `mg` s-o calculeze; altfel scurtează textul |
| `rand-nu-incape` (C04) | scurtează textul sau mută o parte în al doilea rând de titlu |
| `overlay-filmare-subtitrari` | un cuvânt prea lung pentru 2 rânduri: o corectură care îl scurtează; acoperire sub 95%: mai puține elemente în centru sau mai scurte |
| `overlay-filmare-evidentiaza` | scrie expresia cum apare în subtitrări (după corecturi) sau scoate-o |
| `overlay-filmare-transcriere-slaba` | limba greșită: proiect nou cu `--limba`; sunet slab sau muzică pe fundal: o filmare nouă sau un `.srt` cu `--transcriere` |
| `text-invizibil` (C13) | `stil.opacitate_fundal` mai mare sau mai mult contrast între `stil.culori.text` și `stil.culori.fundal` |
| `contrast-slab` (C06) | altă `stil.culori.accent` sau `text`; cu brand, în fișa brandului |
| `check-esuat` (C10), `cadre-goale` (C12), `video-inghetat` (C14), S09, S10 | nimic în date: rulează `mg doctor`, notează eroarea în `jurnal.md` și scrie mesajul în `video/<proiect>/cerere-sablon.md` pentru Dănuț |

## 8. Ce verifică revizorul

Peste lista comună din `.claude/agents/revizor-cadre.md`, pe `cadre/foaie-N.jpg` și pe `cadre/foaie-N.json` (cuvintele rostite în jurul fiecărui cadru):

- Fața (ochii și gura) nu e acoperită de niciun element, în niciun cadru; la un vertical decupat dintr-o filmare orizontală, capul nu e tăiat (`filmare.focus_x` sau `subtitrari.pozitie`).
- Fiecare element apare când e rostită ideea lui și nu rămâne după ce vorbitorul a trecut la altă idee (`elemente[i].ancora.fraza`, `durata`).
- Subtitrările și cardurile se citesc pe fundalul real al filmării (fereastră luminoasă, haină albă), chiar dacă contrastul măsurat a trecut (`stil.opacitate_fundal`).
- Subtitrările spun ce se aude: nume proprii, termeni și cifre scrise corect (`corecturi`).
- Stilul se potrivește cu `stil.descriere` și cu brandul, iar tema nu se bate cu filmarea.
- Filmarea arată neatinsă: fără schimbare de culoare și fără proporții întinse.

Verdictul e TRECE sau REPARĂ, cu fiecare schimbare ca modificare de câmp în `date.json` (de exemplu `elemente[2].ancora.fraza`, `stil.opacitate_fundal`, `filmare.focus_x`), niciodată cod.

## 9. Ce scrie agentul și ce nu

Agentul scrie doar `date.json`, `scenariu.md` (în afara blocului „Ce apare pe ecran”), `jurnal.md` și `cerere-sablon.md`. Nu scrie `active/` (copia de lucru, transcrierea, raportul), `resurse/filmare-original.*`, `build/`, `cadre/`, `.cache/`, `verificare.json`, `motor.lock`, MP4-uri și nimic din `motoare/`, `nucleu/`, `biblioteci/`. În plus:

- nu schimbă ce spune vorbitorul: corecturile repară transcrierea, nu reformulează;
- nu inventează cifre, nume, roluri sau citate; ce pune pe ecran se aude în filmare sau vine de la cursant, notat în `jurnal.md`;
- nu instalează transcrierea fără acordul cursantului (`--instaleaza-transcrierea`, ~670 MB);
- nu pune HTML, CSS sau JS în câmpuri;
- când `mg` pică la o verificare care nu numește un câmp din date (`hyperframes check`, randarea, S09, S10), nu repară codul și nu atinge `build/`: rulează `mg doctor`, notează eroarea în `jurnal.md` și îi spune cursantului că e o problemă a șablonului sau a mașinii.

### Corectura după predare

Când cursantul cere o schimbare după ce a primit filmul, agentul urmează pasul 9 din `FLUX.md` (`mg corectura`). Cererile obișnuite și câmpul lor (`corecturi[]` din date e altceva: repară transcrierea):

| Ce spune cursantul | Ce schimbă agentul |
| --- | --- |
| „subtitrările îmi acoperă fața”, „mută-le mai jos” | `subtitrari.pozitie`: de la `mijloc` la `jos`, de la `jos` la `jos-de-tot` (doar pe vertical); dacă tot acoperă, `subtitrari.marime: "S"` |
| „mută-le mai sus” | `subtitrari.pozitie: "mijloc"` |
| „subtitrări mai mari”, „mai mici” | `subtitrari.marime` (`S`, `M`, `L`) |
| „numele (titlul, cifra) să apară mai devreme sau mai târziu” | `elemente[i].la` sau `elemente[i].ancora` (altă frază, mai devreme sau mai târziu) |
| „să stea mai mult pe ecran” | `elemente[i].durata`, în limitele tipului (rubrica 6) |
| „un cuvânt e scris greșit în subtitrări” | `corecturi[]` |
| „alte culori”, „cardurile mai transparente” | `stil.tema`, `stil.culori`, `stil.opacitate_fundal` |

Imaginea și sunetul filmării nu se schimbă (fără tăieturi interne, zoom sau B-roll): la o asemenea cerere, agentul spune limita și dă variantele din `mg corectura --propuneri`.

## 10. Comenzi

Toate sunt `node nucleu/mg.mjs <subcomandă>`:

- `nou <proiect> --sablon overlay-filmare --filmare <cale> [--limba ro] [--transcriere <fișier .srt|.vtt|.json>] [--instaleaza-transcrierea] [--brand <nume>]`: copiază originalul în `resurse/`, verifică filmarea (sunetul, durata, HDR), scrie `cadre/verificare-1fps.jpg`, face copia de lucru, transcrie și scrie `date.json` minim. La prima folosire, transcrierea locală (Parakeet, ~670 MB, gratuită, pe calculatorul cursantului) nu e instalată: `mg nou` se oprește cu `transcriere-neinstalata`, agentul îi explică cursantului descărcarea și, după acordul lui, reia comanda cu `--instaleaza-transcrierea`. Cu `--transcriere`, subtitrările vin din fișierul dat (din CapCut, Descript sau YouTube), pe replică, fără Parakeet.
- `nou <proiect-nou> --din <proiect>`: refolosește filmarea și transcrierea proiectului vechi (corecturile rămân valabile); nu merge cu `--filmare`, `--limba`, `--transcriere` sau `--instaleaza-transcrierea`.
- `randeaza <proiect> --doar-verificare`: validarea, gruparea subtitrărilor, cronologia (tipărită), build-ul, `hyperframes check` și blocul „Ce apare pe ecran” (fiecare text de element, apoi fiecare grup de subtitrare, după corecturi). Fără MP4. Se rulează după fiecare editare a lui `date.json`.
- `randeaza <proiect> --schita`: în plus, instantaneele și foaia de schiță; merge înainte de aprobare.
- `randeaza <proiect>`: cere aprobarea validă, randează, verifică MP4-ul (inclusiv S09 și S10), scrie foaia de contact și `verificare.json`, apoi golește `video/<proiect>/.cache`.

Înainte de randarea completă, agentul îi spune cursantului cât durează: pe Mac, randarea exemplului vertical (`exemple/vertical/`) a durat cam 2 minute, iar timpul crește cu durata filmării; pe un laptop Windows cu 8 GB RAM, fără placă video dedicată, a durat cam 4 minute.

Nu se folosesc la acest șablon: `mg desen`, generarea de imagini, muzica, `hyperframes beats`, `preview`, `publish`, `upgrade`, `telemetry`, `feedback`, `add`, `catalog`, și nici `hyperframes transcribe` pornit direct (îl rulează doar `mg nou`).

## 11. Capcane și abateri deliberate de la referință

- **Transcrierea nu se reface.** Aceeași filmare retranscrisă înseamnă un proiect nou; tăierea capetelor (`filmare.start`, `filmare.sfarsit`) nu cere retranscriere, iar `--din` păstrează transcrierea veche.
- **Importul e pe replică.** Un `.srt` sau `.vtt` are timpi pe frază, nu pe cuvânt: `mg` împarte replica în cuvinte după lungime, iar ancorele cad aproximativ. Subtitrările apar pe grup, fără cuvântul activ.
- **Compoziția o scrie `mg`.** Fluxul skillului `hyperframes` nu se folosește: procesul e `FLUX.md`, iar elementele sunt HTML static, scris din plan; în browser nu se ia nicio decizie de timp.
- **Video mut plus voce separată.** Filmarea intră de două ori, ca `<video muted>` și ca `<audio>`, pe același fișier și cu aceleași timpi; sunetul nu se amestecă și nu se normalizează.
- **Fonturile** se declară cu nume proprii („MG …”) și subseturi latin și latin-ext, pentru că fonturile împachetate de HyperFrames nu au ă, ș, ț.
- **Înghețarea filmării** o prind doar C14 (cadrul întreg, comparat cu sursa) și S10, la randarea completă; C14 are limite: dacă filmarea îngheață, dar subtitrările se schimbă mai des de 2 s, overlay-ul rupe intervalul și C14 nu vede nimic. `index.motion.json` nu are `keepsMoving` la fundalul filmare.
- **Cifrele** se formatează de mână; `toLocaleString` ar scrie 1,250 pe un Windows în engleză.

Dacă în foaie apar texte suprapuse, un card peste față care nu se poate muta din date sau filmarea colorată ori întinsă, e un defect de șablon, de scris în `cerere-sablon.md`, nu de reparat în date.

## 12. Exemple și referințe

- `exemple/minim.json`: baza pentru `mg nou` (doar subtitrări).
- `exemple/vertical/`: filmare sintetică cu vocea Ioana, transcrierea Parakeet și `date.json` cu nume, cifră, listă și final, plus o corectură și o expresie evidențiată.
- `exemple/orizontal/`: filmare sintetică orizontală, cu `transcriere.srt` (calea importului), tema `hartie`, ritmul `calm`, subtitrări la mijloc, titlu, listă și citat.
- `schema.json` și `implicite.json`: forma datelor, benzile și valorile fixe.
