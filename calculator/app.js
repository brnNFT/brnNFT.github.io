'use strict';
// Pure formula first (testable in Node by tests/test_calculadora_pwa.py), page wiring below.
// Same rule as the spreadsheet (produtos/forex-risk-journal/build.py): size = ROUNDDOWN(risk / loss per unit / step) * step.

const round = (x) => Math.round(x * 1e6) / 1e6;
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

// i: type forex|futures|stocks, balance, riskMode pct|amt, risk, stopMode price|dist, entry, stop, target,
// pipSize, pipValue, lotStep (forex), tickSize, tickValue (futures). Numbers or strings; empty = NaN.
function calc(i) {
  const n = (k) => num(i[k]);
  const fx = i.type === 'forex', fu = i.type === 'futures';
  const pct = i.riskMode !== 'amt';
  const balance = n('balance'), risk = pct ? balance * n('risk') / 100 : n('risk');
  if (!(risk > 0) || (pct && !(n('risk') <= 100))) {
    return { error: pct ? 'Enter a balance above 0 and a risk between 0 and 100%.' : 'Enter a risk amount above 0.' };
  }
  // unit = price distance of one pip / tick / currency unit; value = money per unit per lot / contract / share
  const unit = fx ? n('pipSize') : fu ? n('tickSize') : 1;
  const value = fx ? n('pipValue') : fu ? n('tickValue') : 1;
  const step = fx ? n('lotStep') : 1;
  if (!(unit > 0) || !(value > 0) || !(step > 0)) {
    return { error: 'Pip/tick size, pip/tick value and lot step must be above 0.' };
  }
  const dist = i.stopMode === 'dist';
  const stopSteps = round(dist ? n('stop') : Math.abs(n('entry') - n('stop')) / unit);
  if (!(stopSteps > 0)) {
    return { error: dist ? 'Enter a stop distance above 0.' : 'Enter an entry and a stop that are different.' };
  }
  const lossPerUnit = stopSteps * value;
  const size = round(Math.floor(risk / lossPerUnit / step + 1e-9) * step);
  const out = { risk: round(risk), stopSteps, lossPerUnit: round(lossPerUnit), size, riskAtSize: round(size * lossPerUnit) };
  if (balance > 0) out.riskPctAtSize = round(out.riskAtSize / balance * 100);
  const t = n('target');
  if (t > 0) {
    const sign = !dist && n('entry') < n('stop') ? -1 : 1;
    const tSteps = dist ? t : sign * (t - n('entry')) / unit;
    if (tSteps > 0) out.rr = round(tSteps / stopSteps);
    else out.warn = 'The target is on the wrong side of the entry.';
  }
  if (size === 0) out.warn = 'The risk is too small for this stop: the size rounds down to 0.';
  return out;
}

if (typeof module !== 'undefined') module.exports = { calc, num };

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const FIELDS = ['type', 'balance', 'riskMode', 'risk', 'stopMode', 'entry', 'stop', 'target',
    'pipSize', 'pipValue', 'lotStep', 'tickSize', 'tickValue'];
  const SHORT = { type: 't', balance: 'b', riskMode: 'rm', risk: 'r', stopMode: 'sm', entry: 'e', stop: 's',
    target: 'tp', pipSize: 'ps', pipValue: 'pv', lotStep: 'ls', tickSize: 'ts', tickValue: 'tv' };
  const UNIT = { forex: ['pips', 'lots'], futures: ['ticks', 'contracts'], stocks: ['price units', 'shares'] };
  const read = () => Object.fromEntries(FIELDS.map((k) => [k, $(k).value]));
  const fmt = (x, d = 2) => x.toLocaleString('en-US', { maximumFractionDigits: d });

  function shareUrl(v) {
    const q = new URLSearchParams();
    FIELDS.forEach((k) => { if (v[k] !== '') q.set(SHORT[k], v[k]); });
    return location.origin + location.pathname + '?' + q;
  }

  function render() {
    const v = read(), [stepUnit, sizeUnit] = UNIT[v.type] || UNIT.forex;
    document.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(v.type); });
    document.querySelectorAll('[data-mode]').forEach((el) => { el.hidden = el.dataset.mode !== v.stopMode; });
    document.querySelectorAll('[data-cta-type]').forEach((el) => { el.hidden = el.dataset.ctaType !== v.type; });
    $('riskUnit').textContent = v.riskMode === 'pct' ? '%' : 'currency';
    $('stopUnit').textContent = stepUnit;
    const r = calc(v);
    $('result').classList.toggle('bad', !!r.error);
    $('ok').hidden = !!r.error;
    $('err').textContent = r.error || '';
    $('shareUrl').value = shareUrl(v);
    if (r.error) return;
    $('big').textContent = `${fmt(r.size, 6)} ${r.size === 1 ? sizeUnit.slice(0, -1) : sizeUnit}`;
    $('rRisk').textContent = fmt(r.riskAtSize) + (r.riskPctAtSize ? ` (${fmt(r.riskPctAtSize)}% of balance)` : '');
    $('rBudget').textContent = fmt(r.risk);
    $('rStop').textContent = `${fmt(r.stopSteps, 4)} ${stepUnit}`;
    $('rRR').textContent = r.rr ? `${fmt(r.rr)} : 1` : 'add a target';
    $('warn').textContent = r.warn || '';
  }

  const q = new URLSearchParams(location.search);
  FIELDS.forEach((k) => { if (q.has(SHORT[k])) $(k).value = q.get(SHORT[k]); }); // a bad select value just leaves it empty
  if (!UNIT[$('type').value]) $('type').value = 'forex';
  if (!['pct', 'amt'].includes($('riskMode').value)) $('riskMode').value = 'pct';
  if (!['price', 'dist'].includes($('stopMode').value)) $('stopMode').value = 'price';
  document.querySelector('form').addEventListener('input', render);
  document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
  $('copy').addEventListener('click', () => {
    $('shareUrl').select();
    try { navigator.clipboard.writeText($('shareUrl').value); } catch (e) { document.execCommand('copy'); }
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy link'; }, 1500);
  });

  // Click count: Cloudflare Web Analytics (injected by Cloudflare, not by this page) has no custom events, so a click
  // is recorded as a page view of click/<type> through a pushState that is undone at once. No own cookies, no storage.
  document.querySelectorAll('[data-cta-type]').forEach((a) => a.addEventListener('click', () => {
    try {
      const here = location.pathname + location.search;
      history.pushState(null, '', location.pathname.replace(/[^/]*$/, '') + 'click/' + a.dataset.ctaType);
      history.replaceState(null, '', here);
    } catch (e) { /* analytics must never block the link */ }
  }));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
}
