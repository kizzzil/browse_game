/*
 * «Лента», эпизод 2 «Партнёры» (октябрь 2026).
 * Новые профили: t.krylova.buh (бухгалтер однодневок), gleb.ortov (яхтенный брокер).
 * Новые посты старых героев видны только с эпизода 2.
 *
 * Механика главы 2: строка Base64 в описании профиля Крыловой.
 * Расшифровка (UTF-8): «Дальше - фирма-близнец: тот же адрес, тот же день. Подпись - яхтсмен.»
 * Отвлекающая строка в посте про кружку: «RGViZXQgPSBLcmVkaXQ=» → «Debet = Kredit».
 */
(function () {
  var B64 = [
    "0JTQsNC70YzRiNC1IC0g0YTQuNGA0LzQ",
    "sC3QsdC70LjQt9C90LXRhjog0YLQvtGC",
    "INC20LUg0LDQtNGA0LXRgSwg0YLQvtGC",
    "INC20LUg0LTQtdC90YwuINCf0L7QtNC/",
    "0LjRgdGMIC0g0Y/RhdGC0YHQvNC10L0u"
  ].join("\n");

  World.profile("t.krylova.buh", {
    name: "Татьяна Крылова | бухгалтер",
    avatar: "ТК",
    color: "#6a994e",
    bio: "Бухучёт для ООО и ИП под ключ 📊\nЮрадрес, отчётность, «нулёвки».\nДля своих 🔐\n" + B64,
    followers: 388,
    following: 152,
    episode: 2
  });

  World.posts("t.krylova.buh", 2, [
    { date: "9 октября",
      scene: { bg: "linear-gradient(135deg,#ced4da,#6c757d)", emoji: "📦", text: "ПАУЗА" },
      caption: "Закрываю пару проектов и беру паузу. Клиентам — всё по почте, документы у курьера.",
      comments: [["marina.buh.spb", "Танюш, куда пропадаешь?"], ["t.krylova.buh", "Отдыхать. Заслужила."]] },
    { date: "18 сентября",
      scene: { bg: "radial-gradient(circle at 50% 45%,#fefae0,#dda15e)", emoji: "☕" },
      caption: "Подарили кружку с моим девизом. Кто расшифрует — тот свой 😄 RGViZXQgPSBLcmVkaXQ=",
      comments: [["marina.buh.spb", "Это что, пароль от вайфая? 😂"], ["t.krylova.buh", "Это философия 😌"]] },
    { date: "3 июня",
      scene: { bg: "linear-gradient(160deg,#386641,#a7c957)", emoji: "🗂", text: "+2" },
      caption: "Две регистрации за один день, обе на нашем адресе. Рекорд сезона 💪",
      comments: [["marina.buh.spb", "Конвейер 😅"], ["t.krylova.buh", "Бизнес не ждёт."]] },
    { date: "15 апреля",
      scene: { bg: "linear-gradient(135deg,#e9ecef,#adb5bd)", emoji: "📊" },
      caption: "Сдала квартал за 14 клиентов. Кофе внутривенно.",
      comments: [] }
  ]);

  World.profile("gleb.ortov", {
    name: "Глеб Ортов",
    avatar: "ГО",
    color: "#0d1b2a",
    bio: "Яхтенный брокер. Балтика — моя территория ⚓\nПокупка · продажа · фрахт\nПишу редко, хожу быстро.",
    link: { label: "ortov-yachts · сайт агентства", url: "../ortov-yachts/index.html" },
    followers: 3120,
    following: 97,
    episode: 2
  });

  World.posts("gleb.ortov", 2, [
    { date: "6 октября",
      scene: { bg: "#1b1b2b", image: "../media/ep2/yacht.jpg", imageAlt: "Парусная яхта на закате в заливе" },
      caption: "Белая, как совесть клиента. Скоро в большое плавание 😎",
      comments: [["t.krylova.buh", "Возьмёшь с собой? 😏"], ["gleb.ortov", "Танюш, ты и так в доле 😉"]] },
    { date: "16 августа",
      scene: { bg: "radial-gradient(circle at 40% 40%,#3a5a40,#0d1b2a)", emoji: "🍾" },
      caption: "Закрыл сделку квартала. Люблю клиентов, которые не задают вопросов.",
      comments: [["sea.wolf.kron", "Красава, Глеб!"]] },
    { date: "1 июля",
      scene: { bg: "linear-gradient(180deg,#a9c6de,#3c6e91)", emoji: "⚓", text: "ПРИЧАЛ 6" },
      caption: "Кронштадт. Офис с видом, который не продаётся.",
      comments: [] },
    { date: "3 июня",
      scene: { bg: "linear-gradient(135deg,#f5f0e6,#b08d57)", emoji: "✍️" },
      caption: "Подписал бумаги ещё по одной компании. Скучная сторона яхтенного бизнеса 🙄",
      comments: [["sea.wolf.kron", "Растёшь!"]] }
  ]);

  // Старые герои, октябрь
  World.posts("k.lebedev.arch", 2, [
    { date: "8 октября",
      scene: { bg: "linear-gradient(135deg,#1d3557,#457b9d)", emoji: "📐", text: "ЭЛЛИНГ" },
      caption: "Эскизы эллинга для частного клиента. Залив, сосны, тишина. Иногда заказчики становятся друзьями.",
      comments: [["gleb.ortov", "⚓🔥"]] }
  ]);

  World.posts("mark.velsky", 2, [
    { date: "5 октября",
      scene: { bg: "#111", emoji: "", text: "ДЕНЬГИ НЕ ИСЧЕЗАЮТ" },
      caption: "Аня дома. Вера молчит. 4,2 миллиона не испаряются — они переезжают. Продолжаю.",
      comments: [["anna.velskaya", "Я с тобой."], ["k.lebedev.arch", "Марк, может, оставишь это следствию?"]] }
  ]);

  World.posts("anna.velskaya", 2, [
    { date: "2 октября",
      scene: { bg: "linear-gradient(180deg,#22223b,#4a4e69)", emoji: "🌊", text: "ДОМА" },
      caption: "Спасибо всем, кто искал. Я жива и злая. Аудит не закончен.",
      comments: [["mark.velsky", "❤️"]] }
  ]);
})();
