/*
 * «Лента» — вымышленная соцсеть мира игры «Маяк».
 * Данные регистрируются из data/ep1.js … data/ep4.js, затем World.render() рисует профиль по #нику.
 *
 *   World.profile(nick, { name, avatar, color, bio, link:{label,url}, followers, following, episode })
 *   World.posts(nick, episode, [ { date, scene:{bg,emoji,text,receipt,scarf,image,imageAlt}, caption, comments:[[nick,text]], download:{url,label} } ])
 *   World.bio(nick, episode, { bio, link, name })
 *
 * Видимость: профили и посты с episode <= localStorage["mayak:worldEpisode"] (по умолчанию 1).
 * Движок квеста поднимает это число, когда игрок входит в главу нового эпизода.
 */
(function () {
  const profiles = Object.create(null);

  function entry(nick) {
    return profiles[nick] || (profiles[nick] = { nick, meta: null, posts: {}, bios: [] });
  }

  const World = {
    profile(nick, meta) {
      entry(nick).meta = Object.assign({ episode: 1, followers: 0, following: 0, avatar: nick[0].toUpperCase(), color: "#888" }, meta);
    },
    posts(nick, episode, list) {
      const e = entry(nick);
      e.posts[episode] = (e.posts[episode] || []).concat(list || []);
    },
    bio(nick, episode, patch) {
      entry(nick).bios.push({ episode, patch: patch || {} });
    },
    worldEpisode() {
      try {
        const n = parseInt(JSON.parse(localStorage.getItem("mayak:worldEpisode")), 10);
        return Number.isFinite(n) && n > 0 ? n : 1;
      } catch (e) { return 1; }
    },
    // Профиль с учётом текущего эпизода мира; null — если не существует или ещё «не создан».
    view(nick) {
      const e = profiles[nick];
      const ep = World.worldEpisode();
      if (!e || !e.meta || (e.meta.episode || 1) > ep) return null;
      const p = Object.assign({}, e.meta);
      e.bios.filter((b) => b.episode <= ep).sort((a, b) => a.episode - b.episode).forEach((b) => Object.assign(p, b.patch));
      p.nick = nick;
      p.items = Object.keys(e.posts).map(Number).filter((n) => n <= ep).sort((a, b) => b - a)
        .flatMap((n) => e.posts[n]);
      return p;
    },
    render
  };
  window.World = World;

  // ---------- рендер ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => typeof n === "number" ? n.toLocaleString("ru-RU") : esc(n);

  function userLink(u) {
    return World.view(u) ? `<a class="u" href="#${encodeURIComponent(u)}">${esc(u)}</a>` : `<span class="u">${esc(u)}</span>`;
  }
  // Текст с кликабельными @упоминаниями.
  function richText(t) {
    return esc(t).replace(/@([a-z0-9_][a-z0-9_.]*[a-z0-9_])/gi, (m, u) => World.view(u) ? `<a class="u mention" href="#${encodeURIComponent(u)}">@${esc(u)}</a>` : m);
  }
  function mini(u) {
    const q = World.view(u);
    return `<span class="mini" style="background:${esc(q ? q.color : "#888")}">${esc(q ? q.avatar : String(u)[0].toUpperCase())}</span>`;
  }

  function sceneHtml(s, big) {
    s = s || {};
    let inner = "";
    if (s.image) inner += `<img class="img" src="${esc(s.image)}" alt="${esc(s.imageAlt || "")}" ${big ? "" : 'loading="lazy"'} draggable="false">`;
    if (s.emoji) inner += `<div class="em ${s.receipt ? "side" : ""}">${esc(s.emoji)}</div>`;
    if (s.text) inner += `<div class="txt">${esc(s.text)}</div>`;
    if (s.scarf) inner += `<div class="scarf"><span class="ini">${esc(s.scarf)}</span></div>`;
    if (s.receipt) {
      const r = s.receipt;
      inner += `<div class="receipt">
        <div class="t">${esc(r.title)}</div>${r.sub ? `<div class="c">${esc(r.sub)}</div>` : ""}<hr>
        ${(r.meta || []).map((m) => `<div>${esc(m)}</div>`).join("")}<hr>
        ${(r.items || []).map(([a, b]) => `<div class="row"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join("")}<hr>
        <div class="row"><b>ИТОГО</b><b>${esc(r.total)}</b></div>
        ${r.pay ? `<div>${esc(r.pay)}</div>` : ""}<div class="c">СПАСИБО!</div></div>`;
    }
    return `<div class="scene ${big ? "big" : ""}" style="background:${esc(s.bg || "#222")}">${inner}</div>`;
  }

  function notFound() {
    document.title = "Профиль не найден • Лента";
    $("root").innerHTML = `<div class="notfound"><div class="nf-icon" aria-hidden="true">∅</div><h1>Профиль не найден</h1><p>Возможно, ссылка неверна, аккаунт удалён или ещё не создан.</p></div>`;
  }

  let current = null;

  function render() {
    const nick = decodeURIComponent(location.hash.slice(1)).replace(/^@/, "").trim();
    const p = nick ? World.view(nick) : null;
    const dlg = $("post");
    if (dlg && dlg.open) dlg.close();
    window.scrollTo(0, 0);
    current = p;
    const search = $("search");
    if (search && document.activeElement !== search) search.value = nick;
    if (!p) return notFound();

    document.title = `${p.name} (@${p.nick}) • Лента`;
    const link = p.link && p.link.url
      ? `<div class="bio"><a class="bio-link" href="${esc(p.link.url)}" target="_blank" rel="noopener">🔗 ${esc(p.link.label || p.link.url)}</a></div>` : "";
    $("root").innerHTML = `
      <header class="profile">
        <div class="ava" style="background:${esc(p.color)}">${esc(p.avatar)}</div>
        <div class="who">
          <h1 class="uname">${esc(p.nick)}</h1>
          <div class="stats"><span><b>${p.items.length}</b> публикаций</span><span><b>${fmt(p.followers)}</b> подписчиков</span><span><b>${fmt(p.following)}</b> подписок</span></div>
          <div class="fullname">${esc(p.name)}</div>
          ${p.bio ? `<div class="bio">${richText(p.bio)}</div>` : ""}
          ${link}
        </div>
      </header>
      <div class="tabs"><span class="on">▦ Публикации</span></div>
      ${p.items.length
        ? `<div class="grid">${p.items.map((post, i) => `<button class="tile" data-i="${i}" aria-label="Публикация от ${esc(post.date)}">${sceneHtml(post.scene, false)}</button>`).join("")}</div>`
        : `<p class="empty">Публикаций пока нет.</p>`}`;
    $("root").querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => openPost(+t.dataset.i)));
  }

  function openPost(i) {
    const p = current;
    const post = p && p.items[i];
    if (!post) return;
    const photo = $("post-photo");
    photo.className = "photo";
    photo.innerHTML = sceneHtml(post.scene, true);
    $("post-head").innerHTML = `${mini(p.nick)} ${userLink(p.nick)}`;
    const dl = post.download && post.download.url
      ? `<p class="download"><a href="${esc(post.download.url)}" download>⤓ ${esc(post.download.label || "Скачать оригинал")}</a></p>` : "";
    $("post-body").innerHTML =
      (post.caption ? `<p>${userLink(p.nick)} ${richText(post.caption)}</p>` : "") +
      (post.comments || []).map(([u, c]) => `<p>${userLink(u)} ${richText(c)}</p>`).join("") +
      (post.comments && post.comments.length ? "" : `<p class="muted">Комментариев пока нет.</p>`);
    $("post-dl").innerHTML = dl;
    $("post-date").textContent = post.date || "";
    const dlg = $("post");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function init() {
    const dlg = $("post");
    const photo = $("post-photo");
    photo.addEventListener("click", (e) => {
      const r = photo.getBoundingClientRect();
      photo.style.setProperty("--zx", ((e.clientX - r.left) / r.width * 100) + "%");
      photo.style.setProperty("--zy", ((e.clientY - r.top) / r.height * 100) + "%");
      photo.classList.toggle("zoomed");
    });
    $("close").addEventListener("click", () => dlg.close ? dlg.close() : dlg.removeAttribute("open"));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    $("post-body").addEventListener("click", (e) => { if (e.target.closest("a.u")) dlg.close(); });
    const form = $("search-form");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("search").value.trim().replace(/^@/, "");
      if (v) location.hash = encodeURIComponent(v);
    });
    addEventListener("hashchange", render);
    // «Лента» открыта в соседней вкладке, а игрок продвинулся в квесте — обновим видимость.
    addEventListener("storage", (e) => { if (e.key === "mayak:worldEpisode") render(); });
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
