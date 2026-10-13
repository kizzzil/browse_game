#!/usr/bin/env python3
"""Генератор вымышленного веб-архива «Веб-Память» для эпизода 4 «Лоцман».

Пишет статические страницы в world/webpamyat/:
  lotsman/            календарь снимков блога «Записки лоцмана» (tetrad.lenta/lotsman)
  lotsman/<дата>/     снимки: index.html (записи) и about.html (об авторе)
  mayak-fund/         календарь снимков сайта фонда «Маяк» (mayak-fund.lenta)
  mayak-fund/<дата>/  снимки: index.html и docs.html (документы правления)
Главная страница поиска (index.html), стили (wp.css, lotsman/tetrad.css, mayak-fund/fund.css)
лежат рядом и пишутся руками.

Ключевые места для прохождения (docs/walkthrough/ep4.md):
  глава 1 — lotsman/20250614/about.html: «По профессии я архитектор…»
           (ловушка: lotsman/20260905/about.html — «Я лоцман. По профессии — тоже.»)
  глава 2 — lotsman/20260905/index.html: запись «Отлив» 30.08.2026 → ../../../media/ep4/otliv.wav
           (ловушка: lotsman/20250614/index.html — «Прибой», priboy.wav, просто шум)
  глава 4 — mayak-fund/20251220/docs.html: протокол №4 → ../../../media/ep4/protokol-4.jpg

Запуск из корня репозитория:  python3 tools/assets/ep4_webpamyat.py
Всё вымышлено.
"""
import calendar
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "world", "webpamyat")
FIC = "Вымышленный сайт для игры «Маяк». Все совпадения случайны."
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
          "сентября", "октября", "ноября", "декабря"]
MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август",
              "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
e = html.escape


def human(stamp):
    y, m, d = int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8])
    return f"{d} {MONTHS[m - 1]} {y}"


def short(stamp):
    return f"{stamp[6:8]}.{stamp[4:6]}.{stamp[:4]}"


def write(rel, text):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def doc(title, body_class, css, body):
    links = "\n".join(f'  <link rel="stylesheet" href="{c}">' for c in css)
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(title)}</title>
{links}
</head>
<body class="{body_class}">
{body}
</body>
</html>
"""


def wp_bar(site, stamp, time, page, path_label):
    """Панель «Веб-Памяти» над снимком: адрес, дата, соседние снимки."""
    stamps = [s["stamp"] for s in site["snaps"]]
    i = stamps.index(stamp)
    prev = f'<a href="../{stamps[i - 1]}/{page}">‹ {short(stamps[i - 1])}</a>' if i > 0 else "<span>‹ раньше нет</span>"
    nxt = f'<a href="../{stamps[i + 1]}/{page}">{short(stamps[i + 1])} ›</a>' if i + 1 < len(stamps) else "<span>позже нет ›</span>"
    return f"""<div class="wp-bar" role="banner"><div class="in">
  <a class="brand" href="../../index.html">ВЕБ-ПАМЯТЬ</a>
  <span class="url">{e(site['addr'] + path_label)}</span>
  <span class="when">снимок: <b>{human(stamp)}, {time}</b></span>
  <span class="nav">{prev}<a href="../index.html">все снимки</a>{nxt}</span>
</div></div>"""


def wp_foot():
    return f"""<div class="wp-foot">Снимок сохранён «Веб-Памятью». Содержимое — на дату снимка, ссылки ведут внутрь архива.<br><span class="fic">{FIC}</span></div>"""


def not_saved(site, snap, page, path_label, css):
    stamps = [s["stamp"] for s in site["snaps"]]
    have = [s for s in site["snaps"] if page in s["pages"]]
    near = ", ".join(f'<a href="../{s["stamp"]}/{page}">{short(s["stamp"])}</a>' for s in have) or "нет"
    body = wp_bar(site, snap["stamp"], snap["time"], page, path_label) + f"""
<div class="wp-miss">
  <h1>Страница не сохранена в этом снимке</h1>
  <p>Адрес <b>{e(site['addr'] + path_label)}</b> не был сохранён {human(snap['stamp'])}.</p>
  <p>Снимки этой страницы: {near}.</p>
  <p><a href="index.html">← к главной странице снимка</a> · <a href="../index.html">календарь снимков</a></p>
</div>
""" + wp_foot()
    return doc(f"Не сохранено — Веб-Память", "wp", css, body)


# ---------------------------------------------------------------- блог «Записки лоцмана»

AUDIO = "../../../media/ep4/"


def td_shell(site, snap, page, path_label, inner, nav=True):
    on_i = ' class="on"' if page == "index.html" else ""
    on_a = ' class="on"' if page == "about.html" else ""
    navhtml = f'<div class="td-nav"><a href="index.html"{on_i}>Записи</a><a href="about.html"{on_a}>Об авторе</a></div>' if nav else ""
    body = wp_bar(site, snap["stamp"], snap["time"], page, path_label) + f"""
<div class="td-top"><div class="in"><span><b>ТЕТРАДЬ</b> · блоги на «Ленте»</span><span>tetrad.lenta</span></div></div>
<div class="td-sheet">
  <div class="td-head"><h1>Записки лоцмана</h1><p>О заливе, о воде и о людях, которые не видят дна.</p></div>
  {navhtml}
  <div class="td-body">
{inner}
  </div>
</div>
<div class="td-foot">«Тетрадь» — блоги на «Ленте». Автор пишет под ником lotsman.</div>
""" + wp_foot()
    return doc("Записки лоцмана — снимок " + short(snap["stamp"]) + " — Веб-Память", "wp td", ["../../wp.css", "../tetrad.css"], body)


def post(date, title, paras, audio=None, comments=(), note=None):
    ps = "\n".join(f"      <p>{p}</p>" for p in paras)
    au = ""
    if audio:
        fn, label, dur = audio
        au = f"""      <div class="audio">🎧 <b>{e(label)}</b> · WAV, {dur}
        <audio controls preload="none" src="{AUDIO}{fn}"></audio>
        <a href="{AUDIO}{fn}" download>Скачать запись ({fn})</a></div>"""
    cms = "\n".join(f'      <div class="cm"><b>{e(n)}</b> <small>{e(d)}</small><br>{e(t)}</div>' for n, d, t in comments)
    nt = f'      <p class="td-note">{note}</p>' if note else ""
    return f"""    <article class="post">
      <div class="date">{date}</div>
      <h2>{title}</h2>
{ps}
{au}
{cms}
{nt}
    </article>"""


P_HELLO = post("01.03.2025", "Здравствуй, залив", [
    "Завёл тетрадь. Буду писать о воде: о фарватерах, о створных знаках и о том, как по двум огням найти дорогу, которую не видно.",
    "Створ — это когда два знака на берегу совпадают в одну линию. Пока они на одной линии, ты на курсе. Разошлись — ты уже на мели, просто ещё не знаешь об этом.",
])
P_STVOR = post("12.04.2025", "Почему «Створ»", [
    "Спрашивают, почему лодка так называется. Потому что на воде, как и на берегу, всё решает линия. Девять метров, тёмный корпус, два мотора. Не красавица, зато не видна в сумерках.",
    "Пока она стоит в яхт-клубе, среди чужих мачт. Однажды у неё будет свой дом.",
])
P_PAMYAT = post("20.05.2025", "Вода помнит", [
    "Говорят, вода ничего не помнит. Неправда. Она помнит каждый киль, просто никому не рассказывает. Хорошее качество. Редкое у людей.",
])
P_PRIBOY = post("07.06.2025", "Прибой", [
    "Записал прибой у Лисьего Носа, на рассвете. Просто шум. Ставлю его, когда надо думать.",
], audio=("priboy.wav", "Прибой, 07.06.2025", "4 с"),
   comments=[("marina_spb", "07.06.2025", "Красиво. Под такое спится."), ("lotsman", "07.06.2025", "Под такое думается 🙂")])

P_SLIP = post("18.05.2026", "Весна на слипе", [
    "Спустил «Створ». Пахнет краской и мокрым деревом. Скоро у лодки будет собственный эллинг — проект почти готов, осталось найти, кто за него заплатит.",
])
P_OGNI = post("03.06.2026", "Два огня", [
    "Два огня на одной линии — и ты на курсе. Сегодня зажглись оба.",
], comments=[("albatros", "03.06.2026", "Оба горят 🔥 Подписал."), ("lotsman", "03.06.2026", "Дальше — тихо.")])
P_SHTIL = post("14.08.2026", "Штиль", [
    "Штиль — лучшее время, чтобы перегнать лодку. Никто не смотрит на воду, когда она гладкая.",
], comments=[("albatros", "16.08.2026", "Перегнал. Всё у причала."), ("lotsman", "16.08.2026", "Без имён.")])
P_OTLIV = post("30.08.2026", "Отлив", [
    "Отлив у залива почти незаметен — пара сантиметров. Но каждому отливу нужен тот, кто останется на мели.",
    "Записал у воды. Слушайте не ушами.",
], audio=("otliv.wav", "Отлив, 30.08.2026", "6 с"),
   comments=[("albatros", "30.08.2026", "Принял. ⚓"), ("marina_spb", "31.08.2026", "Опять шум 🙂 А где фото залива?")])

ABOUT_2025 = """    <article class="post">
      <h2>Об авторе</h2>
      <p>Лоцман — это прозвище с яхт-клуба, а не профессия. Лоцманом меня зовут за то, что я всегда знаю, где фарватер, — и на воде, и на берегу.</p>
      <p>По профессии я <b>архитектор</b>: рисую дома на берегу, а живу на воде. Своё бюро, свои заказчики, свои сроки. Чертежи — днём, залив — по вечерам.</p>
      <p>Лодка — «Створ»: моторная, тёмный корпус, девять метров. Пока стоит в яхт-клубе. Однажды построю ей свой эллинг — где-нибудь на северном берегу, у Лисьего Носа, среди сосен.</p>
      <p>Пишу без имени. Кому надо — узнает по почерку.</p>
    </article>"""

ABOUT_2026 = """    <article class="post">
      <h2>Об авторе</h2>
      <p>Я лоцман. Провожу суда там, где другие сядут на мель. По профессии — тоже.</p>
      <p>Остальное неважно.</p>
    </article>"""

BLOG = {
    "dir": "lotsman",
    "addr": "tetrad.lenta/lotsman",
    "title": "Записки лоцмана",
    "snaps": [
        {"stamp": "20250303", "time": "09:14", "status": "200", "pages": {"index.html"},
         "index": P_HELLO, "note": "1 страница"},
        {"stamp": "20250614", "time": "11:02", "status": "200", "pages": {"index.html", "about.html"},
         "index": "\n".join([P_PRIBOY, P_PAMYAT, P_STVOR, P_HELLO]), "about": ABOUT_2025, "note": "2 страницы, 1 аудио"},
        {"stamp": "20260905", "time": "22:47", "status": "200", "pages": {"index.html", "about.html"},
         "index": "\n".join([P_OTLIV, P_SHTIL, P_OGNI, P_SLIP,
                             '    <p class="td-note">Записи до 2026 года автор перенёс в личный архив.</p>']),
         "about": ABOUT_2026, "note": "2 страницы, 1 аудио"},
        {"stamp": "20261110", "time": "03:20", "status": "410", "pages": {"index.html"}, "gone": True,
         "note": "тетрадь удалена автором"},
        {"stamp": "20261202", "time": "16:55", "status": "404", "pages": {"index.html"}, "gone": True,
         "note": "страница не найдена"},
    ],
}


def build_blog():
    site = BLOG
    for snap in site["snaps"]:
        d = f"{site['dir']}/{snap['stamp']}/"
        if snap["stamp"] == "20261110":
            inner = """<div class="td-gone"><h1>Тетрадь удалена</h1><p>Автор удалил эту тетрадь 3 ноября 2026 года.<br>Записи и комментарии больше недоступны.</p></div>"""
            body = wp_bar(site, snap["stamp"], snap["time"], "index.html", "/") + f"""
<div class="td-top"><div class="in"><span><b>ТЕТРАДЬ</b> · блоги на «Ленте»</span><span>tetrad.lenta</span></div></div>
{inner}
<div class="td-foot">«Тетрадь» — блоги на «Ленте».</div>
""" + wp_foot()
            write(d + "index.html", doc("Тетрадь удалена — снимок " + short(snap["stamp"]) + " — Веб-Память", "wp td", ["../../wp.css", "../tetrad.css"], body))
        elif snap["stamp"] == "20261202":
            body = wp_bar(site, snap["stamp"], snap["time"], "index.html", "/") + """
<div class="wp-miss"><h1>404</h1><p>На дату снимка по этому адресу ничего не было: сервер ответил «страница не найдена».</p><p>Попробуйте более ранние снимки в <a href="../index.html">календаре</a>.</p></div>
""" + wp_foot()
            write(d + "index.html", doc("404 — снимок " + short(snap["stamp"]) + " — Веб-Память", "wp", ["../../wp.css"], body))
        else:
            write(d + "index.html", td_shell(site, snap, "index.html", "/", snap["index"]))
        if "about.html" in snap["pages"]:
            write(d + "about.html", td_shell(site, snap, "about.html", "/about", snap["about"]))
        else:
            write(d + "about.html", not_saved(site, snap, "about.html", "/about", ["../../wp.css"]))


# ---------------------------------------------------------------- сайт фонда «Маяк»

def fund_shell(site, snap, page, path_label, active, inner):
    nav = "".join(
        f'<a href="{href}"{" class=on" if href == active else ""}>{label}</a>'
        for href, label in (("index.html", "О фонде"), ("docs.html", "Документы"))
    ).replace("class=on", 'class="on"')
    body = wp_bar(site, snap["stamp"], snap["time"], page, path_label) + f"""
<div class="fs">
  <header><div class="bar"><a class="logo" href="index.html">МАЯК<span>·</span>ФОНД</a><nav>{nav}</nav></div></header>
{inner}
  <footer>© 2014–{snap['stamp'][:4]} БФ «Маяк».<br>{FIC}</footer>
</div>
""" + wp_foot()
    return doc("Фонд «Маяк» — снимок " + short(snap["stamp"]) + " — Веб-Память", "wp", ["../../wp.css", "../fund.css"], body)


FUND_HOME = """  <section class="hero"><h1>Свет для тех, кто в пути</h1>
    <p>Благотворительный фонд «Маяк» с 2014 года помогает семьям рыбаков и жителям прибрежных посёлков Северной косы: ремонт жилья, лечение, образование для детей.</p></section>
  <main><div class="cols">
    <div class="box"><h3>Новый корпус</h3><p>{corp}</p></div>
    <div class="box"><h3>Прозрачность</h3><p>{transp}</p></div>
  </div></main>"""

FUND_DOCS_2025 = """  <section class="hero"><h1>Документы правления</h1>
    <p>Протоколы заседаний правления фонда публикуются в течение трёх дней после подписания.</p></section>
  <main>
    <table>
      <tr><th>№</th><th>Дата</th><th>Повестка</th></tr>
      <tr><td>1</td><td>12.03.2025</td><td class="removed">Отчёт за 2024 год (файл не сохранён в архиве)</td></tr>
      <tr><td>2</td><td>18.06.2025</td><td class="removed">Программы помощи на лето (файл не сохранён в архиве)</td></tr>
      <tr><td>3</td><td>24.09.2025</td><td class="removed">Аудит 2025 года, выбор аудитора (файл не сохранён в архиве)</td></tr>
      <tr><td>4</td><td>18.12.2025</td><td><a href="#p4">Проект и смета нового корпуса, корпоративные карты, договоры на 2026 год</a></td></tr>
    </table>
    <h2 id="p4" style="color:#14213d;margin-top:36px">Протокол №4 от 18 декабря 2025 г.</h2>
    <p>Скан подписанного протокола. Нажмите на изображение, чтобы открыть в полном размере.</p>
    <a href="../../../media/ep4/protokol-4.jpg"><img class="scan" src="../../../media/ep4/protokol-4.jpg" width="1000" height="1480" alt="Скан протокола №4 заседания правления БФ «Маяк» от 18.12.2025 с подписями Лузина П.Р., Лаптевой К.В., Лебедева К.А. и Сомовой В.А." loading="lazy"></a>
  </main>"""

FUND_DOCS_2026 = """  <section class="hero"><h1>Документы правления</h1>
    <p class="removed">Раздел на реконструкции. Приносим извинения за неудобства.</p></section>
  <main><p class="removed">По вопросам доступа к документам обращайтесь в фонд письменно.</p></main>"""

FUND = {
    "dir": "mayak-fund",
    "addr": "mayak-fund.lenta",
    "title": "Фонд «Маяк»",
    "snaps": [
        {"stamp": "20251220", "time": "14:31", "status": "200", "pages": {"index.html", "docs.html"}, "note": "2 страницы, 1 скан",
         "home": FUND_HOME.format(corp="Правление одобрило проект и смету нового корпуса фонда. Автор проекта — архитектор, член правления К.А. Лебедев.",
                                  transp="Протоколы правления — в разделе <a href=\"docs.html\">«Документы»</a>.")},
        {"stamp": "20261005", "time": "08:12", "status": "200", "pages": {"index.html", "docs.html"}, "note": "2 страницы",
         "home": FUND_HOME.format(corp="Строительство корпуса временно приостановлено.",
                                  transp="Ежеквартальные отчёты и независимый аудит. Раздел «Документы» на реконструкции.")},
    ],
}


def build_fund():
    site = FUND
    for snap in site["snaps"]:
        d = f"{site['dir']}/{snap['stamp']}/"
        write(d + "index.html", fund_shell(site, snap, "index.html", "/", "index.html", snap["home"]))
        docs = FUND_DOCS_2025 if snap["stamp"] == "20251220" else FUND_DOCS_2026
        write(d + "docs.html", fund_shell(site, snap, "docs.html", "/docs", "docs.html", docs))


# ---------------------------------------------------------------- календари

def head_html(depth):
    up = "../" * depth
    return f"""<header class="wp-head"><div class="in">
  <a class="wp-logo" href="{up}index.html"><span class="stack"><i></i><i></i><i></i></span><span><b>ВЕБ-ПАМЯТЬ</b><small>архив интернета · снимки страниц по датам</small></span></a>
  <nav><a href="{up}index.html">Поиск</a><a href="{up}index.html#how">Как это работает</a></nav>
</div></header>"""


def calendar_page(site):
    snaps = {s["stamp"]: s for s in site["snaps"]}
    years = sorted({s[:4] for s in snaps})
    first, last = site["snaps"][0]["stamp"], site["snaps"][-1]["stamp"]
    parts = []
    for y in years:
        n = sum(1 for s in snaps if s[:4] == y)
        months = []
        for m in range(1, 13):
            rows = []
            for week in calendar.Calendar(0).monthdayscalendar(int(y), m):
                cells = []
                for day in week:
                    if not day:
                        cells.append("<td></td>")
                        continue
                    st = f"{y}{m:02d}{day:02d}"
                    if st in snaps:
                        cls = ' class="gone"' if snaps[st].get("gone") else ""
                        cells.append(f'<td><a{cls} href="{st}/index.html" title="Снимок {short(st)}">{day}</a></td>')
                    else:
                        cells.append(f"<td>{day}</td>")
                rows.append("<tr>" + "".join(cells) + "</tr>")
            months.append(f"""<div class="month"><h3>{MONTHS_NOM[m - 1]}</h3><table><tr><th>пн</th><th>вт</th><th>ср</th><th>чт</th><th>пт</th><th>сб</th><th>вс</th></tr>{''.join(rows)}</table></div>""")
        parts.append(f"""<section class="year"><h2>{y} <span>снимков: {n}</span></h2><div class="months">{''.join(months)}</div></section>""")
    lst = "\n".join(
        f"""<tr><td><a href="{s['stamp']}/index.html">{short(s['stamp'])}</a>, {s['time']}</td><td><span class="code{' bad' if s.get('gone') else ''}">{s['status']}</span></td><td>{e(s['note'])}</td></tr>"""
        for s in site["snaps"])
    body = head_html(1) + f"""
<main class="wp-main">
  <p><a href="../index.html">← новый поиск</a></p>
  <h1>{e(site['addr'])}</h1>
  <p class="cal-sum">Сохранено {len(snaps)} раз(а) с {human(first)} по {human(last)}. Жёлтые даты — снимки, красные — на дату снимка страницы уже не было.</p>
  {''.join(parts)}
  <h2>Все снимки списком</h2>
  <table class="list"><tr><th>Дата и время</th><th>Ответ</th><th>Что сохранено</th></tr>
{lst}
  </table>
</main>
<footer class="wp-foot">«Веб-Память» хранит копии страниц такими, какими они были на дату снимка. Мы не изменяем содержимое.<br><span class="fic">{FIC}</span></footer>"""
    write(f"{site['dir']}/index.html", doc(f"{site['addr']} — календарь снимков — Веб-Память", "wp", ["../wp.css"], body))


def main():
    build_blog()
    build_fund()
    calendar_page(BLOG)
    calendar_page(FUND)
    n = sum(len(fs) for _, _, fs in os.walk(OUT))
    print("webpamyat files:", n)


if __name__ == "__main__":
    main()
