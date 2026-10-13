(function () {
  "use strict";
  var R = window.REGISTRY;
  var out = document.getElementById("out");
  var q = document.getElementById("q");
  var STATUS = { active: "Действующая", liquidated: "Ликвидирована", excluded: "Исключена из реестра" };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
  function digits(s) { return String(s).replace(/\D/g, ""); }
  function person(id) { return R.persons[id] || id; }
  function addr(id) { return (R.addresses[id] || { text: id }).text; }
  function atAddr(id) { return R.orgs.filter(function (o) { return o.addr === id; }); }
  function badge(o) {
    return '<span class="badge ' + o.status + '">' + STATUS[o.status] + (o.closed ? " " + esc(o.closed) : "") + "</span>";
  }
  function regDate(o) { var p = o.reg.split("."); return p[2] + p[1] + p[0]; }

  function resultCard(o) {
    return '<a class="card res" href="#org=' + o.inn + '">' +
      '<div class="nm">' + esc(o.name) + " " + badge(o) + "</div>" +
      '<div class="meta">ИНН <span class="mono">' + o.inn + "</span> · рег. " + esc(o.reg) + " · рук. " + esc(person(o.director)) + "</div>" +
      '<div class="meta">' + esc(addr(o.addr)) + "</div></a>";
  }

  function search(text) {
    var d = digits(text), n = norm(text);
    if (!n) return [];
    return R.orgs.filter(function (o) {
      if (d.length >= 4 && (o.inn.indexOf(d) !== -1 || o.ogrn.indexOf(d) !== -1)) return true;
      if (/^\d+$/.test(n.replace(/ /g, ""))) return false;
      var hay = norm(o.name + " " + person(o.director) + " " + addr(o.addr) + " " + o.okved);
      return n.split(" ").every(function (w) { return hay.indexOf(w) !== -1; });
    });
  }

  function viewHome() {
    out.innerHTML =
      '<div class="card help"><h1>Поиск по реестру</h1>' +
      "<p>Введите ИНН (10 цифр, можно с пробелами), название организации, фамилию руководителя или часть адреса.</p>" +
      '<p class="note">Совет: название может совпадать у разных фирм. Надёжнее всего искать по ИНН.</p></div>';
  }

  function viewHelp() {
    out.innerHTML =
      '<div class="card help"><h1>Справка</h1>' +
      "<p><b>ИНН</b> — идентификатор налогоплательщика. Для организации — 10 цифр.</p>" +
      "<p><b>Массовый адрес</b> — адрес, по которому зарегистрировано много организаций. Часто это признак фирм-однодневок: офиса нет, есть только почтовый ящик.</p>" +
      "<p><b>Дата регистрации</b> указывается в формате ДД.ММ.ГГГГ.</p>" +
      '<p><a href="#">← К поиску</a></p></div>';
  }

  function viewResults(text) {
    q.value = text;
    var list = search(text);
    out.innerHTML = '<div class="crumbs">Результаты поиска: «' + esc(text) + "» — найдено " + list.length + "</div>" +
      (list.length ? list.map(resultCard).join("") : '<div class="card empty">Ничего не найдено. Проверьте ИНН: 10 цифр без букв.</div>');
  }

  function viewOrg(inn) {
    var o = R.orgs.filter(function (x) { return x.inn === inn; })[0];
    if (!o) { out.innerHTML = '<div class="card empty">Организация с ИНН ' + esc(inn) + " не найдена.</div>"; return; }
    var same = atAddr(o.addr).length;
    var a = R.addresses[o.addr] || {};
    var html = '<div class="crumbs"><a href="#">Поиск</a> › Карточка организации</div>' +
      '<div class="card"><h1>' + esc(o.name) + "</h1>" + badge(o) +
      '<h2>Основные сведения</h2><dl class="kv">' +
      '<dt>ИНН</dt><dd class="mono">' + o.inn + "</dd>" +
      '<dt>ОГРН</dt><dd class="mono">' + o.ogrn + "</dd>" +
      "<dt>Дата регистрации</dt><dd>" + esc(o.reg) + "</dd>" +
      (o.closed ? "<dt>Дата прекращения</dt><dd>" + esc(o.closed) + "</dd>" : "") +
      '<dt>Руководитель</dt><dd>Генеральный директор: <a href="#person=' + o.director + '">' + esc(person(o.director)) + "</a></dd>" +
      "<dt>Учредители</dt><dd>" + o.founders.map(function (f) { return '<a href="#person=' + f[0] + '">' + esc(person(f[0])) + "</a> — " + esc(f[1]); }).join("<br>") + "</dd>" +
      "<dt>Юридический адрес</dt><dd>" + esc(addr(o.addr)) +
      (same > 1 ? '<br><a href="#addr=' + o.addr + '">Ещё организаций по этому адресу: ' + (same - 1) + " →</a>" : "") + "</dd>" +
      "<dt>Уставный капитал</dt><dd>" + esc(o.capital) + "</dd>" +
      "<dt>Основной вид деятельности</dt><dd>" + esc(o.okved) + "</dd>" +
      "<dt>Численность</dt><dd>" + esc(o.staff) + "</dd></dl>";
    if (a.mass) html += '<div class="warn">⚠ Массовый адрес: по этому адресу зарегистрировано ' + same + " организаций.</div>";
    if (o.notes.length) html += "<h2>Отметки</h2>" + o.notes.map(function (n) { return '<p class="note">' + esc(n) + "</p>"; }).join("");
    out.innerHTML = html + "</div>";
  }

  function viewAddr(id) {
    var list = atAddr(id).slice().sort(function (a, b) { return regDate(b) < regDate(a) ? -1 : 1; });
    var a = R.addresses[id];
    if (!a) { out.innerHTML = '<div class="card empty">Адрес не найден.</div>'; return; }
    out.innerHTML = '<div class="crumbs"><a href="#">Поиск</a> › Организации по адресу</div>' +
      '<div class="card"><h1>' + esc(a.text) + "</h1>" +
      (a.mass ? '<div class="warn">⚠ Массовый адрес регистрации: ' + list.length + " организаций.</div>" : "") +
      '<table class="list"><thead><tr><th>Организация</th><th>ИНН</th><th>Дата регистрации</th><th>Руководитель</th><th>Статус</th></tr></thead><tbody>' +
      list.map(function (o) {
        return '<tr><td data-l="Организация"><a href="#org=' + o.inn + '">' + esc(o.name) + '</a></td><td data-l="ИНН" class="mono">' + o.inn +
          '</td><td data-l="Регистрация">' + esc(o.reg) + '</td><td data-l="Руководитель">' + esc(person(o.director)) + '</td><td data-l="Статус">' + badge(o) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function viewPerson(id) {
    var list = R.orgs.filter(function (o) {
      return o.director === id || o.founders.some(function (f) { return f[0] === id; });
    });
    out.innerHTML = '<div class="crumbs"><a href="#">Поиск</a> › Связанные организации</div>' +
      '<div class="card"><h1>' + esc(person(id)) + '</h1><p class="note">Руководитель или учредитель организаций: ' + list.length + "</p></div>" +
      list.map(resultCard).join("");
  }

  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    var m;
    if (!h) viewHome();
    else if (h === "help") viewHelp();
    else if ((m = h.match(/^org=(\d+)$/))) viewOrg(m[1]);
    else if ((m = h.match(/^addr=([\w-]+)$/))) viewAddr(m[1]);
    else if ((m = h.match(/^person=([\w-]+)$/))) viewPerson(m[1]);
    else if ((m = h.match(/^q=(.*)$/))) viewResults(m[1]);
    else viewHome();
    window.scrollTo(0, 0);
  }

  document.getElementById("f").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = q.value.trim();
    var target = v ? "#q=" + encodeURIComponent(v) : "#";
    if (location.hash === target) route(); else location.hash = target;
  });
  window.addEventListener("hashchange", route);
  route();
})();
