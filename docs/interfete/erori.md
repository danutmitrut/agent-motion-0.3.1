# Codurile de eroare ale lui `mg`

Document de interfață al pasului 0 (spec 12, harta 4.1 și 7). Lista de aici și obiectul `CODURI` din `nucleu/lib/erori.mjs` sunt aceeași listă, scrisă de două ori: testul `teste/unitar/erori.test.mjs` le compară și pică la orice diferență.

## Forma erorii

Orice eroare și orice avertisment al lui `mg` are forma comună (spec 6.12):

```json
{ "cod": "rand-nu-incape", "camp": "scene[0].titlu[1]",
  "mesaj": "Scena 1, rândul 2 nu încape în lățimea cadrului la mărimea minimă.",
  "sugestie": "Scurtează rândul sau mută o parte din el într-un rând nou în scene[0].titlu." }
```

Toate cele patru câmpuri sunt șiruri nevide. `eroare()` și `avertisment()` aruncă `TypeError` la un cod care nu e în listă sau la un câmp gol, deci o eroare cu formă greșită pică încă din teste, nu la cursant.

## Regula pentru `camp`

`camp` e mereu un șir nevid, într-una din patru forme:

| Situația | Forma | Exemplu |
| --- | --- | --- |
| date (`date.json`, cronologie) | calea JSON, cu indici de la 0 | `scene[2].titlu[1]`, `stil.culori.accent`, `cronologie.segmente[0].complet` |
| mediul (`mg doctor`, motorul, ffmpeg) | `mediu.<id>` | `mediu.node`, `mediu.ffprobe`, `mediu.hyperframes` |
| utilizare (argumentele comenzii) | `argumente.<nume>` | `argumente.sablon`, `argumente.proiect` |
| citirea fișierelor (C01) | `fisier:<cale relativă la rădăcina agentului, cu />` | `fisier:video/p/date.json` |

O eroare pe tot documentul de date are `camp` egal cu `$`.

## Regula pentru `mesaj` și `sugestie`

- `mesaj` numește locul pentru oameni, cu numărare de la 1 („Scena 3, rândul 2”), în română cu diacritice.
- `sugestie` e o modificare de date, niciodată de cod. La codurile de mediu și de utilizare, sugestia e o acțiune a cursantului sau o comandă `node nucleu/mg.mjs ...`.
- Fără em dash, en dash, s sau t cu sedilă și emoji (testul `teste/unitar/texte-romana.test.mjs`).

## Niveluri, erori fatale și codurile de ieșire

- `nivel` din tabel e nivelul obișnuit al codului. Același cod poate apărea, la nevoie, și ca avertisment (de exemplu la intrările aduse de cursant, spec 6.3); funcția folosită decide lista: `eroare()` pentru erori, `avertisment()` pentru avertismente.
- O eroare care oprește comanda se aruncă drept `new EroareFatala(eroareMg, codIesire)`; `mg.mjs` o prinde, o tipărește și iese cu `codIesire` (implicit 2).
- Codurile de ieșire (`COD_IESIRE`):

| Nume | Valoare | Când |
| --- | --- | --- |
| OK | 0 | reușită |
| DATE | 1 | erori de date sau verificări picate |
| MEDIU | 2 | eroare de mediu, de motor sau internă |
| UTILIZARE | 3 | utilizare greșită (argumente) |

## Cum se tipăresc

Fără `--json`, `mg` tipărește pe stdout antetul `Erori (N):`, apoi câte o eroare pe linie, ca JSON compact cu cheile în ordinea `cod`, `camp`, `mesaj`, `sugestie`; la fel pentru `Avertismente (N):` (funcția `formateazaPentruOm`). Cu `--json`, o singură ieșire: `{"ok": bool, "comanda": "...", "erori": [], "avertismente": [], "rezultat": {...}}`.

## Codurile proprii ale șabloanelor

Un cod propriu al unui șablon are prefixul numelui șablonului (`reel-ilustrat-persistenta`) și o verificare S a șablonului (S01-S99). Intră în aceeași listă și respectă aceeași regulă de adăugare.

Codurile proprii ale lui `reel-ilustrat` se fixează la pasul 0 (spec 7.1) și sunt deja în listă: câte unul pentru S01-S09, S11 și S12 (S12 e avertisment). S10 nu are cod propriu: folosește codurile comune `desen-*` și `iconita-necunoscuta`, pe care le adaugă planul B, împreună cu `mg desen verifica`.

Codurile proprii ale lui `text-animat` intră la planul G (spec 7.2): câte unul pentru S01, S04, S05, S06, S07 și S09. S02 și S03 folosesc codurile comune `prea-repede-de-citit`, `durata-in-afara-limitelor` și `rand-nu-incape`, cu `verificare` S02, respectiv S03. Accentul în date (peste 2 segmente pe scenă) folosește `text-animat-accent` cu `verificare` C03, ca stratul de date să nu atribuie o eroare unei verificări de stadiu `build`.

Codurile proprii ale lui `date-serie` intră la planul I (spec 7.3): trei coduri pentru S03 (`date-serie-evidentiaza`, `date-serie-bare-zero`, `date-serie-final-nu-e-ultimul`) și câte unul pentru S06 și S07, pe MP4 (`date-serie-durata-mp4`, `date-serie-marime-mp4`). S04 folosește `rand-nu-incape` cu `verificare` S04, S05 folosește `resursa-lipsa` și `valoare-invalida` cu `verificare` S05, iar durata totală a videoului folosește `durata-in-afara-limitelor` cu `verificare` C09.

## Corespondența cod → verificare

Implicit, verificarea unei erori e cea din coloana „Verificare” a tabelului de mai jos. Un șablon poate atribui o eroare cu cod comun uneia dintre verificările lui S, cu opțiunea `verificare`:

```js
eroare('prea-repede-de-citit', 'randuri[0]', mesaj, sugestie, { verificare: 'S02' });
```

Exemplu: `text-animat` raportează la S02 (nu la C09) timpul de citire, cu același cod `prea-repede-de-citit`; tot așa, `date-serie` raportează la S05 sigla lipsă, cu codul comun `resursa-lipsa`. Eroarea întoarsă are atunci și cheia `verificare`; fără opțiune, forma rămâne cea de patru câmpuri. O valoare care nu e C01-C17 sau S01-S99 aruncă `TypeError`. Nucleul citește corespondența prin `verificareaErorii(e)`: câmpul erorii, apoi `CODURI`, apoi `null`.

Codurile proprii ale unui șablon au prefixul numelui lui și se adaugă în `nucleu/lib/erori.mjs` și în acest document, în același commit (adăugare compatibilă). Codurile `desen-*` și `iconita-necunoscuta` merg la S10 doar pentru că reelul declară S10 ca verificarea desenelor; un șablon fără desene nu le emite.

## Regula de adăugare

Un cod nou intră în același commit în `nucleu/lib/erori.mjs` (obiectul `CODURI`) și în tabelul de mai jos, cu același nivel și aceeași verificare. Codul e kebab-case, în română, fără diacritice. Coloana „Verificare” are `-` când codul nu ține de o verificare numerotată.

## Lista codurilor

| Cod | Nivel | Verificare | Descriere |
| --- | --- | --- | --- |
| `camp-necunoscut` | eroare | C02 | Câmp care nu există în schema șablonului. |
| `rand-nu-incape` | eroare | C04 | Rândul depășește plafonul de grafeme sau lățimea zonei la mărimea minimă. |
| `rand-prea-lat` | eroare | C04 | Rândul unui card, măsurat cu fontkit la mărimea lui fixă, e mai lat decât cardul minus marja de 4%; pe ecran s-ar rupe sau ar sta la limită. |
| `glifa-lipsa` | eroare | C05 | Fontul rezolvat nu are glifa unui caracter din text. |
| `contrast-slab` | eroare | C06 | Contrastul WCAG dintre o culoare rezolvată și fundal e sub prag. |
| `stil-contrazice-brand` | eroare | C02 | date.json suprascrie un câmp de identitate vizuală fixat de brand. |
| `text-cu-cod` | eroare | C03 | Textul conține caractere de control sau < > { }. |
| `sedila` | eroare | C03 | Textul conține s sau t cu sedilă în loc de ș sau ț cu virgulă. |
| `accent-neinchis` | eroare | C03 | Accentul deschis cu * nu e închis. |
| `liniuta-lunga` | eroare | C03 | Text din `date.json` cu U+2014 sau U+2013; câmp tipic: `scene[0].titlu[0]`. |
| `emoji` | eroare | C03 | Text din `date.json` cu o pictogramă (`\p{Extended_Pictographic}`); câmp tipic: `scene[4].cta`. |
| `accent-gol` | eroare | C03 | `**` sau steluțe fără cuvânt între ele, în `titlu` sau `cuvinte`; câmp tipic: `scene[0].titlu[1]`. |
| `fara-diacritice` | avertisment | C03 | Cuvinte uzuale fără diacritice: si, sa, fara, dupa, pana, cand, asa, intr, niste; câmp tipic: `scene[0].titlu[0]`. |
| `prea-repede-de-citit` | eroare | C09 | Textul nu stă pe ecran cât cere formula timpului de citire. |
| `durata-in-afara-limitelor` | eroare | C09 | Suma duratelor de scenă diferă de `durata` cu peste 0,1 s sau, fără `durata`, iese din 10-60 s; câmp tipic: `durata`. |
| `resursa-lipsa` | eroare | C07 | O resursă cerută de date nu există; de exemplu, piesa din `muzica.fisier` lipsește. |
| `resursa-hash` | eroare | C07 | Un fișier nu mai are sha256-ul înregistrat (activ înghețat sau piesă din bibliotecă). |
| `licenta-lipsa` | eroare | C07 | Un activ folosit nu are licență înregistrată în catalog. |
| `aprobare-invalida` | eroare | C08 | Zona „Texte și cifre” diferă de cea aprobată. |
| `fisier-utf16` | eroare | C01 | Fișierul e salvat în UTF-16; mg acceptă doar UTF-8. |
| `fisier-utf8-invalid` | eroare | C01 | Fișierul conține octeți care nu sunt UTF-8 valid. |
| `fisier-necitibil` | eroare | C01 | Fișierul lipsește sau nu poate fi citit. |
| `json-invalid` | eroare | C01 | Fișierul nu e JSON valid. |
| `date-schimbate-in-randare` | eroare | C01 | date.json s-a schimbat în timpul lui mg randeaza; verificările și filmul sunt pe datele citite la pornire. |
| `camp-lipsa` | eroare | C02 | Lipsește un câmp obligatoriu din schemă. |
| `valoare-invalida` | eroare | C02 | Valoarea unui câmp nu respectă schema sau regulile șablonului. Pe `muzica.*`, eroarea e atribuită lui C07 (`verificare: "C07"`); ca avertisment, piesa mai scurtă decât videoul. |
| `versiune-schema` | eroare | C02 | versiune_schema nu e cea a șablonului instalat. |
| `cronologie-invalida` | eroare | - | Cronologia produsă de șablon nu respectă formatul comun (eroare internă a șablonului). |
| `tema-necunoscuta` | eroare | C02 | Tema cerută nu există sau nu e acceptată de șablon. |
| `brand-lipsa` | eroare | C02 | Brandul cerut nu are fișă în branduri/. |
| `brand-invalid` | eroare | C02 | Fișa de brand are frontmatter invalid sau altă versiune decât 1. |
| `font-necunoscut` | eroare | C05 | Fontul cerut nu există în catalogul de fonturi. |
| `proiect-nume-invalid` | eroare | - | Numele proiectului nu e slug ASCII [a-z0-9-], de cel mult 40 de caractere. |
| `proiect-exista` | eroare | - | Există deja un proiect cu acest nume în video/. |
| `proiect-lipsa` | eroare | - | Proiectul cerut nu există în video/. |
| `sablon-necunoscut` | eroare | - | Șablonul cerut nu există. |
| `sablon-invalid` | eroare | - | Șablonul instalat e incomplet: lipsește un fișier sau un export obligatoriu. |
| `format-neacceptat` | eroare | - | Formatul cerut nu e acceptat de șablon. |
| `argument-necunoscut` | eroare | - | Argument necunoscut sau lipsă pentru comanda mg. |
| `comanda-necunoscuta` | eroare | - | Subcomanda mg nu există. |
| `comanda-indisponibila` | eroare | - | Subcomanda mg e rezervată și nu există încă în această versiune. |
| `eroare-interna` | eroare | - | Eroare neprevăzută în codul lui mg. |
| `motor-lipsa` | eroare | - | Motorul șablonului (HyperFrames sau Remotion) nu e instalat în motoare/<motor>/node_modules. |
| `motor-esuat` | eroare | - | Motorul a ieșit cu eroare sau a dat o ieșire care nu poate fi citită. |
| `ffmpeg-lipsa` | eroare | - | Nu există un ffmpeg sau ffprobe care să ruleze pe acest sistem. |
| `ffmpeg-hash` | eroare | - | Hash-ul binarului ffmpeg sau ffprobe diferă de cel din VERSIUNI.json. |
| `node-vechi` | eroare | - | Versiunea Node e mai mică decât minimul cerut (22). |
| `platforma-nesuportata` | eroare | - | Platforma nu e suportată (de exemplu Windows ARM64). |
| `node-22-windows` | avertisment | - | Node 22 pe Windows: fs.cpSync oprește procesul la căi cu diacritice; se recomandă Node 24. |
| `platforma-netestata` | avertisment | - | Platforma merge neoficial, netestată (de exemplu Mac cu Intel). |
| `claude-vechi` | eroare | - | Claude Code e mai vechi decât versiunea minimă cerută. |
| `cale-onedrive` | avertisment | - | Agentul stă într-un folder sincronizat de OneDrive. |
| `cale-lunga` | avertisment | - | Calea agentului e prea lungă pentru Windows. |
| `cale-cu-spatii-sau-diacritice` | avertisment | - | Calea agentului conține spații sau diacritice. |
| `spatiu-insuficient` | eroare | - | Spațiul liber pe disc e sub minimul cerut. |
| `memorie-putina` | avertisment | - | Memoria RAM e puțină pentru randare. |
| `npm-ci-esuat` | eroare | - | Instalarea dependențelor cu npm ci a eșuat. |
| `chrome-lipsa` | eroare | - | Chrome pentru randare lipsește și nu a putut fi adus. |
| `font-fara-diacritice` | eroare | - | Un font instalat nu acoperă diacriticele românești. |
| `pluginuri-globale` | avertisment | - | Sunt pluginuri globale active care pot prelua cererile agentului. |
| `pluginuri-cu-hookuri` | avertisment | - | Pluginuri globale cu hook-uri rulează și în folderul agentului. |
| `hyperframes-actualizare-pendinte` | avertisment | - | HyperFrames anunță o actualizare; versiunea rămâne cea fixată. |
| `scenariu-necitibil` | avertisment | - | Scenariul proiectului vechi nu a putut fi citit; proiectul nou pornește cu scheletul gol. |
| `curatare-esuata` | avertisment | - | Un folder de lucru temporar nu s-a putut șterge după o comandă reușită (de exemplu ținut încă deschis pe Windows). |
| `integritate-kit` | eroare | - | Hash-ul unui fișier din kit diferă de cel din VERSIUNI.json. |
| `randare-proba-esuata` | eroare | - | Randarea de probă din mg doctor a eșuat. |
| `canar-nefacut` | eroare | - | Testul canar al gărzii nu a fost încheiat. |
| `canar-esuat` | eroare | - | Testul canar a arătat că garda nu blochează. |
| `reel-ilustrat-scene-durate` | eroare | S01 | Numărul scenelor sau duratele lor ies din limitele reelului (2-8 scene, cel mult floor(durata / 3,5), total 10-60 s, scena 2,5-12 s și peste minimul tipului). |
| `reel-ilustrat-persistenta` | eroare | S02 | Un desen rămâne pe ecran peste o scenă care nu e adunare sau card. |
| `reel-ilustrat-carduri-suprapuse` | eroare | S03 | Un card intră înainte de ieșirea cardului precedent plus pauza de 0,5 s. |
| `reel-ilustrat-iconite-retea` | eroare | S04 | Iconițele nu sunt retrase complet înainte de nașterea rețelei. |
| `reel-ilustrat-desen-dupa-retea` | eroare | S05 | Desenul de după rețea pornește la mai puțin de 1,0 s după retragerea ei. |
| `reel-ilustrat-fereastra-scenei` | eroare | S06 | Desenarea și retragerea nu încap în fereastra scenei. |
| `reel-ilustrat-semnatura` | eroare | S07 | Semnătura nu se termină cu cel puțin 0,3 s înainte de final. |
| `reel-ilustrat-cutie-desen` | eroare | S08 | Cutia desenului iese din cadru (marja de 24 px), intră în zona de text sau coboară sub y 1594. |
| `reel-ilustrat-aglomerare` | eroare | S09 | Două desene simultane se suprapun peste 10% din arie sau sunt peste 6 iconițe vizibile deodată. |
| `reel-ilustrat-accent` | eroare | S11 | Accentul nu acoperă un rând întreg al titlului sau titlu și cuvinte apar în aceeași scenă. |
| `reel-ilustrat-ajustare` | avertisment | S12 | Scena folosește desen.ajustare; revizorul o privește atent. |
| `text-animat-final-nu-e-ultimul` | eroare | S01 | Scena final nu e ultima sau apare de mai multe ori. |
| `text-animat-ghilimele-in-citat` | eroare | S04 | Textul citatului începe sau se termină cu ghilimele (șablonul le pune singur), ori citatul din build nu e între „ și ”. |
| `text-animat-cifra` | eroare | S05 | Valoarea finală a cifrei nu e scrisă static în build, în format românesc, cu prefixul și sufixul ei. |
| `text-animat-accent` | eroare | S06 | O scenă are peste 2 segmente accentuate sau, în build, segmentele .accent nu sunt exact textele marcate cu *. |
| `text-animat-sigla` | eroare | S07 | Sigla din build nu e fișierul sursă sau nu are raportul lui de aspect. |
| `text-animat-text-in-build` | eroare | S09 | Textul unui element de scenă din build/index.html nu e textul normalizat din date.json. |
| `overlay-filmare-sursa-schimbata` | eroare | S01 | Filmarea originală din resurse/ sau copia de lucru din active/ nu mai are sha256-ul din motor.lock. |
| `overlay-filmare-ancora` | eroare | S02 | Fraza de ancorare a unui element nu se găsește în transcrierea corectată la apariția cerută, ori punctele unei liste nu sunt în ordine după ancora listei. |
| `overlay-filmare-corectura` | eroare | S03 | O corectură nu se potrivește cu textul actual al cuvintelor, are peste 4 cuvinte, se suprapune cu alta sau numește cuvinte care nu există. |
| `overlay-filmare-ocupare` | eroare | S04 | Un element iese din video, are durata în afara limitelor tipului, încalcă regulile benzilor sau numărul elementelor trece de limite. |
| `overlay-filmare-transcriere-slaba` | eroare | S05 | Raportul transcrierii iese din praguri (viteza vorbirii, simboluri, cuvinte prea scurte sau prea lungi, cuvintele funcționale ale limbii). |
| `overlay-filmare-transcriere-text` | avertisment | S05 | Transcrierea conține emoji, linii de pauză sau caractere de control; apar în subtitrări dacă nu le repari cu corecturi. |
| `overlay-filmare-subtitrari` | eroare | S06 | Gruparea subtitrărilor încalcă regulile (durata minimă, suprapunerea, rândurile, acoperirea de 95%) sau un grup nu încape nici la 42 px. |
| `overlay-filmare-evidentiaza` | eroare | S06 | O expresie din subtitrari.evidentiaza nu se găsește în transcrierea corectată. |
| `overlay-filmare-audio` | eroare | S09 | Pista audio a MP4-ului lipsește, nu e AAC, are altă durată decât videoul sau e mai încet decât copia de lucru. |
| `overlay-filmare-filmare-atinsa` | eroare | S10 | În banda liberă, cadrul MP4-ului diferă de copia de lucru (SSIM sub 0,95): filmarea a fost acoperită, colorată sau deformată. |
| `overlay-filmare-durata` | eroare | C09 | filmare.start și filmare.sfarsit dau o durată în afara intervalului 5-90 s sau ies din copia de lucru. |
| `overlay-filmare-id-dublu` | eroare | C02 | Două elemente au același id (dat sau implicit, e1, e2…); id-ul e numele elementului în cronologie, scenariu și verdict. |
| `date-serie-evidentiaza` | eroare | S03 | Câmpul evidentiaza al unei scene bare sau comparatie nu e eticheta niciunei valori din scenă. |
| `date-serie-bare-zero` | eroare | S03 | Toate valorile unei scene bare sunt 0, deci graficul nu are nicio bară. |
| `date-serie-final-nu-e-ultimul` | eroare | S03 | Scena final nu e ultima sau apare de mai multe ori. |
| `date-serie-durata-mp4` | eroare | S06 | MP4-ul are alt număr de cadre decât scenele (cadreTotale ± 1) sau o durată în afara limitelor șablonului (6-60 s). |
| `date-serie-marime-mp4` | eroare | S07 | MP4-ul are peste 100 MB. |
| `date-serie-antet` | eroare | S01 | Primul rând al tabelului seriei nu numește coloanele nume și citat (sau un sinonim: text, testimonial, mesaj). |
| `date-serie-randuri` | eroare | S02 | Tabelul seriei nu are niciun testimonial sau are peste 100. |
| `date-serie-rand-invalid` | eroare | S02 | Un rând al seriei nu are nume sau citat, are un câmp prea lung sau caractere care nu se pot afișa. |
| `date-serie-nume-duplicat` | eroare | S02 | Două rânduri ale seriei dau același slug al numelui, deci același fișier MP4. |
| `date-serie-citat-lung` | eroare | S02 | Citatul unui rând are peste 350 de caractere sau cere mai mult de 20 s de citire; agentul propune o scurtare în serie.scurtari. |
| `date-serie-scurtare-invalida` | eroare | S02 | O scurtare din serie.scurtari nu e doar o tăietură a citatului original (cu „(…)” în locul bucăților scoase) sau numește un om care nu e în tabel. |
| `date-serie-coloana-necunoscuta` | avertisment | S02 | Tabelul seriei are coloane care nu apar pe card; se ignoră. |
| `date-serie-poza-ambigua` | eroare | S05 | În folderul pozelor sunt mai multe fișiere cu numele aceluiași om. |
| `date-serie-poza-fara-om` | avertisment | S05 | O poză din folderul pozelor nu se potrivește cu niciun nume din tabel. |
| `date-serie-poze-in-excel` | avertisment | S05 | Excelul are poze lipite în foaie, pe care agentul nu le citește; rândurile fără poză în folder apar cu inițiale. |
| `serie-fisier-invalid` | eroare | S01 | Fișierul seriei (Excel sau randuri.json) nu se poate citi. |
| `serie-codificare` | eroare | S01 | După decodare, tabelul seriei are caractere stricate (mojibake), deci a fost salvat cu altă codificare. |
| `serie-incompleta` | eroare | S08 | Seria nu are câte un MP4 verificat pe fiecare rând, are rânduri eșuate sau un .tmp.mp4 rămas. |
| `serie-fara-schita` | eroare | S09 | Randarea completă a seriei cere întâi o schiță verde pe datele de acum, trecută de revizor (TRECE). |
| `desen-necunoscut` | eroare | S10 | Id-ul desenului nu există în `biblioteci/catalog.json` sau în `proprii/catalog-propriu.json`; tot la `mg desen arata`; câmp tipic: `scene[0].desen.id`, `argumente.id`. |
| `desen-familii-amestecate` | eroare | S10 | Filmul amestecă familii de desene din bibliotecă: o scenă folosește altă familie decât prima familie a filmului (familia `proprie` nu contează); câmp tipic: `scene[3].desen.id`. |
| `desen-fara-panou` | eroare | S10 | Tema `noapte`, piesă `evita`, fără `panou: true`; câmp tipic: `scene[1].desen.panou`. |
| `desen-marime-invalida` | eroare | S10 | `marime` nu e `mic`, `mediu` sau `mare`; câmp tipic: `scene[0].desen.marime`. |
| `iconita-necunoscuta` | eroare | S10 | Numele nu există în `lucide-1.49.0.json`; câmp tipic: `scene[2].iconite[1]`. |
| `desen-licenta-lipsa` | eroare | - | `mg desen adauga` fără `--licenta`; câmp tipic: `argumente.licenta`. |
| `desen-etichete-putine` | eroare | - | `mg desen adauga` cu mai puțin de 4 etichete unice; câmp tipic: `argumente.etichete`. |
| `desen-format-neacceptat` | eroare | - | Altă extensie decât `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`; SVG fără element `<svg>`, cu `<style>` sau cu referințe interne `url(#...)`, `href="#..."`, sau cu text (`<text>`, `<tspan>`, `<textPath>`), care se scrie doar în date.json; câmp tipic: `argumente.fisier`. |
| `desen-svg-periculos` | eroare | - | `<script>`, `<foreignObject>`, `<image>`, atribute `on*`, `javascript:`, `<!ENTITY>`, `href` extern; câmp tipic: `argumente.fisier` la `mg desen adauga`, `scene[0].desen.id` la build, când forma din `proprii/` sau `biblioteci/` nu trece de normalizare. |
| `desen-fara-viewbox` | eroare | - | SVG fără `viewBox`; câmp tipic: `argumente.fisier`. |
| `cronologie-suprapunere` | eroare | C09 | Fereastra unei scene cu text începe înainte să se termine fereastra scenei anterioare. |
| `motor-versiune` | eroare | C10 | Motorul a rulat cu altă versiune decât cea fixată în VERSIUNI.json (hyperframes check, sau pachetul remotion instalat). |
| `build-cu-retea` | eroare | C10 | Build-ul conține adrese http sau https, în afara spațiilor de nume SVG și a copiei GSAP fixate. |
| `check-esuat` | eroare | C10 | hyperframes check --json nu a trecut: ok false sau constatări de nivel error. |
| `foaie-lipsa` | eroare | C16 | Foaia de contact nu a putut fi produsă. |
| `text-lipsa-din-build` | eroare | C17 | Un text din cronologie nu apare în build: ca nod de text static în build/index.html (HyperFrames) sau ca valoare în build/props.json (Remotion). |
| `aprobare-lipsa` | eroare | C08 | Scenariul nu are aprobare în motor.lock. |
| `proiect-alta-versiune` | eroare | - | Proiectul a fost făcut pe altă versiune a motorului sau a schemei (T5). |
| `mp4-invalid` | eroare | C11 | MP4-ul nu are codecul, formatul de pixeli, rezoluția, fps-ul sau durata așteptate. |
| `randare-esuata` | eroare | - | Randarea a eșuat și după reluare (cu --low-memory-mode la HyperFrames, cu --concurrency=1 la Remotion). |
| `cadre-goale` | eroare | C12 | MP4-ul are un segment de peste 1 s doar cu fundalul sau primul conținut apare după 0,6 s. |
| `text-invizibil` | eroare | C13 | Un text, la momentul lui și în caseta lui reală de pe ecran (fără casete: zona textului scenei, la momentul complet), diferă de fundal sub 1% sau peste 50% din pixeli (fără casete: peste 35%), ori nu s-a putut măsura. |
| `video-inghetat` | eroare | C14 | Imaginea stă pe loc cel puțin 2 s în afara ferestrelor statice declarate în cronologie. |
| `audio-invalid` | eroare | C15 | Pista audio a MP4-ului nu se potrivește cu datele: fără muzică, nicio pistă; cu muzică, o pistă AAC la durata videoului, cu media peste −35 dB, vârful cel mult −0,5 dB și finalul stins. |
| `filmare-lipsa` | eroare | - | Șablonul cere o filmare, dar lipsește --filmare. |
| `limba-necunoscuta` | eroare | - | Limba cerută nu e printre limbile transcrierii Parakeet. |
| `filmare-extensie` | eroare | - | Fișierul dat la --filmare nu e .mp4, .mov, .m4v sau .webm. |
| `filmare-necitita` | eroare | - | ffprobe nu poate citi filmarea sau nu găsește în ea un flux video. |
| `filmare-fara-audio` | eroare | - | Filmarea nu are pistă audio. |
| `filmare-durata` | eroare | - | Filmarea are sub 5 s sau peste 90 s. |
| `filmare-hdr` | eroare | - | Filmarea e HDR (transfer PQ sau HLG, sau Dolby Vision); se cere reexport în SDR. |
| `filmare-normalizare-esuata` | eroare | - | ffmpeg nu a putut face copia de lucru a filmării sau foaia de verificare. |
| `transcriere-neinstalata` | eroare | - | Transcrierea locală (Parakeet) nu e instalată; mg nou cere --instaleaza-transcrierea, după acordul cursantului. |
| `transcriere-instalare-esuata` | eroare | - | hyperframes models install parakeet a eșuat. |
| `transcriere-esuata` | eroare | - | hyperframes transcribe a eșuat sau nu a scris transcript.json. |
| `transcriere-goala` | eroare | - | Transcrierea nu are niciun cuvânt. |
| `transcriere-format` | eroare | - | Fișierul dat la --transcriere nu e .srt, .vtt sau .json. |
| `remotion-instalare-esuata` | eroare | - | Instalarea motorului Remotion (npm ci în motoare/remotion, apoi remotion browser ensure) a eșuat. |
| `remotion-neinstalat` | eroare | - | Motorul Remotion nu e instalat; mg nou cere --instaleaza-motorul, după acordul cursantului. |
| `bundle-esuat` | eroare | C10 | remotion bundle a eșuat pe compoziția șablonului. |
| `compozitie-invalida` | eroare | C10 | remotion compositions nu găsește compoziția din motor.compozitie sau îi dă alte dimensiuni, alt fps ori alt număr de cadre decât cronologia. |
| `corectura-fara-predare` | eroare | - | Proiectul nu are un film predat pe datele de acum (verificare.json verde, din randarea completă, pe date.json-ul curent), deci nu are ce corecta. |
| `corectura-deschisa` | eroare | - | Încercarea curentă de corectură nu e încă verificată cu mg corectura --verifica; nu se deschide alta. |
| `corectura-lipsa` | eroare | - | Proiectul nu are nicio corectură deschisă. |
| `corectura-nerandata` | eroare | - | De la deschiderea încercării nu există o randare completă verde nouă, pe date.json-ul de acum. |
| `corectura-fara-mesaj` | eroare | - | O corectură se deschide sau se reia doar după un mesaj al cursantului scris după ultima predare sau încercare. |
| `corectura-verificata` | eroare | - | Încercarea e deja verificată, iar filmul s-a schimbat de atunci; o schimbare nouă e o încercare nouă. |
| `corectura-plafon` | eroare | - | Corectura a avut deja două încercări; a treia nu se face, urmează lista de propuneri. |
| `corectura-atinge-altceva` | eroare | - | O scenă fără niciun câmp schimbat în date.json arată altfel decât în filmul de dinainte de corectură. |
| `generare-nepregatita` | eroare | - | Generarea de desene nu e pregătită: lipsește Python 3 sau seiful pentru cheie (keyring în unelte/python/), ori seiful nu răspunde. |
| `kie-cheie-lipsa` | eroare | - | Cheia Kie a cursantului nu e în seiful sistemului. |
| `kie-refuz` | eroare | - | Kie a refuzat cheia sau contul nu mai are credite. |
| `kie-esuat` | eroare | - | Generarea a eșuat la Kie (rețea, sarcină eșuată sau fără rezultat); o sarcină eșuată nu costă, una rămasă în curs se termină cu mg genereaza reia. |
| `desen-generat-nefolosibil` | eroare | - | Desenul generat nu se poate vectoriza ca formă (gol, plin, zgomotos sau nu e PNG); creditele sunt cheltuite. |
| `desen-generat-fara-silueta` | avertisment | - | Conturul desenului generat nu se închide, deci piesa are doar linia, fără silueta albă. |
| `actualizare-sursa` | eroare | - | Versiunea nouă nu se poate aduce sau citi: git lipsește, folderul nu e o clonă git, rețeaua ori autentificarea pică. |
| `actualizare-video-in-lucru` | eroare | - | Un proiect are scenariul aprobat, dar filmul final lipsește sau e mai vechi decât aprobarea; actualizarea așteaptă, afară de --chiar-daca-e-in-lucru. |
| `actualizare-kit-modificat` | eroare | - | Fișiere urmărite de git ale agentului sunt schimbate pe acest calculator; actualizarea le-ar pierde. |
| `actualizare-atinge-cursant` | eroare | - | Versiunea țintă conține fișiere în zona cursantului (video/, branduri/, proprii/ și celelalte din .gitignore). |
| `actualizare-esuata` | eroare | - | Git n-a putut trece kitul pe versiunea țintă; kitul a rămas pe versiunea de dinainte. |
| `actualizare-integritate` | eroare | - | Versiunea adusă nu trece verificarea de integritate din VERSIUNI.json; kitul revine singur la versiunea de dinainte. |
| `actualizare-fara-istoric` | eroare | - | mg actualizeaza --inapoi nu are la ce reveni: nicio actualizare notată sau kitul nu mai e pe versiunea adusă de ea. |
