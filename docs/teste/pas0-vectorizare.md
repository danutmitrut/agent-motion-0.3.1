# Testul de vectorizare de la pasul 0

Decizia 1 de la pasul 0 a adus generarea de desene în v1, pe Mac și pe Windows. Pe Windows, desenul generat trebuie vectorizat fără drepturi de administrator, iar unealta se alege după testul de aici (spec 9.1, 12, 13.2). Documentul descrie testul, faptele verificate înainte, rezultatele de pe Windows și recomandarea calculată. Decizia o ia Dănuț.

## Ce s-a verificat înainte de test (2026-10-01)

| Fapt | Sursa |
| --- | --- |
| Ultimul release autotrace e `0.31.10` (2024-01-29), cu două instalatoare: `autotrace-20240129-win32-setup.exe` (1.726.799 octeți) și `autotrace-20240129-win64-setup.exe` (1.408.394 octeți); nu există arhivă portabilă oficială | `gh api repos/autotrace/autotrace/releases/latest` |
| sha256 al instalatorului win64: `07ac6a0f6b776714d0f35ce9a1ff59ad545dafe7c35678e373fb1215651124c1` | `shasum -a 256` pe fișierul descărcat |
| Instalatorul e NSIS 3.09, nu Inno Setup, deci opțiunile `/VERYSILENT` și `/CURRENTUSER` nu există; opțiunile NSIS sunt `/S` (silențios) și `/D=<cale>` (ultima, fără ghilimele, doar căi absolute) | `file` pe executabil, manifestul din executabil, nsis.sourceforge.io/Docs/Chapter3.html, 3.2.1 |
| Manifestul instalatorului cere `requireAdministrator`, iar scriptul are `RequestExecutionLevel admin` și `InstallDir $PROGRAMFILES64\AutoTrace` | manifestul din executabil; `distribute/win/autotrace.nsi` la tagul `0.31.10` |
| Build-ul Windows e făcut cu `--without-magick` (fără ImageMagick), cu `libpng` inclus | `.github/workflows/windows.yml` la tagul `0.31.10` |
| `windows-latest` e Windows Server 2025 (imaginea `windows-2025-vs2026`) și are 7-Zip 26.03 | `actions/runner-images`, `README.md` și `images/windows/Windows2025-VS2026-Readme.md` |
| Imaginea runner-ului pune `ConsentPromptBehaviorAdmin` pe 0 (administratorii nu primesc dialog UAC); valorile `EnableLUA` și `ConsentPromptBehaviorUser` le citește job-ul și le scrie în rezumat | `images/windows/scripts/build/Configure-BaseImage.ps1`, pasul „Starea UAC și 7-Zip pe runner” |

Consecința directă: pe laptopul unui cursant cu UAC pornit, instalatorul oficial cere parola unui administrator, oricât ar reuși sau nu în CI. De aceea testul măsoară separat instalatorul și varianta portabilă (fișierele extrase din instalator, fără să-l ruleze).

## Candidații

| Id | Ce este | Cum ajunge pe mașină |
| --- | --- | --- |
| `propriu` | vectorizarea proprie, în Node, fără dependențe: prag, subțiere Zhang-Suen, urmărirea liniei de mijloc, simplificare Ramer-Douglas-Peucker, curbe Bézier, apoi ordonarea și normalizarea din `kit/linia-continua/tools/vectorizeaza.py` | e cod al agentului, nu se instalează nimic |
| `autotrace-instalator` | autotrace 0.31.10, prin instalatorul oficial, `setup.exe /S /D=<unelte/vectorizare/autotrace-instalator>` | rulat ca utilizatorul de test |
| `autotrace-portabil` | autotrace 0.31.10, fișierele extrase cu 7-Zip din același instalator, în `unelte/vectorizare/autotrace-portabil` | extras ca utilizatorul de test |

Toți trei scriu aceeași formă, `{w, h, paths, lengths, origine}`, din care `linia.js` citește `w`, `h` și `paths`.

## Metoda

- Workflow-ul `pas0-vectorizare` (pornit manual) rulează pe `windows-latest`, cu repo-ul într-o cale cu spațiu și diacritice (`Proiecte Ăîș test/agent-motion`).
- Job-ul creează utilizatorul local `mgtest`, fără drepturi de administrator, și rulează testul ca el, printr-o sarcină programată cu `RunLevel Limited`. O sondă verifică înainte că procesul rulează ca `mgtest` și fără grupul Administratori (SID `S-1-5-32-544`) în token; dacă nu, job-ul se oprește.
- Ca sarcina să poată porni, `mgtest` primește doar dreptul de logon „Log on as a batch job” (fără niciun grup), verificat înainte cu un logon de tip batch, iar `node` pornește dintr-o copie a lui `node.exe` din workspace; dacă sarcina nu pornește în 90 de secunde sau iese cu cod nenul, job-ul scrie diagnosticul (evenimentele Task Scheduler, starea sarcinii, drepturile) în `pas0-lucru/diagnostic-<sarcina>.txt`.
- Desenul e sintetic (`teste/pas0/vectorizare/genereaza-desen.mjs`): o linie continuă neagră pe alb, groasă de 14 px, cu margini netezite și trei bucle, deci cu capete și încrucișări. Nu e un desen al lui Dănuț.
- autotrace primește desenul convertit în BMP pe 24 de biți și rulează cu `-centerline -background-color FFFFFF -output-format svg`, ca `vectorizeaza.py` din kit. Rulează de două ori: cu fișierele de intrare și de ieșire în calea cu diacritice și într-un folder temporar cu nume ASCII, ca să se vadă dacă diacriticele din cale îl încurcă. În ambele rulări, executabilul și directorul curent rămân în workspace, deci în calea cu diacritice.
- Pentru fiecare rulare, `raport.json` păstrează codul de ieșire, stderr și stdout ale procesului (cel mult 8000 de caractere fiecare, decodate ca UTF-8 sau, dacă nu sunt UTF-8 valid, ca windows-1252, cu codificarea notată), iar mesajul scurt din document spune codul și primele rânduri din stderr (sau din stdout, dacă stderr e gol), nu comanda.
- Dacă autotrace s-a instalat, dar a picat la vectorizare, testul strânge un diagnostic în câmpul `diagnostic` al candidatului: ieșirea lui `autotrace -version`, `-list-input-formats` și `-list-output-formats`, fișierele din folderul extras și câte o rulare de probă, cu aceleași opțiuni, pe PNG-ul original și pe un PPM binar (P6), în folderul temporar ASCII, plus o probă pe BMP cu folderul extras copiat acolo, ca executabilul și directorul curent să fie și ele într-o cale ASCII. Diagnosticul rulează doar la eșecul lui autotrace și nu contează la eligibilitate sau la recomandare.
- Măsurătorile (`teste/pas0/vectorizare/compara.mjs`): numărul de trasee (cât de continuu se desenează), lungimea totală față de linia ideală, abaterea medie și maximă față de linia ideală, acoperirea (partea din linia ideală aflată la cel mult jumătate din grosime de un traseu), timpul vectorizării și timpul instalării.
- Un candidat e eligibil dacă se instalează fără drepturi de administrator (pentru instalator: manifest `asInvoker`), a mers în ambele căi (cea cu diacritice și cea ASCII; măsurătorile se iau din prima rulare reușită, iar un candidat care a picat într-una dintre căi nu e recomandat), are abaterea medie de cel mult 2 px, acoperirea de cel puțin 0,95 și timpul de cel mult 30 s. Dintre eligibili, recomandarea calculată alege cele mai puține trasee, apoi abaterea cea mai mică.

Într-o sarcină programată, ieșirea standard a lui `node` se pierde, așa că `compara.mjs` își scrie singur ieșirea și erorile (cu stack-ul la eșec) în `pas0-lucru/sonda.log` și `pas0-lucru/toate.log`; workflow-ul le afișează în jurnalul job-ului când testul pică, iar artefactul `raport-vectorizare` le include și la eșec.

## Rezultatele

<!-- rezultate:inceput -->
Rulat pe win32-x64, Windows 10.0.26100, Node v22.23.3, ca utilizatorul `mgtest` (în grupul Administratori: nu), la 2026-10-03T12:20:21.383Z. Lungimea liniei de referință: 3126 px.

| Candidat | Fără admin | Instalare (ms) | A mers | Timp (ms) | Trasee | Lungime (px) | Abatere medie (px) | Abatere max (px) | Acoperire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `propriu` | da | - | da | 173 | 4 | 3079 | 0.64 | 5.15 | 1 |
| `autotrace-instalator` | nu | 11 | nu | - | - | - | - | - | - |
| `autotrace-portabil` | da | 458 | nu | - | - | - | - | - | - |

- `propriu`: fără instalare.
- `autotrace-instalator`: instalarea: eșuată (nu a pornit: acces refuzat (EACCES)), manifest `requireAdministrator`; nu s-a instalat.
- `autotrace-portabil`: instalarea: reușită, manifest `requireAdministrator`; cale diacritice: eroare (a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.); cale ascii: eroare (a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.); a picat în toate căile (diacritice: a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.; ascii: a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.).
  - diagnostic (nu contează la eligibilitate): versiunea necunoscută (a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.); proba PNG: nu merge (a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.); proba PPM: nu merge (a ieșit cu codul 1; stderr: autotrace.exe:./.libs/lt-autotrace.c:236: FATAL: couldn't find D:\\a\\agent-motion\\agent-motion\\Proiecte Aî? test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe.); proba BMP cu executabilul și directorul curent într-o cale ASCII: nu merge (a ieșit cu codul 127; fără mesaj pe stderr sau stdout); 9 fișiere în folderul extras.

Recomandarea calculată: `propriu`. propriu trece toate condițiile, cu 4 trasee și abaterea medie de 0.64 px (eligibili: propriu).
<!-- rezultate:sfarsit -->

## Ce înseamnă pentru cursanți

- `autotrace-instalator`: pe un laptop cu UAC pornit și cont obișnuit, cere drepturi de administrator, deci nu respectă cerința din 9.1, indiferent de rezultatul din CI.
- `autotrace-portabil`: extragerea merge fără drepturi de administrator, dar build-ul oficial de Windows al lui 0.31.10 nu funcționează deloc, nici instalat ca administrator. Scriptul NSIS (`distribute/win/autotrace.nsi` la tagul `0.31.10`) împachetează `../../autotrace.exe`, adică wrapper-ul generat de libtool, fără executabilul real și fără biblioteca din `.libs/`; de aceea autotrace iese cu `lt-autotrace.c:236: FATAL: couldn't find ...` sau, dintr-o cale ASCII, cu codul 127 fără mesaj. Problema e raportată în autotrace/autotrace #223 (deschisă), #161 și #131. Un build mai vechi, `travis-20190108.39` (2019), e raportat de utilizatori ca funcțional, dar nu a fost testat aici. Oricare build ar fi folosit, `mg doctor --generare` ar trebui să-l aducă de undeva (7-Zip pe laptopul cursantului, care nu e garantat, sau o arhivă găzduită de Dănuț, descărcată cu sha256 verificat), iar autotrace e GPL, deci redistribuirea binarului cere și oferta codului sursă (spec 11).
- `propriu`: nu aduce niciun binar și nicio licență nouă, merge oriunde merge Node, deci și pe Mac; calitatea pe desenele reale (nu doar pe cel sintetic) se confirmă la pasul 7, pe desenele generate.

## Decizia

O ia Dănuț, după rezultatele de mai sus (spec 13.2), împreună cu modul în care `mg doctor --generare` aduce autotrace pe Mac și cu reconfirmarea efortului pasului 7 (3-5 zile). Până atunci, nicio unealtă de vectorizare pentru Windows nu e fixată în `nucleu/`.

**2026-10-03, decizia lui Dănuț:** unealta de vectorizare e `propriu`, pe Windows și pe Mac. Motivul: e singurul candidat care a mers ca utilizator fără drepturi de administrator, într-o cale cu diacritice, cu marjă mare față de praguri, fără binar și fără licență GPL de redistribuit; `autotrace-instalator` cere administrator, iar build-ul oficial de Windows al lui autotrace 0.31.10 nu funcționează. Cum `propriu` rulează oriunde rulează Node, `mg doctor --generare` nu mai trebuie să aducă autotrace nici pe Mac. Efortul pasului 7 rămâne 3-5 zile, iar acolo se confirmă calitatea pe desenele generate.
