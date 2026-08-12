'use strict';

const LibraryView = (function () {

  let state = { search: '', category: '', showAdd: false };

  function render(root) {
    root.innerHTML = '';
    const title = Tk.el('h1', { class: 'page-title', text: 'Library' });
    const sub = Tk.el('p', { class: 'page-sub', text: 'your whole archive, one page' });
    root.append(title, sub, renderToolbar(), Tk.el('div', { id: 'lib-list' }));
    if (state.showAdd) root.appendChild(renderAddForm());
    refreshList(root);
  }

  function renderToolbar() {
    const bar = Tk.el('div', { class: 'lib-toolbar' }, [
      Tk.el('div', { class: 'field' }, [
        Tk.el('label', { text: 'Search' }),
        Tk.el('input', {
          type: 'search',
          placeholder: 'search facts…',
          value: state.search,
          oninput: (e) => { state.search = e.target.value; refreshList(document.getElementById('view')); }
        })
      ]),
      Tk.el('div', { class: 'field full' }, [
        Tk.el('label', { text: 'Category' }),
        Tk.el('select', {
          onchange: (e) => { state.category = e.target.value; refreshList(document.getElementById('view')); }
        })
      ]),
      Tk.el('button', {
        class: 'btn btn-primary btn-small',
        onclick: () => { state.showAdd = !state.showAdd; render(document.getElementById('view')); }
      }, [Tk.icon('plus', 15), 'Add card'])
    ]);
    const sel = bar.querySelector('select');
    sel.appendChild(Tk.el('option', { value: '', text: 'All categories' }));
    return bar;
  }

  async function refreshList(root) {
    const listEl = root.querySelector('#lib-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    let cards = await Db.getAllCards();
    const cats = await Db.getCategories();
    const sel = root.querySelector('select');
    if (state.category && cats.indexOf(state.category) === -1) state.category = '';
    const current = state.category;
    sel.innerHTML = '';
    sel.appendChild(Tk.el('option', { value: '', text: 'All categories' }));
    cats.forEach((c) => {
      sel.appendChild(Tk.el('option', { value: c, text: c }));
    });
    sel.value = current;

    if (state.category) cards = cards.filter((c) => c.category === state.category);
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      cards = cards.filter((c) => {
        const hay = [c.category, c.front, c.back, c.question, c.sentence, c.answer].filter(Boolean).join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    cards.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

    if (cards.length === 0) {
      listEl.appendChild(Tk.el('div', { class: 'empty-state', text: 'No cards here yet. Dump some facts, or add one by hand.' }));
      return;
    }

    const list = Tk.el('div', { class: 'cards-list' });
    cards.forEach((card) => list.appendChild(renderCardRow(card)));
    listEl.appendChild(list);
  }

  function renderCardRow(card) {
    const row = Tk.el('div', { class: 'paper lib-card rot-' + (card.id.charCodeAt(0) % 2 ? 1 : -1) });
    const top = Tk.el('div', { class: 'lc-top' }, [
      Tk.el('span', { class: 'tag tag-yellow', text: card.category || '?' }),
      Tk.el('span', { class: 'tag', text: CardTypes.typeLabel(card.type) }),
      Tk.el('span', { class: 'lc-meta', text: dueLabel(card) })
    ]);
    row.appendChild(top);

    const front = Tk.el('div', { class: 'lc-front', text: card.type === 'flashcard' ? card.front : (card.type === 'mcq' ? card.question : card.sentence) });
    const back = Tk.el('div', { class: 'lc-back', text: card.type === 'flashcard' ? card.back : (card.type === 'mcq' ? 'Options: ' + card.options.join(' / ') : card.answer) });
    row.append(front, back);

    const actions = Tk.el('div', { class: 'lc-actions', style: 'margin-top:6px' }, [
      Tk.el('button', {
        class: 'btn btn-ghost btn-small',
        text: 'Edit',
        onclick: () => {
          const zone = Tk.el('div', { class: 'edit-zone' });
          zone.appendChild(editForm(card, () => refreshList(document.getElementById('view'))));
          row.appendChild(zone);
        }
      }),
      Tk.el('button', {
        class: 'btn btn-small btn-danger',
        text: 'Delete',
        onclick: async () => {
          if (!confirm('Delete this card?')) return;
          await Db.deleteCard(card.id);
          refreshList(document.getElementById('view'));
        }
      })
    ]);
    row.appendChild(actions);
    return row;
  }

  function editForm(card, onDone) {
    const f = Tk.el('form', { class: 'edit-zone-inner', style: 'display:flex;flex-direction:column;gap:12px' });
    f.appendChild(fieldBox('Category', Tk.el('input', {
      type: 'text', value: card.category || '',
      oninput: (e) => { card.category = e.target.value; }
    })));

    if (card.type === 'flashcard') {
      f.appendChild(fieldBox('Front', Tk.el('textarea', { rows: 2, text: card.front || '', oninput: (e) => { card.front = e.target.value; } })));
      f.appendChild(fieldBox('Back', Tk.el('textarea', { rows: 2, text: card.back || '', oninput: (e) => { card.back = e.target.value; } })));
    } else if (card.type === 'mcq') {
      f.appendChild(fieldBox('Question', Tk.el('textarea', { rows: 2, text: card.question || '', oninput: (e) => { card.question = e.target.value; } })));
      f.appendChild(fieldBox('Options (one per line, first = correct)', Tk.el('textarea', {
        rows: 4, text: card.options.join('\n'),
        oninput: (e) => {
          const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
          card.options = lines;
          card.correctIndex = 0;
        }
      })));
    } else {
      f.appendChild(fieldBox('Sentence (with ___ blank)', Tk.el('textarea', { rows: 2, text: card.sentence || '', oninput: (e) => { card.sentence = e.target.value; } })));
      f.appendChild(fieldBox('Answer', Tk.el('input', { type: 'text', value: card.answer || '', oninput: (e) => { card.answer = e.target.value; } })));
    }

    f.appendChild(Tk.el('div', { style: 'display:flex;gap:10px' }, [
      Tk.el('button', { class: 'btn btn-primary btn-small', type: 'submit', text: 'Save' }),
      Tk.el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Cancel', onclick: (e) => { e.target.closest('.edit-zone').remove(); } })
    ]));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await Db.updateCard(card);
      onDone();
    });
    return f;
  }

  function fieldBox(labelText, input) {
    return Tk.el('div', { class: 'field' }, [Tk.el('label', { text: labelText }), input]);
  }

  function renderAddForm() {
    const form = Tk.el('div', { class: 'paper add-form rot-2' }, [
      Tk.el('h3', { style: 'font-family:var(--font-display);font-weight:700;font-size:20px;margin-bottom:16px', text: 'Add card manually' }),
      Tk.el('div', { class: 'field' }, [
        Tk.el('label', { text: 'Type' }),
        Tk.el('select', { id: 'add-type' }, [
          Tk.el('option', { value: 'flashcard', text: 'Flashcard' }),
          Tk.el('option', { value: 'mcq', text: 'Multiple choice' }),
          Tk.el('option', { value: 'fill_blank', text: 'Fill in the blank' })
        ])
      ]),
      Tk.el('div', { id: 'add-fields' }),
      Tk.el('button', { class: 'btn btn-primary', id: 'add-save', text: 'Add to library' }, [Tk.icon('plus', 16)])
    ]);
    const fields = form.querySelector('#add-fields');
    const typeSel = form.querySelector('#add-type');
    const fillFields = () => {
      fields.innerHTML = '';
      const type = typeSel.value;
      fields.appendChild(fieldBox('Category', Tk.el('input', { type: 'text', id: 'add-cat', placeholder: 'e.g. Biology' })));
      if (type === 'flashcard') {
        fields.appendChild(fieldBox('Front', Tk.el('textarea', { rows: 2, id: 'add-f1', placeholder: 'Question' })));
        fields.appendChild(fieldBox('Back', Tk.el('textarea', { rows: 2, id: 'add-f2', placeholder: 'Answer' })));
      } else if (type === 'mcq') {
        fields.appendChild(fieldBox('Question', Tk.el('textarea', { rows: 2, id: 'add-f1', placeholder: 'Question' })));
        fields.appendChild(fieldBox('Options (one per line, first = correct)', Tk.el('textarea', { rows: 4, id: 'add-f2', placeholder: 'Option A\nOption B\nOption C\nOption D' })));
      } else {
        fields.appendChild(fieldBox('Sentence', Tk.el('input', { type: 'text', id: 'add-f1', placeholder: 'The capital of ___ is Paris.' })));
        fields.appendChild(fieldBox('Answer', Tk.el('input', { type: 'text', id: 'add-f2', placeholder: 'France' })));
      }
    };
    typeSel.addEventListener('change', fillFields);
    fillFields();
    form.querySelector('#add-save').addEventListener('click', async () => {
      const type = typeSel.value;
      const cat = form.querySelector('#add-cat').value.trim();
      const v1 = form.querySelector('#add-f1').value.trim();
      const v2 = form.querySelector('#add-f2').value.trim();
      if (!cat || !v1 || !v2) { toast('Fill every field', true); return; }
      let card;
      if (type === 'flashcard') card = { type, category: cat, front: v1, back: v2 };
      else if (type === 'mcq') {
        const options = v2.split('\n').map((s) => s.trim()).filter(Boolean);
        if (options.length < 2) { toast('Need at least 2 options', true); return; }
        card = { type, category: cat, question: v1, options, correctIndex: 0 };
      } else {
        if (v1.indexOf('___') === -1) { toast('Sentence must contain ___', true); return; }
        card = { type, category: cat, sentence: v1, answer: v2 };
      }
      await Db.addCard(card);
      SheetsSync.pushIfDirty();
      state.showAdd = false;
      render(document.getElementById('view'));
      toast('Card added');
    });
    return form;
  }

  function dueLabel(card) {
    const d = new Date(card.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(d);
    due.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 86400000);
    if (days < 0) return 'due ' + Math.abs(days) + 'd ago';
    if (days === 0) return 'due today';
    if (days === 1) return 'due tomorrow';
    return 'due in ' + days + 'd';
  }

  function toast(msg, err) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  return { render };
})();

if (typeof globalThis !== 'undefined') globalThis.LibraryView = LibraryView;