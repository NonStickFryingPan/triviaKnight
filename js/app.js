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
      s.src = file + '?v=20260816';
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
    const logo = Tk.el('div', { class: 'home-logo' }, [Tk.icon('helmet', 110)]);

    const grid = Tk.el('div', { class: 'home-grid' });

    const dumpCard = Tk.el('div', { class: 'paper home-card rot-1', role: 'link', tabindex: '0', onclick: go('/dump') }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('span', { class: 'hc-icon' }, [Tk.icon('dump', 26)]),
      Tk.el('h2', { text: 'Dump thoughts' }),
      Tk.el('p', { text: 'Paste raw facts, get flashcards, MCQs and fill-in-the-blanks. One click, one LLM call. The cards stay in this browser.' }),
      Tk.el('span', { class: 'hc-meta' }, [Tk.icon('pen', 14), 'start a new dump'])
    ]);

    const reviewCard = Tk.el('div', { class: 'paper home-card rot--1', role: 'link', tabindex: '0', onclick: go('/review') }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('span', { class: 'hc-icon' }, [Tk.icon('review', 26)]),
      Tk.el('h2', { text: 'Take a quiz' }),
      Tk.el('p', { text: 'Review the cards that are due today. The scheduler decides when each card appears again.' }),
      Tk.el('span', { class: 'hc-meta hc-due', id: 'hc-due' }, [Tk.icon('target', 14), 'counting…'])
    ]);

    grid.append(dumpCard, reviewCard);

    const secondary = Tk.el('div', { class: 'home-secondary' }, [
      Tk.el('a', { class: 'home-btn rot-1', href: '#/library' }, [Tk.icon('library', 15), 'Library']),
      Tk.el('a', { class: 'home-btn rot--1', href: '#/settings' }, [Tk.icon('settings', 15), 'Settings'])
    ]);

    viewEl.append(logo, grid, secondary);

    Db.getDueCards(new Date().toISOString()).then((due) => {
      const el = document.getElementById('hc-due');
      if (!el) return;
      const n = due.length;
      el.textContent = '';
      el.append(Tk.icon('target', 14), document.createTextNode(n === 0 ? 'no cards due today' : n + ' card' + (n === 1 ? '' : 's') + ' due today'));
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

  function init() {
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