/*
 * Демо-профили персонажей. Это заглушки, чтобы игру можно было пройти сразу.
 * Для «настоящей» версии заведите аккаунты персонажей в соцсети, выложите туда
 * такие же посты (см. AUTHOR_GUIDE.md) и поменяйте ссылки в js/case.js.
 *
 * scene — как нарисовать «фотографию»: фон, эмодзи и необязательный объект
 * (receipt — чек, scarf — шарф, text — надпись).
 */
window.PROFILES = {
  "k.lebedev.arch": {
    name: "Кирилл Лебедев",
    avatar: "КЛ", color: "#3d5a80",
    bio: "Архитектор. Строю то, что переживёт нас.\nЧлен правления фонда «Маяк» 🏛",
    followers: 1284, following: 311,
    posts: [
      { date: "12 сентября", scene: { bg: "linear-gradient(135deg,#1d3557,#457b9d)", emoji: "📐", text: "23:10" },
        caption: "Весь вечер дома за чертежами. Дедлайн никто не отменял 🔥",
        comments: [["vera.somova", "Не засиживайся 😉"], ["arch_daily_spb", "Ждём проект!"]] },
      { date: "7 сентября", scene: { bg: "linear-gradient(160deg,#a8dadc,#f1faee)", emoji: "🏛" },
        caption: "Новый корпус для фонда «Маяк». Скоро откроем двери.",
        comments: [["anna.velskaya", "Красиво. Надеюсь, смета сойдётся 🙂"]] },
      { date: "29 августа", scene: { bg: "linear-gradient(180deg,#6c9bcf,#1d3557)", emoji: "⛵" },
        caption: "Залив. Тишина. Перезагрузка.", comments: [] },
      { date: "15 августа", scene: { bg: "linear-gradient(135deg,#3a2e2a,#7a5c47)", emoji: "☕" },
        caption: "Утро начинается не с кофе, а с макета.", comments: [] }
    ]
  },

  "vera.somova": {
    name: "Вера Сомова",
    avatar: "ВС", color: "#9d0208",
    bio: "Финансы, вино и север.\nФин. директор фонда «Маяк»",
    link: { label: "mayak-fund · сайт фонда", url: "../fund/index.html" },
    followers: 2731, following: 489,
    posts: [
      { date: "1 октября", scene: { bg: "linear-gradient(180deg,#bde0fe,#ffffff)", emoji: "✈️" },
        caption: "Скоро в отпуск. Давно пора.", comments: [["k.lebedev.arch", "Надолго?"]] },
      { date: "12 сентября", scene: { bg: "radial-gradient(circle at 35% 40%,#5b3a29,#2b1a12)", emoji: "🍰", receipt: {
          title: "СЕВЕРНЫЙ ВЕТЕР", sub: "ресторан · Приморская наб., 7",
          meta: ["12.09.2026  22:58", "Стол 12   Гостей: 2"],
          items: [["Тирамису", "540"], ["Капучино ×2", "560"], ["Вино бел. 150 ×2", "1 300"]],
          total: "2 400", pay: "КАРТА •••• 4417" } },
        caption: "Лучший тирамису в городе. Иногда надо праздновать 🤍",
        comments: [
          ["k.lebedev.arch", "Праздновать что? 🤨"],
          ["lina.serves", "Вы тогда так спешили 🙈 Заберите, пожалуйста, свою вещь, мы выложили фото у меня в профиле"],
          ["vera.somova", "@lina.serves вы ошиблись"]
        ] },
      { date: "3 сентября", scene: { bg: "linear-gradient(135deg,#d00000,#6a040f)", emoji: "🧣" },
        caption: "Новый любимый аксессуар. Именной ❤️", comments: [["mark.velsky", "Тебе идёт красный"]] },
      { date: "20 августа", scene: { bg: "linear-gradient(135deg,#e9ecef,#adb5bd)", emoji: "📊" },
        caption: "Квартальный отчёт сдан. Всё сходится. Всегда.", comments: [["anna.velskaya", "Посмотрим 😉"]] }
    ]
  },

  "mark.velsky": {
    name: "Марк Вельский",
    avatar: "МВ", color: "#2d6a4f",
    bio: "Журналист. Пишу о том, о чём молчат.\nЕсли вы видели мою сестру — напишите мне.",
    followers: 5402, following: 820,
    posts: [
      { date: "13 сентября", scene: { bg: "#111", text: "АНЯ, ГДЕ ТЫ?", emoji: "" },
        caption: "Моя сестра Анна Вельская не выходит на связь с вечера 12 сентября. Если что-то знаете — пишите.",
        comments: [["k.lebedev.arch", "Марк, держись. Всё, что нужно."], ["vera.somova", "Найдётся. Обязательно."]] },
      { date: "12 сентября", scene: { bg: "radial-gradient(circle at 60% 40%,#7f5539,#3b2416)", emoji: "🍔", receipt: {
          title: "ПРИЧАЛ", sub: "бургерная · Портовая ул., 3",
          meta: ["12.09.2026  21:10", "Стол 4   Гостей: 1"],
          items: [["Бургер «Шторм»", "690"], ["Картофель", "250"], ["Лимонад", "310"]],
          total: "1 250", pay: "КАРТА •••• 4471" } },
        caption: "Ужин в одиночестве после сдачи статьи. Аня так и не пришла.",
        comments: [["anna.velskaya", "Прости, аудит. Завтра всё расскажу."]] },
      { date: "2 сентября", scene: { bg: "linear-gradient(135deg,#40916c,#1b4332)", emoji: "⌨️" },
        caption: "Новое расследование. Пока без деталей.", comments: [] }
    ]
  },

  "lina.serves": {
    name: "Лина | официантка",
    avatar: "Л", color: "#e76f51",
    bio: "Работаю в ресторане «Северный ветер». Кофе, смены, люди.",
    followers: 214, following: 390,
    posts: [
      { date: "13 сентября", scene: { bg: "linear-gradient(135deg,#3c2a21,#1a120b)", emoji: "", scarf: "В.С." },
        caption: "После вечерней смены 12.09 нашли за 12-м столом красный шарф с вышивкой. Гостья очень торопилась. Хозяйка, отзовитесь, лежит у администратора!",
        comments: [
          ["lina.serves", "Её спутница была в бежевом плаще и почти не говорила. Они ушли около 23:05."],
          ["mark.velsky", "Лина, напишите мне, пожалуйста. Это очень важно."]
        ] },
      { date: "30 августа", scene: { bg: "linear-gradient(135deg,#f4a261,#e76f51)", emoji: "☕" },
        caption: "Латте-арт номер 47. Почти сердечко.", comments: [] }
    ]
  },

  "anna.velskaya": {
    name: "Анна Вельская",
    avatar: "АВ", color: "#6d597a",
    bio: "Аудитор. Цифры не врут — врут люди.",
    followers: 640, following: 201,
    posts: [
      { date: "11 сентября", scene: { bg: "linear-gradient(180deg,#22223b,#4a4e69)", emoji: "🌊", text: "СЕВЕРНАЯ КОСА" },
        caption: "Иногда, чтобы увидеть всю картину, надо отойти подальше. Завтра важный разговор.",
        comments: [["mark.velsky", "Расскажешь?"], ["anna.velskaya", "После. Обещаю."]] }
    ]
  }
};
