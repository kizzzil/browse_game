/*
 * Безопасное хранилище поверх localStorage. Все ключи — в неймспейсе "mayak:".
 * В приватном режиме, при заблокированных cookies или переполнении игра
 * продолжает работать: данные живут в памяти до перезагрузки страницы.
 *
 *   Store.get("progress:ep1", fallback)   → объект/значение или fallback
 *   Store.set("progress:ep1", value)      → true, если записалось в localStorage
 *   Store.remove("progress:ep1")
 *   Store.keys("progress:")               → ["progress:ep1", …] (без префикса "mayak:")
 *
 * Известные ключи:
 *   mayak:progress:<questId>  состояние движка
 *   mayak:agent               позывной игрока на весь сезон
 *   mayak:worldEpisode        максимальный эпизод, видимый в «Ленте»
 *   mayak:keys                { ep2: "<K b64>", … } — ключи платных эпизодов
 */
(function (root) {
  const PREFIX = "mayak:";
  const memory = new Map();

  function ls() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  function get(key, fallback) {
    const full = PREFIX + key;
    let raw = null;
    try { const s = ls(); raw = s ? s.getItem(full) : null; } catch (e) { raw = null; }
    if (raw === null && memory.has(full)) raw = memory.get(full);
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function set(key, value) {
    const full = PREFIX + key;
    const raw = JSON.stringify(value);
    memory.set(full, raw);
    try { const s = ls(); if (!s) return false; s.setItem(full, raw); return true; } catch (e) { return false; }
  }

  function remove(key) {
    const full = PREFIX + key;
    memory.delete(full);
    try { const s = ls(); if (s) s.removeItem(full); } catch (e) { /* ничего */ }
  }

  function keys(startsWith = "") {
    const out = new Set();
    const want = PREFIX + startsWith;
    try {
      const s = ls();
      if (s) for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(want)) out.add(k.slice(PREFIX.length)); }
    } catch (e) { /* ничего */ }
    for (const k of memory.keys()) if (k.startsWith(want)) out.add(k.slice(PREFIX.length));
    return [...out];
  }

  // Чтение «сырого» значения вне неймспейса (миграция старых сохранений).
  function legacy(fullKey) {
    try { const s = ls(); const raw = s ? s.getItem(fullKey) : null; return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  root.Store = { get, set, remove, keys, legacy, PREFIX };
})(typeof window !== "undefined" ? window : globalThis);
