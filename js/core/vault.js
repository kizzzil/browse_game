/*
 * Шифрование платного контента: AES-GCM 256 + PBKDF2-SHA256.
 * Один файл для браузера (window.Vault, crypto.subtle) и node (require → webcrypto).
 *
 * Формат зашифрованного квеста (quests/<id>/quest.enc.json):
 *   { v:1, alg:"AES-GCM", iv:b64, ct:b64,
 *     keys:[ { kid, salt:b64, iter:200000, iv:b64, wrapped:b64 } ] }
 * ct — JSON квеста, зашифрованный ключом контента K (32 байта).
 * keys[i].wrapped — K, зашифрованный ключом из PBKDF2(normalizeCode(код), salt, iter).
 * kid — первые 8 hex sha256(normalizeCode(код)); по нему ищется нужная обёртка.
 *
 * API:
 *   Vault.normalizeCode(code)                 → "MAYAKDEMO2026"
 *   Vault.unlockWithCode(enc, code)           → Promise<K b64>   (ошибка, если код не подходит)
 *   Vault.decrypt(enc, Kb64)                  → Promise<object>  (ошибка, если ключ не подходит)
 *   Vault.generateKey()                       → K b64 (для сборки)
 *   Vault.encrypt(obj, Kb64, codes, opts)     → Promise<enc>     (для сборки)
 */
(function (root) {
  const isNode = typeof module !== "undefined" && module.exports && typeof window === "undefined";
  const webcrypto = isNode ? require("node:crypto").webcrypto : root.crypto;
  const ITER = 200000;

  function subtle() {
    if (!webcrypto || !webcrypto.subtle) {
      throw new Error("WebCrypto недоступен: откройте игру по https:// или с localhost.");
    }
    return webcrypto.subtle;
  }

  // ---------- base64 ----------
  function toB64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(String(b64));
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  function randomBytes(n) {
    const u8 = new Uint8Array(n);
    webcrypto.getRandomValues(u8);
    return u8;
  }
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function normalizeCode(code) {
    return String(code == null ? "" : code).trim().toUpperCase().replace(/[\s\-‐-—]+/g, "");
  }

  async function kidOf(code) {
    const buf = await subtle().digest("SHA-256", enc.encode(normalizeCode(code)));
    return Array.from(new Uint8Array(buf).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function deriveWrapKey(code, salt, iter) {
    const base = await subtle().importKey("raw", enc.encode(normalizeCode(code)), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  function importContentKey(Kb64) {
    return subtle().importKey("raw", fromB64(Kb64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  function generateKey() {
    return toB64(randomBytes(32));
  }

  async function wrap(Kb64, code, iter = ITER) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const wk = await deriveWrapKey(code, salt, iter);
    const wrapped = await subtle().encrypt({ name: "AES-GCM", iv }, wk, fromB64(Kb64));
    return { kid: await kidOf(code), salt: toB64(salt), iter, iv: toB64(iv), wrapped: toB64(wrapped) };
  }

  async function encrypt(obj, Kb64, codes, opts = {}) {
    if (!codes || !codes.length) throw new Error("Нужен хотя бы один код доступа");
    const iv = randomBytes(12);
    const key = await importContentKey(Kb64);
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    const keys = [];
    const seen = new Set();
    for (const c of codes) {
      const n = normalizeCode(c);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      keys.push(await wrap(Kb64, n, opts.iter || ITER));
    }
    return { v: 1, alg: "AES-GCM", iv: toB64(iv), ct: toB64(ct), keys };
  }

  async function unlockWithCode(encJson, code) {
    if (!encJson || !Array.isArray(encJson.keys)) throw new Error("Повреждённый файл эпизода");
    const n = normalizeCode(code);
    if (!n) throw new Error("Пустой код");
    const kid = await kidOf(n);
    const candidates = encJson.keys.filter((k) => k.kid === kid);
    for (const k of candidates) {
      try {
        const wk = await deriveWrapKey(n, fromB64(k.salt), k.iter || ITER);
        const raw = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(k.iv) }, wk, fromB64(k.wrapped));
        return toB64(raw);
      } catch (e) { /* следующая обёртка */ }
    }
    throw new Error("Код не подходит");
  }

  async function decrypt(encJson, Kb64) {
    const key = await importContentKey(Kb64);
    const raw = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(encJson.iv) }, key, fromB64(encJson.ct));
    return JSON.parse(dec.decode(raw));
  }

  const api = { normalizeCode, kidOf, generateKey, encrypt, unlockWithCode, decrypt, toB64, fromB64, ITER };
  if (isNode) module.exports = api;
  else root.Vault = api;
})(typeof window !== "undefined" ? window : globalThis);
