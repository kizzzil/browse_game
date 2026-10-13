/*
 * Шифрование платного контента: AES-GCM 256 + PBKDF2-SHA256.
 * Один файл для браузера (window.Vault, crypto.subtle) и node (require → webcrypto).
 *
 * Формат зашифрованного квеста (quests/<id>/quest.enc.json), v2:
 *   { v:2, alg:"AES-GCM", iv:b64, ct:b64,
 *     kdf:{ salt:b64, iter:200000 },
 *     keys:[ { kid, iv:b64, wrapped:b64 } ] }
 * ct — JSON квеста, зашифрованный ключом контента K (32 байта).
 * Для кода доступа один раз считается M = PBKDF2-SHA256(normalizeCode(код), kdf.salt, kdf.iter) (256 бит);
 * из M через HMAC-SHA256 выводятся ключ обёртки (HMAC(M,"wrap")) и kid (первые 8 hex HMAC(M,"kid")).
 * keys[i].wrapped — K, зашифрованный ключом обёртки. kid нельзя проверить без PBKDF2, поэтому он не
 * ускоряет перебор кодов (в v1 kid был sha256(код) без соли — так больше не делаем).
 *
 * API:
 *   Vault.normalizeCode(code)                 → "ABCDEFGH"
 *   Vault.unlockWithCode(enc, code)           → Promise<K b64>   (ошибка, если код не подходит)
 *   Vault.kidsFor(enc, codes)                 → Promise<[kid]>   (для сборки: какие коды уже обёрнуты)
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

  const hex = (buf, n) => Array.from(new Uint8Array(buf).slice(0, n), (b) => b.toString(16).padStart(2, "0")).join("");

  // Один PBKDF2 на код и файл → { kid, wrapKey }.
  async function deriveCodeKeys(code, salt, iter) {
    const base = await subtle().importKey("raw", enc.encode(normalizeCode(code)), "PBKDF2", false, ["deriveBits"]);
    const master = await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, 256);
    const mac = await subtle().importKey("raw", master, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const kidRaw = await subtle().sign("HMAC", mac, enc.encode("kid"));
    const wrapRaw = await subtle().sign("HMAC", mac, enc.encode("wrap"));
    const wrapKey = await subtle().importKey("raw", wrapRaw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    return { kid: hex(kidRaw, 4), wrapKey };
  }

  function importContentKey(Kb64) {
    return subtle().importKey("raw", fromB64(Kb64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  function generateKey() {
    return toB64(randomBytes(32));
  }

  async function encrypt(obj, Kb64, codes, opts = {}) {
    if (!codes || !codes.length) throw new Error("Нужен хотя бы один код доступа");
    const iter = opts.iter || ITER;
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await importContentKey(Kb64);
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    const keys = [];
    const seen = new Set();
    for (const c of codes) {
      const n = normalizeCode(c);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      const { kid, wrapKey } = await deriveCodeKeys(n, salt, iter);
      const kiv = randomBytes(12);
      const wrapped = await subtle().encrypt({ name: "AES-GCM", iv: kiv }, wrapKey, fromB64(Kb64));
      keys.push({ kid, iv: toB64(kiv), wrapped: toB64(wrapped) });
    }
    // Порядок обёрток не должен выдавать порядок кодов в codes.json.
    keys.sort((x, y) => (x.kid < y.kid ? -1 : x.kid > y.kid ? 1 : 0));
    return { v: 2, alg: "AES-GCM", iv: toB64(iv), ct: toB64(ct), kdf: { salt: toB64(salt), iter }, keys };
  }

  function checkFormat(encJson) {
    if (!encJson || encJson.v !== 2 || !encJson.kdf || !Array.isArray(encJson.keys)) throw new Error("Повреждённый или устаревший файл эпизода");
  }

  async function kidsFor(encJson, codes) {
    checkFormat(encJson);
    const salt = fromB64(encJson.kdf.salt);
    const out = [];
    for (const n of new Set(codes.map(normalizeCode).filter(Boolean))) out.push((await deriveCodeKeys(n, salt, encJson.kdf.iter || ITER)).kid);
    return out;
  }

  async function unlockWithCode(encJson, code) {
    checkFormat(encJson);
    const n = normalizeCode(code);
    if (!n) throw new Error("Пустой код");
    const { kid, wrapKey } = await deriveCodeKeys(n, fromB64(encJson.kdf.salt), encJson.kdf.iter || ITER);
    for (const k of encJson.keys.filter((x) => x.kid === kid)) {
      try {
        const raw = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(k.iv) }, wrapKey, fromB64(k.wrapped));
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

  const api = { normalizeCode, kidsFor, generateKey, encrypt, unlockWithCode, decrypt, toB64, fromB64, ITER };
  if (isNode) module.exports = api;
  else root.Vault = api;
})(typeof window !== "undefined" ? window : globalThis);
