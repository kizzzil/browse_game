(function () {
  const C = window.CASE;
  const STORE_KEY = "quest:" + C.id;
  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $("#app");

  // ---------- состояние ----------
  const fresh = () => ({ agent: "", chapter: -1, solved: {}, evidence: [], hints: {}, ending: null, startedAt: null });
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(fresh(), JSON.parse(raw));
    } catch (e) { /* приватный режим или повреждённые данные */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* игра идёт и без сохранения */ }
  }

  // ---------- утилиты ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Печатает абзацы по одному; клик по тексту допечатывает мгновенно.
  function typeParagraphs(container, paragraphs, done) {
    let skip = reducedMotion;
    container.addEventListener("click", () => { skip = true; }, { once: true });
    let i = 0;
    function nextParagraph() {
      if (i >= paragraphs.length) return done && done();
      const p = document.createElement("p");
      container.appendChild(p);
      const text = paragraphs[i++];
      if (skip) { p.textContent = text; return nextParagraph(); }
      p.classList.add("typing");
      let n = 0;
      (function tick() {
        if (skip) n = text.length;
        p.textContent = text.slice(0, n);
        if (n++ < text.length) setTimeout(tick, 14 + Math.random() * 22);
        else { p.classList.remove("typing"); setTimeout(nextParagraph, 220); }
      })();
    }
    nextParagraph();
  }

  function progressBar() {
    const total = C.chapters.length + 1;
    let html = '<div class="progress" aria-hidden="true">';
    for (let i = 0; i < total; i++) {
      const cls = i < state.chapter ? "done" : i === state.chapter ? "now" : "";
      html += `<span class="${cls}"></span>`;
    }
    return html + "</div>";
  }

  function cardsHtml(items, highlightIds = []) {
    return '<div class="cards">' + items.map((e) =>
      `<div class="card ${highlightIds.includes(e.id) ? "new" : ""}"><div class="icon">${e.icon}</div><b>${esc(e.title)}</b>${esc(e.text)}</div>`
    ).join("") + "</div>";
  }

  function renderHeader() {
    $("#case-title").textContent = C.title;
    $("#agent-label").textContent = state.agent ? `Аналитик: ${state.agent}` : "";
    $("#evidence-count").textContent = state.evidence.length;
    $("#evidence-list").innerHTML = state.evidence.length
      ? cardsHtml(state.evidence)
      : '<p class="empty">Пока пусто. Улики появятся по мере расследования.</p>';
  }

  // ---------- экраны ----------
  function render() {
    renderHeader();
    window.scrollTo({ top: 0 });
    if (state.ending) return renderEnding();
    if (state.chapter < 0) return renderStart();
    if (state.chapter >= C.chapters.length) return renderFinale();
    renderChapter(C.chapters[state.chapter]);
  }

  function renderStart() {
    app.innerHTML = `
      <section class="screen">
        <div class="stamp">ДОСТУП ОГРАНИЧЕН</div>
        <h1>${esc(C.title)}</h1>
        <p class="lead">${esc(C.subtitle)}</p>
        <div class="briefing">
          <p>Эта игра не заканчивается на этой странице. Улики разбросаны по сети: в профилях персонажей, в комментариях, на сайтах, в исходном коде.</p>
          <p>Открывайте ссылки, смотрите внимательно, возвращайтесь с ответами. Прогресс сохраняется в этом браузере.</p>
        </div>
        <form class="answer start-form" id="start-form">
          <label for="agent">Ваш позывной</label>
          <input id="agent" maxlength="24" autocomplete="off" placeholder="например, Ворон" required>
          <button class="btn" type="submit">Открыть дело</button>
        </form>
        <p class="disclaimer">Все персонажи, компании и события вымышлены. Аккаунты персонажей созданы для игры. Не пишите реальным людям и не ищите их данные: всё нужное для расследования лежит в открытом доступе в профилях персонажей.</p>
      </section>`;
    $("#start-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.agent = $("#agent").value.trim().slice(0, 24) || "Аноним";
      state.chapter = 0;
      state.startedAt = Date.now();
      save();
      render();
    });
    $("#agent").focus();
  }

  function renderChapter(ch) {
    const solved = !!state.solved[ch.id];
    const docs = (ch.docs || []).map((d) => `<div class="doc"><h4>${esc(d.title)}</h4>${d.body}</div>`).join("");
    const links = ch.links ? `
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

  function renderTask(ch) {
    const zone = $("#task-zone");
    zone.innerHTML = `
      <form class="answer" id="answer-form" autocomplete="off">
        <label for="answer-input">${esc(ch.task.prompt)}</label>
        <div class="answer-row">
          <input id="answer-input" placeholder="${esc(ch.task.placeholder || "")}" required>
          <button class="btn" type="submit">Проверить</button>
        </div>
        <div class="feedback" id="feedback"></div>
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
      const ok = await Answers.check(C.salt, input.value, ch.task.answerHash);
      btn.disabled = false;
      const fb = $("#feedback");
      if (ok) {
        state.solved[ch.id] = true;
        const known = new Set(state.evidence.map((x) => x.id));
        for (const ev of ch.reward.evidence) if (!known.has(ev.id)) state.evidence.push(ev);
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
        <button class="btn next" id="next-btn">Дальше →</button>
      </div>`;
    $("#next-btn").addEventListener("click", () => {
      state.chapter = Math.max(state.chapter, C.chapters.indexOf(ch) + 1);
      save();
      render();
    });
    if (animate) zone.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function renderFinale() {
    const f = C.finale;
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
          <div class="suspects">
            ${f.options.map((o) => `
              <label class="suspect"><input type="radio" name="suspect" value="${esc(o.id)}" required> ${esc(o.name)}</label>`).join("")}
          </div>
          <p></p>
          <button class="btn" type="submit">Выдвинуть обвинение</button>
        </form>
      </section>`;
    typeParagraphs($("#briefing"), f.briefing);
    $("#accuse-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const choice = new FormData(e.target).get("suspect");
      if (!choice) return;
      if (!confirm("Обвинение нельзя отозвать. Уверены?")) return;
      const ok = await Answers.check(C.salt, choice, f.answerHash);
      state.ending = { win: ok, accused: choice, at: Date.now() };
      save();
      render();
    });
  }

  function renderEnding() {
    const f = C.finale;
    const win = state.ending.win;
    const mins = state.startedAt ? Math.max(1, Math.round((state.ending.at - state.startedAt) / 60000)) : null;
    const hints = Object.values(state.hints).reduce((a, b) => a + b, 0);
    app.innerHTML = `
      <section class="screen ending ${win ? "win" : "lose"}">
        <div class="stamp">${win ? "ДЕЛО ЗАКРЫТО" : "ОШИБКА СЛЕДСТВИЯ"}</div>
        <h2>${win ? "Вы нашли её." : "Не тот человек."}</h2>
        <div class="briefing" id="briefing"></div>
        <p class="note">Аналитик ${esc(state.agent)}${mins ? ` · время расследования: ${mins} мин` : ""} · подсказок: ${hints}</p>
        <button class="btn" id="again-btn">${win ? "Сыграть заново" : "Пересмотреть улики и попробовать снова"}</button>
      </section>`;
    typeParagraphs($("#briefing"), win ? f.win : f.lose);
    $("#again-btn").addEventListener("click", () => {
      if (win) { state = fresh(); }
      else { state.ending = null; }
      save();
      render();
    });
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
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Стереть прогресс и начать дело заново?")) { state = fresh(); save(); render(); }
  });

  render();
})();
