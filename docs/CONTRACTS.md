# Технические контракты платформы «Маяк»

Статический сайт (GitHub Pages), без сборщиков и фреймворков, ванильный JS (ES2020), без внешних
зависимостей. Node 22 есть только для инструментов (`tools/`). Всё, что лежит в `dist/`, публикуется.

## Структура репозитория

```
index.html                 витрина платформы: сезон, карточки эпизодов, прогресс, покупка/код доступа
play.html                  движок: play.html#<questId>  (например play.html#ep1)
css/platform.css           стили витрины
css/game.css               стили движка (бывший css/style.css)
js/core/answers.js         normalize + sha256 + check (бывший js/answers.js, API не менять)
js/core/storage.js         безопасный localStorage (try/catch), неймспейс "mayak:"
js/core/vault.js           AES-GCM + PBKDF2 (WebCrypto в браузере, node:crypto webcrypto в node)
js/platform/catalog.js     window.CATALOG — метаданные сезона и эпизодов (не секрет)
js/platform/access.js      права доступа + адаптер оплаты (см. ниже)
js/platform/home.js        логика витрины
js/engine/game.js          движок квеста (бывший js/game.js, обобщённый)
content/<id>/quest.js      ИСХОДНИК квеста (CommonJS, module.exports = {...}); в dist НЕ попадает
quests/<id>/quest.json     собранный бесплатный квест (генерируется tools/build.js)
quests/<id>/quest.enc.json собранный платный квест (генерируется tools/build.js)
world/                     «интернет» персонажей; публикуется целиком
world/social/index.html    соцсеть «Лента»: world/social/#<ник>
world/social/core.js       API World (см. ниже)
world/social/data/ep1.js … ep4.js   данные профилей/постов по эпизодам
world/<site>/              вымышленные сайты эпизодов (fund, registry, ortov-yachts, moretrack, webpamyat …)
world/media/<id>/          медиафайлы эпизодов (jpg с EXIF, wav и т.п.)
tools/build.js             сборка: content → quests (хэши, шифрование), копирование в dist/
tools/hash.js              хэш ответа (как сейчас)
tools/assets/              python-скрипты генерации медиа (PIL, numpy доступны; piexif НЕТ — EXIF писать вручную через PIL Image.Exif / getexif и теги GPS)
docs/                      SERIES.md, CONTRACTS.md, PAYMENTS.md, AUTHOR_GUIDE.md
```

Все ссылки внутри сайта — относительные (сайт живёт по адресу https://kizzzil.github.io/browse_game/).
Ссылки из квеста на мир пишутся относительно `play.html`, т.е. `world/social/#vera.somova`,
`world/fund/reports.html`.

## Формат исходника квеста `content/<id>/quest.js`

```js
module.exports = {
  id: "ep2",                       // совпадает с каталогом
  title: "ПАРТНЁРЫ",               // заголовок в шапке движка
  subtitle: "Эпизод 2. ...",
  chapters: [
    {
      id: "registry",              // уникален в пределах квеста
      title: "Глава 1. ...",
      briefing: ["абзац", "абзац"],             // печатаются по одному
      docs: [{ title: "…", body: "<p>HTML…</p>" }],   // опционально; HTML, класс .mark — выделение
      links: [{ label: "…", url: "world/registry/" }], // опционально
      worldEpisode: 2,             // опционально: с этой главы в «Ленте» видны посты эпизода N (по умолчанию = номер эпизода)
      task: {
        prompt: "Вопрос",
        placeholder: "подсказка формата",
        hints: ["…", "…"],
        answers: ["ответ", "вариант ответа"]   // ОТКРЫТЫЙ ТЕКСТ, build превратит в answerHash; normalize: lower, ё→е, только буквы/цифры
      },
      reward: {
        evidence: [{ id: "…", icon: "🧾", title: "…", text: "…" }],
        message: "Что это значит и куда дальше"
      }
    }
  ],
  finale: {
    title: "Финал. …",
    briefing: ["…"],
    prompt: "Вопрос финала",
    options: [{ id: "a", name: "…" }, …],     // выбор одного варианта
    answers: ["a"],                            // id верного варианта(ов) открытым текстом
    // ИЛИ мультивыбор доказательств (эп.4):
    // multi: true, answers: ["id1+id3+id4"]   — id выбранных через "+", отсортированные по алфавиту
    win: ["абзац", …],
    lose: ["абзац", …]
  }
};
```

Сборщик для каждого квеста: соль = `"<id>:"`; `answers` → `answerHash: [sha256(соль+normalize(a))…]`,
поле `answers` в выход НЕ попадает. Бесплатный (по каталогу `free: true`) → `quests/<id>/quest.json`.
Платный → `quests/<id>/quest.enc.json` (см. «Шифрование»).

Существующий эп.1 переносится в `content/ep1/quest.js` (ответы: "23:47"; "северный ветер",
"ресторан северный ветер"; "вс"; "прилив"; финал "somova") с обновлёнными ссылками на world/.

## Каталог `js/platform/catalog.js`

```js
window.CATALOG = {
  season: { id: "mayak", title: "Маяк", tagline: "…" },
  currency: "RUB",
  bundle: { id: "season-mayak", title: "Весь сезон", price: 449, includes: ["ep2","ep3","ep4"] },
  quests: [
    { id: "ep1", number: 1, title: "Дело №0913", teaser: "…", duration: "30–45 мин", free: true,  price: 0 },
    { id: "ep2", number: 2, title: "Партнёры",   teaser: "…", duration: "…", free: false, price: 199, requires: "ep1" },
    { id: "ep3", number: 3, title: "Альбатрос",  … price: 199, requires: "ep2" },
    { id: "ep4", number: 4, title: "Лоцман",     … price: 249, requires: "ep3" }
  ]
};
```
`requires` — мягкая рекомендация (предупреждение), не блокировка.

## Шифрование платного контента (`js/core/vault.js`, `tools/build.js`)

- Для каждого платного квеста при сборке генерируется случайный ключ контента K (AES-GCM 256).
  Чтобы ключ не менялся при каждой сборке, он хранится в `content/<id>/key.json`
  (создаётся при первой сборке; в dist не попадает).
- Контент (v2): `{ v:2, alg:"AES-GCM", iv:b64, ct:b64, kdf:{salt:b64, iter:200000}, keys:[ {kid, iv:b64, wrapped:b64} ] }`.
  Для кода (normalize: trim, upper, без пробелов и дефисов) один раз считается
  `M = PBKDF2-SHA256(code, kdf.salt, kdf.iter)` (256 бит, соль общая на файл). Ключ обёртки = `HMAC-SHA256(M, "wrap")`,
  `kid` = первые 8 hex `HMAC-SHA256(M, "kid")`. Каждый элемент `keys` — K, зашифрованный ключом обёртки (AES-GCM).
  kid нельзя проверить без PBKDF2, поэтому он не ускоряет перебор (в v1 kid был несолёным sha256(код) — так нельзя).
  Клиент (`Access.redeemCode`) пробует код на каждом опубликованном платном эпизоде: один PBKDF2 на эпизод.
- Коды доступа берутся из `content/codes.json`: `{ "ep2": ["КОД1", …], "ep3": [...], "ep4": [...], "season": [...] }`
  (коды "season" добавляются во все платные эпизоды). Для тестов — код `MAYAK-DEMO-2026` во всех.
- Браузер: `Vault.unlockWithCode(encJson, code) → K (raw, b64)` или ошибка; `Vault.decrypt(encJson, Kb64) → объект`.
  Будущий сервер оплаты может вернуть K напрямую (без кода) — движок принимает K через `Access`.

## Доступ и оплата `js/platform/access.js`

```js
window.Access = {
  config: { provider: "demo", checkoutEndpoint: null, keyEndpoint: null },  // будущее: "yookassa" | "cloudpayments" | "stripe"
  isFree(questId), hasAccess(questId), getKey(questId),
  async redeemCode(code)      // пробует код на всех платных квестах (скачивает их enc.json), сохраняет найденные K; → [questIds]
  async purchase(questId|bundleId)  // demo: показывает модалку «оплата скоро + ввести код»; server-провайдер: POST checkoutEndpoint → redirect
  async handleReturn()        // разбирает ?order=… после возврата с оплаты, GET keyEndpoint → K; в demo — no-op
};
```
Ключи хранятся в localStorage `mayak:keys` = `{ ep2: "<K b64>", … }`. Описание серверного контракта
(создание заказа, вебхук, выдача ключа) — в `docs/PAYMENTS.md`.

## Прогресс `js/core/storage.js`

`mayak:progress:<questId>` — состояние движка (как сейчас: agent, chapter, solved, evidence, hints, ending, startedAt).
`mayak:agent` — общий позывной на весь сезон (спрашивается один раз).
`mayak:worldEpisode` — число: максимальный эпизод мира, который видит «Лента» (движок выставляет
`max(текущее, chapter.worldEpisode ?? номер эпизода)` при входе в главу).

## Мир: соцсеть «Лента» (`world/social/`)

Вымышленная соцсеть с собственным брендом «Лента» (не копировать Instagram: ни логотипа, ни названия).
Страница профиля: `world/social/#<ник>`; без ника — список «знакомых» профилей? нет: «Профиль не найден».
Плашки «демо» больше нет; вместо неё в подвале «Вымышленная соцсеть для игры «Маяк»».

`world/social/index.html` подключает только `<script src="core.js" data-episodes="4">` (`data-episodes` — сколько
файлов `data/epN.js` существует). `core.js` сам по порядку вставляет `data/ep1.js … data/epN.js` только для
N ≤ `mayak:worldEpisode` (данные будущих эпизодов не загружаются в страницу заранее), затем рендер; при росте
`mayak:worldEpisode` в соседней вкладке догружает недостающие файлы. Комментарии `/* … */` и `// …` в
`world/**/*.js` вырезаются при копировании в `dist/` — разбор механик держите в `docs/walkthrough/`, а не в данных.
API в `core.js`:

```js
World.profile(nick, { name, avatar /* 1–2 буквы */, color, bio, link /* {label,url} опц. */, followers, following, episode /* с какого эпизода профиль существует, по умолч. 1 */ });
World.posts(nick, episode, [ /* новые сверху */ {
  date: "12 сентября",                // отображаемая дата
  scene: { bg, emoji, text, receipt /* {title,sub,meta[],items[[a,b]],total,pay} */, scarf /* "В.С." */, image /* url относительно world/social/ */ , imageAlt },
  caption, comments: [[nick, text], …],
  download: { url, label }            // опц.: ссылка «Скачать оригинал» под фото (для EXIF-механик — оригинальный файл с метаданными)
}]);
World.bio(nick, episode, { bio?, link?, name? })   // переопределение шапки профиля начиная с эпизода N
```
Видимость: показываются профили и посты с `episode <= mayak:worldEpisode` (по умолчанию 1).
Посты более поздних эпизодов идут выше (новее). `scene.image` — для своих SVG/PNG/JPG (лежат в `world/media/…`).

## Вымышленные сайты (`world/<site>/`)

Самостоятельные HTML-страницы с полным документом (`<!doctype html>`), собственный стиль, мобильная
вёрстка (360px без горизонтального скролла), относительные ссылки, подвал с пометкой о вымышленности.
Никаких внешних запросов, CDN и шрифтов извне — всё локально.

## Проверка

`node tools/build.js` → `dist/`. Локально: `cd dist && python3 -m http.server 8765`.
Playwright есть глобально (`npm root -g`/playwright, Chromium уже установлен, `playwright install` НЕ запускать).
