/*
 * Доступ к эпизодам и оплата.
 *
 * Права доступа — это ключи контента K, сохранённые в localStorage "mayak:keys"
 * ({ ep2: "<K b64>", … }). Ключ получают двумя путями:
 *   1) код доступа → Vault.unlockWithCode(quest.enc.json, код) → K;
 *   2) после оплаты сервер отдаёт K (или персональный код) по номеру заказа.
 *
 * Оплата — через адаптер провайдера (Access.providers). Витрина и движок знают только
 * Access.purchase(itemId) и Access.handleReturn(), поэтому подключение ЮKassa / CloudPayments /
 * Stripe — это настройка config + свой бэкенд (см. docs/PAYMENTS.md), без переписывания страниц.
 *
 * Настройка без правки этого файла: до подключения access.js объявите
 *   window.MAYAK_PAYMENTS = { provider: "yookassa", checkoutEndpoint: "https://…/api/checkout", keyEndpoint: "https://…/api/key" };
 *
 * Зависимости: js/core/storage.js, js/core/vault.js, js/platform/catalog.js.
 */
(function () {
  const C = window.CATALOG;
  const fmtPrice = (n) => n ? `${Number(n).toLocaleString("ru-RU")} ₽` : "Бесплатно";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const listeners = new Set();
  const encCache = Object.create(null);

  function quest(id) { return C.quests.find((q) => q.id === id) || null; }
  function paidQuests() { return C.quests.filter((q) => !q.free); }

  // Покупаемая позиция: эпизод или набор (сезон).
  function item(id) {
    if (C.bundle && id === C.bundle.id) {
      const full = C.bundle.includes.reduce((s, q) => s + ((quest(q) || {}).price || 0), 0);
      return { id, kind: "bundle", title: `${C.bundle.title} «${C.season.title}»`, price: C.bundle.price, includes: C.bundle.includes.slice(), fullPrice: full };
    }
    const q = quest(id);
    if (!q) return null;
    return { id, kind: "quest", title: `Эпизод ${q.number} «${q.title}»`, price: q.price, includes: [id] };
  }

  function keys() { return Store.get("keys", {}) || {}; }
  function setKey(id, k) { const all = keys(); all[id] = k; Store.set("keys", all); emit([id]); }
  function forget(id) { const all = keys(); delete all[id]; Store.set("keys", all); emit([id]); }
  function emit(ids) { listeners.forEach((fn) => { try { fn(ids); } catch (e) { console.warn(e); } }); }

  function isFree(id) { const q = quest(id); return !!(q && q.free); }
  function hasAccess(id) { return isFree(id) || !!keys()[id]; }
  function getKey(id) { return keys()[id] || null; }

  async function fetchEnc(id) {
    if (encCache[id]) return encCache[id];
    const res = await fetch(`${Access.config.questsBase}${encodeURIComponent(id)}/quest.enc.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (encCache[id] = await res.json());
  }

  // quests/manifest.json (пишет tools/build.js): какие эпизоды уже опубликованы.
  let manifestPromise = null;
  function manifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(`${Access.config.questsBase}manifest.json`, { cache: "no-cache" })
        .then((r) => r.ok ? r.json() : null).catch(() => null);
    }
    return manifestPromise;
  }

  // Пробует код на всех платных эпизодах; сохраняет найденные ключи. → [questIds]
  async function redeemCode(code) {
    const n = Vault.normalizeCode(code);
    if (!n) return [];
    const kid = await Vault.kidOf(n);
    const found = [];
    const man = await manifest();
    for (const q of paidQuests()) {
      if (man && man.quests && !man.quests[q.id]) continue; // ещё не опубликован
      let enc;
      try { enc = await fetchEnc(q.id); } catch (e) { continue; } // эпизод ещё не опубликован
      if (!enc.keys || !enc.keys.some((k) => k.kid === kid)) continue;
      try {
        const K = await Vault.unlockWithCode(enc, n);
        const all = keys(); all[q.id] = K; Store.set("keys", all);
        found.push(q.id);
      } catch (e) { /* не подошёл к этому эпизоду */ }
    }
    if (found.length) emit(found);
    return found;
  }

  // ---------- провайдеры оплаты ----------
  const DemoProvider = {
    online: false,
    async checkout(it) { openModal(it.id); return { status: "demo" }; },
    async claim() { return []; }
  };

  // Общий адаптер для своего бэкенда. Конкретный платёжный сервис (ЮKassa, CloudPayments, Stripe)
  // живёт на сервере: витрина лишь создаёт заказ и забирает ключи после возврата.
  const ServerProvider = {
    online: true,
    async checkout(it) {
      const cfg = Access.config;
      if (!cfg.checkoutEndpoint) throw new Error("Не задан checkoutEndpoint");
      const returnUrl = location.href.split("#")[0].split("?")[0];
      const res = await fetch(cfg.checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: it.id, returnUrl, provider: cfg.provider })
      });
      if (!res.ok) throw new Error(`Сервер оплаты ответил ${res.status}`);
      const data = await res.json(); // { orderId, confirmationUrl }
      Store.set("pendingOrder", { id: data.orderId, item: it.id, at: Date.now() });
      if (data.confirmationUrl) location.assign(data.confirmationUrl);
      return { status: "redirect", orderId: data.orderId };
    },
    // GET keyEndpoint?order=… → { status:"succeeded"|"pending"|"canceled", keys?:{ep2:K}, codes?:[…] }
    async claim(orderId) {
      const cfg = Access.config;
      if (!cfg.keyEndpoint || !orderId) return [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch(`${cfg.keyEndpoint}${cfg.keyEndpoint.includes("?") ? "&" : "?"}order=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "succeeded") {
            const got = [];
            const all = keys();
            for (const [id, K] of Object.entries(data.keys || {})) { all[id] = K; got.push(id); }
            Store.set("keys", all);
            for (const code of data.codes || []) got.push(...await redeemCode(code));
            if (got.length) emit(got);
            return [...new Set(got)];
          }
          if (data.status === "canceled") return [];
        }
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // вебхук мог ещё не дойти
      }
      throw new Error("Платёж ещё обрабатывается. Обновите страницу через минуту.");
    }
  };

  function provider() {
    const name = Access.config.provider || "demo";
    return Access.providers[name] || DemoProvider;
  }

  async function purchase(itemId) {
    const it = item(itemId);
    if (!it) throw new Error("Неизвестная позиция: " + itemId);
    openModal(itemId);
  }

  async function handleReturn() {
    const params = new URLSearchParams(location.search);
    const orderId = params.get("order");
    const code = params.get("code");
    let unlocked = [];
    if (orderId && provider().online) {
      try { unlocked = await provider().claim(orderId); }
      finally { Store.remove("pendingOrder"); }
    }
    if (code) unlocked = unlocked.concat(await redeemCode(code));
    if (orderId || code) {
      params.delete("order"); params.delete("code");
      const q = params.toString();
      try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); } catch (e) { /* ничего */ }
    }
    return unlocked;
  }

  // ---------- модалка покупки ----------
  let dlg = null;
  let unlockHandler = null;

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "acc-modal";
    dlg.setAttribute("aria-labelledby", "acc-title");
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeModal(); });
    return dlg;
  }

  function closeModal() { if (dlg && dlg.open) dlg.close(); }

  function openModal(itemId, opts = {}) {
    const it = item(itemId);
    if (!it) return;
    if (opts.onUnlock) unlockHandler = opts.onUnlock;
    const d = ensureDialog();
    const online = provider().online;
    const bundle = C.bundle && it.kind === "quest" ? item(C.bundle.id) : null;
    const includes = it.kind === "bundle"
      ? `<ul class="acc-list">${it.includes.map((id) => { const q = quest(id); return `<li>Эпизод ${q.number}. ${esc(q.title)} <span>${fmtPrice(q.price)}</span></li>`; }).join("")}</ul>
         <p class="acc-save">Вместо ${fmtPrice(it.fullPrice)} — экономия ${fmtPrice(it.fullPrice - it.price)}.</p>` : "";
    d.innerHTML = `
      <div class="acc-box">
        <button class="acc-x" type="button" aria-label="Закрыть">×</button>
        <div class="acc-kicker">${it.kind === "bundle" ? "Полный доступ" : "Платный эпизод"}</div>
        <h2 id="acc-title">${esc(it.title)}</h2>
        <div class="acc-price">${fmtPrice(it.price)}</div>
        ${includes}
        <div class="acc-pay">
          <button class="acc-btn" type="button" id="acc-pay" ${online ? "" : "disabled"}>${online ? `Оплатить ${fmtPrice(it.price)}` : "Оплатить картой"}</button>
          ${online ? `<p class="acc-note">Вы перейдёте на защищённую страницу платёжного сервиса. После оплаты эпизод откроется автоматически.</p>`
                   : `<p class="acc-soon"><b>Онлайн-оплата скоро появится.</b> Пока эпизоды открываются кодом доступа — его выдаёт организатор игры или он приходит в рассылке.</p>`}
        </div>
        ${bundle ? `<button class="acc-link" type="button" id="acc-bundle">Или весь сезон за ${fmtPrice(bundle.price)} — экономия ${fmtPrice(bundle.fullPrice - bundle.price)} →</button>` : ""}
        <form class="acc-code" id="acc-code" autocomplete="off">
          <label for="acc-code-input">Есть код доступа?</label>
          <div class="acc-row">
            <input id="acc-code-input" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" required>
            <button class="acc-btn ghost" type="submit">Активировать</button>
          </div>
          <div class="acc-msg" id="acc-msg" role="status" aria-live="polite"></div>
        </form>
      </div>`;
    d.querySelector(".acc-x").addEventListener("click", closeModal);
    const payBtn = d.querySelector("#acc-pay");
    payBtn.addEventListener("click", async () => {
      payBtn.disabled = true;
      const msg = d.querySelector("#acc-msg");
      try { await provider().checkout(it); }
      catch (e) { msg.className = "acc-msg bad"; msg.textContent = e.message; payBtn.disabled = false; }
    });
    const b = d.querySelector("#acc-bundle");
    if (b) b.addEventListener("click", () => openModal(C.bundle.id));
    d.querySelector("#acc-code").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = d.querySelector("#acc-code-input");
      const btn = e.currentTarget.querySelector("button");
      const msg = d.querySelector("#acc-msg");
      btn.disabled = true;
      msg.className = "acc-msg";
      msg.textContent = "Проверяем код…";
      let ids = [];
      try { ids = await redeemCode(input.value); }
      catch (err) { msg.className = "acc-msg bad"; msg.textContent = "Не удалось проверить код: " + err.message; btn.disabled = false; return; }
      btn.disabled = false;
      if (!ids.length) {
        msg.className = "acc-msg bad";
        msg.textContent = "Код не подошёл. Проверьте буквы и цифры.";
        return;
      }
      const names = ids.map((id) => { const q = quest(id); return `«${q.title}»`; }).join(", ");
      const target = it.includes.find((id) => ids.includes(id)) || ids[0];
      msg.className = "acc-msg good";
      msg.innerHTML = `Открыто: ${esc(names)}. <a href="play.html#${encodeURIComponent(target)}">Играть →</a>`;
      if (unlockHandler) unlockHandler(ids);
    });
    if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
  }

  const Access = {
    config: Object.assign({ provider: "demo", checkoutEndpoint: null, keyEndpoint: null, questsBase: "quests/" }, window.MAYAK_PAYMENTS || {}),
    providers: { demo: DemoProvider, server: ServerProvider, yookassa: ServerProvider, cloudpayments: ServerProvider, stripe: ServerProvider },
    isFree, hasAccess, getKey, setKey, forget, item, quest, fetchEnc, manifest, redeemCode, purchase, handleReturn,
    fmtPrice,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ui: { open: openModal, close: closeModal, onUnlock(fn) { unlockHandler = fn; } }
  };
  window.Access = Access;
})();
