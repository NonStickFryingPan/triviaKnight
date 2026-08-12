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

  function route() {
    const hash = location.hash.replace(/^#/, '');
    if (LlmClient.isLocked()) {
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
    const fn = ROUTES[hash] || ROUTES[''];
    const isHome = fn === home;
    viewEl.classList.toggle('home-route', isHome);
    document.body.classList.toggle('is-home', isHome);
    if (hash !== '/review') ReviewView.reset();
    try {
      fn();
    } catch (err) {
      console.error('Route render failed:', err);
      toast((err && err.message) ? err.message : String(err), true);
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
      Tk.el('p', { text: 'Paste raw facts, get flashcards, MCQs and fill-in-the-blanks. One click, one LLM call — everything else stays on your desk.' }),
      Tk.el('span', { class: 'hc-meta' }, [Tk.icon('pen', 14), 'start a new dump'])
    ]);

    const reviewCard = Tk.el('div', { class: 'paper home-card rot--1', role: 'link', tabindex: '0', onclick: go('/review') }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('span', { class: 'hc-icon' }, [Tk.icon('review', 26)]),
      Tk.el('h2', { text: 'Take a quiz' }),
      Tk.el('p', { text: 'Review what is due today. The FSRS scheduler decides when each card comes back — not you, not the machine, just math.' }),
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
      el.append(Tk.icon('target', 14), document.createTextNode(n === 0 ? 'all caught up' : n + ' card' + (n === 1 ? '' : 's') + ' due today'));
    });
  }

  function go(hash) {
    return () => { location.hash = hash; };
  }

  function toast(msg, err) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  function autoPull() {
    const hash = location.hash.replace(/^#/, '');
    if (SheetsSync.isConfigured() && hash.slice(0, 7) !== '/review') {
      SheetsSync.pull().then((res) => {
        if (res.added || res.updated) toast('Pulled ' + res.added + ' new, ' + res.updated + ' updated');
      }).catch((err) => toast(err.message, true));
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
      SheetsSync: 'js/sheetsSync.js',
      DumpView: 'js/views/dumpView.js',
      ReviewView: 'js/views/reviewView.js',
      LibraryView: 'js/views/libraryView.js',
      SettingsView: 'js/views/settingsView.js',
      UnlockView: 'js/views/unlockView.js'
    };
    const missing = Object.keys(REQUIRED).filter((k) => {
      try { return typeof eval(k) === 'undefined'; }
      catch (e) { return true; }
    });
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
    Db.initDB().catch((err) => {
      viewEl.innerHTML = '';
      try {
        viewEl.appendChild(Tk.el('p', { text: 'Could not open storage: ' + ((err && err.message) ? err.message : String(err)) }));
      } catch (renderErr) {
        console.error('Storage error page failed to render:', renderErr);
      }
      return Promise.reject(err);
    }).then(() => {
      route();
      autoPull();
    }).catch((err) => {
      console.error('App init failed:', err);
      toast((err && err.message) ? err.message : String(err), true);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();