// Codurile de eroare ale lui mg și forma comună a erorii (spec 6.12, harta 4.1 și 7).
// Modul doar nativ: nu importă nimic. Lista de mai jos e dublată în docs/interfete/erori.md;
// un cod nou intră în același commit în ambele locuri (testul teste/unitar/erori.test.mjs le compară).

/** @typedef {{cod: string, camp: string, mesaj: string, sugestie: string, verificare?: string}} EroareMg */

export const COD_IESIRE = Object.freeze({ OK: 0, DATE: 1, MEDIU: 2, UTILIZARE: 3 });

const lista = {
  // Comune, din spec (6.12)
  'camp-necunoscut': { nivel: 'eroare', verificare: 'C02', descriere: 'Câmp care nu există în schema șablonului.' },
  'rand-nu-incape': { nivel: 'eroare', verificare: 'C04', descriere: 'Rândul depășește plafonul de grafeme sau lățimea zonei la mărimea minimă.' },
  'rand-prea-lat': { nivel: 'eroare', verificare: 'C04', descriere: 'Rândul unui card, măsurat cu fontkit la mărimea lui fixă, e mai lat decât cardul minus marja de 4%; pe ecran s-ar rupe sau ar sta la limită.' },
  'glifa-lipsa': { nivel: 'eroare', verificare: 'C05', descriere: 'Fontul rezolvat nu are glifa unui caracter din text.' },
  'contrast-slab': { nivel: 'eroare', verificare: 'C06', descriere: 'Contrastul WCAG dintre o culoare rezolvată și fundal e sub prag.' },
  'stil-contrazice-brand': { nivel: 'eroare', verificare: 'C02', descriere: 'date.json suprascrie un câmp de identitate vizuală fixat de brand.' },
  'text-cu-cod': { nivel: 'eroare', verificare: 'C03', descriere: 'Textul conține caractere de control sau < > { }.' },
  'sedila': { nivel: 'eroare', verificare: 'C03', descriere: 'Textul conține s sau t cu sedilă în loc de ș sau ț cu virgulă.' },
  'accent-neinchis': { nivel: 'eroare', verificare: 'C03', descriere: 'Accentul deschis cu * nu e închis.' },
  'liniuta-lunga': { nivel: 'eroare', verificare: 'C03', descriere: 'Text din date.json cu linie de pauză lungă sau medie (U+2014, U+2013).' },
  'emoji': { nivel: 'eroare', verificare: 'C03', descriere: 'Text din date.json cu emoji sau pictogramă.' },
  'accent-gol': { nivel: 'eroare', verificare: 'C03', descriere: 'Accent marcat cu steluțe fără niciun cuvânt între ele.' },
  'fara-diacritice': { nivel: 'avertisment', verificare: 'C03', descriere: 'Cuvinte uzuale scrise fără diacritice (si, sa, fara, dupa, pana, cand, asa, intr, niste).' },
  'prea-repede-de-citit': { nivel: 'eroare', verificare: 'C09', descriere: 'Textul nu stă pe ecran cât cere formula timpului de citire.' },
  'durata-in-afara-limitelor': { nivel: 'eroare', verificare: 'C09', descriere: 'Suma duratelor de scenă diferă de durata videoului cu peste 0,1 s sau iese din limitele șablonului.' },
  'resursa-lipsa': { nivel: 'eroare', verificare: 'C07', descriere: 'O resursă cerută de date nu există.' },
  'resursa-hash': { nivel: 'eroare', verificare: 'C07', descriere: 'Un fișier nu mai are sha256-ul înregistrat (activ înghețat sau piesă din bibliotecă).' },
  'licenta-lipsa': { nivel: 'eroare', verificare: 'C07', descriere: 'Un activ folosit nu are licență înregistrată în catalog.' },
  'aprobare-invalida': { nivel: 'eroare', verificare: 'C08', descriere: 'Zona „Texte și cifre” diferă de cea aprobată.' },

  // Comune, adăugate în planul A (harta 7)
  'fisier-utf16': { nivel: 'eroare', verificare: 'C01', descriere: 'Fișierul e salvat în UTF-16; mg acceptă doar UTF-8.' },
  'fisier-utf8-invalid': { nivel: 'eroare', verificare: 'C01', descriere: 'Fișierul conține octeți care nu sunt UTF-8 valid.' },
  'fisier-necitibil': { nivel: 'eroare', verificare: 'C01', descriere: 'Fișierul lipsește sau nu poate fi citit.' },
  'json-invalid': { nivel: 'eroare', verificare: 'C01', descriere: 'Fișierul nu e JSON valid.' },
  'date-schimbate-in-randare': { nivel: 'eroare', verificare: 'C01', descriere: 'date.json s-a schimbat în timpul lui mg randeaza; verificările și filmul sunt pe datele citite la pornire.' },
  'camp-lipsa': { nivel: 'eroare', verificare: 'C02', descriere: 'Lipsește un câmp obligatoriu din schemă.' },
  'valoare-invalida': { nivel: 'eroare', verificare: 'C02', descriere: 'Valoarea unui câmp nu respectă schema sau regulile șablonului.' },
  'versiune-schema': { nivel: 'eroare', verificare: 'C02', descriere: 'versiune_schema nu e cea a șablonului instalat.' },
  'cronologie-invalida': { nivel: 'eroare', verificare: null, descriere: 'Cronologia produsă de șablon nu respectă formatul comun (eroare internă a șablonului).' },
  'tema-necunoscuta': { nivel: 'eroare', verificare: 'C02', descriere: 'Tema cerută nu există sau nu e acceptată de șablon.' },
  'brand-lipsa': { nivel: 'eroare', verificare: 'C02', descriere: 'Brandul cerut nu are fișă în branduri/.' },
  'brand-invalid': { nivel: 'eroare', verificare: 'C02', descriere: 'Fișa de brand are frontmatter invalid sau altă versiune decât 1.' },
  'font-necunoscut': { nivel: 'eroare', verificare: 'C05', descriere: 'Fontul cerut nu există în catalogul de fonturi.' },
  'proiect-nume-invalid': { nivel: 'eroare', verificare: null, descriere: 'Numele proiectului nu e slug ASCII [a-z0-9-], de cel mult 40 de caractere.' },
  'proiect-exista': { nivel: 'eroare', verificare: null, descriere: 'Există deja un proiect cu acest nume în video/.' },
  'proiect-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Proiectul cerut nu există în video/.' },
  'sablon-necunoscut': { nivel: 'eroare', verificare: null, descriere: 'Șablonul cerut nu există.' },
  'sablon-invalid': { nivel: 'eroare', verificare: null, descriere: 'Șablonul instalat e incomplet: lipsește un fișier sau un export obligatoriu.' },
  'format-neacceptat': { nivel: 'eroare', verificare: null, descriere: 'Formatul cerut nu e acceptat de șablon.' },
  'argument-necunoscut': { nivel: 'eroare', verificare: null, descriere: 'Argument necunoscut sau lipsă pentru comanda mg.' },
  'comanda-necunoscuta': { nivel: 'eroare', verificare: null, descriere: 'Subcomanda mg nu există.' },
  'comanda-indisponibila': { nivel: 'eroare', verificare: null, descriere: 'Subcomanda mg e rezervată și nu există încă în această versiune.' },
  'eroare-interna': { nivel: 'eroare', verificare: null, descriere: 'Eroare neprevăzută în codul lui mg.' },
  'motor-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Motorul șablonului (HyperFrames sau Remotion) nu e instalat în motoare/<motor>/node_modules.' },
  'motor-esuat': { nivel: 'eroare', verificare: null, descriere: 'Motorul a ieșit cu eroare sau a dat o ieșire care nu poate fi citită.' },
  'ffmpeg-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Nu există un ffmpeg sau ffprobe care să ruleze pe acest sistem.' },
  'ffmpeg-hash': { nivel: 'eroare', verificare: null, descriere: 'Hash-ul binarului ffmpeg sau ffprobe diferă de cel din VERSIUNI.json.' },
  'node-vechi': { nivel: 'eroare', verificare: null, descriere: 'Versiunea Node e mai mică decât minimul cerut (22).' },
  'platforma-nesuportata': { nivel: 'eroare', verificare: null, descriere: 'Platforma nu e suportată (de exemplu Windows ARM64).' },
  'node-22-windows': { nivel: 'avertisment', verificare: null, descriere: 'Node 22 pe Windows: fs.cpSync oprește procesul la căi cu diacritice; se recomandă Node 24.' },
  'platforma-netestata': { nivel: 'avertisment', verificare: null, descriere: 'Platforma merge neoficial, netestată (de exemplu Mac cu Intel).' },
  'claude-vechi': { nivel: 'eroare', verificare: null, descriere: 'Claude Code e mai vechi decât versiunea minimă cerută.' },
  'cale-onedrive': { nivel: 'avertisment', verificare: null, descriere: 'Agentul stă într-un folder sincronizat de OneDrive.' },
  'cale-lunga': { nivel: 'avertisment', verificare: null, descriere: 'Calea agentului e prea lungă pentru Windows.' },
  'cale-cu-spatii-sau-diacritice': { nivel: 'avertisment', verificare: null, descriere: 'Calea agentului conține spații sau diacritice.' },
  'spatiu-insuficient': { nivel: 'eroare', verificare: null, descriere: 'Spațiul liber pe disc e sub minimul cerut.' },
  'memorie-putina': { nivel: 'avertisment', verificare: null, descriere: 'Memoria RAM e puțină pentru randare.' },
  'npm-ci-esuat': { nivel: 'eroare', verificare: null, descriere: 'Instalarea dependențelor cu npm ci a eșuat.' },
  'chrome-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Chrome pentru randare lipsește și nu a putut fi adus.' },
  'font-fara-diacritice': { nivel: 'eroare', verificare: null, descriere: 'Un font instalat nu acoperă diacriticele românești.' },
  'pluginuri-globale': { nivel: 'avertisment', verificare: null, descriere: 'Sunt pluginuri globale active care pot prelua cererile agentului.' },
  'pluginuri-cu-hookuri': { nivel: 'avertisment', verificare: null, descriere: 'Pluginuri globale cu hook-uri rulează și în folderul agentului.' },
  'hyperframes-actualizare-pendinte': { nivel: 'avertisment', verificare: null, descriere: 'HyperFrames anunță o actualizare; versiunea rămâne cea fixată.' },
  'scenariu-necitibil': { nivel: 'avertisment', verificare: null, descriere: 'Scenariul proiectului vechi nu a putut fi citit; proiectul nou pornește cu scheletul gol.' },
  'curatare-esuata': { nivel: 'avertisment', verificare: null, descriere: 'Un folder de lucru temporar nu s-a putut șterge după o comandă reușită (de exemplu ținut încă deschis pe Windows).' },
  'integritate-kit': { nivel: 'eroare', verificare: null, descriere: 'Hash-ul unui fișier din kit diferă de cel din VERSIUNI.json.' },
  'randare-proba-esuata': { nivel: 'eroare', verificare: null, descriere: 'Randarea de probă din mg doctor a eșuat.' },
  'canar-nefacut': { nivel: 'eroare', verificare: null, descriere: 'Testul canar al gărzii nu a fost încheiat.' },
  'canar-esuat': { nivel: 'eroare', verificare: null, descriere: 'Testul canar a arătat că garda nu blochează.' },

  // Proprii ale lui reel-ilustrat (prefixul șablonului), fixate la pasul 0 (spec 7.1, harta 7)
  'reel-ilustrat-scene-durate': { nivel: 'eroare', verificare: 'S01', descriere: 'Numărul scenelor sau duratele lor ies din limitele reelului (2-8 scene, cel mult floor(durata / 3,5), total 10-60 s, scena 2,5-12 s și peste minimul tipului).' },
  'reel-ilustrat-persistenta': { nivel: 'eroare', verificare: 'S02', descriere: 'Un desen rămâne pe ecran peste o scenă care nu e adunare sau card.' },
  'reel-ilustrat-carduri-suprapuse': { nivel: 'eroare', verificare: 'S03', descriere: 'Un card intră înainte de ieșirea cardului precedent plus pauza de 0,5 s.' },
  'reel-ilustrat-iconite-retea': { nivel: 'eroare', verificare: 'S04', descriere: 'Iconițele nu sunt retrase complet înainte de nașterea rețelei.' },
  'reel-ilustrat-desen-dupa-retea': { nivel: 'eroare', verificare: 'S05', descriere: 'Desenul de după rețea pornește la mai puțin de 1,0 s după retragerea ei.' },
  'reel-ilustrat-fereastra-scenei': { nivel: 'eroare', verificare: 'S06', descriere: 'Desenarea și retragerea nu încap în fereastra scenei.' },
  'reel-ilustrat-semnatura': { nivel: 'eroare', verificare: 'S07', descriere: 'Semnătura nu se termină cu cel puțin 0,3 s înainte de final.' },
  'reel-ilustrat-cutie-desen': { nivel: 'eroare', verificare: 'S08', descriere: 'Cutia desenului iese din cadru (marja de 24 px), intră în zona de text sau coboară sub y 1594.' },
  'reel-ilustrat-aglomerare': { nivel: 'eroare', verificare: 'S09', descriere: 'Două desene simultane se suprapun peste 10% din arie sau sunt peste 6 iconițe vizibile deodată.' },
  'reel-ilustrat-accent': { nivel: 'eroare', verificare: 'S11', descriere: 'Accentul nu acoperă un rând întreg al titlului sau titlu și cuvinte apar în aceeași scenă.' },
  'reel-ilustrat-ajustare': { nivel: 'avertisment', verificare: 'S12', descriere: 'Scena folosește desen.ajustare; revizorul o privește atent.' },
  // Proprii ale lui text-animat (prefixul șablonului), planul G (spec 7.2, „Verificări specifice”)
  'text-animat-final-nu-e-ultimul': { nivel: 'eroare', verificare: 'S01', descriere: 'Scena final nu e ultima sau apare de mai multe ori.' },
  'text-animat-ghilimele-in-citat': { nivel: 'eroare', verificare: 'S04', descriere: 'Textul citatului începe sau se termină cu ghilimele (șablonul le pune singur), ori citatul din build nu e între „ și ”.' },
  'text-animat-cifra': { nivel: 'eroare', verificare: 'S05', descriere: 'Valoarea finală a cifrei nu e scrisă static în build, în format românesc, cu prefixul și sufixul ei.' },
  'text-animat-accent': { nivel: 'eroare', verificare: 'S06', descriere: 'O scenă are peste 2 segmente accentuate sau, în build, segmentele .accent nu sunt exact textele marcate cu *.' },
  'text-animat-sigla': { nivel: 'eroare', verificare: 'S07', descriere: 'Sigla din build nu e fișierul sursă sau nu are raportul lui de aspect.' },
  'text-animat-text-in-build': { nivel: 'eroare', verificare: 'S09', descriere: 'Textul unui element de scenă din build/index.html nu e textul normalizat din date.json.' },
  // overlay-filmare (planul H)
  'overlay-filmare-sursa-schimbata': { nivel: 'eroare', verificare: 'S01', descriere: 'Filmarea originală din resurse/ sau copia de lucru din active/ nu mai are sha256-ul din motor.lock.' },
  'overlay-filmare-ancora': { nivel: 'eroare', verificare: 'S02', descriere: 'Fraza de ancorare a unui element nu se găsește în transcrierea corectată la apariția cerută, ori punctele unei liste nu sunt în ordine după ancora listei.' },
  'overlay-filmare-corectura': { nivel: 'eroare', verificare: 'S03', descriere: 'O corectură nu se potrivește cu textul actual al cuvintelor, are peste 4 cuvinte, se suprapune cu alta sau numește cuvinte care nu există.' },
  'overlay-filmare-ocupare': { nivel: 'eroare', verificare: 'S04', descriere: 'Un element iese din video, are durata în afara limitelor tipului, încalcă regulile benzilor sau numărul elementelor trece de limite.' },
  'overlay-filmare-transcriere-slaba': { nivel: 'eroare', verificare: 'S05', descriere: 'Raportul transcrierii iese din praguri (viteza vorbirii, simboluri, cuvinte prea scurte sau prea lungi, cuvintele funcționale ale limbii).' },
  'overlay-filmare-transcriere-text': { nivel: 'avertisment', verificare: 'S05', descriere: 'Transcrierea conține emoji, linii de pauză sau caractere de control; apar în subtitrări dacă nu le repari cu corecturi.' },
  'overlay-filmare-subtitrari': { nivel: 'eroare', verificare: 'S06', descriere: 'Gruparea subtitrărilor încalcă regulile (durata minimă, suprapunerea, rândurile, acoperirea de 95%) sau un grup nu încape nici la 42 px.' },
  'overlay-filmare-evidentiaza': { nivel: 'eroare', verificare: 'S06', descriere: 'O expresie din subtitrari.evidentiaza nu se găsește în transcrierea corectată.' },
  'overlay-filmare-audio': { nivel: 'eroare', verificare: 'S09', descriere: 'Pista audio a MP4-ului lipsește, nu e AAC, are altă durată decât videoul sau e mai încet decât copia de lucru.' },
  'overlay-filmare-filmare-atinsa': { nivel: 'eroare', verificare: 'S10', descriere: 'În banda liberă, cadrul MP4-ului diferă de copia de lucru (SSIM sub 0,95): filmarea a fost acoperită, colorată sau deformată.' },
  'overlay-filmare-durata': { nivel: 'eroare', verificare: 'C09', descriere: 'filmare.start și filmare.sfarsit dau o durată în afara intervalului 5-90 s sau ies din copia de lucru.' },
  'overlay-filmare-id-dublu': { nivel: 'eroare', verificare: 'C02', descriere: 'Două elemente au același id (dat sau implicit, e1, e2…); id-ul e numele elementului în cronologie, scenariu și verdict.' },

  // date-serie (planul I, spec 7.3, „Verificări specifice”)
  'date-serie-evidentiaza': { nivel: 'eroare', verificare: 'S03', descriere: 'Câmpul evidentiaza al unei scene bare sau comparatie nu e eticheta niciunei valori din scenă.' },
  'date-serie-bare-zero': { nivel: 'eroare', verificare: 'S03', descriere: 'Toate valorile unei scene bare sunt 0, deci graficul nu are nicio bară.' },
  'date-serie-final-nu-e-ultimul': { nivel: 'eroare', verificare: 'S03', descriere: 'Scena final nu e ultima sau apare de mai multe ori.' },
  'date-serie-durata-mp4': { nivel: 'eroare', verificare: 'S06', descriere: 'MP4-ul are alt număr de cadre decât scenele (cadreTotale ± 1) sau o durată în afara limitelor șablonului (6-60 s).' },
  'date-serie-marime-mp4': { nivel: 'eroare', verificare: 'S07', descriere: 'MP4-ul are peste 100 MB.' },
  // date-serie, compoziția Serie (felia 3)
  'date-serie-antet': { nivel: 'eroare', verificare: 'S01', descriere: 'Primul rând al tabelului seriei nu numește coloanele nume și citat (sau un sinonim: text, testimonial, mesaj).' },
  'date-serie-randuri': { nivel: 'eroare', verificare: 'S02', descriere: 'Tabelul seriei nu are niciun testimonial sau are peste 100.' },
  'date-serie-rand-invalid': { nivel: 'eroare', verificare: 'S02', descriere: 'Un rând al seriei nu are nume sau citat, are un câmp prea lung sau caractere care nu se pot afișa.' },
  'date-serie-nume-duplicat': { nivel: 'eroare', verificare: 'S02', descriere: 'Două rânduri ale seriei dau același slug al numelui, deci același fișier MP4.' },
  'date-serie-citat-lung': { nivel: 'eroare', verificare: 'S02', descriere: 'Citatul unui rând are peste 350 de caractere sau cere mai mult de 20 s de citire; agentul propune o scurtare în serie.scurtari.' },
  'date-serie-scurtare-invalida': { nivel: 'eroare', verificare: 'S02', descriere: 'O scurtare din serie.scurtari nu e doar o tăietură a citatului original (cu „(…)” în locul bucăților scoase) sau numește un om care nu e în tabel.' },
  'date-serie-coloana-necunoscuta': { nivel: 'avertisment', verificare: 'S02', descriere: 'Tabelul seriei are coloane care nu apar pe card; se ignoră.' },
  'date-serie-poza-ambigua': { nivel: 'eroare', verificare: 'S05', descriere: 'În folderul pozelor sunt mai multe fișiere cu numele aceluiași om.' },
  'date-serie-poza-fara-om': { nivel: 'avertisment', verificare: 'S05', descriere: 'O poză din folderul pozelor nu se potrivește cu niciun nume din tabel.' },
  'date-serie-poze-in-excel': { nivel: 'avertisment', verificare: 'S05', descriere: 'Excelul are poze lipite în foaie, pe care agentul nu le citește; rândurile fără poză în folder apar cu inițiale.' },
  // Seria în nucleu (felia 3): tabelul, ieșirile multiple, schița obligatorie
  'serie-fisier-invalid': { nivel: 'eroare', verificare: 'S01', descriere: 'Fișierul seriei (Excel sau randuri.json) nu se poate citi.' },
  'serie-codificare': { nivel: 'eroare', verificare: 'S01', descriere: 'După decodare, tabelul seriei are caractere stricate (mojibake), deci a fost salvat cu altă codificare.' },
  'serie-incompleta': { nivel: 'eroare', verificare: 'S08', descriere: 'Seria nu are câte un MP4 verificat pe fiecare rând, are rânduri eșuate sau un .tmp.mp4 rămas.' },
  'serie-fara-schita': { nivel: 'eroare', verificare: 'S09', descriere: 'Randarea completă a seriei cere întâi o schiță verde pe datele de acum, trecută de revizor (TRECE).' },

  // Desenele: S10 și mg desen adauga (B04)
  'desen-necunoscut': { nivel: 'eroare', verificare: 'S10', descriere: 'Id-ul desenului nu există în biblioteca de desene sau în piesele proprii.' },
  'desen-familii-amestecate': { nivel: 'eroare', verificare: 'S10', descriere: 'Filmul amestecă familii de desene din bibliotecă; piesele proprii nu contează.' },
  'desen-fara-panou': { nivel: 'eroare', verificare: 'S10', descriere: 'Pe tema noapte, o piesă marcată evita apare fără panou: true.' },
  'desen-marime-invalida': { nivel: 'eroare', verificare: 'S10', descriere: 'Mărimea desenului nu e mic, mediu sau mare.' },
  'iconita-necunoscuta': { nivel: 'eroare', verificare: 'S10', descriere: 'Numele iconiței nu există în setul Lucide fixat.' },
  'desen-licenta-lipsa': { nivel: 'eroare', verificare: null, descriere: 'mg desen adauga a primit o piesă fără --licenta.' },
  'desen-etichete-putine': { nivel: 'eroare', verificare: null, descriere: 'mg desen adauga a primit mai puțin de 4 etichete.' },
  'desen-format-neacceptat': { nivel: 'eroare', verificare: null, descriere: 'Fișierul nu e SVG, PNG, JPG sau WebP, sau SVG-ul folosește stiluri și referințe interne sau text (<text>, <tspan>, <textPath>), care se scrie doar în date.json.' },
  'desen-svg-periculos': { nivel: 'eroare', verificare: null, descriere: 'SVG-ul conține script, foreignObject, imagini încorporate, evenimente, entități sau linkuri externe.' },
  'desen-fara-viewbox': { nivel: 'eroare', verificare: null, descriere: 'SVG-ul nu are viewBox, deci nu se poate scala.' },

  // mg randeaza --doar-verificare (B12): C09 pe cronologie, C10 pe motor și build, C17 pe textele din build
  'cronologie-suprapunere': { nivel: 'eroare', verificare: 'C09', descriere: 'Fereastra unei scene cu text începe înainte să se termine fereastra scenei anterioare.' },
  'motor-versiune': { nivel: 'eroare', verificare: 'C10', descriere: 'Motorul a rulat cu altă versiune decât cea fixată în VERSIUNI.json (hyperframes check, sau pachetul remotion instalat).' },
  'build-cu-retea': { nivel: 'eroare', verificare: 'C10', descriere: 'Build-ul conține adrese http sau https, în afara spațiilor de nume SVG și a copiei GSAP fixate.' },
  'check-esuat': { nivel: 'eroare', verificare: 'C10', descriere: 'hyperframes check --json nu a trecut: ok false sau constatări de nivel error.' },
  'foaie-lipsa': { nivel: 'eroare', verificare: 'C16', descriere: 'Foaia de contact nu a putut fi produsă.' },
  'text-lipsa-din-build': { nivel: 'eroare', verificare: 'C17', descriere: 'Un text din cronologie nu apare în build: ca nod de text static în build/index.html (HyperFrames) sau ca valoare în build/props.json (Remotion).' },

  // Aprobarea scenariului (C08) și versiunea proiectului (T5), B13
  'aprobare-lipsa': { nivel: 'eroare', verificare: 'C08', descriere: 'Scenariul nu are aprobare în motor.lock.' },
  'proiect-alta-versiune': { nivel: 'eroare', verificare: null, descriere: 'Proiectul a fost făcut pe altă versiune a motorului sau a schemei (T5).' },

  // MP4-ul final (C11), B16
  'mp4-invalid': { nivel: 'eroare', verificare: 'C11', descriere: 'MP4-ul nu are codecul, formatul de pixeli, rezoluția, fps-ul sau durata așteptate.' },
  'randare-esuata': { nivel: 'eroare', verificare: null, descriere: 'Randarea a eșuat și după reluare (cu --low-memory-mode la HyperFrames, cu --concurrency=1 la Remotion).' },

  // Verificările pe pixelii MP4-ului (C12-C14), B17
  'cadre-goale': { nivel: 'eroare', verificare: 'C12', descriere: 'MP4-ul are un segment de peste 1 s doar cu fundalul sau primul conținut apare după 0,6 s.' },
  'text-invizibil': { nivel: 'eroare', verificare: 'C13', descriere: 'Un text, la momentul lui și în caseta lui reală de pe ecran (fără casete: zona textului scenei, la momentul complet), diferă de fundal sub 1% sau peste 50% din pixeli (fără casete: peste 35%), ori nu s-a putut măsura.' },
  'video-inghetat': { nivel: 'eroare', verificare: 'C14', descriere: 'Imaginea stă pe loc cel puțin 2 s în afara ferestrelor statice declarate în cronologie.' },
  'audio-invalid': { nivel: 'eroare', verificare: 'C15', descriere: 'Pista audio a MP4-ului nu se potrivește cu datele: fără muzică, nicio pistă; cu muzică, o pistă AAC la durata videoului, cu media peste −35 dB, vârful cel mult −0,5 dB și finalul stins.' },

  // filmarea (planul H)
  'filmare-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Șablonul cere o filmare, dar lipsește --filmare.' },
  'limba-necunoscuta': { nivel: 'eroare', verificare: null, descriere: 'Limba cerută nu e printre limbile transcrierii Parakeet.' },
  'filmare-extensie': { nivel: 'eroare', verificare: null, descriere: 'Fișierul dat la --filmare nu e .mp4, .mov, .m4v sau .webm.' },
  'filmare-necitita': { nivel: 'eroare', verificare: null, descriere: 'ffprobe nu poate citi filmarea sau nu găsește în ea un flux video.' },
  'filmare-fara-audio': { nivel: 'eroare', verificare: null, descriere: 'Filmarea nu are pistă audio.' },
  'filmare-durata': { nivel: 'eroare', verificare: null, descriere: 'Filmarea are sub 5 s sau peste 90 s.' },
  'filmare-hdr': { nivel: 'eroare', verificare: null, descriere: 'Filmarea e HDR (transfer PQ sau HLG, sau Dolby Vision); se cere reexport în SDR.' },
  'filmare-normalizare-esuata': { nivel: 'eroare', verificare: null, descriere: 'ffmpeg nu a putut face copia de lucru a filmării sau foaia de verificare.' },
  'transcriere-neinstalata': { nivel: 'eroare', verificare: null, descriere: 'Transcrierea locală (Parakeet) nu e instalată; mg nou cere --instaleaza-transcrierea, după acordul cursantului.' },
  'transcriere-instalare-esuata': { nivel: 'eroare', verificare: null, descriere: 'hyperframes models install parakeet a eșuat.' },
  'transcriere-esuata': { nivel: 'eroare', verificare: null, descriere: 'hyperframes transcribe a eșuat sau nu a scris transcript.json.' },
  'transcriere-goala': { nivel: 'eroare', verificare: null, descriere: 'Transcrierea nu are niciun cuvânt.' },
  'transcriere-format': { nivel: 'eroare', verificare: null, descriere: 'Fișierul dat la --transcriere nu e .srt, .vtt sau .json.' },

  // Motorul Remotion (planul I)
  'remotion-instalare-esuata': { nivel: 'eroare', verificare: null, descriere: 'Instalarea motorului Remotion (npm ci în motoare/remotion, apoi remotion browser ensure) a eșuat.' },
  'remotion-neinstalat': { nivel: 'eroare', verificare: null, descriere: 'Motorul Remotion nu e instalat; mg nou cere --instaleaza-motorul, după acordul cursantului.' },
  'bundle-esuat': { nivel: 'eroare', verificare: 'C10', descriere: 'remotion bundle a eșuat pe compoziția șablonului.' },
  'compozitie-invalida': { nivel: 'eroare', verificare: 'C10', descriere: 'remotion compositions nu găsește compoziția din motor.compozitie sau îi dă alte dimensiuni, alt fps ori alt număr de cadre decât cronologia.' },

  // Corectura după predare (felia 2)
  'corectura-fara-predare': { nivel: 'eroare', verificare: null, descriere: 'Proiectul nu are un film predat pe datele de acum (verificare.json verde, din randarea completă, pe date.json-ul curent), deci nu are ce corecta.' },
  'corectura-deschisa': { nivel: 'eroare', verificare: null, descriere: 'Încercarea curentă de corectură nu e încă verificată cu mg corectura --verifica; nu se deschide alta.' },
  'corectura-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Proiectul nu are nicio corectură deschisă.' },
  'corectura-nerandata': { nivel: 'eroare', verificare: null, descriere: 'De la deschiderea încercării nu există o randare completă verde nouă, pe date.json-ul de acum.' },
  'corectura-fara-mesaj': { nivel: 'eroare', verificare: null, descriere: 'O corectură se deschide sau se reia doar după un mesaj al cursantului scris după ultima predare sau încercare.' },
  'corectura-verificata': { nivel: 'eroare', verificare: null, descriere: 'Încercarea e deja verificată, iar filmul s-a schimbat de atunci; o schimbare nouă e o încercare nouă.' },
  'corectura-plafon': { nivel: 'eroare', verificare: null, descriere: 'Corectura a avut deja două încercări; a treia nu se face, urmează lista de propuneri.' },
  'corectura-atinge-altceva': { nivel: 'eroare', verificare: null, descriere: 'O scenă fără niciun câmp schimbat în date.json arată altfel decât în filmul de dinainte de corectură.' },

  // Desenele generate (felia 5)
  'generare-nepregatita': { nivel: 'eroare', verificare: null, descriere: 'Generarea de desene nu e pregătită: lipsește Python 3 sau seiful pentru cheie (keyring în unelte/python/), ori seiful nu răspunde.' },
  'kie-cheie-lipsa': { nivel: 'eroare', verificare: null, descriere: 'Cheia Kie a cursantului nu e în seiful sistemului.' },
  'kie-refuz': { nivel: 'eroare', verificare: null, descriere: 'Kie a refuzat cheia sau contul nu mai are credite.' },
  'kie-esuat': { nivel: 'eroare', verificare: null, descriere: 'Generarea a eșuat la Kie (rețea, sarcină eșuată sau fără rezultat); o sarcină eșuată nu costă, una rămasă în curs se termină cu mg genereaza reia.' },
  'desen-generat-nefolosibil': { nivel: 'eroare', verificare: null, descriere: 'Desenul generat nu se poate vectoriza ca formă (gol, plin, zgomotos sau nu e PNG); creditele sunt cheltuite.' },
  'desen-generat-fara-silueta': { nivel: 'avertisment', verificare: null, descriere: 'Conturul desenului generat nu se închide, deci piesa are doar linia, fără silueta albă.' },

  // Actualizarea (felia 6)
  'actualizare-sursa': { nivel: 'eroare', verificare: null, descriere: 'Versiunea nouă nu se poate aduce sau citi: git lipsește, folderul nu e o clonă git, rețeaua ori autentificarea pică.' },
  'actualizare-video-in-lucru': { nivel: 'eroare', verificare: null, descriere: 'Un proiect are scenariul aprobat, dar filmul final lipsește sau e mai vechi decât aprobarea; actualizarea așteaptă, afară de --chiar-daca-e-in-lucru.' },
  'actualizare-kit-modificat': { nivel: 'eroare', verificare: null, descriere: 'Fișiere urmărite de git ale agentului sunt schimbate pe acest calculator; actualizarea le-ar pierde.' },
  'actualizare-atinge-cursant': { nivel: 'eroare', verificare: null, descriere: 'Versiunea țintă conține fișiere în zona cursantului (video/, branduri/, proprii/ și celelalte din .gitignore).' },
  'actualizare-esuata': { nivel: 'eroare', verificare: null, descriere: 'Git n-a putut trece kitul pe versiunea țintă; kitul a rămas pe versiunea de dinainte.' },
  'actualizare-integritate': { nivel: 'eroare', verificare: null, descriere: 'Versiunea adusă nu trece verificarea de integritate din VERSIUNI.json; kitul revine singur la versiunea de dinainte.' },
  'actualizare-fara-istoric': { nivel: 'eroare', verificare: null, descriere: 'mg actualizeaza --inapoi nu are la ce reveni: nicio actualizare notată sau kitul nu mai e pe versiunea adusă de ea.' },
};
for (const intrare of Object.values(lista)) Object.freeze(intrare);

/** Lista completă a codurilor: cheie = cod; valoare = {nivel, verificare, descriere}. */
export const CODURI = Object.freeze(lista);

/** Codul unei verificări comune (C01-C17) sau proprii a șablonului (S01-S99). */
export const ESTE_COD_VERIFICARE = /^(C(0[1-9]|1[0-7])|S(0[1-9]|[1-9]\d))$/;

function construiesteEroareMg(cod, camp, mesaj, sugestie, { verificare } = {}) {
  if (typeof cod !== 'string' || !Object.hasOwn(CODURI, cod)) {
    throw new TypeError(`Cod de eroare necunoscut: ${String(cod)}. Adaugă-l în nucleu/lib/erori.mjs și în docs/interfete/erori.md.`);
  }
  for (const [nume, valoare] of [['camp', camp], ['mesaj', mesaj], ['sugestie', sugestie]]) {
    if (typeof valoare !== 'string' || valoare.trim() === '') {
      throw new TypeError(`Câmpul „${nume}” al erorii ${cod} e gol.`);
    }
  }
  if (verificare === undefined) return { cod, camp, mesaj, sugestie };
  if (typeof verificare !== 'string' || !ESTE_COD_VERIFICARE.test(verificare)) {
    throw new TypeError(`Verificare invalidă pentru eroarea ${cod}: ${String(verificare)}.`);
  }
  return { cod, camp, mesaj, sugestie, verificare };
}

/**
 * @param {string} cod @param {string} camp @param {string} mesaj @param {string} sugestie
 * @param {{verificare?: string}} [optiuni] verificare: suprascrie corespondența din CODURI (de exemplu 'S02')
 * @returns {EroareMg}
 */
export function eroare(cod, camp, mesaj, sugestie, optiuni) {
  return construiesteEroareMg(cod, camp, mesaj, sugestie, optiuni);
}

/**
 * Aceeași formă ca eroare(); ajunge în lista de avertismente, care nu oprește comanda.
 * @returns {EroareMg}
 */
export function avertisment(cod, camp, mesaj, sugestie, optiuni) {
  return construiesteEroareMg(cod, camp, mesaj, sugestie, optiuni);
}

/**
 * Verificarea căreia îi aparține o eroare: câmpul ei `verificare` (pus de șablon), altfel cea din CODURI, altfel null.
 * @param {{cod: string, verificare?: string}} e
 * @returns {string | null}
 */
export function verificareaErorii(e) {
  return e?.verificare ?? CODURI[e?.cod]?.verificare ?? null;
}

/** Eroarea care oprește comanda. mg.mjs o prinde, tipărește eroareMg și iese cu codIesire. */
export class EroareFatala extends Error {
  /** @param {EroareMg} eroareMg @param {number} [codIesire] */
  constructor(eroareMg, codIesire = COD_IESIRE.MEDIU) {
    if (!eroareMg || typeof eroareMg.cod !== 'string' || !Object.hasOwn(CODURI, eroareMg.cod)) {
      throw new TypeError('EroareFatala cere o eroare construită cu eroare() sau avertisment().');
    }
    if (![COD_IESIRE.DATE, COD_IESIRE.MEDIU, COD_IESIRE.UTILIZARE].includes(codIesire)) {
      throw new TypeError(`Cod de ieșire nepermis pentru EroareFatala: ${String(codIesire)}.`);
    }
    super(eroareMg.mesaj);
    this.name = 'EroareFatala';
    this.eroareMg = eroareMg;
    this.codIesire = codIesire;
  }
}

/**
 * Textul pentru om: antetul „Erori (N):” și câte o linie JSON compactă pe eroare,
 * apoi „Avertismente (N):” la fel. Șir gol când nu e nimic de spus.
 * @param {EroareMg[]} erori @param {EroareMg[]} avertismente
 * @returns {string}
 */
export function formateazaPentruOm(erori = [], avertismente = []) {
  const linii = [];
  const compact = (e) => JSON.stringify({ cod: e.cod, camp: e.camp, mesaj: e.mesaj, sugestie: e.sugestie });
  if (erori.length > 0) {
    linii.push(`Erori (${erori.length}):`);
    for (const e of erori) linii.push(compact(e));
  }
  if (avertismente.length > 0) {
    linii.push(`Avertismente (${avertismente.length}):`);
    for (const a of avertismente) linii.push(compact(a));
  }
  return linii.length > 0 ? `${linii.join('\n')}\n` : '';
}
