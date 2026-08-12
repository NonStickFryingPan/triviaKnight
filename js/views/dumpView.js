'use strict';

const DumpView = (function () {

  let state = {
    stage: 'input', // input | loading | preview
    cards: []
  };

  function render(root) {
    root.innerHTML = '';
    const title = Tk.el('h1', { class: 'page-title', text: 'Dump thoughts' });
    const sub = Tk.el('p', { class: 'page-sub', text: 'paste raw facts — the machine turns them into cards' });
    root.append(title, sub, renderStage());
  }

  function renderStage() {
    if (state.stage === 'loading') return renderLoading();
    if (state.stage === 'preview') return renderPreview();
    return renderInput();
  }

  function renderInput() {
    const box = Tk.el('div', { class: 'paper dump-box' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('div', { class: 'field' }, [
        Tk.el('label', { text: 'Raw facts' }),
        Tk.el('textarea', { placeholder: 'e.g. DNA uses 4 bases: A, T, C, G. In the Epic of Gilgamesh, Enkidu was Gilgamesh\'s closest friend.', id: 'dump-text' })
      ]),
      Tk.el('div', { style: 'display:flex;justify-content:flex-end;gap:12px;align-items:center;margin-top:6px' }, [
        Tk.el('span', { class: 'hint', text: 'max ~20k characters', style: 'color:var(--on-surface-variant);font-family:var(--font-mono);font-size:12px' }),
        Tk.el('button', {
          class: 'btn btn-primary',
          text: 'Generate cards',
          onclick: onGenerate
        }, [Tk.icon('bolt', 18)])
      ])
    ]);

    if (!LlmClient.hasApiKey() && !LlmClient.keyManagedRemotely()) {
      box.appendChild(Tk.el('p', {
        class: 'dump-hint',
        text: 'No API key yet — '
      }, [
        document.createTextNode('set it in '),
        Tk.el('a', { href: '#/settings', text: 'Settings' }),
        document.createTextNode(' first.')
      ]));
    }
    return box;
  }

  function renderLoading() {
    return Tk.el('div', { class: 'paper dump-box' }, [
      Tk.el('div', { class: 'loader-row' }, [
        Tk.el('div', { class: 'stamp-spin', text: 'k' }),
        Tk.el('span', { id: 'gen-progress', text: 'Sharpening the pencil… turning your notes into cards' })
      ])
    ]);
  }

  function renderPreview() {
    const wrap = Tk.el('div', {});
    const list = Tk.el('div', { class: 'preview-list' });
    state.cards.forEach((card, i) => list.appendChild(renderPreviewCard(card, i)));

    const bar = Tk.el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;flex-wrap:wrap' }, [
      Tk.el('span', {
        class: 'tag tag-yellow',
        text: state.cards.length + ' card' + (state.cards.length === 1 ? '' : 's')
      }),
      Tk.el('div', { style: 'display:flex;gap:12px' }, [
        Tk.el('button', {
          class: 'btn btn-ghost btn-small',
          text: 'Start over',
          onclick: () => { state = { stage: 'input', cards: [] }; render(document.getElementById('view')); }
        }),
        Tk.el('button', {
          class: 'btn btn-primary btn-small',
          text: 'Save all',
          onclick: onSaveAll
        }, [Tk.icon('check', 16)])
      ])
    ]);
    wrap.append(list, bar);
    return wrap;
  }

  function renderPreviewCard(card, i) {
    const cardEl = Tk.el('div', { class: 'paper preview-card rot-' + (i % 2 === 0 ? 1 : -1) });
    const head = Tk.el('div', { class: 'preview-head' }, [
      Tk.el('span', { class: 'type-label', text: CardTypes.typeLabel(card.type) }),
      Tk.el('button', {
        class: 'icon-btn',
        title: 'Delete',
        onclick: () => {
          state.cards.splice(i, 1);
          render(document.getElementById('view'));
        }
      }, [Tk.icon('trash', 15)])
    ]);
    const fields = [];
    fields.push(Tk.el('div', { class: 'field' }, [
      Tk.el('label', { text: 'Category' }),
      Tk.el('input', {
        type: 'text',
        value: card.category,
        oninput: (e) => { state.cards[i].category = e.target.value; }
      })
    ]));

    if (card.type === 'flashcard') {
      fields.push(field('Front', 'front', i, card.front, 'front'));
      fields.push(field('Back', 'back', i, card.back, 'back'));
    } else if (card.type === 'mcq') {
      fields.push(field('Question', 'question', i, card.question, 'question'));
      fields.push(Tk.el('div', { class: 'field' }, [
        Tk.el('label', { text: 'Options (one per line, first = correct)' }),
        Tk.el('textarea', {
          rows: 4,
          style: 'font-family:var(--font-mono);font-size:14px',
          text: card.options.join('\n'),
          oninput: (e) => {
            const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
            state.cards[i].options = lines;
            state.cards[i].correctIndex = 0;
          }
        })
      ]));
    } else if (card.type === 'fill_blank') {
      fields.push(field('Sentence', 'sentence', i, card.sentence, 'sentence'));
      fields.push(field('Answer', 'answer', i, card.answer, 'answer'));
    }
    cardEl.append(head, ...fields);
    return cardEl;
  }

  function field(labelText, key, i, value, cls) {
    return Tk.el('div', { class: 'field' }, [
      Tk.el('label', { text: labelText }),
      Tk.el('textarea', {
        rows: 2,
        class: cls,
        text: value || '',
        oninput: (e) => { state.cards[i][key] = e.target.value; }
      })
    ]);
  }

  async function onGenerate() {
    const text = document.getElementById('dump-text');
    const dumpText = (text && text.value || '').trim();
    if (!dumpText) { toast('Nothing to generate — paste some facts first', true); return; }
    if (dumpText.length < 15) { toast('That\'s too short to turn into cards — paste a bit more', true); return; }
    state.stage = 'loading';
    render(document.getElementById('view'));
    try {
      const cats = await Db.getCategories();
      const res = await LlmClient.generateCards(dumpText, cats, (chunk, total, made) => {
        const el = document.getElementById('gen-progress');
        if (!el) return;
        el.textContent = total > 1
          ? 'Sharpening the pencil… part ' + chunk + ' of ' + total + (made > 0 ? ' (' + made + ' card' + (made === 1 ? '' : 's') + ' so far)' : '')
          : 'Sharpening the pencil… turning your notes into cards';
      });
      state = { stage: 'preview', cards: res.cards };
      render(document.getElementById('view'));
      if (res.cards.length === 0 && res.failedChunks === 0) {
        state = { stage: 'input', cards: [] };
        render(document.getElementById('view'));
        toast('No cards could be generated — try rephrasing or shorter text', true);
        return;
      }
      const notes = [];
      if (res.skipped > 0) notes.push('skipped ' + res.skipped + ' card' + (res.skipped === 1 ? '' : 's'));
      if (res.failedChunks > 0) notes.push(res.failedChunks + ' of ' + res.chunks + ' part' + (res.failedChunks === 1 ? '' : 's') + ' failed');
      if (notes.length > 0) toast(notes.join(' — ') + ' — the rest are ready', true);
    } catch (err) {
      state = { stage: 'input', cards: [] };
      render(document.getElementById('view'));
      toast(err.message, true);
    }
  }

  async function onSaveAll() {
    const valid = state.cards.filter((c) => {
      if (!c.category || !c.category.trim()) return false;
      if (c.type === 'flashcard') return (c.front || '').trim() && (c.back || '').trim();
      if (c.type === 'mcq') return (c.question || '').trim() && Array.isArray(c.options) && c.options.length >= 2;
      if (c.type === 'fill_blank') return (c.sentence || '').trim() && (c.answer || '').trim();
      return false;
    });
    if (valid.length === 0) { toast('No complete cards to save', true); return; }
    let saved = 0;
    let failed = 0;
    for (const card of valid) {
      try {
        await Db.addCard(card);
        saved++;
      } catch (err) {
        failed++;
        console.error('Card save failed:', err);
      }
    }
    state = { stage: 'input', cards: [] };
    render(document.getElementById('view'));
    toast('Saved ' + saved + ' card' + (saved === 1 ? '' : 's') + (failed > 0 ? ', ' + failed + ' failed' : ''));
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