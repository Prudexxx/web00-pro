(function () {
  const DATA = window.WEB00_DATA;
  if (!DATA) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const page = document.body.dataset.page || "home";

  let activeSolution = (DATA.SOLUTIONS || []).find((item) => item.active !== false) || DATA.SOLUTIONS[0];
  let activeService = null;
  let bugAttachment = null;
  const TITLE_ALIASES = new Map([
    ["Каталог мебели", "Мебельный магазин"],
    ["Сайт для клининга", "Услуга клининга"],
    ["Сайт для кровли", "Услуга кровли"],
    ["Сайт для массажа", "Массаж"],
    ["Сайт для услуг", "Услуга муж на час"],
    ["Сайт для доставки", "Доставка и продажа дров"],
  ]);
  const HOME_LANGUAGE_KEY = "web00.home.language";
  const HOME_LANGUAGES = {
    ru: { label: "Русский", flag: "🇷🇺", htmlLang: "ru" },
    en: { label: "English", flag: "🇬🇧", htmlLang: "en" },
    de: { label: "Deutsch", flag: "🇩🇪", htmlLang: "de" },
    fr: { label: "Français", flag: "🇫🇷", htmlLang: "fr" },
    it: { label: "Italiano", flag: "🇮🇹", htmlLang: "it" },
    zh: { label: "中文", flag: "🇨🇳", htmlLang: "zh-CN" },
    ja: { label: "日本語", flag: "🇯🇵", htmlLang: "ja" },
  };
  const HOME_TRANSLATIONS = {
    ru: {
      "nav.catalog": "Каталог",
      "nav.pricing": "Тарифы",
      "nav.how": "Как это работает",
      "nav.cases": "Кейсы",
      "nav.cta": "Выбрать сайт",
      "hero.badge": "Премиум-платформа готовых сайтов для бизнеса",
      "hero.title": "Готовый сайт для бизнеса<br>запуск без хаоса",
      "hero.text": "Выберите готовый сайт, заполните анкету проекта — и мы запустим ваш сайт под ключ. Быстро, прозрачно и с поддержкой на каждом этапе.",
      "hero.primary": "Выбрать готовый сайт",
      "hero.demo": "Смотреть демо",
      "device.nav.about": "Каталог",
      "device.nav.services": "Тарифы",
      "device.nav.reviews": "Кейсы",
      "device.nav.contacts": "FAQ",
      "device.title": "WEB00 Pro<br>готовые сайты",
      "device.text": "Каталог, тарифы и запуск сайта под ключ",
      "device.cta": "Выбрать сайт",
      "device.mobileText": "Запуск сайта под ключ",
      "device.mobileCta": "Выбрать",
      "trust.launch.title": "Запуск от 48 часов",
      "trust.launch.text": "Быстрый старт без потери качества",
      "trust.performance.title": "Быстро загружается",
      "trust.performance.text": "Высокая скорость и стабильность",
      "trust.seo.title": "Готов к продвижению",
      "trust.seo.text": "Готовность к поисковому продвижению",
      "trust.support.title": "Поддержка и сопровождение",
      "trust.support.text": "Мы рядом после запуска",
      "steps.title": "Как это работает",
      "steps.one.title": "Выбрать",
      "steps.one.text": "Из каталога готовых решений под вашу нишу и задачу.",
      "steps.two.title": "Проверить",
      "steps.two.text": "Смотрите демо, уточняете детали, мы готовим под вашу анкету.",
      "steps.three.title": "Запустить",
      "steps.three.text": "Запускаем сайт от 48 часов и остаёмся на связи.",
      "templates.title": "Популярные готовые сайты",
      "templates.all": "Смотреть все в каталоге →",
      "card.mebel.title": "Мебельный магазин",
      "card.mebel.price": "Готовое решение",
      "card.mebel.text": "Интернет-витрина с каталогом, акциями, заявками и быстрым запуском продаж.",
      "card.mebel.tag1": "Каталог",
      "card.med.title": "Медицинский центр",
      "card.med.price": "Готовое решение",
      "card.med.text": "Страница доверия для клиники: услуги, преимущества, запись и понятный контакт.",
      "card.med.tag1": "Запись",
      "card.med.tag2": "Доверие",
      "card.build.title": "Дома и бани из сруба",
      "card.build.price": "Готовое решение",
      "card.build.text": "Проекты, преимущества, расчёт стоимости и заявки на строительство.",
      "card.build.tag1": "Проекты",
      "card.build.tag2": "Расчёт",
      "card.common.leads": "Заявки",
      "card.common.promo": "Промо",
      "card.common.adaptive": "Адаптив",
      "card.common.type": "Готовое решение",
      "card.common.priceNote": "Стоимость после анкеты",
      "card.demo": "Смотреть пример",
      "card.launch": "Запустить",
      "proof.title": "Почему нам доверяют",
      "proof.price.title": "Прозрачные цены",
      "proof.price.text": "Никаких скрытых платежей. Всё фиксируем в договоре.",
      "proof.qa.title": "Паспорт качества (QA)",
      "proof.qa.text": "Каждый сайт проходит проверку по 50+ пунктам.",
      "proof.support.title": "Поддержка 24/7",
      "proof.support.text": "Техподдержка и сопровождение после запуска.",
      "proof.owner.title": "Вы — владелец",
      "proof.owner.text": "Домен и сайт полностью ваши. Без ограничений.",
      "quality.title": "Паспорт качества",
      "quality.time": "Время запуска",
      "quality.hours": "48ч",
      "quality.yes": "Да",
      "quality.caption": "Средние показатели по всем проектам WEB00",
      "pricing.title": "Тарифы",
      "pricing.compare": "Сравнить все тарифы →",
      "pricing.start.text": "Быстрый старт для малого бизнеса и экспертов.",
      "pricing.start.item1": "Готовый сайт",
      "pricing.start.item2": "Базовая настройка и контент",
      "pricing.start.item3": "Запуск от 48 часов",
      "pricing.start.price": "от 39 000 ₽",
      "pricing.business.text": "Расширенные возможности для роста и конверсии.",
      "pricing.business.item1": "Всё из тарифа Start",
      "pricing.business.item2": "Индивидуальная настройка",
      "pricing.business.item3": "Интеграции и аналитика",
      "pricing.business.price": "от 69 000 ₽",
      "pricing.pro.text": "Максимум возможностей и персональный подход.",
      "pricing.pro.item1": "Всё из тарифа Business",
      "pricing.pro.item2": "Приоритетная поддержка",
      "pricing.pro.item3": "Персональный менеджер",
      "pricing.pro.price": "от 99 000 ₽",
      "pricing.choose": "Выбрать",
      "final.title": "Выберите сайт, заполните анкету проекта, получите запуск",
      "final.text": "Мы берём на себя всё остальное — дизайн, настройку, наполнение и поддержку.",
      "final.cta": "Начать",
      "footer.privacy": "Политика конфиденциальности",
      "footer.consent": "Согласие на обработку данных",
      "footer.contacts": "Контакты",
      "language.title": "Язык",
    },
    en: {
      "nav.catalog": "Catalog",
      "nav.pricing": "Pricing",
      "nav.how": "How it works",
      "nav.cases": "Cases",
      "nav.cta": "Choose a site",
      "hero.badge": "Premium platform for ready-made business websites",
      "hero.title": "A ready-made business website — launch without chaos",
      "hero.text": "Choose a template, fill in the project questionnaire, and we launch your website end to end. Fast, transparent, and supported at every step.",
      "hero.primary": "Choose template",
      "hero.demo": "View demo",
      "device.nav.about": "Catalog",
      "device.nav.services": "Pricing",
      "device.nav.reviews": "Cases",
      "device.nav.contacts": "FAQ",
      "device.title": "WEB00 Pro<br>ready sites",
      "device.text": "Catalog, pricing and turnkey launch",
      "device.cta": "Choose site",
      "device.mobileText": "Turnkey website launch",
      "device.mobileCta": "Choose",
      "trust.launch.title": "Launch from 48 hours",
      "trust.launch.text": "Fast start without losing quality",
      "trust.performance.title": "Loads fast",
      "trust.performance.text": "High speed and stability",
      "trust.seo.title": "Ready for search",
      "trust.seo.text": "Prepared for search promotion",
      "trust.support.title": "Support and maintenance",
      "trust.support.text": "We stay with you after launch",
      "steps.title": "How it works",
      "steps.one.title": "Choose",
      "steps.one.text": "Select a ready solution for your niche and task.",
      "steps.two.title": "Review",
      "steps.two.text": "View the demo, clarify details, and we prepare it for your questionnaire.",
      "steps.three.title": "Launch",
      "steps.three.text": "We launch from 48 hours and stay in touch.",
      "templates.title": "Popular templates",
      "templates.all": "View all in catalog →",
      "card.mebel.title": "Furniture store",
      "card.mebel.price": "Ready solution",
      "card.mebel.text": "Online showcase with catalog, promotions, requests, and a fast sales launch.",
      "card.mebel.tag1": "Catalog",
      "card.med.title": "Medical center",
      "card.med.price": "Ready solution",
      "card.med.text": "A trust-building clinic page: services, benefits, booking, and clear contact.",
      "card.med.tag1": "Booking",
      "card.med.tag2": "Trust",
      "card.build.title": "Log houses and saunas",
      "card.build.price": "Ready solution",
      "card.build.text": "Projects, benefits, price estimate, and construction requests.",
      "card.build.tag1": "Projects",
      "card.build.tag2": "Estimate",
      "card.common.leads": "Leads",
      "card.common.promo": "Promo",
      "card.common.adaptive": "Responsive",
      "card.common.type": "Ready solution",
      "card.common.priceNote": "Price after questionnaire",
      "card.demo": "View example",
      "card.launch": "Launch",
      "proof.title": "Why clients trust us",
      "proof.price.title": "Transparent pricing",
      "proof.price.text": "No hidden fees. Everything is fixed in the agreement.",
      "proof.qa.title": "Quality passport (QA)",
      "proof.qa.text": "Every website is checked across 50+ points.",
      "proof.support.title": "24/7 support",
      "proof.support.text": "Technical support and maintenance after launch.",
      "proof.owner.title": "You own it",
      "proof.owner.text": "The domain and website are fully yours. No limits.",
      "quality.title": "Quality passport",
      "quality.time": "Launch time",
      "quality.hours": "48h",
      "quality.yes": "Yes",
      "quality.caption": "Average metrics across WEB00 projects",
      "pricing.title": "Pricing",
      "pricing.compare": "Compare all plans →",
      "pricing.start.text": "A fast start for small businesses and experts.",
      "pricing.start.item1": "Ready-made template",
      "pricing.start.item2": "Basic setup and content",
      "pricing.start.item3": "Launch from 48 hours",
      "pricing.start.price": "from 39,000 ₽",
      "pricing.business.text": "Expanded features for growth and conversion.",
      "pricing.business.item1": "Everything in Start",
      "pricing.business.item2": "Individual setup",
      "pricing.business.item3": "Integrations and analytics",
      "pricing.business.price": "from 69,000 ₽",
      "pricing.pro.text": "Maximum capabilities and a personal approach.",
      "pricing.pro.item1": "Everything in Business",
      "pricing.pro.item2": "Priority support",
      "pricing.pro.item3": "Personal manager",
      "pricing.pro.price": "from 99,000 ₽",
      "pricing.choose": "Choose",
      "final.title": "Choose a site, complete the project questionnaire, get launched",
      "final.text": "We handle the rest: design, setup, content, and support.",
      "final.cta": "Start",
      "footer.privacy": "Privacy Policy",
      "footer.consent": "Personal data consent",
      "footer.contacts": "Contacts",
      "language.title": "Language",
    },
    de: {
      "nav.catalog": "Katalog",
      "nav.pricing": "Preise",
      "nav.how": "So funktioniert es",
      "nav.cases": "Cases",
      "nav.cta": "Website wählen",
      "hero.badge": "Premium-Plattform für fertige Business-Websites",
      "hero.title": "Fertige Website für Ihr Business — Start ohne Chaos",
      "hero.text": "Wählen Sie eine Vorlage, füllen Sie den Projektfragebogen aus, und wir starten Ihre Website schlüsselfertig. Schnell, transparent und mit Support in jeder Phase.",
      "hero.primary": "Vorlage wählen",
      "hero.demo": "Demo ansehen",
      "device.nav.about": "Katalog",
      "device.nav.services": "Tarife",
      "device.nav.reviews": "Cases",
      "device.nav.contacts": "FAQ",
      "device.title": "WEB00 Pro<br>fertige Websites",
      "device.text": "Katalog, Tarife und schlüsselfertiger Start",
      "device.cta": "Website wählen",
      "device.mobileText": "Website startklar",
      "device.mobileCta": "Wählen",
      "trust.launch.title": "Start ab 48 Stunden",
      "trust.launch.text": "Schneller Start ohne Qualitätsverlust",
      "trust.performance.title": "Lädt schnell",
      "trust.performance.text": "Hohe Geschwindigkeit und Stabilität",
      "trust.seo.title": "Für Suche vorbereitet",
      "trust.seo.text": "Vorbereitet für Suchmaschinen",
      "trust.support.title": "Support und Betreuung",
      "trust.support.text": "Wir bleiben nach dem Start an Ihrer Seite",
      "steps.title": "So funktioniert es",
      "steps.one.title": "Wählen",
      "steps.one.text": "Ein fertiges Konzept für Ihre Nische und Aufgabe auswählen.",
      "steps.two.title": "Prüfen",
      "steps.two.text": "Demo ansehen, Details klären, wir bereiten alles nach Fragebogen vor.",
      "steps.three.title": "Starten",
      "steps.three.text": "Start ab 48 Stunden, danach bleiben wir in Kontakt.",
      "templates.title": "Beliebte Vorlagen",
      "templates.all": "Alle im Katalog ansehen →",
      "card.mebel.title": "Möbelshop",
      "card.mebel.price": "Fertige Lösung",
      "card.mebel.text": "Online-Schaufenster mit Katalog, Aktionen, Anfragen und schnellem Verkaufsstart.",
      "card.mebel.tag1": "Katalog",
      "card.med.title": "Medizinisches Zentrum",
      "card.med.price": "Fertige Lösung",
      "card.med.text": "Vertrauensseite für Kliniken: Leistungen, Vorteile, Termin und klarer Kontakt.",
      "card.med.tag1": "Termin",
      "card.med.tag2": "Vertrauen",
      "card.build.title": "Blockhäuser und Saunen",
      "card.build.price": "Fertige Lösung",
      "card.build.text": "Projekte, Vorteile, Kostenschätzung und Anfragen für den Bau.",
      "card.build.tag1": "Projekte",
      "card.build.tag2": "Kalkulation",
      "card.common.leads": "Anfragen",
      "card.common.promo": "Promo",
      "card.common.adaptive": "Adaptiv",
      "card.common.type": "Fertige Lösung",
      "card.common.priceNote": "Preis nach Fragebogen",
      "card.demo": "Beispiel ansehen",
      "card.launch": "Starten",
      "proof.title": "Warum man uns vertraut",
      "proof.price.title": "Transparente Preise",
      "proof.price.text": "Keine versteckten Kosten. Alles wird im Vertrag fixiert.",
      "proof.qa.title": "Qualitätspass (QA)",
      "proof.qa.text": "Jede Website wird anhand von 50+ Punkten geprüft.",
      "proof.support.title": "Support 24/7",
      "proof.support.text": "Technischer Support und Betreuung nach dem Start.",
      "proof.owner.title": "Sie sind Eigentümer",
      "proof.owner.text": "Domain und Website gehören vollständig Ihnen. Ohne Einschränkungen.",
      "quality.title": "Qualitätspass",
      "quality.time": "Startzeit",
      "quality.hours": "48h",
      "quality.yes": "Ja",
      "quality.caption": "Durchschnittswerte aller WEB00-Projekte",
      "pricing.title": "Tarife",
      "pricing.compare": "Alle Tarife vergleichen →",
      "pricing.start.text": "Schneller Start für kleine Unternehmen und Experten.",
      "pricing.start.item1": "Fertige Vorlage",
      "pricing.start.item2": "Basis-Setup und Inhalte",
      "pricing.start.item3": "Start ab 48 Stunden",
      "pricing.start.price": "ab 39.000 ₽",
      "pricing.business.text": "Erweiterte Möglichkeiten für Wachstum und Conversion.",
      "pricing.business.item1": "Alles aus Start",
      "pricing.business.item2": "Individuelle Einrichtung",
      "pricing.business.item3": "Integrationen und Analytics",
      "pricing.business.price": "ab 69.000 ₽",
      "pricing.pro.text": "Maximale Möglichkeiten und persönlicher Ansatz.",
      "pricing.pro.item1": "Alles aus Business",
      "pricing.pro.item2": "Priorisierter Support",
      "pricing.pro.item3": "Persönlicher Manager",
      "pricing.pro.price": "ab 99.000 ₽",
      "pricing.choose": "Wählen",
      "final.title": "Website wählen, Projektfragebogen ausfüllen, Start erhalten",
      "final.text": "Wir übernehmen alles Weitere: Design, Einrichtung, Inhalte und Support.",
      "final.cta": "Starten",
      "footer.privacy": "Datenschutzerklärung",
      "footer.consent": "Einwilligung zur Datenverarbeitung",
      "footer.contacts": "Kontakt",
      "language.title": "Sprache",
    },
  };
  HOME_TRANSLATIONS.fr = Object.assign({}, HOME_TRANSLATIONS.en, {
    "nav.catalog": "Catalogue",
    "nav.pricing": "Tarifs",
    "nav.how": "Fonctionnement",
    "nav.cases": "Cas",
    "nav.cta": "Choisir un site",
    "hero.badge": "Plateforme premium de sites prêts pour les entreprises",
    "hero.title": "Un site prêt pour votre entreprise — lancement sans chaos",
    "hero.text": "Choisissez un modèle, remplissez le questionnaire projet, et nous lançons votre site clé en main. Rapidement, clairement, avec accompagnement.",
    "hero.primary": "Choisir un modèle",
    "hero.demo": "Voir la démo",
    "templates.title": "Modèles populaires",
    "templates.all": "Tout voir dans le catalogue →",
    "card.mebel.title": "Boutique de meubles",
    "card.med.title": "Centre médical",
    "card.build.title": "Maisons et bains en rondins",
    "proof.title": "Pourquoi ils nous font confiance",
    "pricing.title": "Tarifs",
    "pricing.compare": "Comparer tous les tarifs →",
    "final.title": "Choisissez un site, remplissez le questionnaire, obtenez le lancement",
    "final.cta": "Commencer",
    "footer.privacy": "Politique de confidentialité",
    "footer.consent": "Consentement aux données personnelles",
    "footer.contacts": "Contacts",
    "language.title": "Langue",
  });
  HOME_TRANSLATIONS.it = Object.assign({}, HOME_TRANSLATIONS.en, {
    "nav.catalog": "Catalogo",
    "nav.pricing": "Tariffe",
    "nav.how": "Come funziona",
    "nav.cases": "Casi",
    "nav.cta": "Scegli sito",
    "hero.badge": "Piattaforma premium di siti pronti per il business",
    "hero.title": "Sito pronto per il business — lancio senza caos",
    "hero.text": "Scegli un modello, compila il questionario del progetto e lanciamo il sito chiavi in mano. Rapido, trasparente e con supporto.",
    "hero.primary": "Scegli modello",
    "hero.demo": "Guarda demo",
    "templates.title": "Modelli popolari",
    "templates.all": "Vedi tutto nel catalogo →",
    "card.mebel.title": "Negozio di mobili",
    "card.med.title": "Centro medico",
    "card.build.title": "Case e saune in legno",
    "proof.title": "Perché si fidano di noi",
    "pricing.title": "Tariffe",
    "pricing.compare": "Confronta tutte le tariffe →",
    "final.title": "Scegli un sito, compila il questionario, ottieni il lancio",
    "final.cta": "Inizia",
    "footer.privacy": "Informativa sulla privacy",
    "footer.consent": "Consenso al trattamento dei dati",
    "footer.contacts": "Contatti",
    "language.title": "Lingua",
  });
  HOME_TRANSLATIONS.zh = Object.assign({}, HOME_TRANSLATIONS.en, {
    "nav.catalog": "目录",
    "nav.pricing": "价格",
    "nav.how": "流程",
    "nav.cases": "案例",
    "nav.cta": "选择网站",
    "hero.badge": "面向企业的高端现成网站平台",
    "hero.title": "企业现成网站 — 告别混乱上线",
    "hero.text": "选择模板，填写项目问卷，我们为你完成网站上线。快速、透明，并在每个阶段提供支持。",
    "hero.primary": "选择模板",
    "hero.demo": "查看演示",
    "device.title": "WEB00 Pro<br>现成网站",
    "device.text": "目录、价格与一站式上线",
    "device.cta": "选择网站",
    "templates.title": "热门模板",
    "templates.all": "查看全部目录 →",
    "card.mebel.title": "家具商店",
    "card.mebel.price": "现成方案",
    "card.med.title": "医疗中心",
    "card.med.price": "现成方案",
    "card.build.title": "木屋与桑拿",
    "card.build.price": "现成方案",
    "card.common.type": "现成方案",
    "card.common.priceNote": "填写问卷后报价",
    "proof.title": "客户为什么信任我们",
    "pricing.title": "套餐",
    "pricing.compare": "比较全部套餐 →",
    "pricing.start.price": "39,000 ₽ 起",
    "pricing.business.price": "69,000 ₽ 起",
    "pricing.pro.price": "99,000 ₽ 起",
    "pricing.choose": "选择",
    "quality.yes": "是",
    "final.title": "选择网站，填写项目问卷，获得上线",
    "final.text": "设计、设置、内容和支持都由我们处理。",
    "final.cta": "开始",
    "footer.privacy": "隐私政策",
    "footer.consent": "个人数据同意",
    "footer.contacts": "联系方式",
    "language.title": "语言",
  });
  HOME_TRANSLATIONS.ja = Object.assign({}, HOME_TRANSLATIONS.en, {
    "nav.catalog": "カタログ",
    "nav.pricing": "料金",
    "nav.how": "流れ",
    "nav.cases": "事例",
    "nav.cta": "サイトを選ぶ",
    "hero.badge": "ビジネス向け完成済みサイトのプレミアム平台",
    "hero.title": "ビジネス向け完成サイト — 混乱なく公開",
    "hero.text": "テンプレートを選び、プロジェクト質問票を入力すれば、サイト公開まで対応します。速く、透明に、各段階でサポートします。",
    "hero.primary": "テンプレートを選ぶ",
    "hero.demo": "デモを見る",
    "device.title": "WEB00 Pro<br>完成サイト",
    "device.text": "カタログ、料金、公開まで対応",
    "device.cta": "サイトを選ぶ",
    "templates.title": "人気テンプレート",
    "templates.all": "カタログですべて見る →",
    "card.mebel.title": "家具ショップ",
    "card.mebel.price": "完成済みプラン",
    "card.med.title": "医療センター",
    "card.med.price": "完成済みプラン",
    "card.build.title": "ログハウスとサウナ",
    "card.build.price": "完成済みプラン",
    "card.common.type": "完成済みプラン",
    "card.common.priceNote": "アンケート後に見積もり",
    "proof.title": "信頼される理由",
    "pricing.title": "料金",
    "pricing.compare": "すべての料金を比較 →",
    "pricing.start.price": "39,000 ₽〜",
    "pricing.business.price": "69,000 ₽〜",
    "pricing.pro.price": "99,000 ₽〜",
    "pricing.choose": "選ぶ",
    "quality.yes": "はい",
    "final.title": "サイトを選び、質問票を入力し、公開へ",
    "final.text": "デザイン、設定、コンテンツ、サポートまで対応します。",
    "final.cta": "開始",
    "footer.privacy": "プライバシーポリシー",
    "footer.consent": "個人データ同意",
    "footer.contacts": "連絡先",
    "language.title": "言語",
  });
  Object.assign(HOME_TRANSLATIONS.fr, {
    "device.nav.about": "Catalogue",
    "device.nav.services": "Tarifs",
    "device.nav.reviews": "Cas",
    "device.nav.contacts": "FAQ",
    "device.title": "WEB00 Pro<br>sites prêts",
    "device.text": "Catalogue, tarifs et lancement clé en main",
    "device.cta": "Choisir un site",
    "device.mobileText": "Lancement clé en main",
    "device.mobileCta": "Choisir",
    "trust.launch.title": "Lancement dès 48 h",
    "trust.launch.text": "Démarrage rapide sans perte de qualité",
    "trust.performance.title": "Chargement rapide",
    "trust.performance.text": "Vitesse élevée et stabilité",
    "trust.seo.title": "Prêt pour la recherche",
    "trust.seo.text": "Préparé pour le référencement",
    "trust.support.title": "Support et accompagnement",
    "trust.support.text": "Nous restons présents après le lancement",
    "steps.title": "Comment ça marche",
    "steps.one.title": "Choisir",
    "steps.one.text": "Sélectionnez une solution prête pour votre niche et votre tâche.",
    "steps.two.title": "Vérifier",
    "steps.two.text": "Vous regardez la démo, précisez les détails, nous préparons selon le questionnaire.",
    "steps.three.title": "Lancer",
    "steps.three.text": "Nous lançons dès 48 heures et restons en contact.",
    "card.mebel.price": "Solution prête",
    "card.mebel.text": "Vitrine en ligne avec catalogue, promotions, demandes et lancement rapide des ventes.",
    "card.mebel.tag1": "Catalogue",
    "card.med.price": "Solution prête",
    "card.med.text": "Page de confiance pour clinique : services, avantages, prise de rendez-vous et contact clair.",
    "card.med.tag1": "Rendez-vous",
    "card.med.tag2": "Confiance",
    "card.build.price": "Solution prête",
    "card.build.text": "Projets, avantages, estimation du coût et demandes de construction.",
    "card.build.tag1": "Projets",
    "card.build.tag2": "Estimation",
    "card.common.leads": "Demandes",
    "card.common.promo": "Promo",
    "card.common.adaptive": "Adaptatif",
    "card.common.type": "Solution prête",
    "card.common.priceNote": "Prix après questionnaire",
    "card.demo": "Voir l’exemple",
    "card.launch": "Lancer",
    "proof.price.title": "Prix transparents",
    "proof.price.text": "Aucun paiement caché. Tout est fixé dans l’accord.",
    "proof.qa.title": "Passeport qualité (QA)",
    "proof.qa.text": "Chaque site est vérifié sur plus de 50 points.",
    "proof.support.title": "Support 24/7",
    "proof.support.text": "Support technique et accompagnement après le lancement.",
    "proof.owner.title": "Vous êtes propriétaire",
    "proof.owner.text": "Le domaine et le site vous appartiennent entièrement. Sans limites.",
    "quality.title": "Passeport qualité",
    "quality.time": "Temps de lancement",
    "quality.hours": "48 h",
    "quality.yes": "Oui",
    "quality.caption": "Indicateurs moyens pour les projets WEB00",
    "pricing.start.text": "Démarrage rapide pour petites entreprises et experts.",
    "pricing.start.item1": "Modèle prêt",
    "pricing.start.item2": "Configuration de base et contenu",
    "pricing.start.item3": "Lancement dès 48 h",
    "pricing.start.price": "à partir de 39 000 ₽",
    "pricing.business.text": "Fonctions étendues pour la croissance et la conversion.",
    "pricing.business.item1": "Tout dans Start",
    "pricing.business.item2": "Configuration individuelle",
    "pricing.business.item3": "Intégrations et analytique",
    "pricing.business.price": "à partir de 69 000 ₽",
    "pricing.pro.text": "Maximum de possibilités et approche personnalisée.",
    "pricing.pro.item1": "Tout dans Business",
    "pricing.pro.item2": "Support prioritaire",
    "pricing.pro.item3": "Manager personnel",
    "pricing.pro.price": "à partir de 99 000 ₽",
    "pricing.choose": "Choisir",
    "final.text": "Nous prenons en charge le reste : design, configuration, contenu et support.",
  });
  Object.assign(HOME_TRANSLATIONS.it, {
    "device.nav.about": "Catalogo",
    "device.nav.services": "Tariffe",
    "device.nav.reviews": "Casi",
    "device.nav.contacts": "FAQ",
    "device.title": "WEB00 Pro<br>siti pronti",
    "device.text": "Catalogo, tariffe e lancio chiavi in mano",
    "device.cta": "Scegli sito",
    "device.mobileText": "Lancio sito chiavi in mano",
    "device.mobileCta": "Scegli",
    "trust.launch.title": "Lancio da 48 ore",
    "trust.launch.text": "Partenza rapida senza perdere qualità",
    "trust.performance.title": "Caricamento rapido",
    "trust.performance.text": "Alta velocità e stabilità",
    "trust.seo.title": "Pronto per la ricerca",
    "trust.seo.text": "Pronto per la promozione nei motori di ricerca",
    "trust.support.title": "Supporto e accompagnamento",
    "trust.support.text": "Restiamo al tuo fianco dopo il lancio",
    "steps.title": "Come funziona",
    "steps.one.title": "Scegli",
    "steps.one.text": "Seleziona una soluzione pronta per la tua nicchia e il tuo obiettivo.",
    "steps.two.title": "Verifica",
    "steps.two.text": "Guardi la demo, chiarisci i dettagli, noi prepariamo tutto sul questionario.",
    "steps.three.title": "Lancia",
    "steps.three.text": "Lanciamo da 48 ore e restiamo in contatto.",
    "card.mebel.price": "Soluzione pronta",
    "card.mebel.text": "Vetrina online con catalogo, promozioni, richieste e avvio rapido delle vendite.",
    "card.mebel.tag1": "Catalogo",
    "card.med.price": "Soluzione pronta",
    "card.med.text": "Pagina di fiducia per cliniche: servizi, vantaggi, prenotazione e contatto chiaro.",
    "card.med.tag1": "Prenotazione",
    "card.med.tag2": "Fiducia",
    "card.build.price": "Soluzione pronta",
    "card.build.text": "Progetti, vantaggi, stima dei costi e richieste per costruzione.",
    "card.build.tag1": "Progetti",
    "card.build.tag2": "Stima",
    "card.common.leads": "Richieste",
    "card.common.promo": "Promo",
    "card.common.adaptive": "Responsive",
    "card.common.type": "Soluzione pronta",
    "card.common.priceNote": "Prezzo dopo il questionario",
    "card.demo": "Guarda esempio",
    "card.launch": "Lancia",
    "proof.price.title": "Prezzi trasparenti",
    "proof.price.text": "Nessun costo nascosto. Tutto viene fissato nell’accordo.",
    "proof.qa.title": "Passaporto qualità (QA)",
    "proof.qa.text": "Ogni sito viene controllato su oltre 50 punti.",
    "proof.support.title": "Supporto 24/7",
    "proof.support.text": "Supporto tecnico e accompagnamento dopo il lancio.",
    "proof.owner.title": "Sei il proprietario",
    "proof.owner.text": "Dominio e sito sono completamente tuoi. Senza limiti.",
    "quality.title": "Passaporto qualità",
    "quality.time": "Tempo di lancio",
    "quality.hours": "48h",
    "quality.yes": "Sì",
    "quality.caption": "Metriche medie dei progetti WEB00",
    "pricing.start.text": "Partenza rapida per piccole imprese ed esperti.",
    "pricing.start.item1": "Modello pronto",
    "pricing.start.item2": "Setup base e contenuti",
    "pricing.start.item3": "Lancio da 48 ore",
    "pricing.start.price": "da 39.000 ₽",
    "pricing.business.text": "Funzionalità estese per crescita e conversioni.",
    "pricing.business.item1": "Tutto di Start",
    "pricing.business.item2": "Configurazione individuale",
    "pricing.business.item3": "Integrazioni e analytics",
    "pricing.business.price": "da 69.000 ₽",
    "pricing.pro.text": "Massime possibilità e approccio personale.",
    "pricing.pro.item1": "Tutto di Business",
    "pricing.pro.item2": "Supporto prioritario",
    "pricing.pro.item3": "Manager personale",
    "pricing.pro.price": "da 99.000 ₽",
    "pricing.choose": "Scegli",
    "final.text": "Ci occupiamo del resto: design, configurazione, contenuti e supporto.",
  });
  Object.assign(HOME_TRANSLATIONS.zh, {
    "device.nav.about": "目录",
    "device.nav.services": "价格",
    "device.nav.reviews": "案例",
    "device.nav.contacts": "FAQ",
    "device.mobileText": "一站式网站上线",
    "device.mobileCta": "选择",
    "trust.launch.title": "48小时起上线",
    "trust.launch.text": "快速启动，不牺牲质量",
    "trust.performance.title": "性能 90+",
    "trust.performance.text": "高速稳定",
    "trust.seo.title": "已准备好搜索推广",
    "trust.seo.text": "已为搜索推广准备",
    "trust.support.title": "支持与维护",
    "trust.support.text": "上线后我们继续支持",
    "steps.title": "工作流程",
    "steps.one.title": "选择",
    "steps.one.text": "从现成方案中选择适合行业和任务的模板。",
    "steps.two.title": "确认",
    "steps.two.text": "查看演示、确认细节，我们按问卷准备项目。",
    "steps.three.title": "上线",
    "steps.three.text": "最快48小时上线，并保持联系。",
    "card.mebel.text": "带目录、促销、询盘和快速销售启动的在线展示。",
    "card.mebel.tag1": "目录",
    "card.med.text": "诊所信任页面：服务、优势、预约和清晰联系方式。",
    "card.med.tag1": "预约",
    "card.med.tag2": "信任",
    "card.build.text": "项目展示、优势、费用估算和施工申请。",
    "card.build.tag1": "项目",
    "card.build.tag2": "估算",
    "card.common.leads": "询盘",
    "card.common.promo": "推广",
    "card.common.adaptive": "自适应",
    "card.demo": "查看示例",
    "card.launch": "启动",
    "proof.price.title": "价格透明",
    "proof.price.text": "没有隐藏费用。所有内容写入协议。",
    "proof.qa.title": "质量护照（QA）",
    "proof.qa.text": "每个网站都会通过50多项检查。",
    "proof.support.title": "24/7 支持",
    "proof.support.text": "上线后提供技术支持和维护。",
    "proof.owner.title": "你拥有网站",
    "proof.owner.text": "域名和网站完全属于你。没有限制。",
    "quality.title": "质量护照",
    "quality.time": "上线时间",
    "quality.hours": "48小时",
    "quality.caption": "WEB00 项目的平均指标",
    "pricing.start.text": "适合小企业和专家的快速启动。",
    "pricing.start.item1": "现成模板",
    "pricing.start.item2": "基础设置和内容",
    "pricing.start.item3": "48小时起上线",
    "pricing.business.text": "面向增长和转化的扩展功能。",
    "pricing.business.item1": "包含 Start 全部内容",
    "pricing.business.item2": "个性化设置",
    "pricing.business.item3": "集成与分析",
    "pricing.pro.text": "最大功能和个人化服务。",
    "pricing.pro.item1": "包含 Business 全部内容",
    "pricing.pro.item2": "优先支持",
    "pricing.pro.item3": "专属经理",
  });
  Object.assign(HOME_TRANSLATIONS.ja, {
    "device.nav.about": "カタログ",
    "device.nav.services": "料金",
    "device.nav.reviews": "事例",
    "device.nav.contacts": "FAQ",
    "device.mobileText": "サイト公開まで対応",
    "device.mobileCta": "選ぶ",
    "trust.launch.title": "48時間から公開",
    "trust.launch.text": "品質を落とさず素早く開始",
    "trust.performance.title": "高速表示",
    "trust.performance.text": "高速で安定した動作",
    "trust.seo.title": "集客対応",
    "trust.seo.text": "検索対策の準備済み",
    "trust.support.title": "サポートと運用",
    "trust.support.text": "公開後もサポートします",
    "steps.title": "公開までの流れ",
    "steps.one.title": "選ぶ",
    "steps.one.text": "業種と目的に合う完成済みテンプレートを選びます。",
    "steps.two.title": "確認",
    "steps.two.text": "デモを確認し、詳細を詰め、質問票に合わせて準備します。",
    "steps.three.title": "公開",
    "steps.three.text": "48時間から公開し、その後も連絡を保ちます。",
    "card.mebel.text": "カタログ、キャンペーン、問い合わせ、販売開始に対応したオンライン展示。",
    "card.mebel.tag1": "カタログ",
    "card.med.text": "クリニック向け信頼ページ：サービス、強み、予約、わかりやすい連絡先。",
    "card.med.tag1": "予約",
    "card.med.tag2": "信頼",
    "card.build.text": "施工事例、強み、費用見積もり、建築問い合わせに対応。",
    "card.build.tag1": "事例",
    "card.build.tag2": "見積",
    "card.common.leads": "問い合わせ",
    "card.common.promo": "プロモ",
    "card.common.adaptive": "レスポンシブ",
    "card.demo": "例を見る",
    "card.launch": "開始",
    "proof.price.title": "透明な料金",
    "proof.price.text": "隠れた費用はありません。すべて契約で明確にします。",
    "proof.qa.title": "品質パスポート（QA）",
    "proof.qa.text": "各サイトは50項目以上で確認します。",
    "proof.support.title": "24/7 サポート",
    "proof.support.text": "公開後も技術サポートと運用を行います。",
    "proof.owner.title": "所有者はあなた",
    "proof.owner.text": "ドメインとサイトは完全にあなたのものです。制限はありません。",
    "quality.title": "品質パスポート",
    "quality.time": "公開時間",
    "quality.hours": "48時間",
    "quality.caption": "WEB00全プロジェクトの平均指標",
    "pricing.start.text": "小規模ビジネスと専門家向けの素早い開始。",
    "pricing.start.item1": "完成済みテンプレート",
    "pricing.start.item2": "基本設定とコンテンツ",
    "pricing.start.item3": "48時間から公開",
    "pricing.business.text": "成長とコンバージョン向けの拡張機能。",
    "pricing.business.item1": "Startのすべて",
    "pricing.business.item2": "個別設定",
    "pricing.business.item3": "連携と分析",
    "pricing.pro.text": "最大限の機能と個別対応。",
    "pricing.pro.item1": "Businessのすべて",
    "pricing.pro.item2": "優先サポート",
    "pricing.pro.item3": "専任担当者",
  });

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function attr(value) {
    return esc(value).replaceAll("`", "&#096;");
  }

  function solutions() {
    const seen = new Set();
    return DATA.SOLUTIONS.filter((item) => {
      if (item.active === false || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function solutionFilter(solution) {
    return solution.filter || solution.previewType || "services";
  }

  function solutionPreviewType(solution) {
    return solution.previewType || solution.tone || "services";
  }

  function solutionFeatures(solution) {
    return solution.features || solution.includes || [];
  }

  function solutionPrice(solution) {
    return solution.priceFrom || solution.price || "";
  }

  function solutionTime(solution) {
    return solution.deliveryTime || solution.term || "";
  }

  function solutionAudience(solution) {
    return solution.audience || solution.description || "";
  }

  function solutionDemoUrl(solution) {
    if (!solution || solution.demoMode === "none") return "";
    if (solution.demoMode === "external-iframe" && solution.externalDemoUrl) return solution.externalDemoUrl;
    return solution.demoLocalUrl || "";
  }

  function solutionOriginalDemoUrl(solution) {
    return solution.originalDemoUrl || solution.externalDemoUrl || solution.demoUrl || "";
  }

  function solutionGallery(solution) {
    const gallery = Array.isArray(solution?.galleryImages) ? solution.galleryImages.filter(Boolean) : [];
    const fallback = solution?.previewImage ? [solution.previewImage] : [];
    return [...new Set(gallery.length ? gallery : fallback)];
  }

  function modalIcon(type) {
    const icons = {
      launch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c2.7-.5 4.9-1.8 6.7-3.8"/><path d="M11 13 8 10c1.7-3.7 4.4-5.9 8.1-6.7L20 3l-.3 3.9C18.9 10.6 16.7 13.3 13 15l-2-2Z"/><path d="M7 15l-2 4 4-2"/></svg>',
      support: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.4-2.9 7.7-7 10-4.1-2.3-7-5.6-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
      demo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg>',
      payment: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 15h5"/></svg>',
    };
    return icons[type] || icons.demo;
  }

  function externalLink(url, label, className = "btn btn--secondary btn--small") {
    if (!url) {
      return `<a class="${className} is-disabled" aria-disabled="true" tabindex="-1">${esc(label)}</a>`;
    }
    return `<a class="${className}" href="${attr(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  }

  function solutionById(id) {
    return solutions().find((item) => item.id === id) || solutions()[0] || DATA.SOLUTIONS[0];
  }

  function solutionByIdStrict(id) {
    const value = String(id || "").trim();
    if (!value) return null;
    return solutions().find((item) => item.id === value || item.title === value || item.legacyTitle === value) || null;
  }

  function pricingByTitle(title) {
    const value = String(title || "").trim().toLowerCase();
    if (!value) return null;
    return (DATA.PRICING || []).find((item) => String(item.title || "").trim().toLowerCase() === value) || null;
  }

  function briefUrl(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return `brief.html${suffix ? `?${suffix}` : ""}`;
  }

  function normalizeSolutionTitle(value) {
    const title = String(value || "").trim();
    if (!title) return "";
    const solution = DATA.SOLUTIONS.find((item) => item.title === title || item.legacyTitle === title || item.id === title);
    return solution?.title || TITLE_ALIASES.get(title) || title;
  }

  function setModal(name, open) {
    const modal = $(`[data-modal="${name}"]`);
    if (!modal) return;
    modal.classList.toggle("is-open", open);
    modal.setAttribute("aria-hidden", String(!open));
    const hasOpenModal = open && Boolean($(".modal.is-open"));
    document.body.classList.toggle("is-modal-open", hasOpenModal);
    document.documentElement.classList.toggle("is-modal-open", hasOpenModal);
  }

  function setDemoDialogMode(solution) {
    const dialog = $("[data-modal=\"demo\"] .modal__dialog");
    if (!dialog) return;
    dialog.classList.toggle("modal__dialog--demo-2", solution?.demoMode === "external-iframe");
  }

  function fitDemoDesktopCanvas(target) {
    const frame = $("[data-demo-desktop-canvas]", target);
    if (!frame) return;
    const canvasWidth = 1180;
    const fit = () => {
      const width = frame.clientWidth || frame.getBoundingClientRect().width || 320;
      const height = frame.clientHeight || frame.getBoundingClientRect().height || 520;
      const scale = Math.min(1, Math.max(0.22, width / canvasWidth));
      frame.style.setProperty("--demo-canvas-width", `${canvasWidth}px`);
      frame.style.setProperty("--demo-canvas-scale", scale.toFixed(4));
      frame.style.setProperty("--demo-canvas-height", `${Math.max(980, Math.ceil(height / scale))}px`);
    };
    fit();
    requestAnimationFrame(fit);
    window.setTimeout(fit, 120);
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(fit);
      observer.observe(frame);
    }
  }

  function closeModals() {
    const demoContent = $("[data-demo-modal-content]");
    const demoIframe = demoContent ? $("[data-demo-iframe]", demoContent) : null;
    if (demoIframe) demoIframe.removeAttribute("src");
    if (demoContent) demoContent.innerHTML = "";
    $$(".modal").forEach((modal) => {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    });
    $("[data-modal=\"demo\"] .modal__dialog")?.classList.remove("modal__dialog--demo-2");
    document.body.classList.remove("is-modal-open");
    document.documentElement.classList.remove("is-modal-open");
  }

  function initShell() {
    const menuToggle = $("[data-menu-toggle]");
    const nav = $("[data-nav]");
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (menuToggle && nav) {
      menuToggle.addEventListener("click", () => {
        const open = menuToggle.getAttribute("aria-expanded") !== "true";
        menuToggle.setAttribute("aria-expanded", String(open));
        nav.classList.toggle("is-open", open);
        document.body.classList.toggle("is-menu-open", open);
      });
    }

    $$("[data-nav] a").forEach((link) => {
      const linkPage = link.getAttribute("href")?.split("#")[0] || "";
      link.classList.toggle("is-active", linkPage === currentPage);
    });

    $$('a[data-scroll][href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = $(link.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        if (menuToggle && nav) {
          menuToggle.setAttribute("aria-expanded", "false");
          nav.classList.remove("is-open");
          document.body.classList.remove("is-menu-open");
        }
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    $$("[data-close-modal], .modal__overlay").forEach((item) => item.addEventListener("click", closeModals));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModals();
    });

    document.addEventListener("click", (event) => {
      const leadButton = event.target.closest("[data-open-lead]");
      if (leadButton) {
        event.preventDefault();
        const solutionId = leadButton.dataset.solutionId;
        const service = leadButton.dataset.service;
        if (solutionId) openLeadModal({ solution: solutionById(solutionId) });
        else openLeadModal({ service: service || activeService || "Сайт под ключ" });
      }

      const bugButton = event.target.closest("[data-open-bug]");
      if (bugButton) {
        event.preventDefault();
        openBugModal();
      }

      const messageButton = event.target.closest("[data-open-message]");
      if (messageButton) {
        event.preventDefault();
        openLeadModal({ service: "Вопрос или консультация" });
      }

      const homeDemoButton = event.target.closest("[data-open-demo-id]");
      if (homeDemoButton) {
        event.preventDefault();
        const solution = solutionByIdStrict(homeDemoButton.dataset.openDemoId);
        if (solution) openDemoModal(solution);
      }
    });

    window.addEventListener("message", (event) => {
      const payload = event.data || {};
      if (payload.type !== "WEB00_DEMO_REQUEST") return;
      const solutionId = String(payload.solutionId || "").trim();
      if (!solutionId) return;
      const solution = DATA.SOLUTIONS.find((item) => item.id === solutionId && item.active !== false);
      if (!solution) return;
      closeModals();
      openLeadModal({ solution });
    });
  }

  function renderSolutions() {
    const grid = $("[data-solutions-grid]");
    if (!grid) return;
    grid.innerHTML = solutions().map((solution) => {
      const features = solutionFeatures(solution);
      const hasDemo = Boolean(solutionDemoUrl(solution));
      const tags = features.slice(0, 2);
      return `
      <article class="solution-card" data-solution-card data-category="${esc(solutionFilter(solution))}" data-solution-id="${esc(solution.id)}" role="button" tabindex="0" aria-label="Смотреть решение: ${esc(solution.title)}">
        ${solutionPreview(solution, { card: true })}
        <div class="solution-card__body">
          <div class="solution-card__tags">${tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
          <h3>${esc(solution.title)}</h3>
          <p>${esc(solution.description || solutionAudience(solution))}</p>
          <div class="solution-card__meta"><b>${esc(solutionPrice(solution))}</b><span>${esc(solutionTime(solution))}</span></div>
          <div class="solution-card__actions">
            <button class="solution-card__action solution-card__action--secondary" type="button" data-card-action="${hasDemo ? "demo" : "details"}">${hasDemo ? "Смотреть демо" : "Подробнее"}</button>
            <a class="solution-card__action solution-card__action--primary" href="${attr(briefUrl({ solution: solution.id }))}">Запустить</a>
          </div>
        </div>
      </article>
    `;
    }).join("");

    $$(".solution-card", grid).forEach((card) => {
      const openCard = () => openSolutionModal(solutionById(card.dataset.solutionId));
      card.addEventListener("click", (event) => {
        if (event.target.closest(".solution-card__actions")) return;
        openCard();
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openCard();
      });
      $("[data-card-action]", card)?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const solution = solutionById(card.dataset.solutionId);
        if (solutionDemoUrl(solution)) openDemoModal(solution);
        else openCard();
      });
    });

    $$("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter;
        $$("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
        $$(".solution-card", grid).forEach((card) => {
          card.classList.toggle("is-hidden", filter !== "all" && card.dataset.category !== filter);
        });
      });
    });
  }

  function renderServices() {
    const grid = $("[data-services-grid]");
    if (!grid) return;
    grid.innerHTML = DATA.SERVICES.map((service) => `
      <article class="service-card">
        <span class="service-card__icon">${esc(service.icon)}</span>
        <div>
          <h3>${esc(service.title)}</h3>
          <p>${esc(service.text)}</p>
        </div>
        <a href="${attr(briefUrl({ service: service.type }))}" aria-label="${esc(service.title)}">→</a>
      </article>
    `).join("");
  }

  function renderPricing() {
    const grid = $("[data-pricing-grid]");
    if (!grid) return;
    grid.innerHTML = DATA.PRICING.map((item) => {
      const rowsByTitle = {
        Start: [
          ["Срок запуска", "до 7 дней"],
          ["Поддержка", "30 дней"],
          ["Настройка контента", "Базовая"],
          ["Интеграции", "Базовые"],
          ["Количество страниц", "до 10"],
        ],
        Business: [
          ["Срок запуска", "до 14 дней"],
          ["Поддержка", "60 дней"],
          ["Настройка контента", "Стандартная"],
          ["Интеграции", "Расширенные"],
          ["Количество страниц", "до 20"],
        ],
        Pro: [
          ["Срок запуска", "до 21 дня"],
          ["Поддержка", "90 дней"],
          ["Настройка контента", "Индивидуальная"],
          ["Интеграции", "Максимальные"],
          ["Количество страниц", "до 50"],
        ],
      };
      const rows = rowsByTitle[item.title] || (item.features || []).map((feature) => [feature, ""]);
      const isRecommended = item.title === "Pro";
      const detailId = `tariff-details-${item.title.toLowerCase()}`;
      const detailTextByTitle = {
        Start: "Для быстрого запуска по готовому сайту: структура, базовая настройка, форма заявки и адаптация под ваши данные.",
        Business: "Для бизнеса, которому важны рост и управление: больше страниц, индивидуальная настройка, аналитика и поддержка после запуска.",
        Pro: "Для сложных проектов: персональная структура, расширенные интеграции, приоритетная поддержка и подготовка к масштабированию.",
      };
      return `
        <article class="price-card ${isRecommended ? "price-card--accent" : ""}">
          <div class="price-card__top">
            ${isRecommended ? '<span class="price-card__tag">Рекомендуем</span>' : ""}
          </div>
          <h3>${esc(item.title)}</h3>
          <strong>${esc(item.price)}</strong>
          <p>${esc(item.note)}</p>
          <ul class="price-card__specs">${rows.map(([label, value]) => `<li><span>${esc(label)}</span><b>${esc(value)}</b></li>`).join("")}</ul>
          <div class="price-card__actions" aria-label="Действия для тарифа ${esc(item.title)}">
            <input class="price-card__toggle" type="checkbox" id="${attr(detailId)}">
            <label class="btn btn--secondary btn--small price-card__details" for="${attr(detailId)}">Подробнее</label>
            <a class="btn btn--primary btn--small price-card__choose" href="${attr(briefUrl({ tariff: item.title }))}">Выбрать тариф</a>
            <div class="price-card__more" aria-label="Подробности тарифа ${esc(item.title)}">
              <strong>Что входит</strong>
              <p>${esc(detailTextByTitle[item.title] || item.note)}</p>
              <ul>${(item.features || []).slice(0, 4).map((feature) => `<li>${esc(feature)}</li>`).join("")}</ul>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderFaq(category = "all") {
    const list = $("[data-faq-list]");
    if (!list) return;
    const items = DATA.FAQ_ITEMS.filter((item) => category === "all" || item.category === category);
    list.innerHTML = items.map((item, index) => `
      <article class="faq-item">
        <button class="faq-question" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
          <span>${index + 1}</span>${esc(item.question)}
        </button>
        <div class="faq-answer"><p>${esc(item.answer)}</p></div>
      </article>
    `).join("");

    $$(".faq-question", list).forEach((button) => {
      button.addEventListener("click", () => {
        button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true"));
      });
    });
  }

  function initFaq() {
    renderFaq();
    $$("[data-faq]").forEach((button) => {
      button.addEventListener("click", () => {
        $$("[data-faq]").forEach((item) => item.classList.toggle("is-active", item === button));
        renderFaq(button.dataset.faq);
      });
    });
  }

  function solutionPreview(solution, options = {}) {
    const type = solutionPreviewType(solution);
    const viewButton = options.card ? '<span class="solution-card__view" aria-hidden="true">Смотреть</span>' : "";
    if (solution.previewImage) {
      return `
        <div class="solution-preview solution-preview--image solution-preview--${esc(type)}">
          <img src="${attr(solution.previewImage)}" alt="Превью решения: ${attr(solution.title)}" loading="lazy">
          ${viewButton}
        </div>
      `;
    }
    return `
      <div class="solution-preview solution-preview--${esc(type)}">
        <div class="solution-preview__glow"></div>
        <div class="solution-preview__scene" aria-hidden="true">
          <div class="preview-window">
            <em></em><em></em><em></em>
            <div class="preview-line preview-line--wide"></div>
            <div class="preview-line"></div>
            <div class="preview-grid">
              <b></b><b></b><b></b>
            </div>
          </div>
          <div class="preview-side">
            <b></b><b></b><b></b>
          </div>
        </div>
        <strong>${esc(solution.title)}</strong>
        ${viewButton}
      </div>
    `;
  }

  function openSolutionModal(solution) {
    activeSolution = solution;
    const target = $("[data-solution-modal-content]");
    const features = solutionFeatures(solution);
    const price = solutionPrice(solution);
    const time = solutionTime(solution);
    const hasDemo = Boolean(solutionDemoUrl(solution));
    const gallery = solutionGallery(solution);
    const activeImage = gallery[0] || solution.previewImage || "";
    const category = solution.category || "Бизнес";
    const bestForMap = {
      "Товары": "магазинам, шоурумам и локальным брендам, которым нужно показать ассортимент и быстро принимать заявки.",
      "Услуги": "специалистам и сервисным компаниям, которым важно понятно описать услуги и получать обращения клиентов.",
      "Строительство": "бригадам и компаниям, которым нужно показать работы, доверие, этапы и заявку на расчёт.",
      "Медицина": "медицинским услугам и кабинетам, где важны аккуратная подача, доверие и запись на консультацию.",
      "Недвижимость": "аренде, объектам и локальным предложениям, где нужно показать условия, фото и форму бронирования.",
      "Доставка": "локальному бизнесу с доставкой, прайсом и быстрым заказом через форму.",
      "Индивидуально": "бизнесу с нестандартной задачей, где готовое решение нужно адаптировать под особый сценарий.",
    };
    const included = [...new Set([...features, "Адаптивная версия", "Форма для обращений", "Подготовка к запуску"])].slice(0, 7);
    const quality = ["Скорость 90+", "Готово к поиску", "Адаптивность", "Поддержка после запуска"];
    const launchSteps = ["Анкета", "Подготовка", "Согласование", "Запуск", "Поддержка"];
    target.innerHTML = `
      <div class="solution-modal solution-modal--premium template-detail">
        <section class="template-detail__hero" aria-label="Подробности сайта ${esc(solution.title)}">
          <div class="template-detail__visual">
            <div class="template-detail__eyebrow">Готовый сайт · ${esc(category)}</div>
            <section class="solution-gallery template-detail__gallery" aria-label="Галерея решения ${esc(solution.title)}">
              <div class="solution-gallery__stage template-detail__stage">
                ${activeImage ? `<img data-solution-gallery-main src="${attr(activeImage)}" alt="${attr(solution.title)} - экран сайта">` : `<div class="solution-gallery__empty">Preview готовится</div>`}
              </div>
              ${gallery.length > 1 ? `
                <div class="solution-gallery__thumbs template-detail__thumbs" role="list" aria-label="Экраны сайта">
                  ${gallery.map((image, index) => `
                    <button class="${index === 0 ? "is-active" : ""}" type="button" data-gallery-thumb data-gallery-image="${attr(image)}" aria-label="Показать экран ${index + 1}">
                      <img src="${attr(image)}" alt="" loading="lazy">
                    </button>
                  `).join("")}
                </div>
              ` : ""}
            </section>
          </div>

          <aside class="solution-detail template-detail__summary">
            <span class="solution-detail__tag">Сайт готов к адаптации</span>
            <h2 id="solution-title">${esc(solution.title)}</h2>
            <p class="solution-detail__description">${esc(solution.description)}</p>
            <div class="solution-detail__meta template-detail__meta">
              <article><span>Стоимость</span><strong>${esc(price)}</strong></article>
              <article><span>Запуск</span><strong>${esc(time)}</strong></article>
            </div>
            <div class="template-detail__fit">
              <h3>Кому подходит</h3>
              <p>${esc(bestForMap[category] || "малому бизнесу, которому нужен понятный сайт с формой заявки и подготовкой к запуску.")}</p>
            </div>
            <ul class="check-list solution-detail__features">${features.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
            <div class="solution-detail__actions template-detail__actions">
              <a class="btn btn--primary btn--full" href="${attr(briefUrl({ solution: solution.id }))}">Запустить этот сайт</a>
              ${hasDemo ? `<button class="btn btn--secondary btn--full" type="button" data-open-demo="${esc(solution.id)}">Смотреть демо</button>` : `<p class="template-detail__demo-note">Демо подберём после короткой анкеты.</p>`}
            </div>
          </aside>
        </section>

        <section class="template-detail__sections" aria-label="Состав и запуск сайта">
          <article class="template-detail__panel template-detail__panel--included">
            <span>Что входит</span>
            <h3>Основа для запуска сайта</h3>
            <ul class="check-list">${included.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          </article>
          <article class="template-detail__panel template-detail__panel--quality">
            <span>Паспорт качества</span>
            <h3>Проверяем перед запуском</h3>
            <div class="template-detail__quality-grid">
              ${quality.map((item) => `<b>${esc(item)}</b>`).join("")}
            </div>
          </article>
          <article class="template-detail__panel template-detail__panel--process">
            <span>Как запускаем</span>
            <h3>Понятный путь без лишней сложности</h3>
            <ol>
              ${launchSteps.map((item, index) => `<li><i>${index + 1}</i><strong>${esc(item)}</strong></li>`).join("")}
            </ol>
          </article>
        </section>
      </div>
    `;
    $$("[data-gallery-thumb]", target).forEach((button) => {
      button.addEventListener("click", () => {
        const image = button.dataset.galleryImage;
        const mainImage = $("[data-solution-gallery-main]", target);
        if (!image || !mainImage) return;
        mainImage.src = image;
        mainImage.alt = `${solution.title} - экран сайта`;
        $$("[data-gallery-thumb]", target).forEach((item) => item.classList.toggle("is-active", item === button));
      });
    });
    $("[data-open-demo]", target)?.addEventListener("click", () => openDemoModal(solution));
    setModal("solution", true);
  }

  function openDemoModal(solution) {
    const demoUrl = solutionDemoUrl(solution);
    if (!demoUrl) {
      closeModals();
      openLeadModal({ solution });
      return;
    }
    activeSolution = solution;
    const isExternalFrame = solution?.demoMode === "external-iframe";
    setDemoDialogMode(solution);
    const target = $("[data-demo-modal-content]");
    if (!target) return;
    const features = solutionFeatures(solution);
    const price = solutionPrice(solution);
    const time = solutionTime(solution);
    const originalDemoUrl = solutionOriginalDemoUrl(solution);
    target.innerHTML = `
      <div class="demo-modal ${isExternalFrame ? "demo-modal--external" : ""}">
        <div class="demo-modal__head">
          <div><h2 id="demo-title">${esc(isExternalFrame ? solution.title : `Демо: ${solution.title}`)}</h2><p>${isExternalFrame ? "Полный просмотр открывается отдельно." : "Локальная демо-страница открывается внутри WEB00 Pro."}</p></div>
          ${isExternalFrame ? "" : `<div class="segmented"><button class="is-active" type="button" data-demo-device="desktop">Desktop</button><button type="button" data-demo-device="mobile">Mobile</button></div>`}
          ${externalLink(originalDemoUrl, isExternalFrame ? "Открыть отдельно" : "Открыть оригинал")}
          <a class="btn btn--primary btn--small" href="${attr(briefUrl({ solution: solution.id }))}">Хочу такой сайт</a>
        </div>
        <div class="demo-layout">
          <aside>
            <h3>О сайте</h3>
            <p>${esc(solution.description)}</p>
            <ul class="check-list">${features.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
            <div class="mini-meta"><span>${esc(price)}</span><span>${esc(time)}</span></div>
          </aside>
          <div class="demo-frame ${demoUrl ? "demo-frame--live" : ""}" data-demo-frame>
            ${isExternalFrame ? `
              <div class="demo-frame__external-fallback" data-demo-external-fallback>
                <span>▤</span>
                <h3>Полный просмотр открывается отдельно</h3>
                <p>Откройте сайт в отдельном окне для полного просмотра.</p>
                ${externalLink(originalDemoUrl, "Открыть отдельно", "btn btn--primary btn--small")}
              </div>
            ` : demoUrl ? `
              <iframe data-demo-iframe src="${attr(demoUrl)}" title="Демо: ${attr(solution.title)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            ` : `
              <div class="demo-frame__fallback">
                <span>▤</span>
                <h3>Демо для этого решения готовится</h3>
                <p>Мы уже готовим внутреннюю демонстрационную страницу для этого решения.</p>
                ${externalLink(originalDemoUrl, "Открыть оригинал")}
              </div>
            `}
          </div>
          <aside>
            <h3>Что можно сделать на этом сайте</h3>
            <ul class="feature-list">
              <li>Просматривать структуру и дизайн</li>
              <li>Оценить функционал</li>
              <li>Проверить адаптацию</li>
              <li>Оставить заявку</li>
            </ul>
          </aside>
        </div>
      </div>
    `;
    $$("[data-demo-device]", target).forEach((button) => {
      button.addEventListener("click", () => {
        $$("[data-demo-device]", target).forEach((item) => item.classList.toggle("is-active", item === button));
        const frame = $("[data-demo-frame]", target);
        if (frame) frame.classList.toggle("is-mobile", button.dataset.demoDevice === "mobile");
      });
    });
    const iframe = $("[data-demo-iframe]", target);
    const externalFallback = $("[data-demo-external-fallback]", target);
    if (iframe && externalFallback) {
      iframe.addEventListener("load", () => {
        externalFallback.hidden = true;
      });
      iframe.addEventListener("error", () => {
        externalFallback.hidden = false;
      });
    }
    if (isExternalFrame) fitDemoDesktopCanvas(target);
    setModal("demo", true);
  }

  function leadAside(context) {
    const solution = context.solution;
    if (solution) {
      const features = solutionFeatures(solution);
      return `
        <aside class="lead-aside brief-summary">
          <span class="brief-summary__eyebrow">Выбранный сайт</span>
          ${solutionPreview(solution)}
          <h3>${esc(solution.title)}</h3>
          <p>${esc(solution.description)}</p>
          <div class="brief-summary__meta">
            <article><span>Запуск</span><strong>${esc(solutionTime(solution))}</strong></article>
            <article><span>Стоимость</span><strong>${esc(solutionPrice(solution))}</strong></article>
          </div>
          <ul class="check-list">${features.slice(0, 5).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          <div class="brief-summary__trust">
            <span>Демо до оплаты</span>
            <span>Форма для обращений</span>
            <span>Поддержка после запуска</span>
          </div>
        </aside>
      `;
    }
    const tariff = context.tariff;
    if (tariff) {
      const estimate = context.estimate || tariff.price || "";
      return `
        <aside class="lead-aside brief-summary">
          <span class="brief-summary__eyebrow">Выбранный тариф</span>
          <div class="service-selected"><span>WEB00</span><strong>${esc(tariff.title)}</strong></div>
          <p>${esc(tariff.note || "Тариф для запуска сайта с понятным объёмом работ и поддержкой после старта.")}</p>
          <div class="brief-summary__meta">
            <article><span>Стоимость</span><strong>${esc(estimate)}</strong></article>
            <article><span>Срок</span><strong>по тарифу</strong></article>
          </div>
          <ul class="check-list">${(tariff.features || []).slice(0, 5).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          <div class="brief-summary__trust">
            <span>Персональный менеджер</span>
            <span>Поддержка после запуска</span>
            <span>Правки и доработки</span>
            <span>Запуск и сопровождение</span>
          </div>
        </aside>
      `;
    }
    const service = context.service || "Сайт под ключ";
    const estimateMatch = service.match(/(\d[\d\s]*[–-]\d[\d\s]*\s*₽)/);
    const estimate = context.estimate || estimateMatch?.[1] || "";
    return `
      <aside class="lead-aside brief-summary">
        <span class="brief-summary__eyebrow">Контекст проекта</span>
        <div class="service-selected"><span>WEB00</span><strong>${esc(service)}</strong></div>
        ${estimate ? `<div class="brief-summary__estimate"><span>Ориентир</span><strong>${esc(estimate)}</strong></div>` : ""}
        <p>Опишите задачу, и мы предложим формат, срок и следующий шаг без лишней технической сложности.</p>
        <div class="brief-summary__meta">
          <article><span>Формат</span><strong>Подбор</strong></article>
          <article><span>Старт</span><strong>от 2 дней</strong></article>
        </div>
        <ul class="check-list"><li>Разбор задачи</li><li>Подбор формата сайта</li><li>Цена и срок</li><li>Демо до оплаты</li></ul>
        <div class="brief-summary__trust">
          <span>Без предоплаты</span>
          <span>Обращения в удобный канал</span>
          <span>Поддержка после запуска</span>
        </div>
      </aside>
    `;
  }

  function openLeadModal(context = {}) {
    const solution = context.solution || null;
    activeSolution = solution || activeSolution;
    activeService = context.service || (solution ? "Готовое решение" : "Сайт под ключ");
    renderLeadForm({ solution, service: activeService, tariff: context.tariff || null, estimate: context.estimate || "", mode: "modal", errors: null });
    setModal("lead", true);
  }

  function leadTarget(context = {}) {
    if (context.mode === "page") return $("[data-brief-page-content]");
    return $("[data-lead-modal-content]");
  }

  function renderLeadForm(context) {
    const target = leadTarget(context);
    if (!target) return;
    const isPageMode = context.mode === "page";
    const hasErrors = Boolean(context.errors);
    const rawTaskValue = context.solution
      ? "Запуск готового сайта"
      : context.tariff
        ? "Запуск готового сайта"
        : context.service || "Сайт под заказ";
    const taskValue = rawTaskValue.includes("Доработ")
      ? "Доработка сайта"
      : rawTaskValue.includes("Автомат") || rawTaskValue.includes("бот")
        ? "Автоматизация заявок"
        : rawTaskValue.includes("Поддерж")
          ? "Поддержка после запуска"
          : context.solution
            ? "Запуск готового сайта"
            : "Сайт под заказ";
    const introComment = context.solution
      ? `Интересует решение: ${context.solution.title}`
      : context.tariff
        ? `Интересует тариф: ${context.tariff.title}`
        : "";
    const selectedSiteLabel = context.solution?.title || context.service || "Подберём по анкете";
    const selectedTariffLabel = context.tariff?.title || (context.solution ? "Подберём после анкеты" : "Не выбран");
    const selectedPriceLabel = context.tariff?.price || (context.solution ? solutionPrice(context.solution) : context.estimate || "после анкеты");
    const selectedLaunchLabel = context.solution ? solutionTime(context.solution) : "после проверки анкеты";
    target.innerHTML = `
      <div class="${isPageMode ? "brief-page-ui" : "lead-modal"} brief-modal ${hasErrors ? "has-errors" : ""}">
        <form class="lead-form-ui brief-form" data-lead-form novalidate>
          ${isPageMode ? "" : `<div class="brief-modal__header">
            <span class="brief-kicker">WEB00 · анкета</span>
            <h2 id="lead-title">Анкета на запуск сайта</h2>
            <p>Ответьте на несколько вопросов — мы подготовим сайт под ваш бизнес и покажем результат перед запуском.</p>
          </div>
          <div class="brief-stepper" aria-label="Этапы анкеты">
            <span><b>1</b> Выбор</span>
            <span><b>2</b> О бизнесе</span>
            <span><b>3</b> Материалы</span>
            <span><b>4</b> Проверка</span>
          </div>`}
          ${hasErrors ? '<div class="alert alert--error">Пожалуйста, заполните обязательные поля</div>' : ""}

          <section class="brief-section">
            <div class="brief-section__head"><span>01</span><h3>Выбор сайта и тарифа</h3></div>
            <div class="brief-context-grid" aria-label="Выбранный формат">
              <article><span>Сайт</span><strong>${esc(selectedSiteLabel)}</strong></article>
              <article><span>Тариф</span><strong>${esc(selectedTariffLabel)}</strong></article>
              <article><span>Стоимость</span><strong>${esc(selectedPriceLabel)}</strong></article>
              <article><span>Срок запуска</span><strong>${esc(selectedLaunchLabel)}</strong></article>
            </div>
            <div class="brief-grid">
              <label><span class="field-label">Цель сайта</span><select name="siteGoal">
                <option>Получать обращения клиентов</option>
                <option>Показать услуги и доверие</option>
                <option>Продавать товары</option>
                <option>Запустить страницу под рекламу</option>
                <option>Пока не знаю, нужна помощь с выбором</option>
              </select></label>
              <label><span class="field-label">Тип задачи <b>*</b></span><select name="taskType" required>
                <option ${taskValue === "Запуск готового сайта" ? "selected" : ""}>Запуск готового сайта</option>
                <option ${taskValue === "Сайт под заказ" || taskValue === "Сайт под ключ" ? "selected" : ""}>Индивидуальный сайт</option>
                <option ${taskValue.includes("Доработ") ? "selected" : ""}>Доработка сайта</option>
                <option ${taskValue.includes("Автомат") || taskValue.includes("бот") ? "selected" : ""}>Приём обращений</option>
                <option ${taskValue.includes("Поддерж") ? "selected" : ""}>Поддержка после запуска</option>
              </select></label>
              <label><span class="field-label">Бюджет <b>*</b></span><select name="budget" required><option>Пока не знаю</option><option>до 39 000 ₽</option><option>39 000-69 000 ₽</option><option>69 000-99 000 ₽</option><option>от 99 000 ₽</option></select></label>
            </div>
          </section>

          <section class="brief-section">
            <div class="brief-section__head"><span>02</span><h3>О бизнесе</h3></div>
            <div class="brief-grid">
              <label><span class="field-label">Ваше имя <b>*</b></span><input name="name" type="text" placeholder="Иван" autocomplete="name" required></label>
              <label><span class="field-label">Контакт для связи <b>*</b></span><input name="contact" type="text" placeholder="+7, Telegram или Email" autocomplete="tel" required></label>
              <label><span class="field-label">Ниша / сфера деятельности <b>*</b></span><select name="industry" required>
                <option value="">Выберите сферу</option>
                <option>Товары / интернет-магазин</option>
                <option>Услуги</option>
                <option>Строительство / ремонт</option>
                <option>Медицина / здоровье</option>
                <option>Недвижимость</option>
                <option>Доставка / локальный бизнес</option>
                <option>Индивидуальный проект</option>
                <option>Другое</option>
              </select></label>
              <label><span class="field-label">Название бизнеса / проекта</span><input name="businessName" type="text" placeholder="Название компании или проекта"></label>
            </div>
            <label><span class="field-label">Чем занимаетесь?</span><textarea name="offerDescription" rows="4" maxlength="800" placeholder="Коротко опишите услуги, товары, географию и особенности бизнеса"></textarea></label>
          </section>

          <section class="brief-section">
            <div class="brief-section__head"><span>03</span><h3>Материалы</h3></div>
            <div class="brief-upload-grid" aria-label="Материалы для будущей передачи">
              <div class="brief-upload-placeholder"><strong>Логотип</strong><span>Файлы можно будет передать команде после отправки анкеты.</span></div>
              <div class="brief-upload-placeholder"><strong>Фото / изображения</strong><span>Фото, тексты и материалы можно будет передать после проверки анкеты.</span></div>
            </div>
            <div class="brief-grid">
              <label><span class="field-label">Стиль и настроение сайта</span><input name="styleMood" type="text" placeholder="Например: спокойный, премиальный, строгий"></label>
              <label><span class="field-label">Примеры сайтов, которые нравятся</span><input name="references" type="text" placeholder="Ссылки или названия сайтов"></label>
            </div>
            <label><span class="field-label">Комментарий</span><textarea name="comment" rows="5" maxlength="700" placeholder="Опишите пожелания, сроки, важные детали">${introComment}</textarea></label>
          </section>

          <section class="brief-section">
            <div class="brief-section__head"><span>04</span><h3>Проверка и отправка</h3></div>
            <div class="brief-grid brief-grid--compact">
              <fieldset class="brief-choice-group">
                <legend>Нужен ли домен?</legend>
                <label><input type="radio" name="domainNeeded" value="Да"> <span>Да</span></label>
                <label><input type="radio" name="domainNeeded" value="Нет"> <span>Нет</span></label>
                <label><input type="radio" name="domainNeeded" value="Не знаю" checked> <span>Не знаю</span></label>
              </fieldset>
              <fieldset class="brief-choice-group">
                <legend>Нужен ли блог / статьи?</legend>
                <label><input type="radio" name="blogNeeded" value="Да"> <span>Да</span></label>
                <label><input type="radio" name="blogNeeded" value="Нет"> <span>Нет</span></label>
                <label><input type="radio" name="blogNeeded" value="Позже" checked> <span>Позже</span></label>
              </fieldset>
            </div>
            <fieldset class="brief-choice-group brief-choice-group--wide">
              <legend>Куда должны приходить обращения?</legend>
              <label><input type="checkbox" name="leadChannels" value="Telegram" checked> <span>Telegram</span></label>
              <label><input type="checkbox" name="leadChannels" value="Email"> <span>Email</span></label>
              <label><input type="checkbox" name="leadChannels" value="WhatsApp"> <span>WhatsApp</span></label>
              <label><input type="checkbox" name="leadChannels" value="Таблица"> <span>Таблица</span></label>
            </fieldset>
            <div class="brief-review-note">
              <strong>Перед отправкой</strong>
              <span>Проверьте контакт, цель сайта и материалы. Если чего-то не хватает, команда WEB00 уточнит детали отдельно.</span>
            </div>
          </section>

          <label class="checkbox-row brief-consent"><input name="consent" type="checkbox" required> <span class="field-label">Согласие на обработку данных <b>*</b></span></label>
          <div class="brief-actions">
            <button class="btn btn--primary btn--full" type="submit">Отправить анкету</button>
            ${isPageMode ? '<a class="btn btn--secondary btn--full" href="solutions.html">Вернуться к выбору</a>' : '<button class="btn btn--secondary btn--full" type="button" data-close-modal>Вернуться к выбору</button>'}
          </div>
          <small>Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности. Файлы сейчас не загружаются: их можно будет передать команде WEB00 после проверки анкеты.</small>
        </form>
        ${leadAside(context)}
      </div>
    `;

    const form = $("[data-lead-form]", target);
    if (hasErrors) markLeadErrors(form, context.errors);
    bindLeadErrorCleanup(form);
    form.addEventListener("submit", (event) => submitLeadForm(event, context));
  }

  function markLeadErrors(form, errors) {
    Object.keys(errors || {}).forEach((name) => {
      const field = form.elements[name];
      if (field) field.classList.add("is-invalid");
      const hint = document.createElement("small");
      hint.className = "field-error";
      hint.textContent = errors[name];
      if (field && field.closest("label")) field.closest("label").appendChild(hint);
    });
  }

  function clearLeadError(form, name) {
    const field = form.elements[name];
    if (!field) return;
    field.classList.remove("is-invalid");
    field.closest("label")?.querySelector(".field-error")?.remove();
    if (!$(".field-error", form)) {
      $(".alert--error", form)?.remove();
      form.closest(".lead-modal")?.classList.remove("has-errors");
    }
  }

  function bindLeadErrorCleanup(form) {
    ["name", "contact", "industry", "taskType", "budget", "consent"].forEach((name) => {
      const field = form.elements[name];
      if (!field) return;
      const eventName = field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input";
      field.addEventListener(eventName, () => {
        if (name === "consent") {
          if (field.checked) clearLeadError(form, name);
          return;
        }
        if (String(field.value || "").trim()) clearLeadError(form, name);
      });
    });
  }

  function submitLeadForm(event, context) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const errors = {};
    if (!data.name?.trim()) errors.name = "Заполните имя";
    if (!data.contact?.trim()) errors.contact = "Укажите контакт";
    if (!data.industry?.trim()) errors.industry = "Выберите сферу";
    if (!data.taskType?.trim()) errors.taskType = "Выберите тип задачи";
    if (!form.elements.consent.checked) errors.consent = "Необходимо согласие";

    if (Object.keys(errors).length) {
      renderLeadForm({ ...context, errors });
      return;
    }

    try {
      const lead = DATA.createLead({
        name: data.name.trim(),
        contact: data.contact.trim(),
        taskType: data.taskType,
        siteGoal: data.siteGoal || "",
        budget: data.budget,
        industry: data.industry,
        businessName: data.businessName?.trim() || "",
        offerDescription: data.offerDescription?.trim() || "",
        styleMood: data.styleMood?.trim() || "",
        references: data.references?.trim() || "",
        domainNeeded: data.domainNeeded || "Не знаю",
        leadChannels: formData.getAll("leadChannels"),
        blogNeeded: data.blogNeeded || "Позже",
        comment: data.comment?.trim() || "",
        solution: context.solution?.title || context.tariff?.title || context.service || data.taskType,
        selectedSolutionId: context.solution?.id || "",
        selectedTariff: context.tariff?.title || "",
        tariff: context.tariff?.title || "",
        requestContext: context.estimate
          ? `${context.service || context.tariff?.title || data.taskType}: ${context.estimate}`
          : context.service || (context.solution ? "Готовый сайт" : context.tariff ? `Тариф ${context.tariff.title}` : data.taskType),
      });
      renderLeadSuccess(lead, context);
    } catch (error) {
      renderLeadFallback(context);
    }
  }

  function renderLeadSuccess(lead, context) {
    const target = leadTarget(context);
    if (!target) return;
    const isPageMode = context.mode === "page";
    target.innerHTML = `
      <div class="success-state ${isPageMode ? "brief-page-success" : ""}">
        <div class="success-icon">✓</div>
        <h2>Анкета отправлена</h2>
        <p>Мы получили данные проекта. Проверим анкету и сообщим, если нужны уточнения.</p>
        <div class="success-box success-box--lead">
          <span>Номер проекта</span>
          <strong class="lead-number">${esc(lead.id)}</strong>
          <span class="success-badge">Анкета получена</span>
          <span>Выбранный сайт: ${esc(normalizeSolutionTitle(lead.solution || context.solution?.title || context.service || "WEB00 проект"))}</span>
          <span>Сфера: ${esc(lead.industry || "Будет уточнена")}</span>
          <span>Способ связи: ${esc(lead.contact)}</span>
        </div>
        <div class="success-next">
          <span>1</span><p>Проверим данные</p>
          <span>2</span><p>Уточним материалы</p>
          <span>3</span><p>Подготовим сайт под задачу</p>
          <span>4</span><p>Покажем результат перед запуском</p>
        </div>
        <div class="modal-actions">
          <a class="btn btn--primary" href="status.html?id=${encodeURIComponent(lead.id)}">Проверить статус</a>
          ${isPageMode ? '<a class="btn btn--secondary" href="solutions.html">Вернуться к каталогу</a>' : '<button class="btn btn--secondary" type="button" data-close-modal>Вернуться к каталогу</button>'}
        </div>
      </div>
    `;
    $("[data-close-modal]", target)?.addEventListener("click", closeModals);
  }

  function renderLeadFallback(context) {
    const target = leadTarget(context);
    if (!target) return;
    target.innerHTML = `
      <div class="fallback-state">
        <div class="warning-icon">!</div>
        <h2>Не получилось отправить анкету</h2>
        <p>Проверьте данные и попробуйте ещё раз. Если проблема повторится, напишите нам в Telegram.</p>
        <div class="success-box"><span>Выбранный сайт</span><strong>${esc(context.solution?.title || context.service || "Проект WEB00")}</strong></div>
        <a class="btn btn--primary btn--full" href="${attr(DATA.CONTACTS?.telegram?.href || "https://t.me/GarantiyWeb00bot")}" target="_blank" rel="noopener">Открыть Telegram</a>
        <button class="btn btn--secondary btn--full" type="button" onclick="location.reload()">Попробовать ещё раз</button>
      </div>
    `;
  }

  function openBugModal() {
    bugAttachment = null;
    renderBugForm({ formStartTime: Date.now() });
    setModal("bug", true);
  }

  function renderBugForm(context = {}) {
    const target = $("[data-bug-modal-content]");
    if (!target) return;
    const formStartTime = context.formStartTime || Date.now();
    target.innerHTML = `
      <div class="bug-modal">
        <form data-bug-form novalidate>
          <h2 id="bug-title">Сообщить об ошибке</h2>
          <p>Опишите, что пошло не так. Это поможет быстрее исправить проблему.</p>
          <div class="bug-form-body">
            <p>Если можете, приложите скриншот: нажмите Print Screen и вставьте изображение в поле через Ctrl+V.</p>
            <input class="form-honeypot" name="companySite" type="text" autocomplete="off" tabindex="-1" aria-hidden="true">
            <input name="formStartTime" type="hidden" value="${String(formStartTime)}">
            <label><span class="field-label">Где ошибка? <b>*</b></span><input name="place" type="text" placeholder="Страница, раздел или действие" required></label>
            <label><span class="field-label">Что произошло? <b>*</b></span><textarea name="what" rows="3" placeholder="Опишите проблему" required></textarea></label>
            <label><span class="field-label">Что вы делали перед ошибкой? <b>*</b></span><textarea name="before" rows="2" placeholder="Какие действия были перед проблемой" required></textarea></label>
            <label><span class="field-label">Контакт для связи</span><input name="contact" type="text" placeholder="Telegram, телефон или email"></label>
            <label class="upload-zone" data-upload-zone>
              <span class="field-label">Скриншот / файл</span>
              <input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp">
              <span>Перетащите файл сюда или нажмите для выбора<br><small>PNG, JPG, JPEG, WEBP до 10 МБ</small></span>
            </label>
            <p class="attachment-info" data-attachment-info></p>
          </div>
          <div class="modal-actions bug-form-footer"><button class="btn btn--primary" type="submit">Отправить сообщение</button><button class="btn btn--secondary" type="button" data-close-modal>Отмена</button></div>
        </form>
        <aside class="bug-help">
          <h3>Как правильно сообщить об ошибке</h3>
          <p><strong>Будьте точны</strong><br>Укажите страницу и действия.</p>
          <p><strong>Опишите проблему</strong><br>Расскажите, что произошло.</p>
          <p><strong>Прикрепите скриншот</strong><br>Он помогает быстрее понять проблему.</p>
        </aside>
      </div>
    `;
    const form = $("[data-bug-form]", target);
    if (!form) return;
    const fileInput = form.elements.screenshot;
    const info = $("[data-attachment-info]", form);
    fileInput?.addEventListener("change", () => setBugAttachment(fileInput.files[0], info));
    form.addEventListener("paste", (event) => {
      const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith("image/"));
      if (file) setBugAttachment(file, info);
    });
    const zone = $("[data-upload-zone]", form);
    if (zone) {
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("is-dragover");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-dragover");
        setBugAttachment(event.dataTransfer.files[0], info);
      });
    }
    bindBugErrorCleanup(form);
    form.addEventListener("submit", submitBugReport);
    $("[data-close-modal]", target)?.addEventListener("click", closeModals);
  }

  function setBugAttachment(file, info) {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      if (info) {
        info.textContent = "Можно приложить PNG, JPG, JPEG или WEBP.";
        info.classList.add("is-error");
      }
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      if (info) {
        info.textContent = "Файл больше 10 МБ. Выберите файл меньшего размера.";
        info.classList.add("is-error");
      }
      return;
    }
    bugAttachment = file;
    if (info) {
      info.textContent = `Прикреплён файл: ${file.name}`;
      info.classList.remove("is-error");
    }
  }

  function submitBugReport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.companySite) return;
    const errors = [];
    if (!data.place?.trim()) errors.push("Укажите, где ошибка");
    if (!data.what?.trim()) errors.push("Опишите, что произошло");
    if (!data.before?.trim()) errors.push("Укажите, что вы делали перед ошибкой");
    if (errors.length) {
      ["place", "what", "before"].forEach((name) => {
        if (!data[name]?.trim()) form.elements[name].classList.add("is-invalid");
      });
      $(".attachment-info", form).textContent = errors.join(". ");
      $(".attachment-info", form).classList.add("is-error");
      return;
    }
    try {
      const report = (DATA.createErrorReport || DATA.createBugReport)({
        place: data.place.trim(),
        what: data.what.trim(),
        before: data.before.trim(),
        contact: data.contact?.trim() || "",
        fileName: bugAttachment?.name || "",
        formStartTime: data.formStartTime || "",
      });
      renderBugSuccess(report);
    } catch (error) {
      renderBugFallback();
    }
  }

  function renderBugSuccess(report) {
    const target = $("[data-bug-modal-content]");
    if (!target) return;
    target.innerHTML = `
      <div class="success-state">
        <div class="success-icon">✓</div>
        <h2>Сообщение отправлено</h2>
        <p>Мы проверим проблему и свяжемся с вами, если нужны детали.</p>
        <div class="success-box"><span>Номер обращения</span><strong class="lead-number">${esc(report.id)}</strong><span>${report.fileName ? `Скриншот: ${esc(report.fileName)}` : "Скриншот не прикреплён"}</span></div>
        <div class="modal-actions"><button class="btn btn--primary" type="button" data-close-modal>Вернуться на сайт</button><a class="btn btn--secondary" href="contacts.html">Написать в поддержку</a></div>
      </div>
    `;
    $("[data-close-modal]", target)?.addEventListener("click", closeModals);
  }

  function renderBugFallback() {
    const target = $("[data-bug-modal-content]");
    if (!target) return;
    target.innerHTML = `
      <div class="success-state">
        <div class="success-icon">!</div>
        <h2>Не удалось отправить сообщение автоматически</h2>
        <p>Попробуйте ещё раз или напишите в поддержку.</p>
        <div class="modal-actions"><button class="btn btn--primary" type="button" data-open-bug>Попробовать ещё раз</button><a class="btn btn--secondary" href="contacts.html">Написать в поддержку</a></div>
      </div>
    `;
    $("[data-open-bug]", target)?.addEventListener("click", openBugModal);
  }

  function bindBugErrorCleanup(form) {
    ["place", "what", "before"].forEach((name) => {
      const field = form.elements[name];
      if (!field) return;
      field.addEventListener("input", () => {
        if (!field.value.trim()) return;
        field.classList.remove("is-invalid");
        if (![form.elements.place, form.elements.what, form.elements.before].some((item) => item.classList.contains("is-invalid"))) {
          const info = $(".attachment-info", form);
          info.classList.remove("is-error");
          info.textContent = bugAttachment ? `Прикреплён файл: ${bugAttachment.name}` : "";
        }
      });
    });
  }

  function initCalculator() {
    const form = $("#price-calculator");
    if (!form) return;
    const result = $("[data-calc-result]");

    function calculate() {
      const data = new FormData(form);
      const type = data.get("projectType");
      const pages = Number(data.get("pages") || "1");
      let base = { site: 18000, landing: 12000, shop: 15000, bot: 3000 }[type] || 12000;
      base += Math.max(0, pages - 1) * 1800;
      base += data.getAll("integrations").length * 2500;
      if (data.get("botLevel") === "simple") base += 3000;
      if (data.get("botLevel") === "advanced") base += 9000;
      if (data.get("support") === "1") base += 500;
      if (data.get("support") === "3") base += 1500;
      if (data.get("urgency") === "fast") base *= 1.25;
      if (data.get("design") === "standard") base *= 1.15;
      if (data.get("design") === "premium") base *= 1.35;
      const min = Math.round(base / 1000) * 1000;
      const max = min + Math.max(7000, Math.round(min * 0.28 / 1000) * 1000);
      const days = Math.max(2, Math.ceil(pages / 2) + data.getAll("integrations").length + (type === "bot" ? 1 : 4));
      result.innerHTML = `
        <h3>Предварительная оценка</h3>
        <p>Стоимость проекта <span>ориентировочно</span></p>
        <strong>от ${min.toLocaleString("ru-RU")} ₽ до ${max.toLocaleString("ru-RU")} ₽</strong>
        <p>Срок запуска: от ${days} до ${days + 5} рабочих дней</p>
        <ul><li>Проектирование и структура</li><li>Адаптивная вёрстка</li><li>Форма для обращений</li><li>Подготовка к продвижению</li></ul>
        <small>Расчёт не является юридическим предложением. Итог фиксируется после обсуждения.</small>
      `;
      return { min, max, days };
    }

    form.addEventListener("change", calculate);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const calc = calculate();
      openLeadModal({ service: `Расчёт калькулятора: ${calc.min.toLocaleString("ru-RU")}–${calc.max.toLocaleString("ru-RU")} ₽` });
    });
    calculate();
  }

  function initStatusLookup() {
    $$("[data-status-lookup]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const leadId = String(data.leadId || "").trim();
        const isDirectLookup = form.getAttribute("data-status-lookup") === "direct";
        if (!leadId) {
          const message = $("[data-status-message]", form.closest(".status-lookup") || form.closest(".status-lookup-card") || document);
          if (message) {
            message.textContent = "Введите номер проекта.";
            message.classList.add("is-error");
          }
          return;
        }
        const lead = DATA.getLeadStatus(leadId);
        if (lead) {
          window.location.href = `status.html?id=${encodeURIComponent(lead.id)}`;
          return;
        }
        if (isDirectLookup) {
          window.location.href = `status.html?id=${encodeURIComponent(leadId)}`;
          return;
        }
        const message = $("[data-status-message]", form.closest(".status-lookup") || form.closest(".status-lookup-card") || document);
        if (message) {
          message.textContent = "Проект не найден. Проверьте номер или свяжитесь с поддержкой.";
          message.classList.add("is-error");
        } else {
          window.location.href = `status.html?id=${encodeURIComponent(data.leadId || "")}&notFound=1`;
        }
      });
    });
  }

  function readBriefDraftContext() {
    try {
      return JSON.parse(sessionStorage.getItem("WEB00_BRIEF_CONTEXT") || "{}");
    } catch (error) {
      return {};
    }
  }

  function initBriefPage() {
    const root = $("[data-brief-page-content]");
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const draft = readBriefDraftContext();
    const solution = solutionByIdStrict(params.get("solution") || draft.solutionId);
    const tariff = pricingByTitle(params.get("tariff") || draft.tariff);
    const service = params.get("service") || draft.service || (tariff ? `Тариф ${tariff.title}` : "");
    const estimate = params.get("estimate") || draft.estimate || "";
    const backLink = $("[data-brief-back]");
    if (backLink) {
      if (solution) {
        backLink.href = "solutions.html";
        backLink.textContent = "Назад к каталогу";
      } else if (tariff) {
        backLink.href = "pricing.html";
        backLink.textContent = "Назад к тарифам";
      }
    }
    renderLeadForm({
      mode: "page",
      solution,
      tariff,
      service: service || (solution ? "Готовое решение" : "Сайт под заказ"),
      estimate,
      errors: null,
    });
  }

  function initMessageForm() {
    const form = $("[data-message-form]");
    if (!form) return;
    const startedAt = Date.now();
    const startField = form.elements.formStartTime;
    if (startField) startField.value = String(startedAt);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const messageBox = $("[data-message-result]", form) || $(".form-message", form);
      if (data.companySite) return;
      const errors = [];
      ["name", "contact", "topic", "message"].forEach((name) => {
        const field = form.elements[name];
        if (field && !String(data[name] || "").trim()) {
          field.classList.add("is-invalid");
          errors.push(name);
        }
      });
      if (form.elements.consent && !form.elements.consent.checked) {
        form.elements.consent.classList.add("is-invalid");
        errors.push("consent");
      }
      if (errors.length) {
        if (messageBox) {
          messageBox.textContent = "Заполните обязательные поля и подтвердите согласие.";
          messageBox.classList.add("is-error");
        }
        return;
      }
      try {
        const message = DATA.createSupportMessage({
          name: data.name.trim(),
          contact: data.contact.trim(),
          topic: data.topic,
          message: data.message.trim(),
          formStartTime: data.formStartTime || "",
        });
        form.reset();
        if (form.elements.formStartTime) form.elements.formStartTime.value = String(Date.now());
        if (messageBox) {
          messageBox.textContent = `Сообщение отправлено. Номер обращения: ${message.id}. Мы ответим в выбранный канал связи.`;
          messageBox.classList.remove("is-error");
          messageBox.classList.add("is-success");
        }
      } catch (error) {
        if (messageBox) {
          messageBox.textContent = "Не удалось отправить сообщение автоматически. Попробуйте ещё раз или напишите в поддержку.";
          messageBox.classList.add("is-error");
        }
      }
    });
    form.addEventListener("input", (event) => {
      event.target.classList?.remove("is-invalid");
      const messageBox = $("[data-message-result]", form) || $(".form-message", form);
      messageBox?.classList.remove("is-error");
    });
  }

  function statusSteps(active) {
    const labels = [
      ["Анкета получена", "Данные проекта сохранены"],
      ["Проверяем материалы", "Контент и пожелания"],
      ["Сайт настраивается", "Структура и сборка"],
      ["Проверка качества", "Адаптив и формы"],
      ["Ожидает согласования", "Комментарии клиента"],
      ["Готов к запуску", "Финальная проверка"],
      ["Сайт запущен", "Публикация"],
      ["Поддержка после запуска", "Сопровождение"],
    ];
    const current = Math.max(1, Math.min(Number(active) || 1, labels.length));
    return labels.map(([label, note], index) => {
      const step = index + 1;
      const className = step < current ? "is-done" : step === current ? "is-active" : "";
      return `<li class="${className}"><span>${step}</span><strong>${label}</strong><small>${note}</small></li>`;
    }).join("");
  }

  function statusStage(statusKey, status) {
    const map = {
      new: 1,
      clarification_needed: 2,
      proposal_ready: 5,
      waiting_client_confirmation: 5,
      in_progress: 3,
      revision_in_progress: 5,
      demo_ready: 4,
      delayed: 2,
      ready_to_launch: 6,
      launched: 7,
      completed: 8,
    };
    return map[statusKey] || Math.max(1, Math.min(Number(status?.progress) || 1, 8));
  }

  function formatStatusDate(value) {
    if (!value) return "Уточняется";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Уточняется";
    return date.toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function statusLeadSolution(lead) {
    if (!lead) return null;
    if (lead.selectedSolutionId) {
      const byId = DATA.SOLUTIONS.find((item) => item.id === lead.selectedSolutionId);
      if (byId) return byId;
    }
    const title = normalizeSolutionTitle(lead.solution || "");
    return DATA.SOLUTIONS.find((item) => item.title === title || item.legacyTitle === title || item.id === title) || null;
  }

  function statusDisplayValue(value, fallback = "Уточняется") {
    if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function statusFact(label, value, fallback = "Уточняется") {
    return `<article><span>${esc(label)}</span><strong>${esc(statusDisplayValue(value, fallback))}</strong></article>`;
  }

  function statusCompactDate(value) {
    if (!value) return "Уточняется";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Уточняется";
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  }

  function statusEstimate(lead) {
    const source = [lead?.requestContext, lead?.solution, lead?.budget].filter(Boolean).join(" ");
    const match = source.match(/(\d[\d\s]*[–-]\d[\d\s]*\s*₽|от\s*\d[\d\s]*\s*₽)/i);
    return match ? match[1] : "";
  }

  function renderStatusLookup(root) {
    root.innerHTML = `
      <section class="status-lookup-page">
        <div class="status-lookup-card">
          <p class="status-kicker"><span></span>WEB00 · статус проекта</p>
          <h1>Статус проекта</h1>
          <p>Введите номер проекта, чтобы открыть текущий статус и следующий шаг по запуску сайта.</p>
          <form data-status-lookup="direct">
            <label>
              <span>Номер проекта</span>
              <input name="leadId" type="text" placeholder="WEB00-2026-0001" autocomplete="off">
            </label>
            <button class="btn btn--primary" type="submit">Открыть статус</button>
          </form>
          <p class="status-form-message" data-status-message></p>
          <div class="status-lookup-actions">
            <a class="btn btn--secondary" href="solutions.html">Вернуться в каталог</a>
            <a class="btn btn--secondary" href="brief.html">Заполнить анкету</a>
          </div>
        </div>
      </section>
    `;
  }

  function renderStatusPage() {
    const root = $("#status-app");
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      renderStatusLookup(root);
      initStatusLookup();
      return;
    }
    const state = params.get("state");
    const lead = DATA.getLeadStatus(id);
    if (!lead) {
      renderStatusNotFound(root, id);
      return;
    }
    const statusKey = state && DATA.LEAD_STATUSES[state] ? state : lead.status || "new";
    const status = DATA.LEAD_STATUSES[statusKey] || DATA.LEAD_STATUSES.new;
    const solution = statusLeadSolution(lead);
    const selectedTitle = solution?.title || normalizeSolutionTitle(lead.solution || lead.requestContext || lead.taskType || "WEB00 проект");
    const estimate = statusEstimate(lead);
    const stage = statusStage(statusKey, status);
    const launchValue = solution ? solutionTime(solution) : lead.launchEstimate || "от 2 дней";
    const priceValue = estimate || (solution ? solutionPrice(solution) : lead.budget);
    const channels = statusDisplayValue(lead.leadChannels, "Telegram / удобный канал");
    const tariffValue = statusDisplayValue(lead.tariff || lead.service || lead.taskType, solution ? "Готовый сайт" : "По задаче");
    const passportItems = [
      statusFact("Формат", tariffValue),
      statusFact("Стоимость", priceValue),
      statusFact("Срок запуска", launchValue),
      statusFact("Ниша / сфера", lead.industry),
      statusFact("Страницы", solution?.features?.length ? `до ${Math.max(5, solution.features.length + 4)}` : "по задаче"),
      statusFact("Язык сайта", "русский"),
      statusFact("Интеграции", channels),
      statusFact("Домен", lead.domainNeeded),
    ].join("");
    const summaryItems = [
      statusFact("Статус проекта", status.label),
      statusFact("Дата анкеты", statusCompactDate(lead.createdAt)),
      statusFact("Контакт", lead.contact),
      statusFact("Бизнес", lead.businessName || lead.name),
    ].join("");
    const includedItems = [
      ...(solution?.features || []),
      "Адаптивная вёрстка",
      "Форма для обращений",
      "Подготовка к продвижению",
      "Техническая поддержка после запуска",
    ].slice(0, 7);
    const integrationItems = [
      ["Форма обратной связи", "Подключается"],
      [channels, "По анкете"],
      ["Почта для обращений", lead.contact ? "Уточняется" : "Ожидает"],
    ];
    const supportItems = [
      ["Техническая поддержка", "Включено"],
      ["Помощь после запуска", "Включено"],
      ["Правки и уточнения", "По задаче"],
      ["Консультация", "Доступна"],
    ];
    const historyItems = [
      ["Анкета отправлена", formatStatusDate(lead.createdAt)],
      ["Проект зарегистрирован", `Номер ${lead.id}`],
      ["Текущий статус обновлён", status.update],
    ];
    const notificationItems = [
      ["Данные проекта сохранены", formatStatusDate(lead.createdAt)],
      ["Следующий шаг определён", status.clientAction],
      ["Канал связи указан", statusDisplayValue(lead.contact, "Уточняется")],
    ];
    const projectFacts = [
      statusFact("Номер", lead.id),
      statusFact("Клиент", lead.name),
      statusFact("Домен", lead.domainNeeded),
      statusFact("Блог / статьи", lead.blogNeeded),
    ].join("");
    const description = lead.offerDescription || lead.comment || status.clientAction;
    root.innerHTML = `
      <section class="status-hero status-hero--cabinet">
        <div>
          <p class="status-kicker"><span></span>WEB00 · статус проекта</p>
          <h1>Статус проекта</h1>
          <p>Следите за статусом проекта, данными анкеты и следующим шагом по запуску сайта.</p>
        </div>
        <a class="btn btn--secondary" href="cabinet.html?id=${encodeURIComponent(lead.id)}">Открыть Мой проект</a>
      </section>

      <div class="status-dashboard" aria-label="Кабинет проекта">
        <section class="status-dashboard-grid">
          <article class="status-project-card status-card">
            <div class="status-project-card__preview">
              ${solution ? solutionPreview(solution) : `<div class="status-service-preview"><strong>WEB00</strong><span>${esc(selectedTitle)}</span></div>`}
            </div>
            <div class="status-project-card__body">
              <span class="status-card-label">Текущий проект</span>
              <h2>${esc(selectedTitle)}</h2>
              <div class="status-project-meta">
                <span>${esc(tariffValue)}</span>
                <strong class="status-badge status-badge--${esc(status.badge)}">${esc(status.label)}</strong>
              </div>
              <div class="status-summary-grid status-summary-grid--compact">${summaryItems}</div>
            </div>
          </article>

          <aside class="status-action-card status-card">
            <span class="status-card-label">Следующее действие</span>
            <h3>${statusKey === "new" ? "Ожидайте связи" : esc(status.action || "Уточнить детали")}</h3>
            <p>${esc(status.clientAction)}</p>
            <button class="btn btn--primary" type="button" data-open-lead>Уточнить детали</button>
            <small>Раздел показывает понятный формат статуса проекта. Сообщения и загрузка материалов появятся позже.</small>
          </aside>
        </section>

        <section class="status-timeline-card status-card">
          <div class="status-section-head">
            <span>Прогресс выполнения</span>
            <h2>Путь от анкеты до поддержки</h2>
          </div>
          <ol class="status-progress status-progress--cabinet">${statusSteps(stage)}</ol>
        </section>

        <section class="status-dashboard-grid status-dashboard-grid--details">
          <article class="status-passport-card status-card">
            <div class="status-section-head">
              <span>Паспорт проекта</span>
              <h2>Данные проекта</h2>
            </div>
            <div class="status-passport-layout">
              <div class="status-passport-grid">${passportItems}</div>
              <div>
                <h3>Что входит в проект</h3>
                <ul class="status-check-list">
                  ${includedItems.map((item) => `<li>${esc(item)}</li>`).join("")}
                </ul>
              </div>
            </div>
            ${description ? `<div class="status-description"><span>Краткое описание</span><p>${esc(description)}</p></div>` : ""}
          </article>

          <aside class="status-integrations-card status-card">
            <div class="status-section-head">
              <span>Обращения и интеграции</span>
              <h2>Куда пойдут обращения</h2>
            </div>
            <ul class="status-support-list">
              ${integrationItems.map(([label, value]) => `<li><span>${esc(label)}</span><strong>${esc(value)}</strong></li>`).join("")}
            </ul>
          </aside>
        </section>

        <section class="status-dashboard-grid status-dashboard-grid--support">
          <article class="status-support-card status-card">
            <div class="status-section-head">
              <span>Что входит в поддержку</span>
              <h2>Связь и сопровождение</h2>
            </div>
            <ul class="status-support-list">
              ${supportItems.map(([label, value]) => `<li><span>${esc(label)}</span><strong>${esc(value)}</strong></li>`).join("")}
            </ul>
          </article>

          <article class="status-history-card status-card">
            <div class="status-section-head">
              <span>История</span>
              <h2>События проекта</h2>
            </div>
            <ul class="status-history">
              ${historyItems.map(([title, text]) => `<li><strong>${esc(title)}</strong><small>${esc(text)}</small></li>`).join("")}
            </ul>
          </article>

          <article class="status-notifications-card status-card">
            <div class="status-section-head">
              <span>Уведомления</span>
              <h2>Что важно сейчас</h2>
            </div>
            <ul class="status-history">
              ${notificationItems.map(([title, text]) => `<li><strong>${esc(title)}</strong><small>${esc(text)}</small></li>`).join("")}
            </ul>
          </article>
        </section>

        <section class="mobile-access-card status-card">
          <div>
            <span>Открывать статус с телефона</span>
            <h2>WEB00 всегда под рукой</h2>
            <p>Добавьте WEB00 на главный экран, чтобы возвращаться к статусу проекта и разделу “Мой проект” в один тап.</p>
          </div>
          <a class="btn btn--secondary" href="install.html">Установить WEB00 на телефон</a>
        </section>

        <section class="status-help-actions status-card">
          <div>
            <span class="status-card-label">Нужна помощь по проекту?</span>
            <h2>Связь и поддержка</h2>
            <p>Напишите в поддержку или добавьте WEB00 на телефон для быстрого доступа к статусу. Если что-то пошло не так, можно кратко описать проблему.</p>
          </div>
          <div class="status-help-actions__buttons">
            <a class="btn btn--secondary" href="contacts.html">Написать в поддержку</a>
            <button class="btn btn--secondary status-help-actions__quiet" type="button" data-open-bug>Описать проблему</button>
            <a class="btn btn--secondary" href="install.html">Установить на телефон</a>
          </div>
        </section>

        <section class="status-meta-strip status-card" aria-label="Сводка проекта">
          ${projectFacts}
        </section>
      </div>
    `;
  }

  function renderStatusNotFound(root, id) {
    root.innerHTML = `
      <section class="not-found-layout status-not-found-page">
        <div class="not-found-card status-lookup-card">
          <p class="status-kicker"><span></span>WEB00 · статус проекта</p>
          <h1>Проект не найден</h1>
          <p>Мы не нашли проект с номером ${id ? `<strong>${esc(id)}</strong>` : "без номера"}. Проверьте номер с экрана “Анкета отправлена” или напишите в поддержку.</p>
          <form data-status-lookup="direct">
            <label>
              <span>Номер проекта</span>
              <input name="leadId" type="text" value="${esc(id || "")}" placeholder="WEB00-2026-0001" autocomplete="off">
            </label>
            <button class="btn btn--primary btn--full" type="submit">Проверить ещё раз</button>
          </form>
          <p class="status-form-message" data-status-message></p>
          <div class="status-lookup-actions">
            <a class="btn btn--secondary" href="solutions.html">Вернуться в каталог</a>
            <button class="btn btn--secondary" type="button" data-open-lead>Написать в поддержку</button>
          </div>
        </div>
        <aside class="status-help-card">
          <h2>Что можно сделать</h2>
          <ul>
            <li>Проверьте, что номер введён без лишних пробелов.</li>
            <li>Откройте ссылку из экрана “Анкета отправлена”.</li>
            <li>Если номер потерян, напишите в поддержку.</li>
          </ul>
        </aside>
      </section>
    `;
    initStatusLookup();
  }

  function homeTranslation(lang, key) {
    return HOME_TRANSLATIONS[lang]?.[key] ?? HOME_TRANSLATIONS.ru[key] ?? key;
  }

  function applyHomeLanguage(lang) {
    const nextLang = HOME_LANGUAGES[lang] ? lang : "ru";
    const meta = HOME_LANGUAGES[nextLang];
    document.documentElement.lang = meta.htmlLang;
    $$("[data-i18n]").forEach((node) => {
      node.textContent = homeTranslation(nextLang, node.dataset.i18n);
    });
    $$("[data-i18n-html]").forEach((node) => {
      node.innerHTML = homeTranslation(nextLang, node.dataset.i18nHtml);
    });
    const label = $("[data-language-label]");
    const flag = $("[data-language-flag]");
    if (label) label.textContent = meta.label;
    if (flag) flag.textContent = meta.flag;
    $$("[data-language-option]").forEach((option) => {
      const active = option.dataset.languageOption === nextLang;
      option.setAttribute("aria-checked", String(active));
      option.classList.toggle("is-active", active);
    });
    try {
      localStorage.setItem(HOME_LANGUAGE_KEY, nextLang);
    } catch (_) {
      // Private browsing modes can block storage.
    }
  }

  function initHomeLanguageSwitcher() {
    const trigger = $("[data-language-trigger]");
    const sheet = $("[data-language-sheet]");
    const backdrop = $("[data-language-backdrop]");
    if (!trigger || !sheet || !backdrop) return;

    const closeButton = $("[data-language-close]", sheet);
    const options = $$("[data-language-option]", sheet);
    const setOpen = (open) => {
      sheet.hidden = !open;
      backdrop.hidden = !open;
      sheet.setAttribute("aria-hidden", String(!open));
      trigger.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("has-language-sheet", open);
      if (open) {
        const activeOption = options.find((option) => option.getAttribute("aria-checked") === "true") || options[0];
        activeOption?.focus({ preventScroll: true });
      } else {
        trigger.focus({ preventScroll: true });
      }
    };

    let savedLanguage = "ru";
    try {
      savedLanguage = localStorage.getItem(HOME_LANGUAGE_KEY) || "ru";
    } catch (_) {
      savedLanguage = "ru";
    }
    applyHomeLanguage(savedLanguage);

    trigger.addEventListener("click", () => setOpen(true));
    closeButton?.addEventListener("click", () => setOpen(false));
    backdrop.addEventListener("click", () => setOpen(false));
    options.forEach((option) => {
      option.addEventListener("click", () => {
        applyHomeLanguage(option.dataset.languageOption);
        setOpen(false);
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !sheet.hidden) setOpen(false);
    });
  }

  function initHome() {
    renderSolutions();
    renderServices();
    renderPricing();
    initFaq();
    initCalculator();
    initStatusLookup();
    initMessageForm();
    initHomeLanguageSwitcher();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const { protocol, hostname } = window.location;
    const canRegister = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
    if (!canRegister) return;
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("WEB00 service worker registration skipped.", error);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initShell();
    if (page === "status") {
      renderStatusPage();
      initStatusLookup();
    } else if (page === "brief") {
      initBriefPage();
    } else {
      initHome();
    }
    registerServiceWorker();
  });
})();
