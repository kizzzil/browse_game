(function () {
  "use strict";
  var D = window.MORETRACK;
  var out = document.getElementById("out");
  var q = document.getElementById("q");
  var byId = {};
  D.vessels.forEach(function (v) { byId[v.id] = v; });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
  function ruDate(iso) { var p = iso.split("-"); return p[2] + "." + p[1] + "." + p[0]; }
  function params() {
    var o = {};
    location.hash.replace(/^#/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      o[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = decodeURIComponent(i < 0 ? "" : kv.slice(i + 1));
    });
    return o;
  }
  function badge(v) {
    return v.status === "on"
      ? '<span class="st on">● в эфире</span>'
      : '<span class="st off">○ нет сигнала</span>';
  }
  function icon(v) {
    if (/Парус/.test(v.type)) return "⛵";
    if (/Моторн|катер/i.test(v.type)) return "🛥";
    if (/Рыбол/.test(v.type)) return "🎣";
    if (/Буксир/.test(v.type)) return "⚓";
    return "🚢";
  }

  function mapSvg(active) {
    var pins = Object.keys(D.areas).map(function (id) {
      var a = D.areas[id];
      return '<a href="#area=' + id + "&date=" + (params().date || "2026-11-01") + '" class="pin' + (id === active ? " on" : "") + '">' +
        '<circle cx="' + a.x + '" cy="' + a.y + '" r="' + (id === active ? 9 : 6) + '"/>' +
        '<text x="' + a.x + '" y="' + (a.y - 14) + '" text-anchor="middle">' + esc(a.name.replace(/,.*$/, "")) + "</text></a>";
    }).join("");
    return '<figure class="map"><svg viewBox="0 0 860 320" role="img" aria-label="Схема восточной части Финского залива">' +
      '<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" class="grid"/></pattern></defs>' +
      '<rect width="860" height="320" class="sea"/><rect width="860" height="320" fill="url(#g)"/>' +
      '<path class="land" d="M0 0H860V150C820 160 800 175 770 176C740 160 700 150 650 140C600 120 520 112 440 110C380 105 330 98 260 96C200 92 120 100 60 110C30 115 10 112 0 110Z"/>' +
      '<path class="land" d="M0 320V262C60 250 120 262 190 270C230 274 260 300 300 296C340 286 380 250 430 236C470 228 520 232 560 238C610 246 640 236 680 232C720 238 760 236 800 226C830 220 850 210 860 206V320Z"/>' +
      '<ellipse class="isl" cx="700" cy="212" rx="34" ry="7"/><ellipse class="isl" cx="318" cy="150" rx="11" ry="7"/><ellipse class="isl" cx="150" cy="168" rx="12" ry="8"/>' +
      '<text class="lbl" x="560" y="60">Карельский перешеек</text><text class="lbl" x="420" y="296">Ораниенбаумский берег</text>' +
      pins + "</svg><figcaption>Схема, не для навигации. Нажмите на район, чтобы открыть журнал.</figcaption></figure>";
  }

  function home() {
    out.innerHTML = mapSvg(null) +
      '<section class="panel"><h2>Как пользоваться</h2><ul class="howto">' +
      "<li>Поиск судна — по названию или MT-ID в строке выше.</li>" +
      "<li>Журнал района — список судов, чьи сигналы приняты рядом с островом или гаванью за выбранные сутки.</li>" +
      '<li>Все время на сайте — <b>UTC</b>. Москва = UTC+3.</li>' +
      "<li>Суда с выключенным передатчиком трекер не видит. Последняя принятая точка хранится в карточке судна.</li></ul></section>";
  }

  function searchView(text) {
    var n = norm(text);
    var found = D.vessels.filter(function (v) {
      return norm(v.name).indexOf(n) !== -1 || norm(v.mtid).replace(/ /g, "") === n.replace(/ /g, "");
    });
    if (!n) return home();
    out.innerHTML = '<p class="crumbs"><a href="#">Главная</a> / Поиск: «' + esc(text) + "»</p>" +
      (found.length ? '<p class="count">Найдено судов: ' + found.length + "</p>" + found.map(function (v) {
        return '<a class="res" href="#v=' + v.id + '"><span class="ic">' + icon(v) + '</span><span class="body">' +
          '<span class="nm">' + esc(v.name) + " " + badge(v) + "</span>" +
          '<span class="meta">' + esc(v.type) + " · " + esc(v.len) + " · порт приписки: " + esc(v.port) + "</span>" +
          '<span class="meta mono">' + esc(v.mtid) + " · сигнал: " + esc(v.last.t) + " UTC</span></span></a>";
      }).join("") : '<p class="empty">Судов с таким названием не найдено. Проверьте написание или поищите по MT-ID.</p>');
  }

  function vesselView(id) {
    var v = byId[id];
    if (!v) { out.innerHTML = '<p class="empty">Судно не найдено.</p>'; return; }
    var rows = [
      ["Тип", v.type], ["Длина", v.len], ["Год постройки", v.built], ["Флаг", v.flag],
      ["Порт приписки", v.port], ["Стоянка", v.berth], ["Владелец", v.owner], ["MT-ID", v.mtid]
    ];
    out.innerHTML = '<p class="crumbs"><a href="#">Главная</a> / <a href="#q=' + encodeURIComponent(v.name) + '">' + esc(v.name) + "</a> / " + esc(v.mtid) + "</p>" +
      '<section class="panel vessel"><div class="vh"><span class="ic big">' + icon(v) + "</span><div><h2>" + esc(v.name) + "</h2>" +
      '<div class="meta">' + esc(v.type) + " · " + esc(v.len) + " · " + badge(v) + "</div></div></div>" +
      '<div class="last"><div class="k">Последний сигнал</div><div class="v mono">' + esc(v.last.t) + ' <b class="utc">UTC</b></div>' +
      '<div class="k">Позиция</div><div class="v mono">' + esc(v.last.pos) + "</div>" +
      '<div class="k">Район</div><div class="v">' + esc(v.last.where) + "</div>" +
      '<div class="k">Курс / скорость</div><div class="v mono">' + esc(v.last.course) + " / " + esc(v.last.speed) + "</div></div>" +
      '<table class="kv">' + rows.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</table></section>" +
      '<section class="panel"><h3>История сигналов <small>(время UTC)</small></h3><ol class="track">' +
      v.track.map(function (t) { return '<li><span class="mono t">' + esc(t[0]) + "</span><span>" + esc(t[1]) + "</span></li>"; }).join("") +
      "</ol></section>";
  }

  function areaView(id, date) {
    var a = D.areas[id];
    if (!a) return home();
    if (D.dates.indexOf(date) === -1) date = "2026-11-01";
    var rows = (D.log[id + "|" + date] || []).slice().sort(function (x, y) { return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0; });
    var tabs = D.dates.map(function (d) {
      return '<a class="tab' + (d === date ? " on" : "") + '" href="#area=' + id + "&date=" + d + '">' + ruDate(d).slice(0, 5) + "</a>";
    }).join("");
    out.innerHTML = '<p class="crumbs"><a href="#">Главная</a> / Журнал района</p>' + mapSvg(id) +
      '<section class="panel"><h2>' + esc(a.name) + " · " + ruDate(date) + '</h2><div class="tabs">' + tabs + "</div>" +
      '<p class="note">Время — <b>UTC</b> (Москва = UTC+3). Показаны только суда с включённым передатчиком.</p>' +
      (rows.length ? '<table class="log"><thead><tr><th>Судно</th><th>Тип</th><th>С, UTC</th><th>По, UTC</th><th>Скорость</th><th>Примечание</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var v = byId[r[0]];
          return '<tr><td data-l="Судно"><a href="#v=' + v.id + '">' + esc(v.name) + '</a></td><td data-l="Тип">' + esc(v.type) +
            '</td><td data-l="С, UTC" class="mono">' + esc(r[1]) + '</td><td data-l="По, UTC" class="mono">' + esc(r[2] || "—") +
            '</td><td data-l="Скорость" class="mono">' + esc(r[3]) + '</td><td data-l="Примечание">' + esc(r[4]) + "</td></tr>";
        }).join("") + "</tbody></table>"
        : '<p class="empty">За эти сутки сигналов в районе не принято.</p>') + "</section>";
  }

  function route() {
    var p = params();
    window.scrollTo(0, 0);
    if (p.v) return vesselView(p.v);
    if (p.area) return areaView(p.area, p.date);
    if (p.q != null) { if (document.activeElement !== q) q.value = p.q; return searchView(p.q); }
    home();
  }

  document.getElementById("f").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = q.value.trim();
    location.hash = v ? "q=" + encodeURIComponent(v) : "";
  });
  addEventListener("hashchange", route);
  route();
})();
