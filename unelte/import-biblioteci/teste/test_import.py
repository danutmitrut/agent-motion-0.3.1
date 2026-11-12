"""Testele funcțiilor pure din import.py. Rulare: python3 -m unittest discover -s unelte/import-biblioteci/teste"""
import argparse
import contextlib
import hashlib
import io
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path

DIR = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("import_biblioteci", DIR / "import.py")
imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(imp)

SELECTIE = json.loads((DIR / "selectie.json").read_text(encoding="utf-8"))
LOCK = json.loads((DIR / "surse.lock.json").read_text(encoding="utf-8"))
ROLURI = json.loads((DIR / "roluri.json").read_text(encoding="utf-8"))
NS = "http://www.w3.org/2000/svg"


class TestNoapte(unittest.TestCase):
    def test_praguri(self):
        self.assertEqual(imp.clasificaNoapte(0.04), "bun")
        self.assertEqual(imp.clasificaNoapte(0.05), "autocolant")
        self.assertEqual(imp.clasificaNoapte(0.10), "autocolant")
        self.assertEqual(imp.clasificaNoapte(0.15), "autocolant")
        self.assertEqual(imp.clasificaNoapte(0.16), "evita")
        self.assertEqual(imp.clasificaNoapte(0.70), "evita")

    def test_open_peeps_are_panou_din_piesa(self):
        self.assertEqual(imp.clasificaNoapte(0.40, panouDinPiesa=True), "autocolant")
        self.assertEqual(imp.clasificaNoapte(0.04, panouDinPiesa=True), "bun")

    def test_teme_potrivite(self):
        self.assertEqual(imp.temePotrivite("evita"), ["hartie", "curat"])
        self.assertEqual(imp.temePotrivite("autocolant"), ["noapte", "hartie", "curat"])
        self.assertEqual(imp.temePotrivite("bun"), ["noapte", "hartie", "curat"])


class TestCulori(unittest.TestCase):
    def test_normalizare(self):
        self.assertEqual(imp.normalizeazaCuloare("#FFF"), "#ffffff")
        self.assertEqual(imp.normalizeazaCuloare("white"), "#ffffff")
        self.assertEqual(imp.normalizeazaCuloare(" #FF5678 "), "#ff5678")
        with self.assertRaises(imp.EroareImport):
            imp.normalizeazaCuloare("rgb(0,0,0)")

    def test_roluri(self):
        self.assertEqual(imp.rolPentruCuloare(ROLURI, "open-doodles", "#000"), "ink")
        self.assertEqual(imp.rolPentruCuloare(ROLURI, "open-doodles", "#FF5678"), "acc")
        self.assertEqual(imp.rolPentruCuloare(ROLURI, "open-doodles", "#CF536D"), "acc2")
        self.assertEqual(imp.rolPentruCuloare(ROLURI, "open-peeps", "#231F20"), "ink")
        self.assertEqual(imp.rolPentruCuloare(ROLURI, "open-peeps", "#FFF"), "fond")
        self.assertEqual(imp.rolPentruCuloare(ROLURI, "open-peeps", "#4F66AF"), "acc")

    def test_culoare_necunoscuta_opreste_piesa(self):
        with self.assertRaises(imp.EroareImport) as ctx:
            imp.rolPentruCuloare(ROLURI, "open-peeps", "#123456", "op-x")
        self.assertIn("op-x", str(ctx.exception))


class TestSelectie(unittest.TestCase):
    def test_peep_standing_16(self):
        self.assertEqual(imp.idPentruOriginal(SELECTIE, "open-peeps", "peep-standing-16"), "op-picioare-arata")
        self.assertTrue(imp.idPentruOriginal(SELECTIE, "open-peeps", "peep-standing-16.svg").startswith("op-"))
        self.assertIsNone(imp.idPentruOriginal(SELECTIE, "open-peeps", "peep-sitting-11"))

    def test_prefixe_si_numar(self):
        piese = SELECTIE["piese"]
        self.assertEqual(len(piese), 52)
        for p in piese:
            prefix = {"open-doodles": "od-", "open-peeps": "op-"}[p["sursa"]]
            self.assertTrue(p["id"].startswith(prefix), p["id"])
            self.assertRegex(p["id"], r"^[a-z0-9-]+$")
        self.assertEqual(len({p["id"] for p in piese}), 52)

    def test_fiecare_piesa_are_lock(self):
        chei = {(f["sursa"], f["original"]) for f in LOCK["fisiere"]}
        for p in SELECTIE["piese"]:
            self.assertIn((p["sursa"], p["original"]), chei)
        for f in LOCK["fisiere"]:
            self.assertRegex(f["sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(f["url"].startswith("https://"))


class TestRotunjiri(unittest.TestCase):
    def test_jumatate_in_sus(self):
        self.assertEqual(imp.rotunjeste(0.25, 1), 0.3)
        self.assertEqual(imp.rotunjeste(2.345, 2), 2.35)
        self.assertEqual(imp.rotunjeste(0.04449, 3), 0.044)

    def test_numar_svg(self):
        self.assertEqual(imp.numar(812.0), "812")
        self.assertEqual(imp.numar(-0.04), "0")
        self.assertEqual(imp.numar(-5.94), "-5.9")
        self.assertEqual(imp.numar(12.25), "12.3")

    def test_viewbox_cu_margine(self):
        self.assertEqual(imp.viewBoxCuMargine([0, 0, 100, 50]), [-2.0, -1.0, 104.0, 52.0])


class TestGrupuri(unittest.TestCase):
    def test_grup_din_id(self):
        self.assertEqual(imp.grupDinId("pose/standing/pointing_finger-1"), "corp")
        self.assertEqual(imp.grupDinId("body/Hoodie"), "corp")
        self.assertEqual(imp.grupDinId("Head"), "cap")
        self.assertEqual(imp.grupDinId("head/Bun-2"), "cap")
        self.assertEqual(imp.grupDinId("accessories/Glasses-5"), "cap")
        self.assertEqual(imp.grupDinId("face/Calm"), "fata")
        self.assertEqual(imp.grupDinId("facial-hair/Beard"), "fata")
        self.assertIsNone(imp.grupDinId("Introduction"))
        self.assertIsNone(imp.grupDinId(None))

    def test_pregatire_open_peeps(self):
        svg = (f'<svg xmlns="{NS}" viewBox="0 0 10 10"><g id="a-person"><g id="Head"><g id="face/Calm">'
               '<path d="M0 0h1v1z" fill="#000"/></g><path d="M2 2h1v1z" fill="#FFF"/></g>'
               '<g id="body/x"><path d="M5 5h1v1z" fill="#000"/></g></g></svg>').encode()
        text = imp.pregatesteOriginal(svg, "open-peeps", "op-test")
        self.assertEqual(re.findall(r'data-grup="(\w+)"', text), ["fata", "cap", "corp"])

    def test_forma_fara_grup_opreste_piesa(self):
        svg = f'<svg xmlns="{NS}"><g id="Introduction"><path d="M0 0h1v1z"/></g></svg>'.encode()
        with self.assertRaises(imp.EroareImport) as ctx:
            imp.pregatesteOriginal(svg, "open-peeps", "op-fara-grup")
        self.assertIn("op-fara-grup", str(ctx.exception))

    def test_respinge_image_si_contur(self):
        with self.assertRaises(imp.EroareImport):
            imp.pregatesteOriginal(f'<svg xmlns="{NS}"><image href="x.png"/></svg>'.encode(), "open-doodles", "od-x")
        with self.assertRaises(imp.EroareImport):
            imp.pregatesteOriginal(f'<svg xmlns="{NS}"><path d="M0 0h1" stroke="#000"/></svg>'.encode(), "open-doodles", "od-x")


class TestSvg(unittest.TestCase):
    def test_extrage_forme_mosteneste_umplerea(self):
        text = (f'<svg xmlns="{NS}" viewBox="0 0 10 10"><g fill="none" fill-rule="evenodd">'
                '<path fill="#FF5678" d="M1 1h1"/><path fill="#000" d="M2 2h1"/><path d="M3 3h1"/></g></svg>')
        vb, forme = imp.extrageForme(text, "open-doodles", ROLURI, "od-x")
        self.assertEqual(vb, "0 0 10 10")
        self.assertEqual([f["rol"] for f in forme], ["acc", "ink"])
        self.assertEqual({f["regula"] for f in forme}, {"evenodd"})

    def test_svg_final(self):
        forme = [
            {"d": "M0 50h1", "rol": "ink", "grup": "corp", "regula": "nonzero"},
            {"d": "M0 10h1", "rol": "ink", "grup": "cap", "regula": "evenodd"},
            {"d": "M0 0h9", "rol": "acc", "grup": None, "regula": "nonzero"},
        ]
        cutii = [[0, 50, 1, 1], [0, 10, 1, 1], [0, 0, 9, 9]]
        text = imp.svgFinal("op-x", forme, cutii, [0, 0, 100, 100])
        self.assertTrue(text.startswith(f'<svg xmlns="{NS}" viewBox="-2 -2 104 104" data-piesa="op-x">'))
        self.assertLess(text.index('class="acc"'), text.index('<g class="ink">'))
        self.assertLess(text.index('data-grup="cap"'), text.index('data-grup="corp"'))
        self.assertNotIn(" id=", text)
        self.assertNotIn("fill=", text)
        self.assertTrue(text.endswith("</svg>\n"))


class TestCatalog(unittest.TestCase):
    def test_fuziune_pastreaza_editorialele(self):
        veche = {"id": "od-a", "kb": 1.0, "etichete": ["calm", "liniște", "meditație", "respirație"], "descriere": "x",
                 "noapte": "bun", "teme_potrivite": ["noapte", "hartie", "curat"], "personaj": {"numar": 1}, "animatie": {"implicit": "aparitie"}}
        noua = {"id": "od-a", "tip": "forma", "kb": 2.0, "etichete": [], "descriere": "", "noapte": "evita",
                "teme_potrivite": ["hartie", "curat"], "personaj": None, "animatie": {"implicit": "contur-umplere"}, "de_etichetat": True}
        rez = imp.fuzioneazaPiesa(veche, noua)
        self.assertEqual(rez["kb"], 2.0)
        self.assertEqual(rez["etichete"], veche["etichete"])
        self.assertEqual(rez["noapte"], "bun")
        self.assertNotIn("de_etichetat", rez)
        self.assertEqual(list(rez)[:3], ["id", "tip", "kb"])
        rez2 = imp.fuzioneazaPiesa(veche, noua, recalculeazaNoapte=True)
        self.assertEqual(rez2["noapte"], "evita")
        self.assertEqual(rez2["teme_potrivite"], ["hartie", "curat"])

    def test_piesa_noua_ramane_de_etichetat(self):
        noua = {"id": "od-b", "tip": "forma", "etichete": [], "de_etichetat": True}
        self.assertTrue(imp.fuzioneazaPiesa(None, noua)["de_etichetat"])


class TestArhiva(unittest.TestCase):
    """I1: originalul se verifică înainte să intre în arhivă."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.arhiva = Path(self._tmp.name)
        self._descarca = imp.descarca
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(lambda: setattr(imp, "descarca", self._descarca))

    def intrare(self, octeti):
        return {"sursa": "open-peeps", "original": "peep-1.svg", "url": "https://exemplu.invalid/peep-1.svg",
                "sha256": hashlib.sha256(octeti).hexdigest()}

    def test_hash_gresit_la_descarcare_nu_scrie_in_arhiva(self):
        imp.descarca = lambda url: b"<html>pagina de eroare</html>"
        intrare = self.intrare(b"<svg/>")
        with self.assertRaises(imp.EroareImport) as ctx:
            imp.aduOriginal(intrare, self.arhiva, "op-test")
        mesaj = str(ctx.exception)
        self.assertIn("op-test", mesaj)
        self.assertIn(intrare["sha256"], mesaj)
        self.assertIn(hashlib.sha256(b"<html>pagina de eroare</html>").hexdigest(), mesaj)
        self.assertEqual(list(self.arhiva.rglob("*")), [])

    def test_descarcare_corecta_intra_in_arhiva(self):
        imp.descarca = lambda url: b"<svg/>"
        self.assertEqual(imp.aduOriginal(self.intrare(b"<svg/>"), self.arhiva, "op-test"), b"<svg/>")
        self.assertEqual((self.arhiva / "open-peeps" / "peep-1.svg").read_bytes(), b"<svg/>")

    def test_fisier_vechi_cu_hash_gresit_nu_se_sterge_si_nu_se_descarca(self):
        cale = self.arhiva / "open-peeps" / "peep-1.svg"
        cale.parent.mkdir(parents=True)
        cale.write_bytes(b"vechi stricat")
        apeluri = []
        imp.descarca = lambda url: apeluri.append(url) or b"<svg/>"
        with self.assertRaises(imp.EroareImport) as ctx:
            imp.aduOriginal(self.intrare(b"<svg/>"), self.arhiva, "op-test")
        self.assertIn(str(cale), str(ctx.exception))
        self.assertIn("șterge", str(ctx.exception))
        self.assertEqual(cale.read_bytes(), b"vechi stricat")
        self.assertEqual(apeluri, [])


class TestChromeTermen(unittest.TestCase):
    """I2: termen de așteptare și oprirea grupului de procese, probate cu un proces fals în loc de Chrome."""

    def test_citeste_pana_la_semn(self):
        cod = "print('a'); print('</html>', flush=True); import time; time.sleep(30)"
        text = imp.citesteChromePanaLa([sys.executable, "-c", cod], "stdout", "</html>", termen=20)
        self.assertIn("</html>", text)

    def test_termenul_depasit_da_eroare_in_romana(self):
        cod = "import time; print('nimic', flush=True); time.sleep(30)"
        with self.assertRaises(imp.EroareImport) as ctx:
            imp.citesteChromePanaLa([sys.executable, "-c", cod], "stdout", "</html>", termen=1, descriere="proba")
        self.assertIn("proba", str(ctx.exception))
        self.assertIn("1 s", str(ctx.exception))

    @unittest.skipUnless(hasattr(os, "killpg"), "grupuri de procese doar pe Mac și Linux")
    def test_nu_ramane_niciun_proces_copil(self):
        cod = ("import subprocess, sys, time\n"
               "c = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
               "print('PID', c.pid, flush=True); print('</html>', flush=True); time.sleep(60)\n")
        text = imp.citesteChromePanaLa([sys.executable, "-c", cod], "stdout", "</html>", termen=20)
        pid = int(re.search(r"PID (\d+)", text).group(1))
        with self.assertRaises(ProcessLookupError):
            for _ in range(50):
                os.kill(pid, 0)
                time.sleep(0.1)


class TestChromeTermenFaraGrupuri(unittest.TestCase):
    """W1: pe Windows lipsesc os.killpg și signal.SIGKILL; oprirea trece prin taskkill /T /F, fără AttributeError.

    Simulăm Windows pe orice sistem: scoatem os.killpg (signal.SIGKILL rămâne, îl folosește proces.kill() pe Mac și
    Linux) și înlocuim subprocess.run, pentru că taskkill nu există acolo; procesul de probă se oprește prin proces.kill().
    """

    def setUp(self):
        self.scoase = []
        if hasattr(os, "killpg"):
            self.scoase.append((os, "killpg", os.killpg))
            del os.killpg
        self.apeluri = []
        self.run_real = subprocess.run
        subprocess.run = lambda argumente, **kw: self.apeluri.append(argumente) or subprocess.CompletedProcess(argumente, 0)

    def tearDown(self):
        subprocess.run = self.run_real
        for modul, nume, valoare in self.scoase:
            setattr(modul, nume, valoare)

    def test_citeste_pana_la_semn(self):
        cod = "print('a'); print('</html>', flush=True); import time; time.sleep(30)"
        text = imp.citesteChromePanaLa([sys.executable, "-c", cod], "stdout", "</html>", termen=20)
        self.assertIn("</html>", text)
        self.assertEqual(len(self.apeluri), 1)
        self.assertEqual(self.apeluri[0][:4], ["taskkill", "/T", "/F", "/PID"])

    def test_termenul_depasit_da_eroare_in_romana(self):
        cod = "import time; print('nimic', flush=True); time.sleep(30)"
        with self.assertRaises(imp.EroareImport) as ctx:
            imp.citesteChromePanaLa([sys.executable, "-c", cod], "stdout", "</html>", termen=1, descriere="proba")
        self.assertIn("proba", str(ctx.exception))
        self.assertEqual(self.apeluri[0][:4], ["taskkill", "/T", "/F", "/PID"])


class TestFaraTrasee(unittest.TestCase):
    """Desenele one-line nu fac parte din biblioteca agentului (decizia din 2026-10-07)."""

    def test_argumentul_trasee_e_respins_de_argparse(self):
        # importa e înlocuit: dacă flagul ar reapărea, testul nu poate ajunge la importul real (rețea, Chrome, scrieri)
        with mock.patch.object(imp, "importa") as importa:
            with contextlib.redirect_stderr(io.StringIO()) as err:
                with self.assertRaises(SystemExit) as ctx:
                    imp.main(["--trasee", "folder"])
        importa.assert_not_called()
        self.assertEqual(ctx.exception.code, 2)
        self.assertIn("--trasee", err.getvalue())

    def test_folderul_trasee_opreste_importul(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "biblioteci" / "trasee").mkdir(parents=True)
            with mock.patch.object(imp, "RADACINA", Path(tmp)):
                with self.assertRaises(imp.EroareImport) as ctx:
                    imp.importa(argparse.Namespace(arhiva=None, chrome=None, recalculeaza_noapte=False, fara_foi=True))
        self.assertEqual(str(ctx.exception), "Desenele one-line nu fac parte din biblioteca agentului (decizia din 2026-10-07)")

    def test_ajutorul_nu_pomeneste_traseele(self):
        parser_ajutor = subprocess.run([sys.executable, str(DIR / "import.py"), "--help"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(parser_ajutor.returncode, 0)
        self.assertIsNone(re.search(r"trase|lc-", parser_ajutor.stdout, re.I))


class TestOrdineScrieri(unittest.TestCase):
    """I4: catalogul și foaia se scriu la urmă, una lângă alta; un eșec spune ce s-a scris."""

    def test_catalogul_si_foaia_la_urma(self):
        rel = ["catalog.json", "forme/a.svg", "foi/foaie.html", "LICENTE.md", "foi/foaie-noapte.jpg"]
        self.assertEqual(imp.ordineScrieri(rel), ["forme/a.svg", "LICENTE.md", "foi/foaie-noapte.jpg", "catalog.json", "foi/foaie.html"])

    def test_scrie_in_ordine(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage, dest = Path(tmp) / "stage", Path(tmp) / "dest"
            rel = ["catalog.json", "forme/a.svg", "foi/foaie.html"]
            for r in rel:
                (stage / r).parent.mkdir(parents=True, exist_ok=True)
                (stage / r).write_text(r, encoding="utf-8")
            self.assertEqual(imp.scrieDinStaging(stage, dest, rel), ["forme/a.svg", "catalog.json", "foi/foaie.html"])
            self.assertEqual((dest / "foi" / "foaie.html").read_text(encoding="utf-8"), "foi/foaie.html")

    def test_eroare_la_scriere_spune_ce_s_a_scris(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage, dest = Path(tmp) / "stage", Path(tmp) / "dest"
            rel = ["forme/a.svg", "forme/b.svg", "catalog.json"]
            for r in ("forme/a.svg", "catalog.json"):
                (stage / r).parent.mkdir(parents=True, exist_ok=True)
                (stage / r).write_text(r, encoding="utf-8")
            with self.assertRaises(imp.EroareDupaScriere) as ctx:
                imp.scrieDinStaging(stage, dest, rel)
            mesaj = str(ctx.exception)
            self.assertIn("forme/b.svg", mesaj)
            self.assertIn("S-au scris deja 1 din 3", mesaj)
            self.assertIn("repară", mesaj)
            self.assertFalse((dest / "catalog.json").exists())


if __name__ == "__main__":
    unittest.main()
