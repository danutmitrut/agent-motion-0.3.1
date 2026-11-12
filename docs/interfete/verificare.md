# Formatul `video/<proiect>/verificare.json`

Document de interfață (spec 6.11, harta 5.14; planul E, M2 și D). `verificare.json` spune ce s-a verificat la ultima rulare a lui `mg randeaza` și cu ce rezultat. Îl scrie doar nucleul, atomic; agentul și cursantul nu îl editează. Versiunea curentă e 1.

## Exemplu (pasul comun, `--doar-verificare`)

```json
{
  "versiune": 1,
  "proiect": "programari",
  "sablon": "reel-ilustrat",
  "mod": "doar-verificare",
  "scris_la": "2026-10-14T09:00:00.000Z",
  "sha256_date": "3f1c…",
  "mp4": null,
  "sha256_mp4": null,
  "ok": true,
  "ok_pentru_aprobare": true,
  "obligatorii": ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C09", "C10", "C17", "S01", "S02"],
  "verificari": [
    { "cod": "C01", "ok": true, "valoare": { "fisier": "video/programari/date.json" }, "prag": "UTF-8 fără BOM, JSON valid", "camp": null, "erori": [], "avertismente": [] }
  ],
  "avertismente": []
}
```

## Câmpurile

| Câmp | Tip | Sens |
| --- | --- | --- |
| `versiune` | `1` | versiunea formatului |
| `proiect` | șir | numele proiectului (folderul din `video/`) |
| `sablon` | șir | numele șablonului din `motor.lock` |
| `mod` | `'doar-verificare'` \| `'schita'` \| `'complet'` | ce rulare a scris ultima fișierul (pasul comun scrie mereu `doar-verificare`; schița și randarea completă îl rescriu) |
| `scris_la` | șir ISO 8601 | momentul scrierii |
| `sha256_date` | șir hex \| `null` | hash-ul octeților lui `date.json` citiți la pregătire (SEC-1); `null` când fișierul nu s-a putut citi |
| `mp4` | șir \| `null` | calea MP4-ului verificat, relativă la rădăcină, cu `/`; `null` în afara randării complete sau când MP4-ul n-a trecut C11 |
| `sha256_mp4` | șir hex \| `null` | hash-ul MP4-ului din `mp4` |
| `ok` | boolean | toate rezultatele din `verificari` trec, nu există erori și fiecare cod din `obligatorii` are rezultat |
| `ok_pentru_aprobare` | boolean | verde pentru aprobarea scenariului: fiecare rezultat de stadiu `date` sau `build` trece și fiecare cod declarat al acestor stadii are rezultat. Pasul comun scrie aici valoarea lui `ok`; randarea completă îl calculează pe verificările ei (`okPentruAprobare`), deci un MP4 picat nu-l face fals; schița îl păstrează pe cel al pasului comun |
| `obligatorii` | listă de coduri | la pasul comun (și la schiță), codurile declarate în `SABLON.md` cu stadiul `date` sau `build`; la randarea completă, toată lista `verificari` din frontmatter |
| `verificari` | listă de `RezultatVerificare` | rezultatele, sortate după cod; doar codurile declarate în `SABLON.md` (un C nedeclarat se scoate) |
| `avertismente` | listă de `EroareMg` | avertismentele rulării, fără dubluri |
| `schita` | obiect | doar după `--schita`: `{ check_la_tranzitii, foaie }`; `check_la_tranzitii`: `{ ok, erori }` la HyperFrames, `null` la Remotion (nu există check la tranziții) |

`RezultatVerificare` are cheile `cod, ok, valoare, prag, camp, erori, avertismente` (forma lui `rezultat()` din `nucleu/lib/verificari/index.mjs`). Stadiile codurilor sunt în `docs/interfete/sablon.md`, secțiunea „Verificările declarate și stadiile”.

## Sugestiile lui C12, C13 și C14

Sugestiile lui C12, C13 și C14 numesc un câmp doar dacă există în `date.json` sau dacă schema șablonului îl permite (un câmp opțional omis rămâne o sugestie validă; `verificariMp4` primește schema în `schema`, opțional, lângă `date`); altfel trimit la rubrica erorilor din `SABLON.md` al șablonului, care trebuie să spună ce câmpuri schimbă golurile, vizibilitatea textului și mișcarea.

## Modul comparat cu sursa (`cronologie.fundal` = „filmare”)

Când fundalul cronologiei e filmarea, C12-C14 compară MP4-ul cu sursa (`video/<proiect>/<sursa_video.fisier>`, citită de la `sursa_video.start`, pe `cronologie.durata`), decupată ca în compoziție (`filtruDecupare(sursa_video, cronologie, sursa_video.focus_x)`):

- **C12:** la 10 cadre/s, în 135 px lățime, ambele fluxuri în același pas. Un cadru e uniform când sub 0,3% din pixeli diferă cu peste 24 de culoarea lui medie. Eroarea `cadre-goale` apare pentru fiecare interval mai lung de 0,1 s în care MP4-ul e uniform, iar sursa nu.
- **C13:** pentru fiecare text cu `caseta`, la rezoluția MP4-ului, proporția pixelilor din casetă care diferă cu peste 40 pe un canal de cadrul sursei de la același moment trebuie să fie între 1% și 100% (fără plafon, pentru că un card e opac). Fără casete, se măsoară `zona_text` a segmentelor, la `complet`, cu același prag. Eroarea e `text-invizibil`.
- **C14:** `freezedetect` rulează pe MP4 și pe sursă (aceeași decupare, aceeași durată). Înghețurile sursei, pe cronologia MP4-ului (minus `start`), se adaugă la ferestrele statice, apoi se aplică `verificaInghetare` neschimbat (`video-inghetat`).

## C15, audio

C15 are două forme, după cum datele au sau nu muzică (`asteptari.audio = { prezent, durata }`).

- Fără muzică: `valoare = { muzica: false, pista }`, `prag = { mod: 'fara-muzica', pista_audio: 'niciuna' }`. MP4-ul nu are nicio pistă audio.
- Cu muzică: `valoare = { muzica: true, pista, piste, nivel }` (`pista = { codec, canale, durata }`, `nivel = { medie, maxim, coada }` în dB, din `volumedetect` pe tot fișierul și pe ultimele 0,5 s), `prag = { mod: 'cu-muzica', codec: 'aac', piste: 1, durata: '<durata cronologiei> ± 0,05 s', medie_peste: -35, maxim_cel_mult: -0.5, coada_sub_medie: 10 }`. Exact o pistă AAC, cu durata cronologiei ± 0,05 s, media peste −35 dB, vârful cel mult −0,5 dB, iar ultimele 0,5 s cu cel puțin 10 dB sub medie. Câmpurile numite în sugestii: `muzica.volum` (prea încet, saturat), `muzica.incepe_de_la` (prea încet, durată diferită, final nestins) și `muzica.fisier` (prea încet, durată diferită, final nestins). Pista lipsă, numărul pistelor, codecul și nivelul nemăsurat trimit la `mp4.audio` și la `node nucleu/mg.mjs doctor`. O valoare ne-numerică a nivelului pică verificarea.

## Cine îl scrie

- Pasul comun (`pasComun` din `nucleu/lib/randeaza/index.mjs`), la orice mod: verificările de date, C10, C17 și ce întoarce `verificariBuild`, cu `mod: 'doar-verificare'`.
- Schița (`--schita`): pornește de la fișierul pasului comun și schimbă `mod`, `ok`, `scris_la` și adaugă `schita`.
- Randarea completă: rescrie fișierul cu `mod: 'complet'`, C08, verificările pe MP4, `verificariProprii` și C16.

## Cine îl citește

- Hook-ul de aprobare (`nucleu/lib/garda/aprobare.mjs`): `ok_pentru_aprobare` și `sha256_date`.
- Hook-ul `Stop` (`nucleu/lib/garda/stop.mjs`): `ok`, `mod`, `sha256_date`, `mp4`, `sha256_mp4`, `obligatorii`, `verificari`.

## Versiunea 2 (ieșiri multiple, felia 3)

Nucleul scrie versiunea 2 pentru un proiect cu ieșiri multiple (`iesiri(date, ctx)` întoarce o listă, `docs/interfete/sablon.md`) și versiunea 1 pentru rest. Contractul a fost fixat înainte de implementare; felia 3 l-a păstrat și a adăugat doar ce e notat la „Ce a adăugat felia 3”.

Versiunea 2 are:

- `versiune: 2`;
- câmpurile de nivel superior ale versiunii 1 (`proiect`, `sablon`, `mod`, `scris_la`, `sha256_date`, `ok`, `ok_pentru_aprobare`, `obligatorii`, `verificari`, `avertismente`), dar fără `mp4` și `sha256_mp4`;
- `manifest: { cale, sha256 }`, cu `cale` de forma `video/<p>/serie/manifest.json` (relativă la rădăcină, cu `/`) și `sha256` hash-ul lui;
- `iesiri: [{ id, mp4, sha256_mp4, ok, obligatorii, verificari }]`, câte un element pe ieșire, cu `id` din `iesiri(date, ctx)` și `mp4` calea `video/<p>/serie/<NN>-<id>.mp4`.

Împărțirea pe niveluri:

- `obligatorii` de nivel superior = codurile declarate în `SABLON.md` cu stadiile `date`, `build` și `aprobare` (C08). `verificari` de nivel superior are rezultatele acestor stadii, comune tuturor ieșirilor, cu C08 inclus la randarea completă.
- Fiecare ieșire are propriile `obligatorii` (codurile declarate cu stadiul `mp4`) și propriile `verificari` (rezultatele ei pe MP4: C11-C16 declarate și codurile S de stadiu `mp4`).
- Regula „fiecare cod obligatoriu are rezultat și toate rezultatele trec” se aplică separat la nivelul superior și la fiecare ieșire. `ok` de nivel superior e adevărat doar dacă nivelul superior trece și `ok`-ul fiecărei ieșiri e adevărat; `ok` al unei ieșiri e adevărat doar dacă ale ei `verificari` trec și fiecare cod din `obligatorii` ei are rezultat.
- `ok_pentru_aprobare` se calculează doar din nivelul superior, ca la versiunea 1.

Exemplu (o serie cu două ieșiri, listele de rezultate prescurtate; fiecare cod din `obligatorii` are în fișierul real câte un rezultat în `verificari`):

```json
{
  "versiune": 2,
  "proiect": "serie-rutina",
  "sablon": "reel-ilustrat",
  "mod": "complet",
  "scris_la": "2026-10-14T09:00:00.000Z",
  "sha256_date": "3f1c…",
  "manifest": { "cale": "video/serie-rutina/serie/manifest.json", "sha256": "a91e…" },
  "ok": true,
  "ok_pentru_aprobare": true,
  "obligatorii": ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C17", "S01"],
  "verificari": [ { "cod": "C01", "ok": true, "valoare": {}, "prag": "…", "camp": null, "erori": [], "avertismente": [] } ],
  "iesiri": [
    { "id": "scurt", "mp4": "video/serie-rutina/serie/01-scurt.mp4", "sha256_mp4": "77b0…", "ok": true,
      "obligatorii": ["C11", "C12", "C13", "C14", "C15", "C16"],
      "verificari": [ { "cod": "C11", "ok": true, "valoare": {}, "prag": "…", "camp": null, "erori": [], "avertismente": [] } ] },
    { "id": "lung", "mp4": "video/serie-rutina/serie/02-lung.mp4", "sha256_mp4": "c3d2…", "ok": true,
      "obligatorii": ["C11", "C12", "C13", "C14", "C15", "C16"],
      "verificari": [ { "cod": "C11", "ok": true, "valoare": {}, "prag": "…", "camp": null, "erori": [], "avertismente": [] } ] }
  ],
  "avertismente": []
}
```

Regula hook-ului `Stop` pentru versiunea 2 (`nucleu/lib/garda/stop.mjs`, `problemaPredariiSerie`) păstrează toate verificările versiunii 1 care au sens. Toate acestea trebuie să fie adevărate:

1. `ok === true`, `mod === 'complet'` și `sha256_date` e egal cu hash-ul lui `date.json` de pe disc;
2. fiecare cod din `obligatorii` de nivel superior are rezultat verde în `verificari`;
3. manifestul există și are hash-ul înregistrat în `manifest.sha256`;
4. predarea numește `serie/manifest.json` sau un MP4 care apare în `iesiri`; orice altă cale e refuzată;
5. pentru fiecare ieșire: MP4-ul există, are hash-ul înregistrat în `sha256_mp4`, `ok === true` și fiecare cod din `obligatorii` ei are rezultat verde în `verificari`-le ei;
6. cadrele de predare ale fiecărei ieșiri există: `video/<proiect>/cadre/<id>/predare-1.png` și `predare-2.png`.

### Ce a adăugat felia 3

- `surse`: `{ "<cale relativă la proiect>": "<sha256>" | null }`, fișierele de intrare ale ieșirilor (hook-ul `surse` al șablonului: tabelul și pozele). O schimbare a tabelului nu trece prin `date.json`, deci fără acest câmp n-ar lăsa nicio urmă în verificare.
- S08 (seria întreagă) și S09 (schița seriei) au stadiul `mp4` în `SABLON.md`, dar stau la nivelul superior: sunt în `obligatorii` și `verificari` de sus la randarea completă și lipsesc din `obligatorii` ieșirilor. La un proiect cu un singur MP4, șablonul le dă verzi, cu `valoare: { aplicabil: false }`.
- La `doar-verificare` și `schita`, `manifest` e `null`, iar fiecare ieșire are `mp4: null`, `ok: false` și `verificari: []` (nimic randat încă). La `schita` se adaugă `schita: { foaie, iesiri }`. `ok` de sus spune doar că datele și build-urile trec (cu `obligatorii` de sus prezente); nu e o serie predabilă, regula Stop cere oricum `mod: complet`.
- La `complet` oprit înainte de randare (C08 sau S09 picate), `iesiri` are tot câte un element pe ieșire, cu `mp4: null` și `ok: false`, iar `manifest` e `null`.
- La `complet`, o ieșire are `sarit: true` (în `verificare.json` și în rezultatul lui `mg randeaza --json`) când MP4-ul ei a rămas cel din rularea anterioară (același build, MP4 neatins); regula Stop nu face nicio diferență.
- La regula Stop, punctul 4 primește și folderul `video/<proiect>/serie` (cu sau fără `/` la final). După o corectură, regula corecturii (versiunea 1) se aplică pe amprenta seriei (`amprentaSerie` din `nucleu/lib/fisiere.mjs`: hash-ul perechilor `[id, sha256_mp4]`) în locul hash-ului MP4-ului.
