'use strict';

const UnlockView = (function () {

  function render(root) {
    root.innerHTML = '';
    const card = Tk.el('div', { class: 'paper unlock-card rot-1' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('div', { class: 'unlock-logo' }, [Tk.icon('helmet', 64)]),
      Tk.el('h1', { class: 'unlock-title', text: 'Trivia Knight' }),
      Tk.el('p', { class: 'hint', text: 'Enter your passcode to open your desk.' }),
      Tk.el('div', { class: 'field', style: 'width:100%;max-width:280px;margin:0' }, [
        Tk.el('label', { text: 'Passcode', for: 'unlock-pass' }),
        Tk.el('input', {
          type: 'password',
          id: 'unlock-pass',
          autocomplete: 'current-password',
          placeholder: 'your secret key',
          onkeydown: (ev) => { if (ev.key === 'Enter') unlock(); }
        })
      ]),
      Tk.el('button', { class: 'btn btn-primary', text: 'Unlock', id: 'unlock-btn', onclick: unlock })
    ]);
    root.appendChild(card);
    const input = document.getElementById('unlock-pass');
    if (input) input.focus();
  }

  async function unlock() {
    const input = document.getElementById('unlock-pass');
    const btn = document.getElementById('unlock-btn');
    if (!input || !btn || btn.disabled) return;
    const pass = input.value.trim();
    if (!pass) return;
    btn.disabled = true;
    try {
      await LlmClient.login(pass);
      toast('Unlocked');
      document.dispatchEvent(new CustomEvent('tk:unlocked'));
    } catch (err) {
      toast(err.message, true);
      input.value = '';
      input.focus();
    } finally {
      btn.disabled = false;
    }
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

if (typeof globalThis !== 'undefined') globalThis.UnlockView = UnlockView;