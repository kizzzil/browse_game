/*
 * Витрина сезона: герой, прогресс, карточки эпизодов, покупка сезона, ввод кода.
 * Данные — window.CATALOG, права — window.Access, прогресс — Store "progress:<id>".
 */
(function () {
  const CAT = window.CATALOG;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const price = Access.fmtPrice;
  const pad = (n) => String(n).padStart(2, "0");

  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // new | progress | done | locked
  let published = null; // quests/manifest.json → { ep1: {...}, … }; null — ещё не загружен
  function status(q) {
    const p = Store.get("progress:" + q.id, null);
    const done = !!(p && p.ending && p.ending.win);
    if (published && !published[q.id]) return { code: "soon", label: "Скоро", p };
    if (!Access.hasAccess(q.id)) return { code: "locked", label: "Заблокирован", p };
    if (done) return { code: "done", label: "Пройден", p };
    if (p && p.chapter >= 0) return { code: "progress", label: p.chapter >= 4 ? "Финал" : `В процессе · глава ${p.chapter + 1}`, p };
    return { code: "new", label: "Не начат", p };
  }

  function questUrl(q) { return `play.html#${encodeURIComponent(q.id)}`; }

  function renderHero() {
    $("#tagline").textContent = CAT.season.tagline;
    $("#blurb").textContent = CAT.season.blurb || "";
    const list = CAT.quests.map((q) => ({ q, s: status(q) }));
    const current = list.find((x) => x.s.code === "progress") || list.find((x) => x.s.code === "new") || list.find((x) => x.s.code === "locked");
    // «soon» в герое не предлагаем: нечего покупать.
    let primary;
    if (!current && list.some((x) => x.s.code === "soon")) primary = `<span class="owned">Следующее дело готовится</span>`;
    else if (!current) primary = `<a class="btn big" href="${questUrl(CAT.quests[0])}">Сезон пройден · сыграть снова</a>`;
    else if (current.s.code === "locked") primary = `<button class="btn big" type="button" data-buy="${esc(current.q.id)}">Открыть эпизод ${current.q.number} · ${esc(price(current.q.price))}</button>`;
    else if (current.s.code === "progress") primary = `<a class="btn big" href="${questUrl(current.q)}">Продолжить: эпизод ${current.q.number}</a>`;
    else primary = current.q.free
      ? `<a class="btn big" href="${questUrl(current.q)}">Начать бесплатно</a>`
      : `<a class="btn big" href="${questUrl(current.q)}">Играть: эпизод ${current.q.number}</a>`;
    const allOwned = CAT.bundle ? CAT.bundle.includes.every((id) => Access.hasAccess(id)) : true;
    const secondary = allOwned ? `<span class="owned">✓ Весь сезон открыт</span>`
      : `<button class="btn-outline big" type="button" data-buy="${esc(CAT.bundle.id)}">Весь сезон · ${esc(price(CAT.bundle.price))}</button>`;
    $("#hero-cta").innerHTML = primary + secondary;
  }

  function renderProgress() {
    const list = CAT.quests.map((q) => ({ q, s: status(q) }));
    const done = list.filter((x) => x.s.code === "done").length;
    const agent = Store.get("agent", "");
    $("#progress-text").textContent = done === list.length
      ? `Сезон завершён${agent ? `, аналитик ${agent}` : ""}. Все дела закрыты.`
      : `Закрыто дел: ${done} из ${list.length}${agent ? ` · аналитик ${agent}` : ""}`;
    $("#nav-progress").innerHTML = `<span class="np-bar"><i style="width:${Math.round(done / list.length * 100)}%"></i></span><span>${done}/${list.length}</span>`;
    $("#nav-progress").title = `Закрыто дел: ${done} из ${list.length}`;
    $("#season-track").innerHTML = list.map(({ q, s }) => `
      <li class="st ${s.code}">
        <a href="#ep-${esc(q.id)}">
          <span class="st-dot" aria-hidden="true">${s.code === "done" ? "✓" : s.code === "locked" ? "🔒" : s.code === "soon" ? "…" : q.number}</span>
          <span class="st-name">${esc(q.title)}</span>
          <span class="st-state">${esc(s.label)}</span>
        </a>
      </li>`).join("");
  }

  function renderEpisodes() {
    $("#episode-list").innerHTML = CAT.quests.map((q) => {
      const s = status(q);
      const req = q.requires ? CAT.quests.find((x) => x.id === q.requires) : null;
      const reqDone = req ? status(req).code === "done" : true;
      let actions;
      if (s.code === "soon") {
        actions = `<span class="soon-note">Материалы дела готовятся</span>`;
      } else if (s.code === "locked") {
        actions = `<button class="btn" type="button" data-buy="${esc(q.id)}">Купить · ${esc(price(q.price))}</button>
                   <button class="ghost" type="button" data-code="${esc(q.id)}">Ввести код</button>`;
      } else if (s.code === "done") {
        actions = `<a class="ghost" href="${questUrl(q)}">Открыть дело</a>`;
      } else if (s.code === "progress") {
        actions = `<a class="btn" href="${questUrl(q)}">Продолжить →</a>`;
      } else {
        actions = `<a class="btn" href="${questUrl(q)}">${q.free ? "Играть бесплатно" : "Начать →"}</a>`;
      }
      const warn = req && !reqDone && s.code !== "done"
        ? `<p class="req">Рекомендуем сначала пройти эпизод ${req.number} «${esc(req.title)}».</p>` : "";
      const priceTag = q.free ? `<span class="tag free">Бесплатно</span>`
        : Access.hasAccess(q.id) ? `<span class="tag owned">Открыт</span>` : `<span class="tag">${esc(price(q.price))}</span>`;
      return `
        <article class="ep ${s.code}" id="ep-${esc(q.id)}">
          <div class="ep-top">
            <span class="ep-num">${pad(q.number)}</span>
            <span class="ep-status s-${s.code}">${esc(s.label)}</span>
          </div>
          <div class="ep-meta">Эпизод ${q.number}${q.month ? ` · ${esc(q.month)}` : ""} · ${esc(q.duration)}</div>
          <h3 class="ep-title">${esc(q.title)}</h3>
          <p class="ep-teaser">${esc(q.teaser)}</p>
          ${warn}
          <div class="ep-foot">
            ${priceTag}
            <div class="ep-actions">${actions}</div>
          </div>
        </article>`;
    }).join("");
  }

  function renderBundle() {
    const b = CAT.bundle;
    const el = $("#bundle");
    if (!b) { el.hidden = true; return; }
    const items = b.includes.map((id) => CAT.quests.find((q) => q.id === id)).filter(Boolean);
    const full = items.reduce((s, q) => s + q.price, 0);
    const owned = items.every((q) => Access.hasAccess(q.id));
    el.innerHTML = `
      <div class="bundle-card">
        <div class="bundle-text">
          <div class="kicker">${owned ? "Открыто" : "Выгоднее"}</div>
          <h2 id="bundle-h">${esc(b.title)} «${esc(CAT.season.title)}»</h2>
          <p class="muted">Все платные эпизоды одной покупкой. Новые улики, сайты и файлы в каждом деле, развязка — в финале сезона.</p>
          <ul class="bundle-list">${items.map((q) => `<li><span>Эпизод ${q.number}. ${esc(q.title)}</span><span class="${owned ? "" : "strike"}">${esc(price(q.price))}</span></li>`).join("")}</ul>
        </div>
        <div class="bundle-buy">
          ${owned
            ? `<div class="owned big-owned">✓ Сезон открыт полностью</div>`
            : `<div class="bundle-old">${esc(price(full))}</div>
               <div class="bundle-price">${esc(price(b.price))}</div>
               <div class="bundle-save">экономия ${esc(price(full - b.price))}</div>
               <button class="btn big" type="button" data-buy="${esc(b.id)}">Купить сезон</button>`}
        </div>
      </div>`;
  }

  function renderAll() {
    renderHero();
    renderProgress();
    renderEpisodes();
    renderBundle();
  }

  // ---------- события ----------
  document.addEventListener("click", (e) => {
    const buy = e.target.closest("[data-buy]");
    if (buy) { Access.purchase(buy.dataset.buy); return; }
    const code = e.target.closest("[data-code]");
    if (code) {
      $("#code").scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => $("#code-input").focus({ preventScroll: true }), 350);
    }
  });

  $("#code-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#code-input");
    const btn = e.currentTarget.querySelector("button");
    const msg = $("#code-msg");
    btn.disabled = true;
    msg.className = "code-msg";
    msg.textContent = "Проверяем код…";
    let ids = [];
    try { ids = await Access.redeemCode(input.value); }
    catch (err) { msg.className = "code-msg bad"; msg.textContent = "Не удалось проверить код. Обновите страницу и попробуйте ещё раз."; btn.disabled = false; return; }
    btn.disabled = false;
    if (!ids.length) {
      msg.className = "code-msg bad";
      msg.textContent = "Код не подошёл. Проверьте буквы и цифры.";
      return;
    }
    input.value = "";
    const names = ids.map((id) => CAT.quests.find((q) => q.id === id)).sort((a, b) => a.number - b.number);
    msg.className = "code-msg good";
    msg.innerHTML = `Открыто: ${names.map((q) => `<a href="${questUrl(q)}">«${esc(q.title)}»</a>`).join(", ")}.`;
  });

  const reset = $("#reset-all");
  const resetIdle = reset.textContent;
  reset.addEventListener("click", () => {
    if (reset.dataset.armed) {
      clearTimeout(reset.timer);
      delete reset.dataset.armed;
      reset.textContent = resetIdle;
      for (const k of Store.keys("progress:")) Store.remove(k);
      Store.remove("worldEpisode");
      Store.remove("agent");
      renderAll();
      toast("Прогресс сброшен. Открытые эпизоды остались открыты.");
      return;
    }
    reset.dataset.armed = "1";
    reset.textContent = "Точно стереть прогресс всех эпизодов?";
    reset.timer = setTimeout(() => { delete reset.dataset.armed; reset.textContent = resetIdle; }, 4000);
  });

  Access.onChange(() => renderAll());
  // Прогресс могли изменить в соседней вкладке с игрой.
  addEventListener("storage", (e) => { if (!e.key || e.key.startsWith("mayak:")) renderAll(); });
  addEventListener("pageshow", (e) => { if (e.persisted) renderAll(); });

  renderAll();
  Access.manifest().then((m) => { if (m && m.quests) { published = m.quests; renderAll(); } });
  Access.handleReturn().then((ids) => {
    if (ids && ids.length) {
      const names = ids.map((id) => (CAT.quests.find((q) => q.id === id) || {}).title).filter(Boolean);
      toast(`Открыто: ${names.map((n) => `«${n}»`).join(", ")}`);
    }
  }).catch((err) => toast(err.message));
})();
