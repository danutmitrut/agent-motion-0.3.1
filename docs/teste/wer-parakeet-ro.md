# Rata de eroare a transcrierii Parakeet în română

Măsurată pe 2026-10-19 cu `unelte/wer/masoara.mjs` (planul H, H18), pe 5 clipuri din Google FLEURS (configurația `ro_ro`, setul `dev`, licența CC BY 4.0), transcrise pe Mac (`darwin-arm64`) pe drumul lui `mg nou`: fiecare clip devine un MP4 (cadru negru și vocea), apoi `hyperframes transcribe --engine parakeet --language ro`. Modelul: `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8`, revizia `2bda32ec70b097a55adaa07d9a7173915b43cc78`, prin `sherpa-onnx-node` 1.13.8. Clipurile nu sunt în repo.

## Metoda

WER = (substituiri + ștergeri + inserări) / cuvintele referinței, pe textul normalizat: litere mici, ș și ț cu virgulă, fără punctuație, cratima ca despărțitor de cuvinte. Referința e transcrierea FLEURS cu punctuație (coloana a treia din `dev.tsv`). Cifrele se compară ca text: „2015” față de „două mii cincisprezece” contează ca eroare.

## Rezultate

| Clip | Durata | Vorbitor | Cuvinte | Substituiri | Ștergeri | Inserări | WER |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `10015838705897580692.wav` | 6,2 s | bărbat | 20 | 8 | 2 | 0 | 50,0% |
| `10079749733289859357.wav` | 8,4 s | bărbat | 19 | 0 | 0 | 0 | 0,0% |
| `10080346825560604313.wav` | 11,8 s | bărbat | 18 | 0 | 0 | 0 | 0,0% |
| `10096581817385879300.wav` | 9,5 s | bărbat | 20 | 3 | 0 | 0 | 15,0% |
| `10105989786580992399.wav` | 15,5 s | bărbat | 31 | 5 | 0 | 0 | 16,1% |
| Total | 51,4 s | | 108 | 16 | 2 | 0 | 16,7% |

## Clip cu clip

- `10015838705897580692.wav` (50,0%)
  - Referința: Cu toate că trei persoane se aflau în interiorul casei când mașina a lovit-o, nimeni nu a fost rănit.
  - Transcrierea: Cu toate că 3 persoane sau aflaut interiorul ca să-i peșteau, tot nimeni nu a fost rănit.
- `10079749733289859357.wav` (0,0%)
  - Referința: În mod normal, un curs va aborda mult mai detaliat toate problemele discutate aici, de obicei prin experiență practică.
  - Transcrierea: În mod normal, un curs va aborda mult mai detaliat toate problemele discutate aici, de obicei prin experiență practică.
- `10080346825560604313.wav` (0,0%)
  - Referința: De exemplu, „învățarea” și „socializarea” sunt sugerate ca fiind motivații importante pentru folosirea internetului (James et al., 1995).
  - Transcrierea: De exemplu, învățarea și socializarea sunt sugerate ca fiind motivații importante pentru folosirea internetului James et al 1995.
- `10096581817385879300.wav` (15,0%)
  - Referința: Se pare că jafurile de amploare ar fi continuat pe timpul nopții, când oamenii legii nu patrulau pe străzile Bișkekului.
  - Transcrierea: Se pare că jaful de amploare ar fi continuat pe timpul nopții, când oamenii legii nu paturrau pe străzile bisquecului.
- `10105989786580992399.wav` (16,1%)
  - Referința: A avut multe efecte sociale și politice, precum adoptarea sistemului metric, trecerea de la un sistem absolutist la unul republican, naționalistl și convingerea că țara aparține poporului, nu unui singur conducător.
  - Transcrierea: Au avut multe efecte sociale și politice, precum adoptarea sistemului metric, trecerea de la un sistem absolutist, la un republican, naționalist, și convingerea că țară aparine poporului, nu unui singur conducător.

## Concluzia

Transcrierea e utilizabilă, dar cere corecturi: agentul citește fiecare grup din blocul „Ce apare pe ecran” înainte să ceară aprobarea.

## Ce rămâne deschis

- Eșantionul e mic: 5 clipuri, 108 cuvinte, iar toți vorbitorii sunt bărbați, deci vocile de femei nu sunt măsurate. O eroare în plus sau în minus mută rata cu 0,9%: cifra e un ordin de mărime, nu o valoare exactă.
- Common Voice (CC0) nu e în măsurătoare: din octombrie 2025 se descarcă doar prin Mozilla Data Collective, cu cont (verificat pe 2026-10-18).
- Parakeet dă alt text pe fiecare platformă (inferența, nu codificarea: decizia 29). Aceleași clipuri, măsurate pe Windows la 2026-10-20: 16,7% pe 108 cuvinte, în `wer-parakeet-ro-windows.md`.
- FLEURS e vorbire citită, înregistrată curat; vorbirea liberă, filmată cu telefonul, are de obicei o rată mai mare. Verificarea pe clipurile cursanților, cu acordul lor, rămâne pentru primul atelier (spec 7.4).
