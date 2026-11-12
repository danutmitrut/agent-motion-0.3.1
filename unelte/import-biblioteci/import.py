#!/usr/bin/env python3
"""Importul reproductibil al bibliotecii de desene (spec 8.7).

Îl rulează Dănuț pe Mac, nu cursanții. Doar biblioteca standard Python, plus:
- svgo 3.3.2, prin `npx --yes svgo@3.3.2` (Node trebuie să fie instalat);
- Google Chrome, pentru cutiile de încadrare, acoperirea de cerneală și foile de contact;
- `sips` (vine cu macOS), pentru conversia foilor în JPG.

Rulare, din rădăcina repo-ului:
    python3 unelte/import-biblioteci/import.py --arhiva "<folderul cu originalele>"
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import urllib.request
import xml.etree.ElementTree as ET
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

AICI = Path(__file__).resolve().parent
RADACINA = AICI.parents[1]
NS = "http://www.w3.org/2000/svg"
SVGO = "svgo@3.3.2"
CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PRAG_BUN = 0.05
PRAG_EVITA = 0.15
LATURA_MASURARE = 256
TERMEN_CHROME_S = 60
MARGINE_CUTIE = 0.02
TEME = ("noapte", "hartie", "curat")
FORME_SVG = ("path", "circle", "ellipse", "rect", "polygon", "polyline", "line")
INTERZISE = ("mask", "use", "image", "foreignObject", "script")
ROLURI_ORDINE = ("ink", "fond", "acc", "acc2")
URL_CC0 = "https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt"
SHA_CC0 = "a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499"
ARHIVA_IMPLICITA = Path.home() / "PROIECTE AI" / "motion-graphics" / "biblioteca-cursanti" / "originale"
EDITORIALE = ("personaj", "etichete", "descriere", "noapte", "teme_potrivite", "animatie", "de_etichetat")
ORDINE_CAMPURI = (
    "id", "tip", "familie", "sursa", "original", "fisier", "sha256", "kb", "cutie",
    "roluri", "recolorabil", "acoperire_cerneala",
    "personaj", "etichete", "descriere", "noapte", "teme_potrivite", "animatie", "de_etichetat",
)
SVGO_CONFIG = """export default {
  multipass: true,
  floatPrecision: 1,
  plugins: [
    { name: 'preset-default', params: { overrides: {
      removeViewBox: false,
      cleanupIds: { remove: true, minify: false },
      moveElemsAttrsToGroup: false,
      mergePaths: false
    } } },
    'removeDimensions',
    { name: 'convertTransform', params: { floatPrecision: 1 } }
  ]
};
"""
SURSE = {
    "open-doodles": {
        "nume": "Open Doodles", "autor": "Pablo Stanley", "url": "https://www.opendoodles.com",
        "descarcat_din": "S3", "licenta": "CC0-1.0",
        "licenta_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "dovada": ["dovezi/cc0-1.0.txt"], "nota": "",
    },
    "open-peeps": {
        "nume": "Open Peeps", "autor": "Pablo Stanley", "url": "https://www.openpeeps.com",
        "descarcat_din": "openpeeps.com (CDN Webflow)", "licenta": "CC0-1.0",
        "licenta_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "dovada": ["dovezi/cc0-1.0.txt"], "nota": "",
    },
    "lucide": {
        "nume": "Lucide", "autor": "Lucide Contributors", "url": "https://lucide.dev",
        "descarcat_din": "npm lucide-static@1.49.0", "licenta": "ISC",
        "licenta_url": "https://github.com/lucide-icons/lucide/blob/main/LICENSE",
        "dovada": ["dovezi/LICENSE-lucide.txt"], "nota": "", "versiune": "1.49.0",
        "catalog": "motoare/comun/iconite/lucide-1.49.0.json",
    },
}
SINONIME_INITIALE = {
    "copleșit": ["obosit", "epuizat", "stres"],
    "cafea": ["coffee", "cană"],
    "calm": ["liniște", "relaxat", "meditație"],
    "laptop": ["calculator", "birou", "lucru"],
    "telefon": ["mobil", "apel", "mesaj"],
}
ANIMATIE_FORMA = {"implicit": "contur-umplere", "alternative": ["aparitie"], "esalonare": 0.06, "accent": "aparitie"}


class EroareImport(Exception):
    """O problemă care oprește importul; mesajul numește piesa."""


class EroareDupaScriere(EroareImport):
    """Eșec în faza de scriere în biblioteci/, când o parte din fișiere sunt deja scrise."""


# ---------------------------------------------------------------- funcții pure (testate)

def rotunjeste(x, zecimale=1):
    """Rotunjire „jumătate în sus”, ca în Node; round() din Python rotunjește 0,25 la 0,2."""
    pas = Decimal(1).scaleb(-zecimale)
    return float(Decimal(repr(float(x))).quantize(pas, rounding=ROUND_HALF_UP))


def numar(x):
    """Un număr scris în SVG: o zecimală, fără zerouri inutile, fără „-0”."""
    v = rotunjeste(x, 1)
    if v == 0:
        return "0"
    text = f"{v:.1f}"
    return text[:-2] if text.endswith(".0") else text


def clasificaNoapte(acoperire, panouDinPiesa=False):
    """Eticheta pentru tema noapte (8.4.3, deciziile 7 și 15)."""
    if acoperire < PRAG_BUN:
        return "bun"
    if acoperire <= PRAG_EVITA:
        return "autocolant"
    return "autocolant" if panouDinPiesa else "evita"


def temePotrivite(noapte):
    return ["hartie", "curat"] if noapte == "evita" else ["noapte", "hartie", "curat"]


def normalizeazaCuloare(valoare):
    v = valoare.strip().lower()
    if v == "white":
        return "#ffffff"
    if v == "black":
        return "#000000"
    if re.fullmatch(r"#[0-9a-f]{3}", v):
        return "#" + "".join(c * 2 for c in v[1:])
    if re.fullmatch(r"#[0-9a-f]{6}", v):
        return v
    raise EroareImport(f"culoare într-un format necunoscut: {valoare}")


def rolPentruCuloare(roluri, sursa, culoare, idPiesa="?"):
    harta = roluri["surse"].get(sursa)
    if harta is None:
        raise EroareImport(f"{idPiesa}: sursa {sursa} nu are roluri în roluri.json")
    c = normalizeazaCuloare(culoare)
    if c not in harta:
        raise EroareImport(f"{idPiesa}: culoarea {c} nu e în roluri.json pentru {sursa}; piesa nu se importă")
    return harta[c]


def idPentruOriginal(selectie, sursa, original):
    nume = original if original.endswith(".svg") else original + ".svg"
    for p in selectie["piese"]:
        if p["sursa"] == sursa and p["original"] == nume:
            return p["id"]
    return None


def grupDinId(id_):
    """Grupul Open Peeps după id-ul unui strămoș (8.4.4, deciziile 10 și 16)."""
    if not id_:
        return None
    if id_.startswith(("pose/", "body/")):
        return "corp"
    if id_ == "Head" or id_.startswith(("head/", "accessories/")):
        return "cap"
    if id_.startswith(("face/", "facial-hair/")):
        return "fata"
    return None


def viewBoxCuMargine(cutie, margine=MARGINE_CUTIE):
    x, y, w, h = cutie
    mx, my = w * margine, h * margine
    return [rotunjeste(x - mx), rotunjeste(y - my), rotunjeste(w + 2 * mx), rotunjeste(h + 2 * my)]


def ordoneazaPiesa(piesa):
    return {k: piesa[k] for k in ORDINE_CAMPURI if k in piesa}


def fuzioneazaPiesa(veche, noua, recalculeazaNoapte=False):
    """Câmpurile tehnice vin din import, cele editoriale rămân din catalogul existent (8.5.3)."""
    if veche is None:
        return ordoneazaPiesa(noua)
    rez = dict(noua)
    for camp in EDITORIALE:
        if camp in veche:
            rez[camp] = veche[camp]
        elif camp == "de_etichetat":
            rez.pop(camp, None)
    if recalculeazaNoapte:
        rez["noapte"] = noua["noapte"]
        rez["teme_potrivite"] = noua["teme_potrivite"]
    return ordoneazaPiesa(rez)


def sha256Octeti(octeti):
    return hashlib.sha256(octeti).hexdigest()


def local(tag):
    return tag.split("}")[-1]


# ---------------------------------------------------------------- descărcare

def citesteJson(cale):
    with open(cale, encoding="utf-8") as f:
        return json.load(f)


def scrieJson(cale, obiect):
    Path(cale).parent.mkdir(parents=True, exist_ok=True)
    Path(cale).write_text(json.dumps(obiect, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def descarca(url):
    cerere = urllib.request.Request(url, headers={"User-Agent": "agent-motion-import/1"})
    with urllib.request.urlopen(cerere, timeout=60) as r:
        return r.read()


def aduOriginal(intrare, arhiva, idPiesa=None):
    """Originalul din arhivă sau, dacă lipsește, de la URL; sha256 trebuie să fie cel din surse.lock.json.

    Octeții descărcați intră în arhivă doar după ce sha256 se potrivește. Un fișier din arhivă cu hash greșit
    nu se șterge și nu se rescrie: mesajul îl numește, iar ștergerea o face Dănuț.
    """
    nume = f"{intrare['sursa']}/{intrare['original']}"
    eticheta = f"{idPiesa} ({nume})" if idPiesa else nume
    cale = Path(arhiva) / intrare["sursa"] / intrare["original"]
    asteptat = intrare["sha256"]
    if cale.exists():
        octeti = cale.read_bytes()
        primit = sha256Octeti(octeti)
        if primit != asteptat:
            raise EroareImport(
                f"{eticheta}: fișierul din arhivă {cale} are sha256 {primit}, iar surse.lock.json cere {asteptat}. "
                "Unealta nu-l șterge singură: șterge-l tu ca să fie descărcat din nou, apoi rulează importul.")
        return octeti
    octeti = descarca(intrare["url"])
    primit = sha256Octeti(octeti)
    if primit != asteptat:
        raise EroareImport(
            f"{eticheta}: ce s-a descărcat de la {intrare['url']} are sha256 {primit}, iar surse.lock.json cere {asteptat}. "
            "Nu s-a scris nimic în arhivă; importul se oprește.")
    cale.parent.mkdir(parents=True, exist_ok=True)
    cale.write_bytes(octeti)
    return octeti


# ---------------------------------------------------------------- normalizare SVG

def pregatesteOriginal(octeti, sursa, idPiesa):
    """Respinge ce nu are voie să intre și, la Open Peeps, pune data-grup pe fiecare formă, înainte de svgo."""
    ET.register_namespace("", NS)
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    radacina = ET.fromstring(octeti)
    for el in radacina.iter():
        tag = local(el.tag)
        if tag in INTERZISE:
            raise EroareImport(f"{idPiesa}: conține <{tag}>, piesa nu se importă")
        contur = el.get("stroke")
        if contur is not None and contur != "none":
            raise EroareImport(f"{idPiesa}: are contur trasat real (stroke={contur}), piesa nu se importă")
    if sursa == "open-peeps":
        def parcurge(el, grup):
            grup = grupDinId(el.get("id")) or grup
            if local(el.tag) in FORME_SVG:
                if grup is None:
                    raise EroareImport(f"{idPiesa}: o formă fără strămoș recunoscut (pose/, body/, Head, head/, accessories/, face/, facial-hair/)")
                el.set("data-grup", grup)
            for copil in el:
                parcurge(copil, grup)
        parcurge(radacina, None)
    return ET.tostring(radacina, encoding="unicode")


def ruleazaSvgo(dirIntrare, dirIesire, dirLucru):
    npx = shutil.which("npx")
    if npx is None:
        raise EroareImport("npx nu e instalat; instalează Node.js 22")
    config = Path(dirLucru) / "svgo.config.mjs"
    config.write_text(SVGO_CONFIG, encoding="utf-8")
    subprocess.run([npx, "--yes", SVGO, "--config", str(config), "-f", str(dirIntrare), "-o", str(dirIesire), "--quiet"], check=True)


def extrageForme(text, sursa, roluri, idPiesa):
    """Formele din ieșirea svgo, în ordinea din fișier: [{d, rol, grup, regula}] și viewBox-ul."""
    radacina = ET.fromstring(text)
    forme = []

    def parcurge(el, umplere, regula):
        umplere = el.get("fill", umplere)
        regula = el.get("fill-rule", regula)
        tag = local(el.tag)
        if tag == "path":
            if umplere != "none":
                forme.append({"d": el.get("d"), "rol": rolPentruCuloare(roluri, sursa, umplere, idPiesa),
                              "grup": el.get("data-grup"), "regula": regula})
        elif tag in FORME_SVG:
            raise EroareImport(f"{idPiesa}: <{tag}> a rămas după svgo; piesa nu se importă")
        for copil in el:
            parcurge(copil, umplere, regula)

    parcurge(radacina, "#000000", "nonzero")
    if not forme:
        raise EroareImport(f"{idPiesa}: nicio formă vizibilă după svgo")
    return radacina.get("viewBox"), forme


def svgIntermediar(idPiesa, viewBox, forme):
    parti = [f'<svg xmlns="{NS}" viewBox="{viewBox}" data-piesa="{idPiesa}" width="100" height="100">']
    for i, f in enumerate(forme):
        regula = ' fill-rule="evenodd"' if f["regula"] == "evenodd" else ""
        parti.append(f'<path data-i="{i}"{regula} d="{f["d"]}"/>')
    parti.append("</svg>")
    return "".join(parti)


def svgFinal(idPiesa, forme, cutiiForme, cutie):
    vb = viewBoxCuMargine(cutie)
    def linie(f, cuClasa):
        clasa = f' class="{f["rol"]}"' if cuClasa else ""
        grup = f' data-grup="{f["grup"]}"' if f.get("grup") else ""
        regula = ' fill-rule="evenodd"' if f["regula"] == "evenodd" else ""
        return f'<path{clasa}{grup}{regula} d="{f["d"]}"/>'
    jos = [linie(f, True) for f in forme if f["rol"] in ("acc", "acc2")]
    jos += [linie(f, True) for f in forme if f["rol"] == "fond"]
    cerneala = [(rotunjeste(cutiiForme[i][1]), i) for i, f in enumerate(forme) if f["rol"] == "ink"]
    cerneala.sort()
    parti = [f'<svg xmlns="{NS}" viewBox="{" ".join(numar(v) for v in vb)}" data-piesa="{idPiesa}">']
    parti += jos
    parti.append('<g class="ink">' + "".join(linie(forme[i], False) for _, i in cerneala) + "</g>")
    parti.append("</svg>")
    return "\n".join(parti) + "\n"


def svgMasurare(idPiesa, forme, cutie):
    """Varianta pentru acoperire: cerneala neagră, restul alb, viewBox pe cutia exactă, latura mare 256 px."""
    x, y, w, h = cutie
    k = LATURA_MASURARE / max(w, h)
    lat, ina = max(1, round(w * k)), max(1, round(h * k))
    parti = [f'<svg xmlns="{NS}" viewBox="{x} {y} {w} {h}" width="{lat}" height="{ina}">']
    for f in forme:
        culoare = "#000000" if f["rol"] == "ink" else "#ffffff"
        regula = ' fill-rule="evenodd"' if f["regula"] == "evenodd" else ""
        parti.append(f'<path fill="{culoare}"{regula} d="{f["d"]}"/>')
    parti.append("</svg>")
    return "".join(parti), lat, ina


# ---------------------------------------------------------------- Chrome

def gasesteChrome(cale):
    for c in (cale, os.environ.get("CHROME"), CHROME_MAC, shutil.which("google-chrome"), shutil.which("chromium")):
        if c and Path(c).exists():
            return c
    raise EroareImport("nu găsesc Google Chrome; dă calea cu --chrome")


def argumenteChrome(chrome, profil):
    return [chrome, "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
            "--allow-file-access-from-files", "--hide-scrollbars", "--force-device-scale-factor=1",
            f"--user-data-dir={profil}"]


def opresteGrup(proces):
    """Chrome pornește procese-copil: oprim tot grupul de procese, nu doar procesul principal.

    Pe Mac și Linux, grupul cu os.killpg. Pe Windows nu există os.killpg și nici signal.SIGKILL: oprim arborele
    cu taskkill /T /F, ca opresteArbore din nucleu/lib/procese.mjs. Oprirea nu aruncă niciodată, ca să nu
    ascundă eroarea originală (de exemplu termenul depășit).
    """
    if hasattr(os, "killpg") and hasattr(signal, "SIGKILL"):
        try:
            os.killpg(proces.pid, signal.SIGKILL)
        except OSError:
            pass
    else:
        try:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proces.pid)], capture_output=True, check=False)
        except OSError:
            pass
    try:
        proces.kill()
    except OSError:
        pass
    proces.wait()


def citesteChromePanaLa(argumente, flux, semn, termen=TERMEN_CHROME_S, descriere="Chrome"):
    """Pornește Chrome în propriul grup de procese și citește `flux` (stdout sau stderr) până la `semn`.

    Chrome headless nu iese singur după --dump-dom sau --screenshot, deci oprim noi grupul, mereu, în finally.
    Dacă `semn` nu apare în `termen` secunde, EroareImport. La sfârșitul fluxului fără semn se întoarce ce s-a citit.
    """
    proces = subprocess.Popen(
        argumente,
        stdout=subprocess.PIPE if flux == "stdout" else subprocess.DEVNULL,
        stderr=subprocess.PIPE if flux == "stderr" else subprocess.DEVNULL,
        text=True, encoding="utf-8", errors="replace", start_new_session=True)
    bucati = []
    gata = threading.Event()
    gasit = []

    def citeste():
        try:
            for linie in getattr(proces, flux):
                bucati.append(linie)
                if semn in linie:
                    gasit.append(True)
                    return
        finally:
            gata.set()

    fir = threading.Thread(target=citeste, daemon=True)
    fir.start()
    try:
        if not gata.wait(termen):
            raise EroareImport(f"{descriere}: Chrome nu a dat semnul „{semn}” în {termen} s; l-am oprit. "
                               "Verifică dacă Chrome pornește (se poate să se fi schimbat comportamentul unei versiuni noi).")
    finally:
        opresteGrup(proces)
        fir.join(5)
        for curent in (proces.stdout, proces.stderr):
            if curent is not None:
                curent.close()
    return "".join(bucati)


def chromeDumpDom(chrome, profil, html):
    """Chrome 154 nu iese singur după --dump-dom: citim până la </html>, apoi oprim grupul de procese."""
    text = citesteChromePanaLa(argumenteChrome(chrome, profil) + ["--dump-dom", Path(html).resolve().as_uri()],
                               "stdout", "</html>", descriere=f"măsurătorile din {Path(html).name}")
    m = re.search(r'<pre id="rezultat">(.*?)</pre>', text, re.S)
    if not m or not m.group(1).strip():
        raise EroareImport(f"Chrome nu a scris rezultatul pentru {html}")
    return json.loads(m.group(1).replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))


def chromeCaptura(chrome, profil, url, png, latime, inaltime):
    """--screenshot scrie fișierul și anunță pe stderr „bytes written to file”; apoi oprim grupul de procese."""
    citesteChromePanaLa(argumenteChrome(chrome, profil) + [f"--window-size={latime},{inaltime}", f"--screenshot={png}", url],
                        "stderr", "bytes written to file", descriere=f"captura {Path(png).name}")
    if not Path(png).exists():
        raise EroareImport(f"Chrome nu a scris captura {png}")


PAGINA_CUTII = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="piese">{svguri}</div><pre id="rezultat"></pre>
<script>
var r = {{piese: {{}}}};
document.querySelectorAll("#piese svg").forEach(function (s) {{
  var b = s.getBBox();
  var forme = [];
  s.querySelectorAll("path").forEach(function (p) {{ var c = p.getBBox(); forme[+p.dataset.i] = [c.x, c.y, c.width, c.height]; }});
  r.piese[s.dataset.piesa] = {{cutie: [b.x, b.y, b.width, b.height], forme: forme}};
}});
document.getElementById("rezultat").textContent = JSON.stringify(r);
</script></body></html>
"""

PAGINA_ACOPERIRE = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
{imagini}<pre id="rezultat"></pre>
<script>
window.addEventListener("load", function () {{
  var r = {{}};
  document.querySelectorAll("img[data-piesa]").forEach(function (img) {{
    var w = +img.getAttribute("width"), h = +img.getAttribute("height");
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h).data, n = 0;
    for (var i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
    r[img.dataset.piesa] = n / (w * h);
  }});
  document.getElementById("rezultat").textContent = JSON.stringify(r);
}});
</script></body></html>
"""


# ---------------------------------------------------------------- foile de contact

def paginaFoaie(catalog, shaCatalog, teme):
    culori = {t: {"fundal": v["culori"]["fundal"], "text": v["culori"]["text"], "accent": v["culori"]["accent"]} for t, v in teme.items()}
    piese = [{"id": p["id"], "tip": p["tip"], "fisier": "../" + p["fisier"], "noapte": p["noapte"]} for p in catalog["piese"]]
    return f"""<!DOCTYPE html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="catalog-sha256" content="{shaCatalog}">
<title>Foaia bibliotecii</title>
<style>
body{{margin:0;background:var(--fundal);color:var(--text);font:11px/1.2 Helvetica,Arial,sans-serif}}
#grila{{display:grid;grid-template-columns:repeat(10,150px);padding:16px}}
.celula{{width:150px;height:170px;box-sizing:border-box;padding:6px}}
.desen{{width:138px;height:138px}}
.desen svg{{width:100%;height:100%}}
.ink{{fill:var(--linie)}}.fond{{fill:var(--fundal)}}.acc,.acc2{{fill:var(--accent)}}
.id{{text-align:center;margin-top:6px}}
.evita .id::after{{content:" \\25CF";color:var(--accent)}}
</style></head>
<body><div id="grila"></div>
<script>
var TEME = {json.dumps(culori, ensure_ascii=False)};
var PIESE = {json.dumps(piese, ensure_ascii=False)};
var tema = TEME[new URLSearchParams(location.search).get("tema")] || TEME.noapte;
var radacina = document.documentElement.style;
radacina.setProperty("--fundal", tema.fundal); radacina.setProperty("--text", tema.text);
radacina.setProperty("--linie", tema.text); radacina.setProperty("--accent", tema.accent);
function citeste(cale) {{ var r = new XMLHttpRequest(); r.open("GET", cale, false); r.send(); return r.responseText; }}
var grila = document.getElementById("grila");
PIESE.forEach(function (p) {{
  var c = document.createElement("div"); c.className = "celula" + (p.noapte === "evita" ? " evita" : "");
  var d = document.createElement("div"); d.className = "desen";
  d.innerHTML = citeste(p.fisier);
  var e = document.createElement("div"); e.className = "id"; e.textContent = p.id;
  c.appendChild(d); c.appendChild(e); grila.appendChild(c);
}});
</script></body></html>
"""


def randeazaFoi(chrome, profil, dirBiblioteci, numarPiese):
    randuri = max(1, -(-numarPiese // 10))
    latime, inaltime = 10 * 150 + 32, randuri * 170 + 32
    html = (Path(dirBiblioteci) / "foi" / "foaie.html").resolve()
    for tema in TEME:
        png = Path(dirBiblioteci) / "foi" / f"foaie-{tema}.png"
        jpg = Path(dirBiblioteci) / "foi" / f"foaie-{tema}.jpg"
        chromeCaptura(chrome, profil, html.as_uri() + f"?tema={tema}", str(png.resolve()), latime, inaltime)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "60", str(png), "--out", str(jpg)],
                       check=True, stdout=subprocess.DEVNULL)
        png.unlink()


# ---------------------------------------------------------------- licențe

def scrieLicente(cale, surse):
    randuri = ["# Licențele bibliotecii de desene", "",
               "Fișier generat de `unelte/import-biblioteci/import.py`. Nu-l edita de mână; schimbă `nota` sau `dovada` în `catalog.json` și rulează din nou importul.", ""]
    for cheie, s in surse.items():
        randuri += [f"## {s['nume']}", "",
                    f"- Autor: {s['autor']}",
                    f"- Sursa: {s['url'] or 'arhiva privată a lui Dănuț Mitruț'}",
                    f"- Descărcat din: {s['descarcat_din'] or 'nu se aplică'}",
                    f"- Licența: {s['licenta']}" + (f" ({s['licenta_url']})" if s.get("licenta_url") else ""),
                    f"- Verificat la: {s['verificat']}",
                    f"- Dovezi: {', '.join(s['dovada']) if s['dovada'] else 'nu se aplică'}"]
        if s.get("licenta_text"):
            randuri.append(f"- Termeni: {s['licenta_text']}")
        if s.get("generat_cu"):
            randuri.append(f"- Generat cu: {s['generat_cu']}, apoi vectorizat")
        if s.get("nota"):
            randuri.append(f"- Notă: {s['nota']}")
        randuri.append("")
    randuri += ["## Ce am modificat", "",
                "Formele Open Doodles și Open Peeps sunt normalizate: viewBox decupat pe cutia de încadrare plus 2%, culorile înlocuite cu clase de rol (ink, fond, acc, acc2), id-urile, comentariile, titlurile și dimensiunile șterse, transformările aplatizate, coordonatele rotunjite la o zecimală. Nicio piesă nu e altfel modificată.", ""]
    Path(cale).write_text("\n".join(randuri), encoding="utf-8", newline="\n")


def scrieDovezi(dirBiblioteci, dirExistent=None):
    """Scrie dovezile în `dirBiblioteci` (în faza de pregătire, folderul de lucru). Un cc0-1.0.txt valid din
    `dirExistent` (biblioteci/ din repo) se refolosește, ca să nu mai fie descărcat."""
    dovezi = Path(dirBiblioteci) / "dovezi"
    dovezi.mkdir(parents=True, exist_ok=True)
    cc0 = dovezi / "cc0-1.0.txt"
    octeti = None
    if dirExistent is not None:
        existent = Path(dirExistent) / "dovezi" / "cc0-1.0.txt"
        if existent.exists() and sha256Octeti(existent.read_bytes()) == SHA_CC0:
            octeti = existent.read_bytes()
    if octeti is None:
        octeti = descarca(URL_CC0)
        if sha256Octeti(octeti) != SHA_CC0:
            raise EroareImport("textul CC0 descărcat are alt sha256 decât cel verificat pe 2026-10-01")
    cc0.write_bytes(octeti)
    lucide = RADACINA / "motoare" / "comun" / "iconite" / "LICENSE-lucide.txt"
    if not lucide.exists():
        raise EroareImport("lipsește motoare/comun/iconite/LICENSE-lucide.txt (vine din sarcina B03)")
    shutil.copyfile(lucide, dovezi / "LICENSE-lucide.txt")


# ---------------------------------------------------------------- catalogul și scrierea

def construiesteCatalog(vechi, noi, azi, recalculeazaNoapte=False):
    """Catalogul nou din catalogul vechi și piesele importate acum (`noi`, după id).

    O piesă din catalogul vechi care nu mai e în `noi` iese din catalog, ca la orice piesă scoasă din selecție.
    """
    vechiPiese = {p["id"]: p for p in vechi.get("piese", [])}
    surse = {}
    for cheie, baza in SURSE.items():
        s = dict(baza)
        veche = vechi.get("surse", {}).get(cheie, {})
        s["dovada"] = veche.get("dovada", s["dovada"])
        s["nota"] = veche.get("nota", s["nota"])
        s["verificat"] = veche.get("verificat", azi)
        surse[cheie] = s
    piese = [fuzioneazaPiesa(vechiPiese.get(i), noi[i], recalculeazaNoapte) for i in sorted(noi)]
    return {"versiune": 1, "surse": surse, "piese": piese, "sinonime": vechi.get("sinonime") or SINONIME_INITIALE}


def ordineScrieri(relative):
    """Ordinea scrierii în biblioteci/: tot ce nu e catalog întâi, apoi catalog.json și foaie.html, unul lângă altul."""
    coada = [c for c in ("catalog.json", "foi/foaie.html") if c in relative]
    return [r for r in relative if r not in coada] + coada


def scrieDinStaging(stage, destinatie, relative):
    """Copiază din folderul de lucru în biblioteci/. Ultima fază, fără nimic de calculat în ea.

    La un eșec, EroareDupaScriere spune ce s-a scris deja.
    """
    scrise = []
    for rel in ordineScrieri(relative):
        try:
            tinta = Path(destinatie) / rel
            tinta.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(stage) / rel, tinta)
        except OSError as e:
            raise EroareDupaScriere(
                f"Eroare la scrierea {rel}: {e}\n"
                f"S-au scris deja {len(scrise)} din {len(relative)} fișiere"
                f"{' (ultimul: ' + scrise[-1] + ')' if scrise else ''}. "
                "Biblioteca din biblioteci/ poate fi pe jumătate nouă: o nouă rulare a importului repară totul.") from e
        scrise.append(rel)
    return scrise


# ---------------------------------------------------------------- importul

MESAJ_ONE_LINE = "Desenele one-line nu fac parte din biblioteca agentului (decizia din 2026-10-07)"


def importa(argumente):
    if (RADACINA / "biblioteci" / "trasee").exists():
        raise EroareImport(MESAJ_ONE_LINE)
    selectie = citesteJson(AICI / "selectie.json")
    lock = citesteJson(AICI / "surse.lock.json")
    roluri = citesteJson(AICI / "roluri.json")
    dirBiblioteci = RADACINA / "biblioteci"
    chrome = gasesteChrome(argumente.chrome)
    azi = datetime.date.today().isoformat()
    erori = []

    intrariLock = {(f["sursa"], f["original"]): f for f in lock["fisiere"]}
    lucru = Path(tempfile.mkdtemp(prefix="import-biblioteci-"))
    profil = lucru / "chrome-profil"
    dirBrut, dirSvgo = lucru / "brut", lucru / "svgo"
    dirBrut.mkdir()
    dirSvgo.mkdir()

    # 1-2: descărcare cu sha256, selecție, pregătire (data-grup înainte de svgo)
    piese = []
    for p in selectie["piese"]:
        try:
            intrare = intrariLock.get((p["sursa"], p["original"]))
            if intrare is None:
                raise EroareImport(f"{p['id']}: {p['sursa']}/{p['original']} lipsește din surse.lock.json")
            octeti = aduOriginal(intrare, argumente.arhiva, p["id"])
            (dirBrut / f"{p['id']}.svg").write_text(pregatesteOriginal(octeti, p["sursa"], p["id"]), encoding="utf-8")
            piese.append(p)
        except EroareImport as e:
            erori.append(str(e))
    if erori:
        raise EroareImport("\n".join(erori))

    # 3: svgo, apoi formele și rolurile
    ruleazaSvgo(dirBrut, dirSvgo, lucru)
    forme = {}
    for p in piese:
        try:
            viewBox, lista = extrageForme((dirSvgo / f"{p['id']}.svg").read_text(encoding="utf-8"), p["sursa"], roluri, p["id"])
            forme[p["id"]] = (viewBox, lista)
        except EroareImport as e:
            erori.append(str(e))
    if erori:
        raise EroareImport("\n".join(erori))

    # cutiile (getBBox), în Chrome
    pagina = lucru / "cutii.html"
    pagina.write_text(PAGINA_CUTII.format(
        svguri="".join(svgIntermediar(i, vb, l) for i, (vb, l) in forme.items()),
    ), encoding="utf-8")
    masuri = chromeDumpDom(chrome, profil, pagina)

    # 3 (final): SVG-ul normalizat; 4: măsurătorile. Nimic nu se scrie încă în biblioteci/: totul în folderul de lucru.
    stage = lucru / "biblioteci"
    for sub in ("forme", "dovezi", "foi"):
        (stage / sub).mkdir(parents=True)
    relative = []
    noi, imagini = {}, []
    for p in piese:
        _, lista = forme[p["id"]]
        m = masuri["piese"][p["id"]]
        text = svgFinal(p["id"], lista, m["forme"], m["cutie"])
        (stage / "forme" / f"{p['id']}.svg").write_text(text, encoding="utf-8", newline="\n")
        relative.append(f"forme/{p['id']}.svg")
        octeti = text.encode("utf-8")
        vb = viewBoxCuMargine(m["cutie"])
        roluriPiesa = [r for r in ROLURI_ORDINE if any(f["rol"] == r for f in lista)]
        noi[p["id"]] = {
            "id": p["id"], "tip": "forma", "familie": "cerneala", "sursa": p["sursa"], "original": p["original"],
            "fisier": f"forme/{p['id']}.svg", "sha256": sha256Octeti(octeti), "kb": rotunjeste(len(octeti) / 1024, 1),
            "cutie": {"w": round(vb[2]), "h": round(vb[3])}, "roluri": roluriPiesa, "recolorabil": True,
            "personaj": None, "etichete": [], "descriere": "", "animatie": dict(ANIMATIE_FORMA), "de_etichetat": True,
        }
        svgM, lat, ina = svgMasurare(p["id"], lista, m["cutie"])
        imagini.append(f'<img data-piesa="{p["id"]}" width="{lat}" height="{ina}" src="data:image/svg+xml;base64,'
                       + base64.b64encode(svgM.encode("utf-8")).decode("ascii") + '">')
    pagina2 = lucru / "acoperire.html"
    pagina2.write_text(PAGINA_ACOPERIRE.format(imagini="".join(imagini)), encoding="utf-8")
    acoperiri = chromeDumpDom(chrome, profil, pagina2)
    for idPiesa, piesa in noi.items():
        a = rotunjeste(acoperiri[idPiesa], 3)
        piesa["acoperire_cerneala"] = a
        piesa["noapte"] = clasificaNoapte(a, panouDinPiesa=piesa["sursa"] == "open-peeps")
        piesa["teme_potrivite"] = temePotrivite(piesa["noapte"])

    # 5: fuziunea catalogului după id
    caleCatalog = dirBiblioteci / "catalog.json"
    vechi = citesteJson(caleCatalog) if caleCatalog.exists() else {"versiune": 1, "surse": {}, "piese": [], "sinonime": {}}
    catalog = construiesteCatalog(vechi, noi, azi, argumente.recalculeaza_noapte)
    scrieJson(stage / "catalog.json", catalog)

    # LICENTE.md, dovezi/, foaie.html și foile, tot în folderul de lucru (dovezile se verifică aici, înainte de orice scriere)
    scrieLicente(stage / "LICENTE.md", catalog["surse"])
    scrieDovezi(stage, dirBiblioteci)
    shaCatalog = sha256Octeti((stage / "catalog.json").read_bytes())
    teme = {t: citesteJson(RADACINA / "motoare" / "comun" / "teme" / f"{t}.json") for t in TEME}
    (stage / "foi" / "foaie.html").write_text(paginaFoaie(catalog, shaCatalog, teme), encoding="utf-8", newline="\n")
    if not argumente.fara_foi:
        randeazaFoi(chrome, profil, stage, len(catalog["piese"]))
    relative += ["LICENTE.md", "dovezi/cc0-1.0.txt", "dovezi/LICENSE-lucide.txt", "catalog.json", "foi/foaie.html"]
    if not argumente.fara_foi:
        relative += [f"foi/foaie-{tema}.jpg" for tema in TEME]

    # Abia acum se scrie în biblioteci/: forme, licențe, dovezi, foi, apoi catalog.json și foaie.html la urmă
    scrieDinStaging(stage, dirBiblioteci, relative)
    for i in sorted(set(piesa["id"] for piesa in vechi.get("piese", [])) - set(piesa["id"] for piesa in catalog["piese"])):
        print(f"Atenție: {i} era în catalog și nu mai e în selecție; fișierul lui rămâne în biblioteci/ până îl ștergi tu.")
    shutil.rmtree(lucru, ignore_errors=True)

    deEtichetat = [p["id"] for p in catalog["piese"] if p.get("de_etichetat")]
    print(f"Import gata: {len(catalog['piese'])} piese în biblioteci/catalog.json.")
    print(f"Pe noapte: " + ", ".join(f"{k} {sum(1 for p in catalog['piese'] if p['noapte'] == k)}" for k in ("bun", "autocolant", "evita")))
    if deEtichetat:
        print(f"De etichetat ({len(deEtichetat)}): {', '.join(deEtichetat)}")
    print("Uită-te la biblioteci/foi/foaie-noapte.jpg, foaie-hartie.jpg și foaie-curat.jpg înainte de commit.")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Importul bibliotecii de desene (spec 8.7). Doar pe Mac.")
    parser.add_argument("--arhiva", default=str(ARHIVA_IMPLICITA), help="folderul cu originalele descărcate (<sursa>/<fisier>)")
    parser.add_argument("--chrome", default=None, help="calea spre Google Chrome")
    parser.add_argument("--recalculeaza-noapte", action="store_true", help="suprascrie noapte și teme_potrivite și la piesele existente")
    parser.add_argument("--fara-foi", action="store_true", help="nu randa foile de contact (doar foaie.html)")
    argumente = parser.parse_args(argv)
    try:
        importa(argumente)
    except EroareImport as e:
        if isinstance(e, EroareDupaScriere):
            print(f"Importul s-a oprit în timpul scrierii în biblioteci/:\n{e}", file=sys.stderr)
        else:
            print(f"Importul s-a oprit, nu s-a scris nimic în biblioteci/:\n{e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
