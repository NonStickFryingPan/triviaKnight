'use strict';

const ReviewView = (function () {

  const session = {
    queue: null,      // null = not started
    index: 0,
    correct: 0
  };

  function render(root) {
    root.innerHTML = '';
    if (!session.queue) {
      renderReady(root);
      return;
    }
    if (session.index >= session.queue.length) {
      renderSummary(root);
      return;
    }
    renderCard(root, session.queue[session.index]);
  }

  async function renderReady(root) {
    root.innerHTML = '';
    const title = Tk.el('h1', { class: 'page-title', text: 'Review' });
    const sub = Tk.el('p', { class: 'page-sub', text: 'keep the ink fresh' });
    root.append(title, sub);
    const box = Tk.el('div', { class: 'paper', style: 'padding:40px;text-align:center;max-width:520px;margin:0 auto' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('p', { style: 'font-family:var(--font-mono);font-size:14px;letter-spacing:0.1em;color:var(--on-surface-variant);text-transform:uppercase;margin-bottom:14px', text: 'Due today' }),
      Tk.el('p', { style: 'font-family:var(--font-display);font-weight:800;font-size:64px;line-height:1;margin-bottom:20px', text: '…' })
    ]);
    root.appendChild(box);
    try {
      const due = await Db.getDueCards(new Date().toISOString());
      const limit = parseInt(Tk.storage.get('dsk_new_per_day', '20'), 10) || 20;
      const shuffled = Tk.shuffle(due);
      const news = shuffled.filter((c) => (c.reps || 0) === 0);
      const repeats = shuffled.filter((c) => (c.reps || 0) > 0);
      const queue = repeats.concat(news.slice(0, limit));
      if (queue.length === 0) {
        const empty = Tk.el('div', { class: 'empty-state', style: 'margin-top:26px' }, [
          Tk.el('p', { text: 'All caught up — nothing due today.' }),
          Tk.el('p', { text: 'Dump some new facts to feed the quill.' })
        ]);
        root.appendChild(empty);
        return;
      }
      session.queue = queue;
      session.index = 0;
      session.correct = 0;
      renderCard(root, queue[0]);
    } catch (err) {
      toast(err.message, true);
    }
  }

  function progress(root) {
    const total = session.queue.length;
    const done = Math.min(session.index, total);
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return Tk.el('div', { class: 'progress-row' }, [
      Tk.el('span', { class: 'progress-count', text: done + ' / ' + total }),
      Tk.el('div', { class: 'progress-track' }, [
        Tk.el('div', { class: 'progress-fill', style: 'width:' + pct + '%' })
      ])
    ]);
  }

  function renderCard(root, card) {
    root.innerHTML = '';
    const stage = Tk.el('div', { class: 'review-stage' });
    const viewData = CardTypes.render(card);
    const cardEl = Tk.el('div', { class: 'flip-card', dataset: { type: card.type } });

    if (card.type === 'flashcard') {
      const inner = Tk.el('div', { class: 'flip-inner' });
      const face = Tk.el('div', { class: 'paper flip-face rot-1' }, [
        Tk.el('div', { class: 'tape' }),
        Tk.el('span', { class: 'face-label', text: 'Q' }),
        Tk.el('h2', { text: viewData.front }),
        Tk.el('button', {
          class: 'btn btn-ghost btn-small reveal-btn',
          text: 'Reveal answer',
          onclick: (e) => { e.stopPropagation(); cardEl.classList.add('flipped'); }
        }, [Tk.icon('flip', 15)])
      ]);
      const back = Tk.el('div', { class: 'paper flip-face flip-back rot--1' }, [
        Tk.el('span', { class: 'face-label', text: 'A' }),
        Tk.el('div', { class: 'answer', text: viewData.back }),
        stamps(onFlashGrade(card))
      ]);
      inner.append(face, back);
      cardEl.appendChild(inner);
      stage.append(progress(root), cardEl);
      root.appendChild(stage);
      return;
    }

    // auto-graded types
    const face = Tk.el('div', { class: 'paper plain-face rot-1' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('span', { class: 'face-label', text: card.type === 'mcq' ? 'Multiple choice' : 'Fill in the blank' })
    ]);

    if (card.type === 'mcq') {
      face.appendChild(Tk.el('h2', { text: viewData.question }));
      const opts = Tk.el('div', { class: 'opt-list' });
      viewData.options.forEach((opt, idx) => {
        opts.appendChild(Tk.el('button', {
          class: 'opt',
          text: String.fromCharCode(65 + idx) + '.  ' + opt,
          onclick: () => answerMcq(card, idx, opts)
        }));
      });
      face.appendChild(opts);
      stage.append(progress(root), cardEl);
      cardEl.appendChild(face);
      root.appendChild(stage);
      return;
    }

    // fill_blank
    face.appendChild(Tk.el('h2', { text: viewData.sentence, style: 'font-size:26px' }));
    const input = Tk.el('input', { type: 'text', class: 'blank-input', placeholder: 'type your answer…', autocomplete: 'off' });
    const checkBtn = Tk.el('button', { class: 'btn btn-primary btn-small', text: 'Check' }, [Tk.icon('check', 15)]);
    const row = Tk.el('div', { style: 'display:flex;gap:12px;align-items:center;justify-content:center;width:100%', class: 'blank-row' }, [input, checkBtn]);
    face.appendChild(row);
    const feedback = Tk.el('div', { style: 'min-height:60px;text-align:center' });
    face.appendChild(feedback);
    stage.append(progress(root), cardEl);
    cardEl.appendChild(face);
    root.appendChild(stage);

    const gradeIt = () => {
      const res = CardTypes.grade(card, input.value);
      if (res.correct) session.correct++;
      persistReview(card, res.correct ? 'good' : 'again')
        .catch((err) => toast(err.message, true))
        .then(() => showFeedback(feedback, res, card, () => next()));
    };
    checkBtn.addEventListener('click', gradeIt);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') gradeIt(); });
    input.focus();
  }

  function answerMcq(card, pickedIdx, opts) {
    const res = CardTypes.grade(card, pickedIdx);
    if (res.correct) session.correct++;
    Array.from(opts.children).forEach((btn, idx) => {
      btn.disabled = true;
      btn.classList.remove('selected');
      if (idx === pickedIdx) btn.classList.add(res.correct ? 'correct' : 'wrong');
    });
    persistReview(card, res.correct ? 'good' : 'again')
      .catch((err) => toast(err.message, true))
      .then(() => {
        const correctText = CardTypes.reveal(card);
        if (correctText) {
          const target = viewData.options.indexOf(correctText);
          const btns = Array.from(opts.children);
          if (target >= 0 && btns[target]) btns[target].classList.add('correct');
        }
        const wrap = Tk.el('div', { style: 'text-align:center;margin-top:6px' }, [
          Tk.el('div', { class: 'feedback ' + (res.correct ? 'ok' : 'bad'), text: res.correct ? 'Correct' : 'Not quite' }),
          res.correct ? null : Tk.el('div', { class: 'correct-answer', text: 'Answer: ' }, [Tk.el('strong', { text: correctText })]),
          Tk.el('button', { class: 'btn btn-primary btn-small', style: 'margin-top:14px', text: 'Next card', onclick: next }, [Tk.icon('arrow', 15)])
        ]);
        opts.parentElement.appendChild(wrap);
      });
  }

  function showFeedback(feedbackEl, res, card, onNext) {
    feedbackEl.innerHTML = '';
    feedbackEl.appendChild(Tk.el('div', { class: 'feedback ' + (res.correct ? 'ok' : 'bad'), text: res.correct ? 'Correct' : 'Not quite' }));
    if (!res.correct) {
      feedbackEl.appendChild(Tk.el('div', { class: 'correct-answer', text: 'Answer: ' }, [Tk.el('strong', { text: CardTypes.reveal(card) })]));
    }
    feedbackEl.appendChild(Tk.el('button', { class: 'btn btn-primary btn-small', style: 'margin-top:14px', text: 'Next card', onclick: onNext }, [Tk.icon('arrow', 15)]));
  }

  function stamps(onPick) {
    const wrap = Tk.el('div', { class: 'stamps' });
    const defs = [
      { key: 'again', label: 'Again', sub: 'forgot' },
      { key: 'hard', label: 'Hard', sub: 'struggled' },
      { key: 'good', label: 'Good', sub: 'normal' },
      { key: 'easy', label: 'Easy', sub: 'instant' }
    ];
    defs.forEach((d) => {
      wrap.appendChild(Tk.el('button', {
        class: 'stamp stamp-' + d.key,
        onclick: () => onPick(d.key)
      }, [
        Tk.el('span', { class: 'st-big', text: d.label }),
        Tk.el('span', { class: 'st-sub', text: d.sub })
      ]));
    });
    return wrap;
  }

  function onFlashGrade(card) {
    // quality values kept ONLY so CardTypes.grade stays correct (correct = quality >= 3);
    // the scheduler receives the rating KEY.
    const QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };
    return (key) => {
      const res = CardTypes.grade(card, QUALITY[key]);
      if (res.correct) session.correct++;
      persistReview(card, key)
        .catch((err) => toast(err.message, true))
        .then(() => {
          session.index++;
          render(document.getElementById('view'));
        });
    };
  }

  const persisting = new WeakSet();

  async function persistReview(card, ratingKey) {
    if (persisting.has(card)) return; // guard double-fire (stamp spam, Enter+Check)
    persisting.add(card);
    const next = Scheduler.schedule(card, ratingKey);
    Object.assign(card, next, { lastReviewed: next.lastReviewed });
    await Db.addReviewLog(Object.assign({ cardId: card.id }, next.lastLog));
    await Db.updateCard(card);
  }

  function next() {
    session.index++;
    render(document.getElementById('view'));
  }

  function renderSummary(root) {
    const total = session.queue.length;
    const pct = total === 0 ? 0 : Math.round((session.correct / total) * 100);
    const box = Tk.el('div', { class: 'paper summary-box' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('div', { class: 'big', text: pct + '%' }),
      Tk.el('div', { class: 'med', text: pct >= 80 ? 'Well inked' : pct >= 50 ? 'Decent scrawl' : 'Back to the books' }),
      Tk.el('p', { class: 'meta', text: session.correct + ' / ' + total + ' remembered' }),
      Tk.el('button', {
        class: 'btn btn-primary',
        text: 'Back to desk',
        onclick: () => { session.queue = null; location.hash = '#/'; }
      }, [Tk.icon('home', 17)])
    ]);
    root.append(box);
  }

  function toast(msg, err) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  // drop a finished session when leaving the review page; mid-session state is kept
  function reset() {
    if (session.queue && session.index >= session.queue.length) {
      session.queue = null;
      session.index = 0;
      session.correct = 0;
    }
  }

  return { render, reset };
})();

if (typeof globalThis !== 'undefined') globalThis.ReviewView = ReviewView;