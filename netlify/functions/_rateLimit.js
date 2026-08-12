'use strict';

// In-memory per-IP limiter. Per-warm-instance state: acceptable for a
// personal app (Netlify may run several warm instances; worst case the
// limit is multiplied by instance count).

function createRateLimiter(opts) {
  const hourly = opts.hourly;
  const daily = opts.daily;
  const windowMs = opts.windowMs || 60 * 60 * 1000;
  const ips = new Map();

  function dayKey(d) {
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }

  return function check(ip) {
    if (!ip) return { ok: true, retryAfterMs: null };
    const now = Date.now();
    let rec = ips.get(ip);
    if (!rec) {
      rec = { tokens: [], day: { date: dayKey(new Date(now)), count: 0 } };
      ips.set(ip, rec);
    }
    rec.tokens = rec.tokens.filter((t) => now - t < windowMs);
    const today = dayKey(new Date(now));
    if (rec.day.date !== today) {
      rec.day = { date: today, count: 0 };
    }
    if (rec.tokens.length >= hourly || rec.day.count >= daily) {
      const retryAfterMs = rec.tokens.length
        ? windowMs - (now - rec.tokens[0])
        : windowMs;
      return { ok: false, retryAfterMs: Math.max(retryAfterMs, 0) };
    }
    rec.tokens.push(now);
    rec.day.count++;
    return { ok: true, retryAfterMs: null };
  };
}

module.exports = { createRateLimiter };
