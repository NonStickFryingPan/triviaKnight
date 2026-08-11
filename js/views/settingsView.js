'use strict';

const SettingsView = (function () {

  function render(root) {
    root.innerHTML = '';
    const title = Tk.el('h1', { class: 'page-title', text: 'Settings' });
    const sub = Tk.el('p', { class: 'page-sub', text: 'key, backups, and daily appetite' });
    root.append(title, sub);

    const stack = Tk.el('div', { class: 'settings-stack' });
    stack.append(
      apiCard(),
      backupCard(),
      syncCard(),
      dailyCard(),
      aboutCard()
    );
    root.appendChild(stack);
    refreshStats();
  }

  function apiCard() {
    if (LlmClient.keyManagedRemotely()) {
      return Tk.el('div', { class: 'paper settings-card rot--1' }, [
        Tk.el('div', { class: 'tape' }),
        Tk.el('h3', { text: 'DeepSeek API key' }),
        Tk.el('p', { class: 'hint', text: 'Managed by the server (Netlify environment variable) — nothing to configure here.' }),
        Tk.el('div', { class: 'row', style: 'margin-top:10px' }, [
          Tk.el('span', { class: 'desc', text: 'Status' }),
          Tk.el('div', { class: 'ctrl' }, [
            Tk.el('span', { class: 'tag tag-yellow', text: 'set on server' })
          ])
        ])
      ]);
    }
    const card = Tk.el('div', { class: 'paper settings-card rot--1' }, [
      Tk.el('div', { class: 'tape' }),
      Tk.el('h3', { text: 'DeepSeek API key' }),
      Tk.el('p', { class: 'hint', text: 'Used only for the one-time "text to cards" call. Stored in this browser, sent only to your own proxy. Never logged.' }),
      Tk.el('div', { style: 'display:flex;gap:10px;align-items:flex-end;margin-top:12px;flex-wrap:wrap' }, [
        Tk.el('div', { class: 'field', style: 'flex:1 1 280px;margin:0' }, [
          Tk.el('label', { text: 'Key (sk-…)', for: 'api-key-input' }),
          Tk.el('input', { type: 'password', id: 'api-key-input', value: LlmClient.getApiKey(), placeholder: 'sk-…', autocomplete: 'off' })
        ]),
        Tk.el('button', { class: 'btn btn-primary btn-small', text: 'Save key', onclick: saveKey })
      ])
    ]);
    return card;
  }

  function saveKey() {
    const input = document.getElementById('api-key-input');
    LlmClient.setApiKey(input.value);
    toast(input.value.trim() ? 'API key saved' : 'API key cleared');
  }

  function backupCard() {
    const card = Tk.el('div', { class: 'paper settings-card rot-1' }, [
      Tk.el('h3', { text: 'Backup' }),
      Tk.el('p', { class: 'hint', text: 'Everything lives in this browser only — export a JSON file to be safe. (Included: scheduling state.)' }),
      Tk.el('div', { style: 'display:flex;gap:10px;margin-top:14px;flex-wrap:wrap' }, [
        Tk.el('button', { class: 'btn btn-ghost btn-small', text: 'Export backup', onclick: exportBackup }, [Tk.icon('download', 15)]),
        Tk.el('label', { class: 'btn btn-ghost btn-small', style: 'cursor:pointer;display:inline-flex;align-items:center;gap:9px' }, [
          Tk.icon('upload', 15),
          'Import backup',
          Tk.el('input', { type: 'file', accept: '.json,application/json', class: 'hidden', id: 'import-file' })
        ])
      ])
    ]);
    card.querySelector('#import-file').addEventListener('change', importBackup);
    return card;
  }

  async function exportBackup() {
    const json = await Db.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'triviaKnight-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  }

  async function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      await Db.importAll(text);
      toast('Backup imported');
      refreshStats();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function syncCard() {
    const managed = LlmClient.keyManagedRemotely();
    const syncPending = !Tk.storage.get('tk_sheet_url', '') || !Tk.storage.get('tk_sheet_token', '');
    const fields = managed ? [
      Tk.el('div', { class: 'row', style: 'margin-top:10px' }, [
        Tk.el('span', { class: 'desc', text: 'Apps Script URL' }),
        Tk.el('div', { class: 'ctrl' }, [
          Tk.el('span', { class: 'tag', text: syncPending ? 'not set on server' : 'managed by passcode' })
        ])
      ]),
      Tk.el('div', { class: 'row' }, [
        Tk.el('span', { class: 'desc', text: 'Token' }),
        Tk.el('div', { class: 'ctrl' }, [
          Tk.el('span', { class: 'tag tag-yellow', text: syncPending ? 'not set on server' : 'managed by passcode' })
        ])
      ]),
      syncPending ? Tk.el('p', { class: 'hint', style: 'margin-top:10px', text: 'Set SHEET_URL and SHEET_TOKEN in Netlify environment variables, redeploy, then unlock again.' }) : null
    ] : [
      Tk.el('div', { style: 'display:flex;gap:10px;align-items:flex-end;margin-top:14px;flex-wrap:wrap' }, [
        Tk.el('div', { class: 'field', style: 'flex:1 1 320px;margin:0' }, [
          Tk.el('label', { text: 'Apps Script URL', for: 'sync-url' }),
          Tk.el('input', {
            type: 'text',
            id: 'sync-url',
            value: Tk.storage.get('tk_sheet_url', ''),
            placeholder: 'https://script.google.com/macros/s/…/exec',
            autocomplete: 'off',
            onchange: (ev) => {
              Tk.storage.set('tk_sheet_url', ev.target.value.trim());
              toast('Apps Script URL saved');
            }
          })
        ]),
        Tk.el('div', { class: 'field', style: 'flex:1 1 220px;margin:0' }, [
          Tk.el('label', { text: 'Token', for: 'sync-token' }),
          Tk.el('input', {
            type: 'password',
            id: 'sync-token',
            value: Tk.storage.get('tk_sheet_token', ''),
            placeholder: 'secret token',
            autocomplete: 'off',
            onchange: (ev) => {
              Tk.storage.set('tk_sheet_token', ev.target.value.trim());
              toast('Token saved');
            }
          })
        ])
      ])
    ];
    const actions = [
      Tk.el('button', { class: 'btn btn-ghost btn-small', text: 'Pull now', id: 'sync-pull', onclick: onPull }, [Tk.icon('download', 15)]),
      Tk.el('button', { class: 'btn btn-ghost btn-small', text: 'Push to sheet', id: 'sync-push', onclick: onPush }, [Tk.icon('upload', 15)])
    ];
    if (managed) {
      actions.push(Tk.el('button', { class: 'btn btn-ghost btn-small', text: 'Lock site', id: 'sync-lock', onclick: lockSite }, [Tk.icon('lock', 15)]));
    }
    const card = Tk.el('div', { class: 'paper settings-card rot-1' }, [
      Tk.el('h3', { text: 'Backup & Sync' }),
      Tk.el('p', { class: 'hint', text: 'Sync between devices through your own Google Sheet. Pulls merge per card (newest wins); push overwrites the sheet; deleted cards can come back from it.' }),
      ...fields,
      Tk.el('div', { style: 'display:flex;gap:10px;margin-top:16px;flex-wrap:wrap' }, actions),
      Tk.el('p', { class: 'hint', style: 'margin-top:12px', id: 'sync-last', text: 'Last synced: ' + formatLastSync(SheetsSync.lastSync()) })
    ]);
    return card;
  }

  function lockSite() {
    LlmClient.lock();
    toast('Locked — enter your passcode to reopen');
    location.hash = '#/';
  }

  function formatLastSync(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  function refreshLastSync() {
    const el = document.getElementById('sync-last');
    if (!el) return;
    el.textContent = 'Last synced: ' + formatLastSync(SheetsSync.lastSync());
  }

  function setBusy(which, busy) {
    const btn = document.getElementById(which);
    if (btn) btn.disabled = busy;
  }

  async function onPull() {
    setBusy('sync-pull', true);
    try {
      const res = await SheetsSync.pull();
      refreshLastSync();
      if (res.added || res.updated) {
        toast('Pulled ' + res.added + ' new, ' + res.updated + ' updated');
        refreshStats();
      } else {
        toast('Up to date');
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      setBusy('sync-pull', false);
    }
  }

  async function onPush() {
    setBusy('sync-push', true);
    try {
      const remoteTs = await SheetsSync.remoteStatus();
      if (remoteTs && remoteTs > SheetsSync.lastSync() &&
          !confirm('The sheet was changed elsewhere since your last sync. Push anyway?')) {
        return;
      }
      const res = await SheetsSync.push();
      refreshLastSync();
      toast('Pushed ' + res.count + ' cards');
    } catch (err) {
      toast(err.message, true);
    } finally {
      setBusy('sync-push', false);
    }
  }

  function dailyCard() {
    const card = Tk.el('div', { class: 'paper settings-card rot--1' }, [
      Tk.el('h3', { text: 'Daily limit' }),
      Tk.el('div', { class: 'row', style: 'margin-top:8px' }, [
        Tk.el('span', { class: 'desc', text: 'New cards allowed per review session. Repeats are never capped.' }),
        Tk.el('div', { class: 'ctrl', style: 'width:110px' }, [
          Tk.el('input', {
            type: 'number',
            id: 'daily-input',
            min: '1',
            max: '500',
            value: Tk.storage.get('dsk_new_per_day', '20'),
            onchange: (ev) => {
              const v = Math.max(1, Math.min(500, parseInt(ev.target.value, 10) || 20));
              Tk.storage.set('dsk_new_per_day', String(v));
              ev.target.value = v;
              toast('New cards per day: ' + v);
            }
          })
        ])
      ])
    ]);
    return card;
  }

  function aboutCard() {
    const card = Tk.el('div', { class: 'paper settings-card rot-1' }, [
      Tk.el('h3', { text: 'The archive' }),
      Tk.el('p', { class: 'hint', id: 'stat-line', text: 'Loading…' }),
      Tk.el('p', { class: 'hint', text: 'FSRS scheduler — the memory model behind Anki\'s modern scheduling. Backend correctness is pure math; the LLM never touches scheduling or grading.' })
    ]);
    return card;
  }

  async function refreshStats() {
    const cards = await Db.getAllCards();
    const line = document.getElementById('stat-line');
    if (!line) return;
    const due = cards.filter((c) => c.dueDate <= new Date().toISOString()).length;
    const cats = new Set(cards.map((c) => c.category)).size;
    line.textContent = cards.length + ' cards, ' + cats + ' categories, ' + due + ' due today.';
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