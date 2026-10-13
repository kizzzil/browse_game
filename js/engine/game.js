/*
 * Движок квеста: play.html#<questId>.
 * Загружает quests/<id>/quest.json (бесплатный) или quests/<id>/quest.enc.json (платный,
 * расшифровывается ключом из Access). Прогресс — Store "progress:<id>", позывной — Store "agent".
 */
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $("#app");
  const CAT = window.CATALOG;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const questId = (decodeURIComponent(location.hash.slice(1)) || CAT.quests[0].id).trim();
  const meta = CAT.quests.find((q) => q.id === questId) || null;
  addEventListener("hashchange", () => location.reload());

  let Q = null;       // загруженный квест
  let salt = "";
  let state = null;

  // ---------- утилиты ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function nextQuest() {
    const i = CAT.quests.indexOf(meta);
    return i >= 0 ? CAT.quests[i + 1] || null : null;
  }
  function questDone(id) {
    const p = Store.get("progress:" + id, null);
    return !!(p && p.ending && p.ending.win);
  }
  // Поднимает эпизод мира, который видит «Лента».
  function bumpWorld(n) {
    const stored = Store.get("worldEpisode", null);
    const cur = Number(stored) || 1;
    if (n && (n > cur || stored === null)) Store.set("worldEpisode", Math.max(n, cur));
  }

  // Двойное нажатие вместо confirm(): первое «взводит» кнопку, второе выполняет.
  function armButton(btn, armedText, action, ms = 4000) {
    const idle = btn.innerHTML;
    btn.addEventListener("click", () => {
      if (btn.dataset.armed) {
        clearTimeout(btn.timer);
        delete btn.dataset.armed;
        btn.innerHTML = idle;
        action();
        return;
      }
      btn.dataset.armed = "1";
      btn.textContent = armedText;
      btn.timer = setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = idle; }, ms);
    });
  }

  // Печатает абзацы по одному; клик по тексту допечатывает мгновенно.
  function typeParagraphs(container, paragraphs, done) {
    let skip = reducedMotion;
    container.addEventListener("click", () => { skip = true; }, { once: true });
    let i = 0;
    function nextParagraph() {
      if (!container.isConnected) return;
      if (i >= paragraphs.length) return done && done();
      const p = document.createElement("p");
      container.appendChild(p);
      const text = paragraphs[i++];
      if (skip) { p.textContent = text; return nextParagraph(); }
      p.classList.add("typing");
      let n = 0;
      (function tick() {
        if (!container.isConnected) return;
        if (skip) n = text.length;
        p.textContent = text.slice(0, n);
        if (n++ < text.length) setTimeout(tick, 14 + Math.random() * 22);
        else { p.classList.remove("typing"); setTimeout(nextParagraph, 220); }
      })();
    }
    nextParagraph();
  }

  // ---------- состояние ----------
  const fresh = () => ({ agent: Store.get("agent", "") || "", chapter: -1, solved: {}, evidence: [], hints: {}, ending: null, startedAt: null });
  function load() {
    let s = Store.get("progress:" + questId, null);
    if (!s && questId === "ep1") {
      // Сохранения прототипа (до платформы) лежали в "quest:mayak-01".
      s = Store.legacy("quest:mayak-01");
      if (s && s.agent && !Store.get("agent", "")) Store.set("agent", s.agent);
    }
    const st = Object.assign(fresh(), s || {});
    if (!st.agent) st.agent = Store.get("agent", "") || "";
    return st;
  }
  function save() { Store.set("progress:" + questId, state); }

  // ---------- шапка ----------
  function progressBar() {
    const total = Q.chapters.length + 1;
    let html = '<div class="progress" aria-hidden="true">';
    for (let i = 0; i < total; i++) {
      const cls = i < state.chapter ? "done" : i === state.chapter ? "now" : "";
      html += `<span class="${cls}"></span>`;
    }
    return html + "</div>";
  }

  function cardsHtml(items, highlightIds = []) {
    return '<div class="cards">' + items.map((e) =>
      `<div class="card ${highlightIds.includes(e.id) ? "new" : ""}"><div class="icon">${esc(e.icon || "📎")}</div><b>${esc(e.title)}</b>${esc(e.text)}</div>`
    ).join("") + "</div>";
  }

  function renderHeader() {
    $("#case-title").textContent = Q ? Q.title : (meta ? meta.title.toUpperCase() : "МАЯК");
    $("#agent-label").textContent = state && state.agent ? `Аналитик: ${state.agent}` : "";
    const ev = state ? state.evidence : [];
    $("#evidence-count").textContent = ev.length;
    $("#evidence-list").innerHTML = ev.length
      ? cardsHtml(ev)
      : '<p class="empty">Пока пусто. Улики появятся по мере расследования.</p>';
    $("#btn-evidence").hidden = !Q;
    $("#btn-reset").hidden = !Q;
  }

  // ---------- экраны ----------
  function render() {
    renderHeader();
    window.scrollTo({ top: 0 });
    if (state.ending) return renderEnding();
    if (state.chapter < 0) return renderStart();
    if (state.chapter >= Q.chapters.length) return renderFinale();
    renderChapter(Q.chapters[state.chapter]);
  }

  function renderStart() {
    const n = meta ? meta.number : null;
    app.innerHTML = `
      <section class="screen">
        <div class="stamp">ДОСТУП ОГРАНИЧЕН</div>
        ${n ? `<div class="kicker">Сезон «${esc(CAT.season.title)}» · эпизод ${n} из ${CAT.quests.length}</div>` : ""}
        <h1>${esc(Q.title)}</h1>
        <p class="lead">${esc(Q.subtitle || "")}</p>
        ${Q.previously && Q.previously.length ? `<div class="previously"><h3>Ранее в сезоне</h3>${Q.previously.map((p) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}
        <div class="briefing">
          <p>Эта игра не заканчивается на этой странице. Улики разбросаны по сети: в профилях персонажей, в комментариях, на сайтах, в файлах и исходном коде.</p>
          <p>Открывайте ссылки, смотрите внимательно, возвращайтесь с ответами. Прогресс сохраняется в этом браузере.</p>
        </div>
        <form class="answer start-form" id="start-form">
          <label for="agent">Ваш позывной</label>
          <input id="agent" maxlength="24" autocomplete="off" placeholder="например, Ворон" value="${esc(state.agent)}" required>
          <button class="btn" type="submit">Открыть дело</button>
        </form>
        <p class="disclaimer">Все персонажи, компании, сайты и события вымышлены. Не пишите реальным людям и не ищите их данные: всё нужное для расследования лежит в открытом доступе на страницах персонажей. Регистрироваться, взламывать или платить где-либо для решения не нужно.</p>
      </section>`;
    $("#start-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.agent = $("#agent").value.trim().slice(0, 24) || "Аноним";
      Store.set("agent", state.agent);
      state.chapter = 0;
      state.startedAt = state.startedAt || Date.now();
      save();
      render();
    });
    if (!state.agent) $("#agent").focus();
  }

  function renderChapter(ch) {
    bumpWorld(ch.worldEpisode != null ? ch.worldEpisode : meta && meta.number);
    const solved = !!state.solved[ch.id];
    const docs = (ch.docs || []).map((d) => `<div class="doc"><h4>${esc(d.title)}</h4>${d.body}</div>`).join("");
    const links = ch.links && ch.links.length ? `
      <h3>Куда смотреть</h3>
      <ul class="links">${ch.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join("")}</ul>
      <p class="note">Ссылки открываются в новой вкладке. Эта вкладка подождёт.</p>` : "";

    app.innerHTML = `
      <section class="screen">
        ${progressBar()}
        <div class="stamp">${solved ? "РАСКРЫТО" : "В РАБОТЕ"}</div>
        <h2>${esc(ch.title)}</h2>
        <div class="briefing" id="briefing"></div>
        <div id="rest" hidden>
          ${docs}
          ${links}
          <div id="task-zone"></div>
        </div>
      </section>`;

    const showRest = () => {
      $("#rest").hidden = false;
      solved ? renderReward(ch, false) : renderTask(ch);
    };
    if (solved) {
      $("#briefing").innerHTML = ch.briefing.map((p) => `<p>${esc(p)}</p>`).join("");
      showRest();
    } else {
      typeParagraphs($("#briefing"), ch.briefing, showRest);
    }
  }

  function hintsHtml(ch) {
    const all = ch.task.hints || [];
    const used = state.hints[ch.id] || 0;
    if (!all.length) return "";
    const list = all.slice(0, used).map((h) => `<li>${esc(h)}</li>`).join("");
    const more = used < all.length ? `<button type="button" id="hint-btn">Нужна подсказка (${used}/${all.length})</button>` : "";
    return `<div class="hints">${more}${list ? `<ol>${list}</ol>` : ""}</div>`;
  }

  function addEvidence(list) {
    const known = new Set(state.evidence.map((x) => x.id));
    for (const ev of list || []) if (!known.has(ev.id)) state.evidence.push(ev);
  }

  function renderTask(ch) {
    const zone = $("#task-zone");
    zone.innerHTML = `
      <form class="answer" id="answer-form" autocomplete="off">
        <label for="answer-input">${esc(ch.task.prompt)}</label>
        <div class="answer-row">
          <input id="answer-input" placeholder="${esc(ch.task.placeholder || "")}" autocapitalize="off" spellcheck="false" required>
          <button class="btn" type="submit">Проверить</button>
        </div>
        <div class="feedback" id="feedback" role="status" aria-live="polite"></div>
        <div id="hints">${hintsHtml(ch)}</div>
      </form>`;

    const bindHint = () => {
      const b = $("#hint-btn");
      if (b) b.addEventListener("click", () => {
        state.hints[ch.id] = (state.hints[ch.id] || 0) + 1;
        save();
        $("#hints").innerHTML = hintsHtml(ch);
        bindHint();
      });
    };
    bindHint();

    const form = $("#answer-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#answer-input");
      const btn = form.querySelector(".btn");
      btn.disabled = true;
      const ok = await Answers.check(salt, input.value, ch.task.answerHash);
      btn.disabled = false;
      const fb = $("#feedback");
      if (ok) {
        state.solved[ch.id] = true;
        addEvidence(ch.reward.evidence);
        save();
        renderHeader();
        fb.className = "feedback good";
        fb.textContent = "Совпадение подтверждено.";
        toast("Новая улика добавлена на доску");
        setTimeout(() => renderReward(ch, true), 500);
      } else {
        fb.className = "feedback bad";
        fb.textContent = input.value.trim() ? "Не сходится. Проверьте ещё раз." : "Введите ответ.";
        form.classList.remove("shake");
        void form.offsetWidth;
        form.classList.add("shake");
      }
    });
    $("#answer-input").focus({ preventScroll: true });
  }

  function renderReward(ch, animate) {
    const zone = $("#task-zone");
    const ids = animate ? ch.reward.evidence.map((e) => e.id) : [];
    zone.innerHTML = `
      <div class="reward">
        <h3>Новые улики</h3>
        ${cardsHtml(ch.reward.evidence, ids)}
        <p class="msg">${esc(ch.reward.message)}</p>
        <button class="btn next" id="next-btn" type="button">Дальше →</button>
      </div>`;
    $("#next-btn").addEventListener("click", () => {
      state.chapter = Math.max(state.chapter, Q.chapters.indexOf(ch) + 1);
      save();
      render();
    });
    if (animate) zone.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function renderFinale() {
    const f = Q.finale;
    bumpWorld(meta && meta.number);
    const multi = !!f.multi;
    const options = f.options.map((o) => multi
      ? `<label class="suspect pick"><input type="checkbox" name="pick" value="${esc(o.id)}">
           <span class="pick-body">${o.icon ? `<span class="pick-icon">${esc(o.icon)}</span>` : ""}<span><b>${esc(o.name)}</b>${o.text ? `<small>${esc(o.text)}</small>` : ""}</span></span></label>`
      : `<label class="suspect"><input type="radio" name="suspect" value="${esc(o.id)}" required> ${esc(o.name)}</label>`).join("");
    const idleText = multi ? (f.button || "Предъявить доказательства") : (f.button || "Выдвинуть обвинение");
    app.innerHTML = `
      <section class="screen">
        ${progressBar()}
        <div class="stamp">ФИНАЛ</div>
        <h2>${esc(f.title)}</h2>
        <div class="briefing" id="briefing"></div>
        <h3>Ваши улики</h3>
        ${cardsHtml(state.evidence)}
        <form class="answer" id="accuse-form">
          <label>${esc(f.prompt)}</label>
          ${multi ? `<p class="note multi-note">Отметьте все подходящие варианты. Лишнее так же опасно, как недостающее. <span id="pick-count">Выбрано: 0</span></p>` : ""}
          <div class="suspects ${multi ? "multi" : ""}">${options}</div>
          <div class="feedback" id="feedback" role="status" aria-live="polite"></div>
          <button class="btn" type="submit">${esc(idleText)}</button>
        </form>
      </section>`;
    typeParagraphs($("#briefing"), f.briefing || []);
    const form = $("#accuse-form");
    const btn = form.querySelector(".btn");
    const disarm = () => { delete btn.dataset.armed; clearTimeout(btn.timer); btn.textContent = idleText; };
    form.addEventListener("change", () => {
      disarm();
      if (multi) $("#pick-count").textContent = `Выбрано: ${form.querySelectorAll("input:checked").length}`;
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let choice;
      if (multi) {
        const ids = [...form.querySelectorAll("input[name=pick]:checked")].map((x) => x.value).sort();
        if (!ids.length) { $("#feedback").className = "feedback bad"; $("#feedback").textContent = "Выберите хотя бы один вариант."; return; }
        choice = ids.join("+");
      } else {
        choice = new FormData(form).get("suspect");
        if (!choice) return;
      }
      $("#feedback").textContent = "";
      if (!btn.dataset.armed) {
        btn.dataset.armed = "1";
        btn.textContent = multi ? "Решение нельзя отозвать. Подтвердить" : "Обвинение нельзя отозвать. Подтвердить";
        btn.timer = setTimeout(disarm, 6000);
        return;
      }
      disarm();
      const ok = await Answers.check(salt, choice, f.answerHash);
      state.ending = { win: ok, accused: choice, at: Date.now() };
      if (ok) addEvidence(f.evidence);
      save();
      render();
    });
  }

  function renderEnding() {
    const f = Q.finale;
    const win = state.ending.win;
    const mins = state.startedAt ? Math.max(1, Math.round((state.ending.at - state.startedAt) / 60000)) : null;
    const hints = Object.values(state.hints).reduce((a, b) => a + b, 0);
    const next = nextQuest();
    let nextHtml = "";
    if (win && next) {
      const locked = !Access.hasAccess(next.id);
      nextHtml = `
        <div class="next-ep">
          <div class="kicker">Следующий эпизод</div>
          <h3 class="next-title">Эпизод ${next.number}. ${esc(next.title)}</h3>
          <p>${esc(next.teaser)}</p>
          <div class="btn-row">
            <a class="btn" href="play.html#${encodeURIComponent(next.id)}">${locked ? `Открыть за ${esc(Access.fmtPrice(next.price))}` : "Следующий эпизод →"}</a>
            <a class="ghost" href="index.html">Все эпизоды</a>
          </div>
        </div>`;
    } else if (win) {
      nextHtml = `<div class="next-ep"><div class="kicker">Сезон «${esc(CAT.season.title)}» завершён</div><div class="btn-row"><a class="btn" href="index.html">К витрине сезона</a></div></div>`;
    }
    app.innerHTML = `
      <section class="screen ending ${win ? "win" : "lose"}">
        <div class="stamp">${win ? "ДЕЛО ЗАКРЫТО" : "ОШИБКА СЛЕДСТВИЯ"}</div>
        <h2>${esc(win ? (f.winTitle || "Дело раскрыто.") : (f.loseTitle || "Не тот вывод."))}</h2>
        <div class="briefing" id="briefing"></div>
        <p class="note">Аналитик ${esc(state.agent)}${mins ? ` · время расследования: ${mins} мин` : ""} · подсказок: ${hints}</p>
        <div id="after" ${reducedMotion ? "" : "hidden"}>
          ${nextHtml}
          <div class="btn-row">
            <button class="${win ? "ghost" : "btn"}" id="again-btn" type="button">${win ? "Сыграть эпизод заново" : "Пересмотреть улики и попробовать снова"}</button>
          </div>
        </div>
      </section>`;
    typeParagraphs($("#briefing"), win ? f.win : f.lose, () => { const a = $("#after"); if (a) a.hidden = false; });
    const again = $("#again-btn");
    if (win) {
      armButton(again, "Прогресс эпизода сотрётся. Подтвердить", () => { state = fresh(); save(); render(); });
    } else {
      again.addEventListener("click", () => { state.ending = null; save(); render(); });
    }
  }

  // ---------- экраны без квеста ----------
  function renderNotice(stamp, title, text, extra = "") {
    app.innerHTML = `
      <section class="screen">
        <div class="stamp">${esc(stamp)}</div>
        <h1>${esc(title)}</h1>
        <div class="briefing">${text.map((p) => `<p>${p}</p>`).join("")}</div>
        ${extra}
        <div class="btn-row"><a class="ghost" href="index.html">← Все эпизоды сезона</a></div>
      </section>`;
  }

  function renderLocked(reason) {
    const req = meta.requires ? CAT.quests.find((q) => q.id === meta.requires) : null;
    const reqWarn = req && !questDone(req.id)
      ? `<p class="soft-warn">Рекомендуем сначала пройти эпизод ${req.number} «${esc(req.title)}»: сюжет продолжается оттуда.</p>` : "";
    const bundle = CAT.bundle && CAT.bundle.includes.includes(meta.id) ? CAT.bundle : null;
    app.innerHTML = `
      <section class="screen locked">
        <div class="stamp">ЗАСЕКРЕЧЕНО</div>
        <div class="kicker">Сезон «${esc(CAT.season.title)}» · эпизод ${meta.number} из ${CAT.quests.length}</div>
        <h1>${esc(meta.title)}</h1>
        <p class="lead">${esc(meta.teaser)}</p>
        <div class="lock-box">
          <div class="lock-icon" aria-hidden="true">🔒</div>
          <div>
            <h2>Эпизод заблокирован</h2>
            <p>${reason ? esc(reason) : "Материалы этого дела доступны после покупки эпизода или сезона либо по коду доступа."}</p>
            ${reqWarn}
            <div class="btn-row">
              <button class="btn" id="buy-btn" type="button">Купить · ${esc(Access.fmtPrice(meta.price))}</button>
              <button class="ghost" id="code-btn" type="button">Ввести код</button>
            </div>
            ${bundle ? `<p class="note">Или <button class="linkish" id="bundle-btn" type="button">весь сезон за ${esc(Access.fmtPrice(bundle.price))}</button>.</p>` : ""}
            <form class="answer code-form" id="code-form" hidden autocomplete="off">
              <label for="code-input">Код доступа</label>
              <div class="answer-row">
                <input id="code-input" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" required>
                <button class="btn" type="submit">Открыть</button>
              </div>
              <div class="feedback" id="code-feedback" role="status" aria-live="polite"></div>
            </form>
          </div>
        </div>
        <div class="btn-row"><a class="ghost" href="index.html">← Витрина сезона</a></div>
      </section>`;
    $("#buy-btn").addEventListener("click", () => Access.purchase(meta.id));
    const bb = $("#bundle-btn");
    if (bb) bb.addEventListener("click", () => Access.purchase(CAT.bundle.id));
    $("#code-btn").addEventListener("click", () => {
      const f = $("#code-form");
      f.hidden = false;
      $("#code-input").focus();
    });
    $("#code-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fb = $("#code-feedback");
      const btn = e.currentTarget.querySelector(".btn");
      btn.disabled = true;
      fb.className = "feedback";
      fb.textContent = "Проверяем код…";
      let ids = [];
      try { ids = await Access.redeemCode($("#code-input").value); } catch (err) { ids = []; }
      btn.disabled = false;
      if (ids.includes(meta.id)) { fb.className = "feedback good"; fb.textContent = "Доступ открыт."; return; } // onChange перезапустит загрузку
      fb.className = "feedback bad";
      fb.textContent = ids.length ? "Код подходит к другим эпизодам, но не к этому." : "Код не подошёл. Проверьте буквы и цифры.";
    });
  }

  // ---------- загрузка ----------
  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  }

  let booted = false;
  async function boot() {
    renderHeader();
    if (!meta) {
      return renderNotice("404", "Дело не найдено", ["Такого эпизода нет в сезоне. Проверьте ссылку."]);
    }
    document.title = `${meta.title} — «${CAT.season.title}», эпизод ${meta.number}`;
    if (location.protocol === "file:") {
      return renderNotice("ОФЛАЙН", meta.title, ["Игра загружает материалы дела по сети и не работает из файла. Запустите локальный сервер: <code>cd dist && python3 -m http.server 8765</code> и откройте <code>http://localhost:8765/play.html#" + esc(meta.id) + "</code>."]);
    }
    let quest;
    try {
      if (Access.isFree(meta.id)) {
        quest = await fetchJson(`quests/${encodeURIComponent(meta.id)}/quest.json`);
      } else {
        const K = Access.getKey(meta.id);
        if (!K) {
          const man = await Access.manifest();
          if (man && man.quests && !man.quests[meta.id]) {
            return renderNotice("СКОРО", meta.title, ["Материалы этого дела ещё готовятся. Загляните позже — эпизод появится на витрине сезона."]);
          }
          return renderLocked();
        }
        const enc = await Access.fetchEnc(meta.id);
        try { quest = await Vault.decrypt(enc, K); }
        catch (e) {
          Access.forget(meta.id);
          return renderLocked("Сохранённый ключ больше не подходит к этому эпизоду (возможно, он обновился). Введите код доступа ещё раз.");
        }
      }
    } catch (e) {
      if (e.status === 404 || /404/.test(e.message)) {
        return renderNotice("СКОРО", meta.title, ["Материалы этого дела ещё готовятся. Загляните позже."]);
      }
      console.error(e);
      return renderNotice("СБОЙ СВЯЗИ", meta.title, ["Не удалось загрузить материалы дела. Проверьте соединение и обновите страницу."]);
    }
    Q = quest;
    salt = Q.salt || `${Q.id || meta.id}:`;
    state = load();
    booted = true;
    render();
  }

  // ---------- панель улик и сброс ----------
  const panel = $("#evidence-panel");
  function togglePanel(open) {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
  }
  $("#btn-evidence").addEventListener("click", () => togglePanel(!panel.classList.contains("open")));
  $("#btn-close-evidence").addEventListener("click", () => togglePanel(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") togglePanel(false); });
  const resetBtn = $("#btn-reset");
  resetBtn.addEventListener("click", () => {
    if (!Q) return;
    if (resetBtn.dataset.armed) {
      clearTimeout(resetBtn.timer);
      delete resetBtn.dataset.armed;
      resetBtn.textContent = "⟲";
      state = fresh(); save(); render();
      return;
    }
    resetBtn.dataset.armed = "1";
    resetBtn.textContent = "Стереть прогресс?";
    toast("Нажмите ещё раз, чтобы начать эпизод заново");
    resetBtn.timer = setTimeout(() => { delete resetBtn.dataset.armed; resetBtn.textContent = "⟲"; }, 4000);
  });

  // Доступ открыли (код в этой вкладке или оплата) — перезагружаем эпизод.
  Access.onChange((ids) => {
    if (!booted && meta && ids.includes(meta.id) && Access.hasAccess(meta.id)) {
      Access.ui.close();
      toast("Доступ к эпизоду открыт");
      boot();
    }
  });

  state = fresh();
  Access.handleReturn().catch((e) => toast(e.message)).finally(boot);
})();
