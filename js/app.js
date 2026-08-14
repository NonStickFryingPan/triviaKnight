'use strict';

(function () {
  const ROUTES = {
    '': home,
    '/': home,
    '/dump': () => DumpView.render(viewEl),
    '/review': () => ReviewView.render(viewEl),
    '/library': () => LibraryView.render(viewEl),
    '/settings': () => SettingsView.render(viewEl)
  };

  const viewEl = document.getElementById('view');

  const VIEW_FILES = {
    '/dump': 'js/views/dumpView.js',
    '/review': 'js/views/reviewView.js',
    '/library': 'js/views/libraryView.js',
    '/settings': 'js/views/settingsView.js',
    'unlock': 'js/views/unlockView.js'
  };
  const loadedViews = new Set();
  const viewLoads = new Map();

  function ensureView(file) {
    if (loadedViews.has(file)) return Promise.resolve();
    if (viewLoads.has(file)) return viewLoads.get(file);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = file + '?v=20260818';
      s.onload = () => {
        loadedViews.add(file);
        viewLoads.delete(file);
        resolve();
      };
      s.onerror = () => {
        viewLoads.delete(file);
        reject(new Error('Failed to load ' + file));
      };
      document.head.appendChild(s);
    });
    viewLoads.set(file, p);
    return p;
  }

  async function route() {
    const hash = location.hash.replace(/^#/, '');
    if (LlmClient.isLocked()) {
      try {
        await ensureView(VIEW_FILES['unlock']);
      } catch (err) {
        console.error('Failed to load unlock view:', err);
        Tk.toast(err.message, true);
        return;
      }
      viewEl.classList.add('home-route');
      document.body.classList.add('is-home');
      UnlockView.render(viewEl);
      backLink(true);
      window.scrollTo(0, 0);
      viewEl.classList.remove('view-in');
      void viewEl.offsetWidth;
      viewEl.classList.add('view-in');
      return;
    }
    const f = VIEW_FILES[hash];
    if (f) {
      try {
        await ensureView(f);
      } catch (err) {
        console.error('Failed to load view:', err);
        Tk.toast(err.message, true);
        return;
      }
    }
    const fn = ROUTES[hash] || ROUTES[''];
    const isHome = fn === home;
    viewEl.classList.toggle('home-route', isHome);
    document.body.classList.toggle('is-home', isHome);
    if (hash !== '/review' && typeof ReviewView !== 'undefined') ReviewView.reset();
    try {
      fn();
    } catch (err) {
      console.error('Route render failed:', err);
      Tk.toast((err && err.message) ? err.message : String(err), true);
    }
    backLink(isHome);
    window.scrollTo(0, 0);
    viewEl.classList.remove('view-in');
    void viewEl.offsetWidth;
    viewEl.classList.add('view-in');
  }

  function backLink(isHome) {
    const el = document.getElementById('back-link');
    if (!el) return;
    el.replaceChildren();
    if (isHome) return;
    if (viewEl.querySelector('.summary-box')) return;
    el.appendChild(Tk.el('a', { href: '#/', 'aria-label': 'back to desk' }, [
      Tk.el('span', { class: 'back-arrow', 'aria-hidden': 'true' }, [Tk.icon('arrow', 15)]),
      'home'
    ]));
  }

  function home() {
    viewEl.innerHTML = '';

    // Primary Action Card: Dump Thoughts
    const dumpCard = Tk.el('div', { class: 'paper home-card home-card-dump rot-1' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('h2', { class: 'dump-title', text: 'Dump thoughts' }),
      Tk.el('p', { class: 'dump-desc', text: 'Paste raw facts, get flashcards, MCQs and fill-in-the-blanks.' }),
      Tk.el('button', { class: 'home-dump-btn', onclick: go('/dump') }, [
        'Start a new dump',
        Tk.icon('pen', 14)
      ])
    ]);

    // Secondary Action Card: Take a Quiz (with dynamic numeric counter badge)
    const quizCard = Tk.el('div', { class: 'paper home-card home-card-quiz rot--1', role: 'button', tabindex: '0', onclick: go('/review') }, [
      Tk.el('div', { class: 'quiz-badge-wrap', id: 'hc-badge-wrap' }, [
        Tk.el('span', { class: 'quiz-badge-num', id: 'hc-badge-num', text: '0' })
      ]),
      Tk.el('div', { class: 'quiz-info' }, [
        Tk.el('h3', { text: 'Take a quiz' }),
        Tk.el('span', { class: 'quiz-due', id: 'hc-due', text: 'No cards due today' })
      ]),
      Tk.el('div', { class: 'quiz-arrow' }, [
        Tk.el('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
          Tk.el('polyline', { points: '9 18 15 12 9 6' })
        ])
      ])
    ]);

    // Centered Navigation Bar (Library & Settings Buttons)
    const navBar = Tk.el('div', { class: 'home-nav-bar' }, [
      Tk.el('a', { class: 'home-nav-btn rot-1', href: '#/library' }, [Tk.icon('library', 16), 'Library']),
      Tk.el('a', { class: 'home-nav-btn rot--1', href: '#/settings' }, [Tk.icon('settings', 16), 'Settings'])
    ]);

    const centerWrap = Tk.el('div', { class: 'home-center-wrap' }, [dumpCard, quizCard, navBar]);

    viewEl.append(centerWrap);

    Db.getDueCards(new Date().toISOString()).then((due) => {
      const el = document.getElementById('hc-due');
      const badgeEl = document.getElementById('hc-badge-num');
      const n = due ? due.length : 0;
      if (badgeEl) {
        badgeEl.textContent = String(n);
      }
      if (el) {
        el.textContent = n === 0 ? 'No cards due today' : n + ' card' + (n === 1 ? '' : 's') + ' due today';
      }
    });
  }

  function go(hash) {
    return () => { location.hash = hash; };
  }

  function autoPull() {
    const hash = location.hash.replace(/^#/, '');
    if (SheetsSync.isConfigured() && hash.slice(0, 7) !== '/review') {
      SheetsSync.pull().then((res) => {
        if (res.added || res.updated) Tk.toast('Pulled ' + res.added + ' new, ' + res.updated + ' updated');
      }).catch((err) => Tk.toast(err.message, true));
    }
  }

  const DESK_CARD_FACTS = [
    [
      'Oxford University is older than the Aztec Empire (1096 vs 1325).',
      'The University of Bologna was founded in 1088 and has taught continuously ever since.',
      'The Great Wall of China is held together in part by sticky rice flour in the mortar.',
      'Woolly mammoths were still roaming Wrangel Island when the pyramids were completed.',
      'The Roman Colosseum once had a retractable canvas roof called the Velarium.',
      'Ancient Romans washed their clothes using aged urine as a natural source of ammonia.'
    ],
    [
      'Cleopatra lived closer in time to the Moon landing than to the Great Pyramids.',
      'A day on Venus is longer than a year on Venus (243 Earth days to rotate vs 225 to orbit).',
      'Light leaving the surface of the Sun takes 8 minutes and 20 seconds to reach Earth.',
      'If the history of Earth were compressed into 24 hours, humans would appear at 11:58 PM.',
      'Saturn would float if placed in a giant bathtub because its density is less than water.',
      'Neutron stars spin up to 700 times per second due to conservation of angular momentum.'
    ],
    [
      'The sentence "Buffalo buffalo Buffalo buffalo buffalo buffalo Buffalo buffalo" is valid grammar.',
      'The shortest complete sentence in the English language is "I am."',
      '"Dreamt" is the only common English word that ends with the letters "mt".',
      'A pangram is a sentence containing every letter of the alphabet, like the quick brown fox.',
      'The ampersand symbol (&) was once taught as the 27th letter of the English alphabet.',
      'There are over 7,000 living languages spoken worldwide today, but half may vanish this century.'
    ],
    [
      'Venus is the only planet in our solar system that spins clockwise.',
      'A standard cumulus cloud weighs approximately 1.1 million pounds (500 metric tons).',
      'Water can boil and freeze at the exact same temperature and pressure (the triple point).',
      'Lightning strikes the Earth approximately 8 million times every single day.',
      'Glass is an amorphous solid that behaves like a rigid liquid at the molecular level.',
      'Hot water can freeze faster than cold water under certain conditions (Mpemba effect).'
    ],
    [
      'Voltaire drank up to 50 cups of coffee daily while writing.',
      'Mary Shelley conceived Frankenstein during a rainy summer ghost-story contest in 1816.',
      'The national animal of Scotland is the mythical Unicorn.',
      'Victor Hugo\'s novel Les Misérables contains a single sentence that is 823 words long.',
      'Shakespeare invented or first recorded over 1,700 words, including "eyeball" and "lonely".',
      'Tolkien invented Middle-earth to give his constructed Elvish languages a world to exist in.'
    ],
    [
      'The dot over an "i" or "j" is officially called a tittle.',
      'Your stomach lining regenerates itself every 3 to 4 days to prevent digesting itself.',
      'Octopuses have three hearts, nine brains, and blue copper-based blood.',
      'The human eye can distinguish approximately 10 million distinct color shades.',
      'Human bones are ounce-for-ounce 4 times stronger than concrete in compression.',
      'Sharks existed before trees (early sharks: 400M years ago, trees: 350M years ago).'
    ],
    [
      'Bananas share roughly 50% of their DNA with humans.',
      'DNA in all the cells of a single human body stretched end-to-end would reach Pluto and back.',
      'Koala fingerprints are so identical to human fingerprints that they can confuse crime scenes.',
      'A single teaspoon of honey represents the entire life work of 12 worker bees.',
      'Butterflies taste their food with specialized sensory receptors on their feet.',
      'Sea otters hold hands while sleeping to prevent drifting apart in ocean currents.'
    ],
    [
      'There are more possible iterations of a chess game than atoms in the observable universe.',
      'If you shuffle a standard deck of 52 cards, that exact order has likely never existed before.',
      'Zero is the only number that cannot be represented in traditional Roman numerals.',
      'The first computer "bug" was an actual dead moth trapped in a relay of the Harvard Mark II (1947).',
      'A googolplex is so large that writing it in full exceeds the number of particles in the universe.',
      'There are exactly 2,598,960 different five-card poker hands possible in a 52-card deck.'
    ],
    [
      'Honey found in ancient Egyptian tombs from 3,000 years ago is still completely edible.',
      'Apples, peaches, and raspberries all belong to the Rosaceae family, related to roses.',
      'Pure gold is so malleable that a single ounce can be beaten into a 100 sq ft sheet.',
      'Vanilla was originally pollinated exclusively by the Melipona bee native to Mexico.',
      'Table salt (NaCl) is made of sodium (explosive in water) and chlorine (toxic gas).',
      'Cashews grow attached to cashew apples and have toxic double shells.'
    ],
    [
      'Mammoths were still alive while the Egyptians were building the pyramids.',
      'Wombat droppings are cube-shaped, which prevents them from rolling away in rocky terrain.',
      'Hummingbirds are the only birds capable of flying backwards and upside down with ease.',
      'A group of flamingos is officially called a "flamboyance".',
      'Crows can recognize individual human faces and remember grudges for years.',
      'Sloths can take up to a full month to digest a single meal of leaves.'
    ]
  ];

  function initDeskSlips() {
    try {
      const slips = document.querySelectorAll('.scrap-slip');
      if (!slips.length) return;
      slips.forEach((slip, index) => {
        const cardIndex = index % DESK_CARD_FACTS.length;
        const facts = DESK_CARD_FACTS[cardIndex];
        let cursor = 0;

        slip.addEventListener('click', () => {
          const textEl = slip.querySelector('.slip-text');
          if (!textEl) return;
          cursor = (cursor + 1) % facts.length;
          const next = facts[cursor];

          textEl.style.opacity = '0';
          textEl.style.transform = 'translateY(-3px)';
          textEl.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
          setTimeout(() => {
            textEl.textContent = next;
            textEl.style.opacity = '1';
            textEl.style.transform = 'translateY(0)';
          }, 130);
        });
      });
    } catch (err) {
      console.warn('Desk slips init skipped:', err);
    }
  }

  function init() {
    initDeskSlips();
    const REQUIRED = {
      Tk: 'js/utils.js',
      FSRS: 'js/vendor/ts-fsrs.js',
      Scheduler: 'js/scheduler.js',
      Db: 'js/db.js',
      CardTypes: 'js/cardTypes.js',
      LlmClient: 'js/llmClient.js',
      SheetsSync: 'js/sheetsSync.js'
    };
    const missing = Object.keys(REQUIRED).filter((k) => typeof globalThis[k] === 'undefined');
    if (missing.length > 0) {
      const files = missing.map((k) => REQUIRED[k]).join(', ');
      console.error('Failed to load scripts:', files);
      viewEl.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'paper';
      box.style.cssText = 'padding:40px;text-align:center;max-width:520px;margin:40px auto';
      const h = document.createElement('h2');
      h.textContent = 'Something went wrong';
      const p = document.createElement('p');
      p.textContent = 'Some app files failed to load: ' + files;
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Hard refresh (Ctrl+Shift+R) — if it persists, a browser extension is likely interfering.';
      box.append(h, p, hint);
      viewEl.appendChild(box);
      return;
    }
    window.addEventListener('hashchange', route);
    document.addEventListener('tk:unlocked', () => {
      route();
      autoPull();
    });
    window.addEventListener('unhandledrejection', (e) => {
      e.preventDefault();
      console.error('Unhandled rejection:', e.reason);
      Tk.toast((e.reason && e.reason.message) ? e.reason.message : 'Unexpected error', true);
    });
    window.addEventListener('error', (e) => {
      console.error('Uncaught error:', e.error || e.message);
      Tk.toast((e.error && e.error.message) ? e.error.message : 'Unexpected error', true);
    });
    Tk.Bus.on('cards:saved', () => SheetsSync.pushIfDirty());
    Tk.Bus.on('session:finished', () => SheetsSync.pushIfDirty());
    Db.initDB().catch((err) => {
      console.error('Storage failed to open:', err);
      viewEl.innerHTML = '';
      try {
        const box = document.createElement('div');
        box.className = 'paper';
        box.style.cssText = 'padding:40px;text-align:center;max-width:520px;margin:40px auto';
        const h = document.createElement('h2');
        h.textContent = "Storage couldn't open";
        const p = document.createElement('p');
        p.textContent = 'The app database failed to open — private browsing blocks IndexedDB and storage may be full.';
        const retry = Tk.el('button', { class: 'btn btn-primary', style: 'margin-top:16px', text: 'Reload', onclick: () => location.reload() });
        box.append(h, p, retry);
        viewEl.appendChild(box);
      } catch (renderErr) {
        console.error('Storage error page failed to render:', renderErr);
      }
      return Promise.reject(err);
    }).then(() => {
      route();
      autoPull();
    }).catch((err) => {
      console.error('App init failed:', err);
      Tk.toast((err && err.message) ? err.message : String(err), true);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();