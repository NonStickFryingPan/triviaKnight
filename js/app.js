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
    const fn = ROUTES[hash] || ROUTES[''];
    const isHome = fn === home;
    viewEl.classList.toggle('home-route', isHome);
    document.body.classList.toggle('is-home', isHome);
    if (hash !== '/review') ReviewView.reset();
    fn();
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

  function init() {
    window.addEventListener('hashchange', route);
    Db.initDB().then(() => {
      route();
      const hash = location.hash.replace(/^#/, '');
      if (SheetsSync.isConfigured() && hash.slice(0, 7) !== '/review') {
        SheetsSync.pull().then((res) => {
          if (res.added || res.updated) toast('Pulled ' + res.added + ' new, ' + res.updated + ' updated');
        }).catch((err) => toast(err.message, true));
      }
    }).catch((err) => {
      viewEl.innerHTML = '';
      viewEl.appendChild(Tk.el('p', { text: 'Could not open storage: ' + err.message }));
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();