'use strict';

const Tk = {
  uid() {
    return crypto.randomUUID();
  },

  nowISO() {
    return new Date().toISOString();
  },

  addDays(base, days) {
    const d = base instanceof Date ? new Date(base.getTime()) : new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  },

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },

  normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:"'`()\[\]{}\-–—]+$/g, '')
      .trim();
  },

  levenshtein(a, b) {
    // Damerau-Levenshtein: adjacent transposition counts as one edit
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev2 = null;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let d = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && prev2) {
          d = Math.min(d, prev2[j - 2] + 1);
        }
        curr[j] = d;
      }
      prev2 = prev; prev = curr; curr = new Array(n + 1);
    }
    return prev[n];
  },

  fuzzyMatch(userAnswer, correctAnswer) {
    const u = Tk.normalizeText(userAnswer);
    const c = Tk.normalizeText(correctAnswer);
    if (u === c) return true;
    if (c.length > 4 && Tk.levenshtein(u, c) <= 1) return true;
    return false;
  },

  splitIntoChunks(text, maxChars) {
    const chunks = [];
    let rest = String(text || '').trim();
    const limit = Math.max(2, maxChars | 0);
    while (rest.length > limit) {
      let cut = rest.lastIndexOf('. ', limit);
      let include = 2;
      if (cut <= 1) { cut = rest.lastIndexOf('\n', limit); include = 1; }
      if (cut <= 1) { cut = rest.lastIndexOf(' ', limit); include = 1; }
      if (cut <= 1) { cut = limit; include = 0; }
      chunks.push(rest.slice(0, cut + include).trim());
      rest = rest.slice(cut + include).trim();
    }
    if (rest) chunks.push(rest);
    return chunks.filter((c) => c.length > 0);
  },

  el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  },

  ICONS: {
    home: '<rect x="3" y="5" width="18" height="14" fill="none"/><path d="M3 8h18M8 5v18" stroke-dasharray="3 3"/>',
    dump: '<path d="M4 20c0-6 3-9 9-9s7 3 7 9M12 4l2 4M6 8l3-1M18 7l-3 1M12 6.2c1.2-1.4 3-2.2 3-2.2"/>',
    review: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M4 20l4-4"/>',
    library: '<path d="M5 5h14v14H5zM9 5v14M13 9l3 3-3 3"/>',
    settings: '<path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15.5 15.5L20 20"/>',
    trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12M10 10v6M14 10v6"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    download: '<path d="M12 4v10M7.5 9.5L12 14l4.5-4.5M5 19h14"/>',
    upload: '<path d="M12 14V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    flip: '<path d="M4 8h12M14 4l4 4-4 4M20 16H8M10 12l-4 4 4 4"/>',
    bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
    pen: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM13.5 7.5l3 3"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    helmet: '<path d="M5 12.5V9a7 7 0 0 1 14 0v3.5"/><path d="M7.5 11.5h9"/><path d="M12 9.5v7.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
  },

  icon(name, size) {
    const svg = Tk.el('svg', {
      viewBox: '0 0 24 24',
      width: size || 20,
      height: size || 20,
      fill: 'none',
      'stroke': 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    });
    svg.innerHTML = Tk.ICONS[name] || '';
    return svg;
  },

  storage: {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch {}
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch {}
    }
  }
};

if (typeof globalThis !== 'undefined') globalThis.Tk = Tk;
if (typeof module !== 'undefined') module.exports = Tk;