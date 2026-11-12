// Clientul Kie al lui mg genereaza (felia 5): încărcarea referinței, sarcina, așteptarea și descărcarea rezultatului.
// Același contract ca deseneaza-lot.py din kitul lui Dănuț (docs.kie.ai, gpt-image-2-image-to-image).
// Cheia stă doar în memorie: merge doar în antetul cererilor către Kie, fără redirecționări (redirect: 'error').

export const MODEL = 'gpt-image-2-image-to-image';
const BAZA = 'https://api.kie.ai/api/v1';
const BAZA_FISIERE = 'https://kieai.redpandaai.co';
const TERMEN_RETEA_MS = 60000;
const DESCARCARE_MAX = 30 * 1024 * 1024;
// sondarea trece peste atâtea căderi de rețea la rând; sarcina rulează la Kie oricum
const CADERI_TOLERATE = 3;

export class EroareKie extends Error {
  /**
   * @param {string} mesaj
   * @param {{refuz?: boolean, credit?: boolean, esuat?: boolean, retea?: boolean}} [tip]
   *   esuat = Kie a spus că sarcina a eșuat (nu se plătește); retea = cererea n-a primit răspuns
   */
  constructor(mesaj, { refuz = false, credit = false, esuat = false, retea = false } = {}) {
    super(mesaj);
    this.name = 'EroareKie';
    this.refuz = refuz;
    this.credit = credit;
    this.esuat = esuat;
    this.retea = retea;
  }
}

/**
 * limitaMs implicită (90 s) ține toată comanda sub termenul implicit al uneltei Bash din Claude Code (120 s); o sarcină
 * mai lentă rămâne în jurnal și se termină cu mg genereaza reia, fără cost nou.
 * @param {string} cheie
 * @param {{fetch?: typeof fetch, dormi?: (ms: number) => Promise<void>, limitaMs?: number, pasMs?: number}} [optiuni]
 */
export function clientKie(cheie, { fetch: f = globalThis.fetch, dormi = (ms) => new Promise((r) => setTimeout(r, ms)), limitaMs = 90000, pasMs = 5000 } = {}) {
  const antete = { Authorization: `Bearer ${cheie}`, 'Content-Type': 'application/json' };

  async function json(url, init = {}) {
    let r;
    try {
      r = await f(url, { ...init, headers: antete, redirect: 'error', signal: AbortSignal.timeout(TERMEN_RETEA_MS) });
    } catch (e) {
      throw new EroareKie(`Kie nu răspunde (${e?.cause?.code ?? e?.name ?? 'rețea'}).`, { retea: true });
    }
    if (r.status === 401 || r.status === 403) throw new EroareKie('Kie a refuzat cheia (401/403).', { refuz: true });
    const text = await r.text();
    let date;
    try {
      date = JSON.parse(text);
    } catch {
      throw new EroareKie(`Kie a răspuns cu ${r.status}, fără JSON.`);
    }
    return date;
  }

  function verificaCod(raspuns, ce) {
    if (raspuns?.code === 200) return;
    const cod = raspuns?.code;
    // 401: cheie greșită; 402: credite insuficiente (docs.kie.ai, codurile comune)
    throw new EroareKie(`Kie a refuzat ${ce}: ${cod ?? '?'} ${raspuns?.msg ?? ''}`.trim(), { refuz: cod === 401, credit: cod === 402 });
  }

  return {
    /** Urcă referința (PNG) și întoarce URL-ul ei public (ține 24 h la Kie). */
    async incarca(octeti, numeFisier) {
      const corp = { base64Data: `data:image/png;base64,${Buffer.from(octeti).toString('base64')}`, uploadPath: 'agent-motion/referinte', fileName: numeFisier };
      const r = await json(`${BAZA_FISIERE}/api/file-base64-upload`, { method: 'POST', body: JSON.stringify(corp) });
      verificaCod(r, 'încărcarea referinței');
      const url = r?.data?.downloadUrl ?? r?.data?.fileUrl;
      if (typeof url !== 'string' || !url.startsWith('https://')) throw new EroareKie('Kie a încărcat referința, dar n-a dat un URL https.');
      return url;
    },
    async creeaza(prompt, referinte) {
      const corp = { model: MODEL, input: { prompt, input_urls: referinte, aspect_ratio: '1:1', resolution: '1K' } };
      const r = await json(`${BAZA}/jobs/createTask`, { method: 'POST', body: JSON.stringify(corp) });
      verificaCod(r, 'cererea');
      const id = r?.data?.taskId;
      if (typeof id !== 'string' || id === '') throw new EroareKie('Kie a primit cererea, dar n-a dat un taskId.');
      return id;
    },
    /** Așteaptă sarcina și întoarce URL-ul imaginii. */
    async asteapta(idSarcina) {
      let caderi = 0;
      for (let trecut = 0; trecut <= limitaMs; trecut += pasMs) {
        let r;
        try {
          r = await json(`${BAZA}/jobs/recordInfo?taskId=${encodeURIComponent(idSarcina)}`);
          caderi = 0;
        } catch (e) {
          if (!(e instanceof EroareKie) || !e.retea || ++caderi > CADERI_TOLERATE) throw e;
          await dormi(pasMs);
          continue;
        }
        const date = r?.data ?? {};
        if (date.state === 'success') {
          let urls = [];
          try {
            urls = JSON.parse(date.resultJson || '{}').resultUrls ?? [];
          } catch { /* mai jos */ }
          if (!Array.isArray(urls) || typeof urls[0] !== 'string' || !urls[0].startsWith('https://')) {
            throw new EroareKie(`Sarcina ${idSarcina} a reușit, dar nu are un URL de rezultat.`);
          }
          return urls[0];
        }
        if (['fail', 'failed', 'error'].includes(date.state)) {
          throw new EroareKie(`Sarcina ${idSarcina} a eșuat la Kie: ${date.failMsg || date.state}`, { esuat: true });
        }
        await dormi(pasMs);
      }
      throw new EroareKie(`Sarcina ${idSarcina} nu s-a terminat în ${Math.round(limitaMs / 1000)} s.`);
    },
    /** Descarcă rezultatul (fără cheie: e un URL public). */
    async descarca(url) {
      let r;
      try {
        r = await f(url, { signal: AbortSignal.timeout(TERMEN_RETEA_MS) });
      } catch (e) {
        throw new EroareKie(`Descărcarea desenului a eșuat (${e?.cause?.code ?? e?.name ?? 'rețea'}).`, { retea: true });
      }
      if (!r.ok) throw new EroareKie(`Descărcarea desenului a răspuns cu ${r.status}.`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > DESCARCARE_MAX) throw new EroareKie('Desenul descărcat e prea mare (peste 30 MB).');
      return buf;
    },
    toString() {
      return 'clientKie(cheie=<ascunsă>)';
    },
  };
}
