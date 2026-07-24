(function () {
  const STORAGE_KEYS = {
    leads: "web00_pro_leads",
    bugs: "web00_pro_bug_reports",
    supportMessages: "web00_pro_support_messages",
    leadSeq: "web00_pro_lead_seq",
    bugSeq: "web00_pro_bug_seq",
    supportSeq: "web00_pro_support_seq",
  };

  const CONTACTS = {
    telegram: {
      label: "Telegram",
      value: "GarantiyWeb00bot",
      href: "https://t.me/GarantiyWeb00bot",
      placeholder: false,
    },
    max: {
      label: "MAX",
      value: "WEB00 в MAX",
      href: "https://max.ru/u/f9LHodD0cOKyonoj-aP5RBGWocesp86479bRtc3lkiQ0qzWtqtXIEiV2tVs",
      placeholder: false,
    },
    vk: {
      label: "VK",
      value: "club231397496",
      href: "https://vk.com/club231397496/",
      placeholder: false,
    },
    phone: {
      label: "Телефон",
      value: "+7 (905) 861-52-31",
      href: "tel:+79058615231",
      placeholder: false,
    },
    email: {
      label: "E-mail",
      value: "email уточняется",
      href: "#",
      placeholder: true,
    },
  };

  const SOLUTIONS = [
    {
      id: "site-custom",
      legacyTitle: "Сайт под заказ",
      title: "Сайт под заказ",
      editableTitle: true,
      category: "Индивидуально",
      description: "Индивидуальный сайт под задачу клиента: структура, дизайн, формы заявок и подготовка к запуску.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "по оценке задачи",
      features: ["Индивидуальная структура", "Адаптив", "Форма заявки", "Подбор решения"],
      previewImage: "assets/img/previews/site-custom-home.png",
      previewType: "individual",
      filter: "individual",
      demoMode: "none",
      demoLocalUrl: null,
      externalDemoUrl: null,
      originalDemoUrl: null,
      demoUrl: "",
      active: true,
    },
    {
      id: "mebel",
      legacyTitle: "Мебельный магазин",
      title: "Мебельный магазин",
      editableTitle: true,
      category: "Товары",
      description: "Витрина мебельного магазина с категориями, карточками товаров, условиями доставки и заявкой на расчёт.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Каталог товаров", "Категории", "Карточки товаров", "Заявка на расчёт"],
      previewImage: "assets/img/previews/mebel-home.png",
      previewType: "goods",
      filter: "goods",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/MEBELPlanet/",
      originalDemoUrl: "https://prudexxx.github.io/MEBELPlanet/",
      demoUrl: "https://prudexxx.github.io/MEBELPlanet/",
      active: true,
    },
    {
      id: "odezhda",
      legacyTitle: "Магазин одежды",
      title: "Магазин одежды",
      editableTitle: true,
      category: "Товары",
      description: "Мини-магазин для одежды, шоурума или локального бренда с коллекциями и быстрым заказом.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Коллекции", "Карточки товаров", "Размеры", "Заказ через форму"],
      previewImage: "assets/img/previews/odezhda-home.png",
      previewType: "goods",
      filter: "goods",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/OdegdaPlanet/",
      originalDemoUrl: "https://prudexxx.github.io/OdegdaPlanet/",
      demoUrl: "https://prudexxx.github.io/OdegdaPlanet/",
      active: true,
    },
    {
      id: "doma-bani",
      legacyTitle: "Дома, бани из сруба",
      title: "Дома, бани из сруба",
      editableTitle: true,
      category: "Строительство",
      description: "Сайт для строительной компании с проектами домов и бань, преимуществами и заявкой на расчёт.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Каталог проектов", "Карточки объектов", "Портфолио", "Заявка на расчёт"],
      previewImage: "assets/img/previews/doma-bani-home.png",
      previewType: "construction",
      filter: "construction",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/DomaBani/",
      originalDemoUrl: "https://prudexxx.github.io/DomaBani/",
      demoUrl: "https://prudexxx.github.io/DomaBani/",
      active: true,
    },
    {
      id: "medicina",
      legacyTitle: "Медицина услуги",
      title: "Медицина услуги",
      editableTitle: true,
      category: "Медицина",
      description: "Сайт медицинской услуги с описанием направлений, доверием, записью и контактами.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Описание услуг", "Блок доверия", "Запись", "Контакты"],
      previewImage: "assets/img/previews/medicina-home.png",
      previewType: "medicine",
      filter: "medicine",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/MedizinaPlanet/",
      originalDemoUrl: "https://prudexxx.github.io/MedizinaPlanet/",
      demoUrl: "https://prudexxx.github.io/MedizinaPlanet/",
      active: true,
    },
    {
      id: "narko-medicine",
      legacyTitle: "Наркологическая медицина",
      title: "Наркологическая медицина",
      editableTitle: true,
      category: "Медицина",
      description: "Медицинский лендинг для консультаций, записи и аккуратной подачи услуг клиники.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Услуги клиники", "Преимущества", "Запись", "Контакты"],
      previewImage: "assets/img/previews/narko-home.png",
      previewType: "medicine",
      filter: "medicine",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/NarkoKlinika/",
      originalDemoUrl: "https://prudexxx.github.io/NarkoKlinika/",
      demoUrl: "https://prudexxx.github.io/NarkoKlinika/",
      active: true,
    },
    {
      id: "uslugi",
      legacyTitle: "Услуга муж на час",
      title: "Услуга муж на час",
      editableTitle: true,
      category: "Услуги",
      description: "Сайт для мастера или небольшой команды: список работ, преимущества, цены и заявка.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 2 дней",
      features: ["Список работ", "Преимущества", "Цены", "Форма заявки"],
      previewImage: "assets/img/previews/mug-na-chas-home.png",
      previewType: "services",
      filter: "services",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/MugNaChas/",
      originalDemoUrl: "https://prudexxx.github.io/MugNaChas/",
      demoUrl: "https://prudexxx.github.io/MugNaChas/",
      active: true,
    },
    {
      id: "cleaning",
      legacyTitle: "Услуга клининга",
      title: "Услуга клининга",
      editableTitle: true,
      category: "Услуги",
      description: "Лендинг клининга с пакетами уборки, преимуществами, расчётом и заявкой.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Виды уборки", "Пакеты услуг", "Форма расчёта", "Telegram-уведомления"],
      previewImage: "assets/img/previews/cleaning-home.png",
      previewType: "services",
      filter: "services",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/Klining/",
      originalDemoUrl: "https://prudexxx.github.io/Klining/",
      demoUrl: "https://prudexxx.github.io/Klining/",
      active: true,
    },
    {
      id: "advokat",
      legacyTitle: "Услуга адвоката",
      title: "Услуга адвоката",
      editableTitle: true,
      category: "Услуги",
      description: "Юридический сайт для консультаций, услуг адвоката, преимуществ и заявки на связь.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Юридические услуги", "Преимущества", "Форма консультации", "Контакты"],
      previewImage: "assets/img/previews/advokat-home.png",
      previewType: "services",
      filter: "services",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/Advokat/",
      originalDemoUrl: "https://prudexxx.github.io/Advokat/",
      demoUrl: "https://prudexxx.github.io/Advokat/",
      active: true,
    },
    {
      id: "krovlya",
      legacyTitle: "Услуга кровли",
      title: "Услуга кровли",
      editableTitle: true,
      category: "Строительство",
      description: "Сайт для кровельной бригады или компании: услуги, этапы, гарантии и заявка на замер.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Виды работ", "Портфолио", "Расчёт работ", "Заявка на замер"],
      previewImage: "assets/img/previews/krovlya-home.png",
      previewType: "construction",
      filter: "construction",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/Krovla/",
      originalDemoUrl: "https://prudexxx.github.io/Krovla/",
      demoUrl: "https://prudexxx.github.io/Krovla/",
      active: true,
    },
    {
      id: "digital-projects",
      legacyTitle: "Цифровые проекты",
      title: "Цифровые проекты",
      editableTitle: true,
      category: "Индивидуально",
      description: "Сайт для цифровых услуг, проектной деятельности, портфолио и сбора заявок.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Оффер", "Проекты", "Портфолио", "Заявка"],
      previewImage: "assets/img/previews/digital-projects-home.png",
      previewType: "individual",
      filter: "individual",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/ProektyPlanet/",
      originalDemoUrl: "https://prudexxx.github.io/ProektyPlanet/",
      demoUrl: "https://prudexxx.github.io/ProektyPlanet/",
      active: true,
    },
    {
      id: "ruberoid-roof",
      legacyTitle: "Услуга кровли рубероида",
      title: "Услуга кровли рубероида",
      editableTitle: true,
      category: "Строительство",
      description: "Узкий лендинг под кровлю рубероидом с описанием материалов, расчётом и заявкой.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Услуги", "Материалы", "Расчёт", "Заявка"],
      previewImage: "assets/img/previews/ruberoid-home.png",
      previewType: "construction",
      filter: "construction",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/Ruberoid/",
      originalDemoUrl: "https://prudexxx.github.io/Ruberoid/",
      demoUrl: "https://prudexxx.github.io/Ruberoid/",
      active: true,
    },
    {
      id: "rental-house",
      legacyTitle: "Дом под сдачу",
      title: "Дом под сдачу",
      editableTitle: true,
      category: "Недвижимость",
      description: "Сайт для сдачи дома: описание объекта, условия, галерея и заявка на бронирование.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Описание объекта", "Условия", "Галерея", "Заявка"],
      previewImage: "assets/img/previews/dom-arenda-home.png",
      previewType: "realty",
      filter: "realty",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/Dom/",
      originalDemoUrl: "https://prudexxx.github.io/Dom/",
      demoUrl: "https://prudexxx.github.io/Dom/",
      active: true,
    },
    {
      id: "massage",
      legacyTitle: "Массаж",
      title: "Массаж",
      editableTitle: true,
      category: "Услуги",
      description: "Сайт для специалиста или салона с услугами массажа, записью, акциями и отзывами.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 2 дней",
      features: ["Услуги и цены", "Онлайн-запись", "Отзывы", "Блок доверия"],
      previewImage: "assets/img/previews/massage-home.png",
      previewType: "services",
      filter: "services",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://prudexxx.github.io/m/",
      originalDemoUrl: "https://prudexxx.github.io/m/",
      demoUrl: "https://prudexxx.github.io/m/",
      active: true,
    },
    {
      id: "drova",
      legacyTitle: "Доставка и продажа дров",
      title: "Доставка и продажа дров",
      editableTitle: true,
      category: "Доставка",
      description: "Сайт для локальной продажи и доставки дров с ассортиментом, условиями и быстрым заказом.",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 2 дней",
      features: ["Ассортимент", "Зоны доставки", "Прайс", "Быстрый заказ"],
      previewImage: "assets/img/previews/drova-home.png",
      previewType: "delivery",
      filter: "delivery",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://www.xn--80adfgo7anlsu.xn--p1ai/",
      originalDemoUrl: "https://www.xn--80adfgo7anlsu.xn--p1ai/",
      demoUrl: "https://www.xn--80adfgo7anlsu.xn--p1ai/",
      active: true,
    },
  ];

  const SOLUTION_GALLERIES = {
    "site-custom": ["site-custom-01", "site-custom-02", "site-custom-03", "site-custom-04"],
    mebel: ["mebel-01", "mebel-02", "mebel-03", "mebel-04"],
    odezhda: ["odezhda-01", "odezhda-02", "odezhda-03", "odezhda-04"],
    "doma-bani": ["doma-bani-01", "doma-bani-02", "doma-bani-03", "doma-bani-04"],
    medicina: ["medicina-01", "medicina-02", "medicina-03", "medicina-04"],
    "narko-medicine": ["narko-medicine-01", "narko-medicine-02", "narko-medicine-03", "narko-medicine-04"],
    uslugi: ["uslugi-01", "uslugi-02", "uslugi-03", "uslugi-04"],
    cleaning: ["cleaning-01", "cleaning-02", "cleaning-03", "cleaning-04"],
    advokat: ["advokat-01", "advokat-02", "advokat-03", "advokat-04"],
    krovlya: ["krovlya-01", "krovlya-02", "krovlya-03", "krovlya-04"],
    "digital-projects": ["digital-projects-01", "digital-projects-02", "digital-projects-03", "digital-projects-04"],
    "ruberoid-roof": ["ruberoid-roof-01", "ruberoid-roof-02", "ruberoid-roof-03", "ruberoid-roof-04"],
    "rental-house": ["rental-house-01", "rental-house-02", "rental-house-03", "rental-house-04"],
    massage: ["massage-01", "massage-02", "massage-03", "massage-04"],
    drova: ["drova-01", "drova-02", "drova-03", "drova-04"],
  };

  SOLUTIONS.forEach((solution) => {
    const gallery = SOLUTION_GALLERIES[solution.id];
    solution.galleryImages = gallery
      ? gallery.map((name) => `assets/img/solution-gallery/${name}.png`)
      : [solution.previewImage].filter(Boolean);
  });

  const SERVICES = [
    { id: "ready", title: "Готовый сайт с адаптацией", text: "Быстрый старт на базе готового решения: смотрите демо, выбираете формат и адаптируете его под свой бизнес.", icon: "▣", type: "Готовый сайт с адаптацией" },
    { id: "site", title: "Сайт под заказ", text: "Индивидуальный сайт под структуру, нишу и цели бизнеса, если готовых решений недостаточно.", icon: "</>", type: "Сайт под заказ" },
    { id: "leads", title: "Сайт с заявками", text: "Формы, заявки, Telegram, MAX, таблица и уведомления, чтобы обращения клиентов не терялись.", icon: "→", type: "Сайт с заявками" },
    { id: "redesign", title: "Доработка сайта", text: "Улучшим структуру, дизайн, формы, адаптив, тексты и сценарии заявок на существующем сайте.", icon: "✎", type: "Доработка сайта" },
    { id: "bot", title: "Telegram-боты и автоматизация", text: "Боты, сценарии, уведомления и обработка обращений для задач, где нужно меньше ручной работы.", icon: "⌁", type: "Telegram-боты и автоматизация" },
    { id: "support", title: "Поддержка после запуска", text: "Правки, обновления, развитие сайта и помощь после публикации.", icon: "☏", type: "Поддержка после запуска" },
  ];

  const PRICING = [
    { title: "Start", price: "от 39 000 ₽", note: "Быстрый старт для малого бизнеса и экспертов.", tag: "Быстрый запуск", features: ["Готовый сайт", "Базовая настройка и контент", "Адаптивная версия", "Форма заявки", "Готов к продвижению", "Запуск от 48 часов"] },
    { title: "Business", price: "от 69 000 ₽", note: "Расширенные возможности для роста и конверсии.", tag: "Рекомендуем", features: ["Всё из тарифа Start", "Индивидуальная настройка", "До 20 страниц", "Интеграции и аналитика", "CMS для управления сайтом", "Поддержка после запуска"] },
    { title: "Pro", price: "от 99 000 ₽", note: "Максимум возможностей и персональный подход.", tag: "Максимум", features: ["Всё из тарифа Business", "Персональная структура", "Расширенные интеграции", "Приоритетная поддержка", "Персональный менеджер", "Подготовка к масштабированию"] },
  ];

  const FAQ_ITEMS = [
    { category: "price", question: "Сколько стоит сайт?", answer: "Основные тарифы: Start от 39 000 ₽, Business от 69 000 ₽, Pro от 99 000 ₽. Итог фиксируется после уточнения задачи и выбранного формата запуска." },
    { category: "price", question: "Почему цена указана “от”?", answer: "Потому что итог зависит от объёма: количества страниц, структуры, карточек товаров, форм заявки, интеграций, правок и сроков запуска." },
    { category: "price", question: "Можно ли начать без предоплаты?", answer: "Да. Для готовых решений можно сначала посмотреть демо, обсудить задачу и согласовать условия. Мы не просим платить вслепую за непонятный результат." },
    { category: "price", question: "Есть ли скрытые платежи?", answer: "Нет. Перед началом работы фиксируем, что входит в задачу, срок и ориентировочную стоимость. Дополнительные пожелания обсуждаются отдельно." },
    { category: "demo", question: "Что такое готовый сайт?", answer: "Это готовый сайт под конкретную нишу. Его можно посмотреть, выбрать и адаптировать под ваш бизнес: контакты, тексты, товары, услуги и заявки." },
    { category: "demo", question: "Можно ли посмотреть сайт до заказа?", answer: "Да. В разделе “Готовые решения” можно открыть демо и оценить структуру, визуальный уровень и сценарий заявки до обращения." },
    { category: "demo", question: "Демо — это мой будущий сайт один в один?", answer: "Нет. Демо показывает направление и структуру. Ваш сайт адаптируется под ваш бизнес, контакты, услуги, тексты и задачи." },
    { category: "launch", question: "Что происходит после заявки?", answer: "Мы смотрим выбранное решение или описание задачи, уточняем детали и предлагаем следующий шаг: готовый сайт, сайт под заказ, доработку или автоматизацию заявок." },
    { category: "launch", question: "Я не знаю, какой сайт мне нужен. Что делать?", answer: "Оставьте заявку или напишите в Telegram. Мы поможем выбрать формат: готовое решение, сайт под заказ, доработку или автоматизацию." },
    { category: "launch", question: "Сколько времени занимает запуск?", answer: "Готовые решения можно адаптировать быстрее, обычно от 2 дней. Индивидуальные проекты зависят от объёма и согласуются отдельно." },
    { category: "launch", question: "Что нужно от меня для старта?", answer: "Достаточно выбрать пример сайта или описать задачу, оставить контакт и ответить на несколько уточняющих вопросов. Логотип, фото, тексты и ссылки ускоряют работу." },
    { category: "support", question: "Что если мне нужно что-то поправить?", answer: "Правки обсуждаются после просмотра демо или результата. Можно менять блоки, тексты, контакты, изображения, форму и порядок разделов." },
    { category: "support", question: "Можно ли доработать сайт после запуска?", answer: "Да. После запуска можно добавлять блоки, менять тексты, обновлять карточки, подключать заявки и развивать сайт дальше." },
    { category: "support", question: "Есть ли поддержка после запуска?", answer: "Да. Можно подключить поддержку: мелкие правки, обновления, помощь с заявками и сопровождение сайта." },
    { category: "leads", question: "Куда будут приходить заявки с сайта?", answer: "Способ передачи заявок согласуется под проект. Можно подготовить отправку в Telegram, MAX, таблицу или другой удобный канал при подключении обработчика заявок." },
    { category: "leads", question: "Можно ли подключить Telegram или таблицу?", answer: "Да. Можно сделать форму, после которой данные заявки будут уходить в выбранный канал. Конкретная схема зависит от задачи и этапа запуска." },
    { category: "docs", question: "Нужна ли политика конфиденциальности?", answer: "Да. Если сайт собирает контакты клиентов, нужны политика конфиденциальности и согласие на обработку персональных данных." },
    { category: "docs", question: "Где будет размещён сайт?", answer: "Вариант размещения выбирается перед запуском: статический хостинг, ваш домен или другой подходящий вариант. Мы поможем подобрать удобную схему." },
  ];

  const LEAD_STATUSES = {
    new: {
      label: "Анкета получена",
      badge: "blue",
      title: "Анкета получена",
      intro: "Спасибо! Мы получили данные проекта и проверяем, что нужно для запуска сайта.",
      progress: 1,
      update: "Анкета получена и сохранена.",
      action: "Проверить данные проекта",
      clientAction: "Мы проверим данные и сообщим, если нужны уточнения.",
    },
    in_progress: {
      label: "Сайт настраивается",
      badge: "blue",
      title: "Сайт настраивается",
      intro: "Команда готовит структуру, контент и настройки под ваш бизнес.",
      progress: 4,
      update: "Структура и сборка сайта в работе.",
      action: "Посмотреть прогресс",
      clientAction: "Можно написать менеджеру, если появились новые вводные.",
    },
    clarification_needed: {
      label: "Проверяем материалы",
      badge: "gold",
      title: "Проверяем материалы",
      intro: "Мы смотрим данные проекта и отмечаем, чего может не хватать для запуска.",
      progress: 2,
      update: "Проверяем материалы, пожелания и ответы по структуре.",
      action: "Уточнить материалы",
      clientAction: "Если понадобятся детали, мы напишем в выбранный канал связи.",
    },
    proposal_ready: {
      label: "Ожидает согласования",
      badge: "violet",
      title: "Ожидает согласования",
      intro: "Мы подготовили план запуска и ждём подтверждения деталей.",
      progress: 5,
      update: "План запуска подготовлен к согласованию.",
      action: "Проверить детали",
      clientAction: "Ознакомьтесь с деталями и напишите, если нужно уточнение.",
    },
    waiting_client_confirmation: {
      label: "Ожидает подтверждения",
      badge: "gold",
      title: "Ожидаем ваше подтверждение",
      intro: "Детали отправлены на согласование. Подтвердите запуск, чтобы мы продолжили работу.",
      progress: 5,
      update: "Проект ожидает решения клиента.",
      action: "Подтвердить запуск",
      clientAction: "Подтвердите запуск или пришлите комментарии.",
    },
    demo_ready: {
      label: "Проверка качества",
      badge: "green",
      title: "Проверка качества",
      intro: "Сайт проверяется перед согласованием и запуском.",
      progress: 4,
      update: "Проверяем структуру, адаптив, формы и ключевые блоки.",
      action: "Проверить демо",
      clientAction: "Посмотрите демо и отправьте комментарии, если нужны правки.",
    },
    revision_in_progress: {
      label: "Ожидает согласования",
      badge: "blue",
      title: "Вносим правки",
      intro: "Мы получили ваши комментарии и работаем над улучшениями.",
      progress: 5,
      update: "Правки по комментариям внесены в работу.",
      action: "Проверить комментарии",
      clientAction: "Можно добавить ещё комментарий, пока доработка не завершена.",
    },
    delayed: {
      label: "Проверяем материалы",
      badge: "gold",
      title: "Срок обновлён",
      intro: "Мы немного отстаём от графика, но уже активно работаем над решением.",
      progress: 2,
      update: "Срок обновлён после проверки материалов.",
      action: "Связаться с нами",
      clientAction: "Подскажите приоритеты, если что-то нужно ускорить.",
    },
    ready_to_launch: {
      label: "Готов к запуску",
      badge: "green",
      title: "Готов к запуску",
      intro: "Проект прошёл проверку и готов к финальному запуску.",
      progress: 6,
      update: "Домен, контент и формы проверены.",
      action: "Подтвердить запуск",
      clientAction: "Подтвердите запуск, чтобы сайт стал доступен посетителям.",
    },
    launched: {
      label: "Сайт запущен",
      badge: "green",
      title: "Проект успешно запущен",
      intro: "Ваш сайт опубликован и доступен для посетителей. Все системы работают корректно.",
      progress: 7,
      update: "Проект запущен, поддержка активна.",
      action: "Перейти на сайт",
      clientAction: "Можно запросить развитие проекта или поддержку после запуска.",
    },
    completed: {
      label: "Поддержка после запуска",
      badge: "green",
      title: "Поддержка после запуска",
      intro: "Сайт запущен, а команда WEB00 остаётся на связи по вопросам поддержки.",
      progress: 8,
      update: "Основные этапы выполнены, поддержка доступна.",
      action: "Связаться с поддержкой",
      clientAction: "Напишите, если нужны правки, обновления или консультация.",
    },
  };

  const MOCK_LEADS = [
    {
      id: "WEB00-2026-0001",
      status: "new",
      solution: "Мебельный магазин",
      tariff: "Business",
      contact: "demo",
      name: "Демо клиент",
      industry: "Товары / интернет-магазин",
      businessName: "Демо проект",
      createdAt: "2026-05-22T10:00:00.000Z",
    },
    {
      id: "WEB00-2026-0002",
      status: "demo_ready",
      solution: "Сайт под ключ",
      contact: "demo",
      name: "Демо клиент",
      createdAt: "2026-05-22T11:00:00.000Z",
    },
  ];

  const BUG_REPORTS = [];

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function nextSeq(key) {
    const current = Number(localStorage.getItem(key) || "0") + 1;
    localStorage.setItem(key, String(current));
    return current;
  }

  function year() {
    return new Date().getFullYear();
  }

  function createLead(data) {
    const seq = nextSeq(STORAGE_KEYS.leadSeq);
    const lead = {
      id: `WEB00-${year()}-${String(seq).padStart(4, "0")}`,
      status: "new",
      createdAt: new Date().toISOString(),
      ...data,
    };
    const leads = readJson(STORAGE_KEYS.leads, []);
    leads.unshift(lead);
    writeJson(STORAGE_KEYS.leads, leads);
    return lead;
  }

  function allLeads() {
    return [...readJson(STORAGE_KEYS.leads, []), ...MOCK_LEADS];
  }

  function getLeadStatus(id) {
    if (!id) return null;
    return allLeads().find((lead) => lead.id.toLowerCase() === String(id).trim().toLowerCase()) || null;
  }

  function updateLeadStatusMock(id, status) {
    const leads = readJson(STORAGE_KEYS.leads, []);
    const index = leads.findIndex((lead) => lead.id === id);
    if (index >= 0) {
      leads[index].status = status;
      leads[index].updatedAt = new Date().toISOString();
      writeJson(STORAGE_KEYS.leads, leads);
      return leads[index];
    }
    return null;
  }

  function createBugReport(data) {
    const seq = nextSeq(STORAGE_KEYS.bugSeq);
    const report = {
      id: `WEB00-ERR-${year()}-${String(seq).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      ...data,
    };
    const reports = readJson(STORAGE_KEYS.bugs, []);
    reports.unshift(report);
    writeJson(STORAGE_KEYS.bugs, reports);
    return report;
  }

  function createErrorReport(data) {
    return createBugReport(data);
  }

  function createSupportMessage(data) {
    const seq = nextSeq(STORAGE_KEYS.supportSeq);
    const message = {
      id: `WEB00-MSG-${year()}-${String(seq).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      ...data,
    };
    const messages = readJson(STORAGE_KEYS.supportMessages, []);
    messages.unshift(message);
    writeJson(STORAGE_KEYS.supportMessages, messages);
    return message;
  }

  window.WEB00_DATA = {
    CONTACTS,
    SOLUTIONS,
    SERVICES,
    PRICING,
    FAQ_ITEMS,
    LEAD_STATUSES,
    MOCK_LEADS,
    BUG_REPORTS,
    createLead,
    getLeadStatus,
    createBugReport,
    createErrorReport,
    createSupportMessage,
    updateLeadStatusMock,
    allLeads,
  };
})();
