# Оплата эпизодов: как подключить настоящие платежи

Сейчас витрина работает с демо-провайдером: кнопка «Оплатить» неактивна, есть надпись
«Онлайн-оплата скоро появится», эпизоды открываются **кодом доступа** (тестовый код —
`MAYAK-DEMO-2026`, открывает весь сезон). Этот документ описывает, как включить приём
денег через ЮKassa, CloudPayments или Stripe, не переписывая витрину и движок.

## 1. Как устроен доступ сейчас

- Платный эпизод публикуется зашифрованным: `quests/<id>/quest.enc.json`
  (AES-GCM 256, случайный ключ контента **K** из `content/<id>/key.json`).
- В том же файле лежат «обёртки» K — K, зашифрованный ключом, выведенным из кода доступа
  (PBKDF2-SHA256, 200 000 итераций). Коды — в `content/codes.json`.
- Браузер получает K одним из двух способов и сохраняет его в `localStorage["mayak:keys"]`:
  1. игрок вводит код → `Access.redeemCode(code)` → `Vault.unlockWithCode` → K;
  2. **после оплаты сервер отдаёт K** (или персональный код) → `Access.handleReturn()`.
- Движок (`play.html#ep2`) берёт K через `Access.getKey("ep2")` и расшифровывает эпизод.

Витрина и движок знают только `Access.purchase(itemId)` и `Access.handleReturn()`.
Выбор платёжного сервиса — это настройка и серверный код.

## 2. Схема с сервером

```
Витрина (GitHub Pages)                  Ваш бэкенд (serverless)                 Платёжный сервис
──────────────────────                  ───────────────────────                 ────────────────
[Купить «Партнёры»]
  Access.purchase("ep2")
  POST /api/checkout ───────────────▶  создать заказ {orderId, item, price}
     {item:"ep2", returnUrl}             POST /payments (ЮKassa) ─────────────▶  платёж создан
                         ◀─────────────  {orderId, confirmationUrl}   ◀───────  confirmation_url
  location = confirmationUrl ─────────────────────────────────────────────────▶ страница оплаты
                                                                                 игрок платит
                                         POST /api/webhook  ◀──────────────────  payment.succeeded
                                         проверить подпись/статус через API,
                                         заказ → paid, сгенерировать выдачу
  ◀────────────────────────────────────────────────────────────────────────────  redirect returnUrl?order=…
  Access.handleReturn()
  GET /api/key?order=… ─────────────▶  заказ paid? → {status:"succeeded",
                         ◀─────────────    keys:{ep2:"<K>"}}  или {codes:["ABCD-…"]}
  сохранить K в mayak:keys → эпизод открыт
```

Цены сервер берёт **только из своего каталога**, никогда из запроса клиента.

### Настройка витрины

Перед `js/platform/access.js` на `index.html` и `play.html` добавьте:

```html
<script>
  window.MAYAK_PAYMENTS = {
    provider: "yookassa",                                  // "yookassa" | "cloudpayments" | "stripe" | "server"
    checkoutEndpoint: "https://pay.example.com/api/checkout",
    keyEndpoint: "https://pay.example.com/api/key"
  };
</script>
```

Все эти провайдеры на клиенте используют один адаптер `ServerProvider` (в `access.js`):
он делает `POST checkoutEndpoint`, перенаправляет на `confirmationUrl`, а после возврата
опрашивает `keyEndpoint` (до 6 попыток с паузой: вебхук может прийти позже редиректа).
Если для CloudPayments нужен виджет вместо редиректа, добавьте свой объект в
`Access.providers.cloudpayments` с методами `checkout(item)` и `claim(orderId)` — витрина
не изменится.

### Контракт API

`POST /api/checkout` — тело `{ item: "ep2" | "season-mayak", returnUrl, provider }` →
`{ orderId, confirmationUrl }`.

`GET /api/key?order=<orderId>` →
- `{ status: "pending" }` — платёж ещё не подтверждён;
- `{ status: "canceled" }`;
- `{ status: "succeeded", keys: { ep2: "<K b64>", … } }` — или `codes: ["…"]`, если вы
  выдаёте персональные коды (их тогда нужно заранее вшить в `quest.enc.json`, см. ниже).

`POST /api/webhook` — уведомление платёжного сервиса.

## 3. Пример serverless-функции (Node, ЮKassa)

Псевдокод на Node 20+ (Vercel / Netlify / Yandex Cloud Functions — любая платформа
с переменными окружения и небольшим хранилищем: KV, Redis, Postgres, YDB).

```js
// api/_shared.js
const CATALOG = {                       // цены — только здесь, не из запроса
  "ep2": { title: "Эпизод 2 «Партнёры»", price: 199, grants: ["ep2"] },
  "ep3": { title: "Эпизод 3 «Альбатрос»", price: 199, grants: ["ep3"] },
  "ep4": { title: "Эпизод 4 «Лоцман»", price: 249, grants: ["ep4"] },
  "season-mayak": { title: "Сезон «Маяк»", price: 449, grants: ["ep2", "ep3", "ep4"] }
};
// Ключи контента K из content/<id>/key.json — в секретах окружения, НЕ в репозитории.
const KEYS = JSON.parse(process.env.MAYAK_CONTENT_KEYS); // {"ep2":"…","ep3":"…","ep4":"…"}
const SHOP = process.env.YOOKASSA_SHOP_ID, SECRET = process.env.YOOKASSA_SECRET_KEY;
const auth = "Basic " + Buffer.from(`${SHOP}:${SECRET}`).toString("base64");
const ALLOWED_RETURN = /^https:\/\/kizzzil\.github\.io\/browse_game\//;

// api/checkout.js
export async function POST(req) {
  const { item, returnUrl } = await req.json();
  const product = CATALOG[item];
  if (!product || !ALLOWED_RETURN.test(returnUrl)) return Response.json({ error: "bad request" }, { status: 400 });
  const orderId = crypto.randomUUID();
  const r = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: { Authorization: auth, "Idempotence-Key": orderId, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { value: product.price.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: `${returnUrl}?order=${orderId}` },
      description: product.title,
      metadata: { orderId, item }
      // receipt: {...} — чек по 54-ФЗ, если вы его формируете через ЮKassa
    })
  });
  const payment = await r.json();
  await db.orders.insert({ orderId, item, paymentId: payment.id, status: "pending", createdAt: Date.now() });
  return Response.json({ orderId, confirmationUrl: payment.confirmation.confirmation_url });
}

// api/webhook.js — URL указывается в личном кабинете ЮKassa
export async function POST(req) {
  const event = await req.json();
  // Телу вебхука не доверяем: перепроверяем платёж запросом к API (и/или фильтруем по IP ЮKassa).
  const r = await fetch(`https://api.yookassa.ru/v3/payments/${event.object.id}`, { headers: { Authorization: auth } });
  const payment = await r.json();
  const order = await db.orders.get(payment.metadata.orderId);
  if (order && payment.status === "succeeded" && payment.paid
      && Number(payment.amount.value) === CATALOG[order.item].price) {
    await db.orders.update(order.orderId, { status: "paid", paidAt: Date.now() });
  }
  if (order && payment.status === "canceled") await db.orders.update(order.orderId, { status: "canceled" });
  return new Response("ok");
}

// api/key.js
export async function GET(req) {
  const orderId = new URL(req.url).searchParams.get("order");
  const order = orderId && await db.orders.get(orderId);
  if (!order) return Response.json({ status: "canceled" }, { status: 404 });
  if (order.status !== "paid") return Response.json({ status: order.status });
  const keys = Object.fromEntries(CATALOG[order.item].grants.map((id) => [id, KEYS[id]]));
  return Response.json({ status: "succeeded", keys });
}
```

Не забудьте CORS: разрешите `Origin: https://kizzzil.github.io` для `/api/checkout` и `/api/key`.

Stripe — то же самое через Checkout Session (`success_url` с `?order=…`, вебхук
`checkout.session.completed`). CloudPayments — виджет на клиенте или ссылка на оплату,
вебхук `Pay`, проверка HMAC-подписи заголовка `Content-HMAC`.

## 4. Что хранить на сервере

| Что | Где | Зачем |
|---|---|---|
| Ключи контента K эпизодов (`content/<id>/key.json`) | секреты окружения | выдача K после оплаты |
| Секретные ключи платёжного сервиса | секреты окружения | создание и проверка платежей |
| Заказы: `orderId`, позиция, сумма, `paymentId`, статус, даты | БД / KV | идемпотентность, повторная выдача, возвраты |
| (опционально) e-mail покупателя | БД | восстановление доступа на другом устройстве: письмо с персональным кодом |

Персональные коды вместо K: сгенерируйте пул кодов заранее, добавьте их в
`content/codes.json` (в `"ep2"` или `"season"`), пересоберите (`node tools/build.js`) — их
обёртки попадут в `quest.enc.json`. Сервер после оплаты выдаёт следующий свободный код
и помечает его использованным. Плюс: код можно отправить письмом и ввести на любом устройстве.
Минус: пул конечен, и для новых кодов нужна пересборка и деплой.

Смена ключа K (удаление `content/<id>/key.json`) делает недействительными ключи у всех
купивших — так делать не надо. Чтобы отозвать утёкший код, удалите его из `codes.json`
и пересоберите: K остаётся прежним, у честных игроков всё работает.

## 5. Почему без шифрования клиентская проверка ничего не защищает

На статическом хостинге всё, что получает браузер, может прочитать любой: «если
`hasAccess`, показать эпизод» обходится одной строкой в консоли, а файл эпизода
скачивается напрямую. Поэтому платный эпизод **зашифрован**, и без K (или кода) его
содержимое — бессмысленный набор байтов. Хэши ответов внутри — защита от подглядывания,
а не от перебора: короткие ответы подбираются, поэтому они спрятаны внутри шифрования.

Чего шифрование не даёт: купивший может поделиться кодом или K. Это общая
проблема цифрового контента; смягчается персональными кодами и мягкими лимитами
на сервере (например, выдача K по одному заказу не чаще N раз).

## 6. Важное ограничение: исходники в публичном репозитории

В `content/` лежат исходники квестов **с ответами открытым текстом**, `key.json` с ключами
и `codes.json` с кодами. Пока репозиторий публичный, любой может прочитать платные
эпизоды прямо на GitHub — шифрование в `dist/` тогда ничего не защищает.

Перед началом продаж:
1. вынесите `content/` в **приватный** репозиторий (или сделайте приватным этот и
   публикуйте только `dist/` в отдельный публичный репозиторий / ветку `gh-pages`);
2. смените ключи: удалите `content/*/key.json`, пересоберите — старые ключи из публичной
   истории git станут бесполезны (ранние тестовые ключи у игроков перестанут работать —
   движок попросит ввести код заново);
3. уберите `MAYAK-DEMO-2026` из `content/codes.json` и пересоберите;
4. передайте новые K в секреты сервера оплаты.

`tools/build.js` умеет работать без исходника: если `content/<id>/quest.js` нет, а
собранный `quests/<id>/quest.enc.json` есть, он публикуется как есть.

## 7. Юридический минимум (РФ)

Продажа цифрового контента физлицам требует фискального чека (54-ФЗ): ЮKassa и
CloudPayments умеют формировать его сами («Чеки от ЮKassa» / CloudKassir). Нужны
публичная оферта, политика конфиденциальности и контакты продавца на витрине.
