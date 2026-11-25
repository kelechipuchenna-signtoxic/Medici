/* Medici Cutz — Point of Sale */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '−₦' : '₦') + Math.abs(v).toLocaleString('en-NG'); };
const num = (v) => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dObj = (d) => new Date(d + 'T00:00:00Z');
const addDays = (d, n) => new Date(dObj(d).getTime() + n * 864e5).toISOString().slice(0, 10);
const niceDate = (d) => { const x = dObj(d); return `${DAYS[x.getUTCDay()].slice(0, 3)} ${x.getUTCDate()} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
const shortDate = (d) => { const x = dObj(d); return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const fmt12 = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')}${ap}`; };
const stampTime = (s) => fmt12(String(s).slice(11, 16));
const METHODS = { cash: 'Cash', transfer: 'Transfer', card: 'Card', split: 'Split' };
const STATUS = { booked: 'Booked', checked_in: 'Checked in', completed: 'Completed', cancelled: 'Cancelled', forfeited: 'Late / no-show', paid: 'Paid', void: 'Void' };
const priceLabel = (x) => (x.price_max > x.price ? `${money(x.price)} – ${money(x.price_max)}` : money(x.price));
const fmtPhone = (p) => (p ? (p.startsWith('234') ? '0' + p.slice(3) : p) : '');

const I = {
  dash: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  reg: '<svg viewBox="0 0 24 24"><path d="M4 7h16l-1.5 12h-13z"/><path d="M8 7a4 4 0 0 1 8 0"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  rec: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 10h18M16 15h2"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/></svg>',
};

const S = { user: null };
let cart = newCart();
function newCart() { return { items: [], client: null, discount_type: 'pct', discount_value: '', discount_reason: '', redeem: '', method: '', tendered: '', booking_id: null, notes: '' }; }

// ------------------------------------------------------------------ infra
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.includes('/auth/')) { renderLogin(); throw new Error('Session expired. Please sign in again.'); }
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j;
}
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), err ? 6000 : 3500);
}
const fail = (e) => toast(e.message, true);
function modal({ title, body, foot = '', wide = false, mount }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h3>${esc(title)}</h3><button class="x" data-close aria-label="Close">✕</button></div>
    <div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  document.body.append(bg);
  mount && mount(bg, close);
  const f = bg.querySelector('input:not([type=hidden]),select'); f && f.focus();
  return close;
}
const confirmBox = (title, text, okLabel = 'Confirm', danger = false) => new Promise((res) => {
  modal({ title, body: `<p style="margin:0">${text}</p>`, foot: `<button class="btn ghost" data-close>Back</button><button class="btn ${danger ? 'danger' : 'gold'}" id="ok">${okLabel}</button>`,
    mount: (el, close) => { $('#ok', el).onclick = () => { close(); res(true); }; el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => res(false))); } });
});
const formData = (form) => Object.fromEntries(new FormData(form));
const field = (label, input, hint = '') => `<label class="field"><span>${label}</span>${input}${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
const isAdmin = () => S.user?.role === 'admin';
const staffOptions = (sel, filterCat) => `<option value="">— Barber —</option>` + S.staff.filter((s) => s.active && (!filterCat || !s.skills || s.skills.split(',').map((x) => x.trim()).includes(filterCat)))
  .map((s) => `<option value="${s.id}" ${s.id == sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
function openWhatsApp(promise) {
  const w = window.open('about:blank', '_blank');
  return promise.then((r) => { if (w) w.location = r.link; else location.href = r.link; return r; }).catch((e) => { w && w.close(); throw e; });
}

// ------------------------------------------------------------------ auth
function renderLogin() {
  document.title = 'Sign in · Medici POS';
  $('#root').innerHTML = `<div class="login"><form id="lf">
    <img src="/img/emblem-sm.png" alt=""><h1 class="gold-text">Medici Cutz</h1><p>Point of Sale</p>
    <div class="field"><span>Username</span><input name="username" autocomplete="username" autocapitalize="none" required></div>
    <div class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></div>
    <div id="le" style="color:var(--bad);font-size:13px;min-height:20px;margin-bottom:8px"></div>
    <button class="btn gold block lg">Sign in</button></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/auth/login', formData(e.target)); await boot(); }
    catch (err) { $('#le').textContent = err.message; }
  };
}
async function boot() {
  try { Object.assign(S, await api('GET', '/api/pos/bootstrap')); }
  catch { return renderLogin(); }
  renderShell(); route();
}
async function refreshCatalogue() { Object.assign(S, await api('GET', '/api/pos/bootstrap')); }

// ------------------------------------------------------------------ shell & routing
const NAV = [
  ['dashboard', 'Dashboard', I.dash], ['register', 'New sale', I.reg], ['bookings', 'Bookings', I.cal], ['sales', 'Sales & receipts', I.rec],
  ['clients', 'Clients & loyalty', I.users], 'sep', ['purchases', 'Purchases', I.box], ['expenses', 'Expenses', I.wallet], ['reports', 'Reports', I.chart], 'sep', ['settings', 'Settings', I.cog],
];
function renderShell() {
  $('#root').innerHTML = `<div class="app">
    <aside class="side" id="side">
      <div class="brand"><img src="/img/emblem-sm.png" alt=""><div><b class="gold-text">Medici Cutz</b><small>Point of Sale</small></div></div>
      <nav>${NAV.map((n) => (n === 'sep' ? '<div class="sep"></div>' : `<a href="#/${n[0]}" data-r="${n[0]}">${n[2]}${n[1]}</a>`)).join('')}</nav>
      <div class="me"><div><b>${esc(S.user.name)}</b><span class="muted">${S.user.role === 'admin' ? 'Administrator' : 'Cashier'}</span></div><button class="btn sm ghost" id="logout">Sign out</button></div>
    </aside>
    <main class="main"><div class="topbar"><div class="row" style="gap:10px"><button class="btn sm ghost menu-btn" id="menuBtn" aria-label="Menu">${I.menu}</button><h1 id="title"></h1></div><div class="actions" id="actions"></div></div>
    <div class="content" id="view"></div></main></div>`;
  $('#logout').onclick = async () => { await api('POST', '/api/auth/logout').catch(() => {}); renderLogin(); };
  $('#menuBtn').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('#side')) $('#side')?.classList.remove('open'); });
}
function route() {
  if (!S.user) return;
  const [name, ...rest] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
  const fn = VIEWS[name] || VIEWS.dashboard;
  $$('.side nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === name));
  $('#side').classList.remove('open');
  $('#actions').innerHTML = '';
  $('#view').innerHTML = '<div class="empty">Loading…</div>';
  Promise.resolve(fn(...rest)).catch(fail);
}
addEventListener('hashchange', route);
const setTitle = (t, actions = '') => { $('#title').textContent = t; $('#actions').innerHTML = actions; document.title = t + ' · Medici POS'; };

// ------------------------------------------------------------------ dashboard
const VIEWS = {};
VIEWS.dashboard = async () => {
  setTitle('Dashboard', `<a class="btn" href="#/bookings">${I.cal} Bookings</a><a class="btn gold" href="#/register">${I.plus} New sale</a>`);
  const d = await api('GET', '/api/pos/dashboard');
  const max = Math.max(1, ...d.week.map((w) => w.revenue));
  const waiting = d.bookings.filter((b) => b.status === 'booked' || b.status === 'checked_in');
  $('#view').innerHTML = `
  <div class="muted" style="margin:-6px 0 16px">${niceDate(d.date)}</div>
  <div class="kpis">
    <div class="kpi"><small>Today's sales</small><b class="gold">${money(d.today.revenue)}</b><div class="sub">${d.today.sales} transaction${d.today.sales === 1 ? '' : 's'}</div></div>
    <div class="kpi"><small>Today's outflows</small><b>${money(d.today.expenses)}</b><div class="sub">Expenses + purchases</div></div>
    <div class="kpi"><small>Month to date</small><b>${money(d.month.revenue)}</b><div class="sub">${d.month.new_clients} new client${d.month.new_clients === 1 ? '' : 's'}</div></div>
    <div class="kpi"><small>Month net</small><b style="color:${d.month.net >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(d.month.net)}</b><div class="sub">After expenses & purchases</div></div>
  </div>
  <div class="cols">
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Today's chairs</h3><span class="muted">${waiting.length} upcoming · ${d.bookings.length} total</span></div>
        <div class="scroll-x">${bookingTable(d.bookings, true)}</div></div>
      <div class="card"><div class="card-h"><h3>Last 7 days</h3><span class="muted">${money(d.week.reduce((a, w) => a + w.revenue, 0))}</span></div>
        <div class="card-b"><div class="bars">${d.week.map((w) => `<div class="b" title="${shortDate(w.date)}: ${money(w.revenue)}"><small>${w.revenue ? money(w.revenue).replace(/,\d{3}$/, 'k') : ''}</small><i style="height:${(w.revenue / max) * 100}%"></i><small>${DAYS[dObj(w.date).getUTCDay()].slice(0, 3)}</small></div>`).join('')}</div></div></div>
    </div>
    <div class="stack">
      ${shareCard()}
      <div class="card"><div class="card-h"><h3>Recent sales</h3><a href="#/sales" class="muted" style="font-size:13px">All →</a></div>
        ${d.recent.length ? `<table class="t">${d.recent.map((s) => `<tr class="click" data-sale="${s.id}"><td>${esc(s.number)}<div class="muted" style="font-size:12px">${esc(s.client_name || 'Walk-in')} · ${stampTime(s.created_at)}</div></td><td class="r money">${s.status === 'void' ? '<span class="pill void">Void</span>' : money(s.total)}</td></tr>`).join('')}</table>` : '<div class="empty">No sales yet. Your first one is a tap away.</div>'}</div>
      ${d.lowStock.length ? `<div class="card"><div class="card-h"><h3>Low stock</h3></div><table class="t">${d.lowStock.map((p) => `<tr><td>${esc(p.name)}</td><td class="r" style="color:var(--warn)">${p.stock} left</td></tr>`).join('')}</table></div>` : ''}
    </div>
  </div>`;
  bindShare(); bindBookingActions(VIEWS.dashboard);
  $$('[data-sale]').forEach((r) => (r.onclick = () => saleModal(r.dataset.sale)));
};

function shareCard() {
  const link = location.origin + '/book';
  return `<div class="card"><div class="card-h"><h3>Booking link</h3></div><div class="card-b">
    <div class="share"><code>${esc(link)}</code><button class="btn sm" id="copyLink">${I.copy} Copy</button></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" id="shareWa">${I.wa} Share on WhatsApp</button><a class="btn sm ghost" href="/book" target="_blank">Open</a></div>
    <p class="hint">Post this on your WhatsApp status, groups and Instagram bio. Clients book in under a minute.</p></div></div>`;
}
function bindShare() {
  const link = location.origin + '/book';
  const c = $('#copyLink'); if (!c) return;
  c.onclick = () => navigator.clipboard.writeText(link).then(() => toast('Booking link copied.'), () => prompt('Copy this link:', link));
  $('#shareWa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(`✂️ *Medici Cutz* — Abuja's premium barber shop.\nSkip the queue: book your chair in under a minute 👇\n${link}\n\nPlease arrive within ${S.settings.grace_minutes} minutes of your booked time.`), '_blank');
}

// ------------------------------------------------------------------ bookings
function bookingTable(rows, compact) {
  if (!rows.length) return '<div class="empty">No bookings for this day.</div>';
  return `<table class="t"><thead><tr><th>Time</th><th>Client</th><th>Service</th>${compact ? '' : '<th>Barber</th>'}<th>Status</th><th></th></tr></thead><tbody>
  ${rows.map((b) => `<tr>
    <td><b>${fmt12(b.time)}</b>${compact ? '' : `<div class="muted" style="font-size:12px">${shortDate(b.date)}</div>`}</td>
    <td>${esc(b.name)}<div class="muted" style="font-size:12px">${esc(fmtPhone(b.phone))} · ${esc(b.ref)}</div>${b.notes ? `<div class="muted" style="font-size:12px;font-style:italic">“${esc(b.notes)}”</div>` : ''}</td>
    <td>${esc(b.service_name)}${compact ? `<div class="muted" style="font-size:12px">${esc(b.staff_name || '')}</div>` : ''}</td>
    ${compact ? '' : `<td>${esc(b.staff_name || '—')}</td>`}
    <td><span class="pill ${b.status}">${STATUS[b.status]}</span></td>
    <td class="r"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap">${bookingActions(b)}</div></td></tr>`).join('')}</tbody></table>`;
}
function bookingActions(b) {
  const a = (act, label, cls = '') => `<button class="btn sm ${cls}" data-bk="${b.id}" data-act="${act}">${label}</button>`;
  if (b.status === 'booked') return a('checked_in', 'Check in') + a('bill', 'Bill', 'gold') + a('more', '⋯', 'ghost');
  if (b.status === 'checked_in') return a('bill', 'Bill', 'gold') + a('more', '⋯', 'ghost');
  if (b.status === 'forfeited') return a('override', 'Check in anyway', 'ghost');
  if (b.status === 'completed' && b.sale_id) return `<button class="btn sm ghost" data-sale="${b.sale_id}">Receipt</button>`;
  return '';
}
let bookingCache = {};
function bindBookingActions(refresh) {
  $$('[data-bk]').forEach((btn) => (btn.onclick = async (e) => {
    e.stopPropagation();
    const id = btn.dataset.bk, act = btn.dataset.act;
    try {
      if (act === 'checked_in') { await api('PATCH', `/api/pos/bookings/${id}`, { status: 'checked_in' }); toast('Checked in.'); return refresh(); }
      if (act === 'override') {
        if (!(await confirmBox('Late arrival', `This client arrived after the ${S.settings.grace_minutes}-minute grace window and the slot was released. Check them in only if the barber is free.`, 'Check in anyway'))) return;
        await api('PATCH', `/api/pos/bookings/${id}`, { status: 'checked_in', override: true }); toast('Checked in.'); return refresh();
      }
      if (act === 'bill') return billBooking(id);
      if (act === 'more') {
        modal({ title: 'Booking options', body: `<div class="stack"><button class="btn block" id="ns">Mark as no-show</button><button class="btn block danger" id="cx">Cancel booking</button></div>`,
          mount: (el, close) => {
            $('#ns', el).onclick = async () => { await api('PATCH', `/api/pos/bookings/${id}`, { status: 'forfeited' }).catch(fail); close(); refresh(); };
            $('#cx', el).onclick = async () => { await api('PATCH', `/api/pos/bookings/${id}`, { status: 'cancelled' }).catch(fail); close(); refresh(); };
          } });
      }
    } catch (err) { fail(err); }
  }));
  $$('#view [data-sale]').forEach((r) => (r.onclick = (e) => { e.stopPropagation(); saleModal(r.dataset.sale); }));
}
async function billBooking(id) {
  const rows = await api('GET', `/api/pos/bookings?from=${addDays(S.today, -1)}&to=${addDays(S.today, 30)}`);
  const b = rows.find((x) => x.id == id);
  if (!b) return toast('Booking not found.', true);
  cart = newCart();
  cart.booking_id = b.id;
  if (b.client_id) cart.client = await api('GET', `/api/pos/clients/${b.client_id}`);
  const svc = S.services.find((s) => s.id === b.service_id);
  if (svc) cart.items.push({ key: Math.random(), type: 'service', id: svc.id, name: svc.name, price: svc.price, qty: 1, staff_id: b.staff_id, category: svc.category });
  if (b.status === 'booked') await api('PATCH', `/api/pos/bookings/${id}`, { status: 'checked_in' }).catch(() => {});
  location.hash = '#/register';
}

VIEWS.bookings = async (date) => {
  date = date || S.today;
  setTitle('Bookings', `<button class="btn" id="prev">‹</button><input type="date" id="bd" value="${date}" style="width:auto"><button class="btn" id="next">›</button><button class="btn gold" id="newB">${I.plus} New booking</button>`);
  const rows = await api('GET', `/api/pos/bookings?from=${date}&to=${date}`);
  const count = (s) => rows.filter((r) => r.status === s).length;
  $('#view').innerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Upcoming</small><b>${count('booked')}</b></div><div class="kpi"><small>In the chair</small><b>${count('checked_in')}</b></div>
      <div class="kpi"><small>Completed</small><b class="gold">${count('completed')}</b></div><div class="kpi"><small>Late / no-show</small><b style="color:var(--bad)">${count('forfeited')}</b></div>
    </div>
    <div class="cols"><div class="card"><div class="card-h"><h3>${niceDate(date)}</h3><span class="muted">${rows.length} booking${rows.length === 1 ? '' : 's'}</span></div><div class="scroll-x">${bookingTable(rows, false)}</div></div>
    <div class="stack">${shareCard()}<div class="card card-b"><b class="serif" style="font-size:19px">Arrival policy</b><p class="muted" style="margin:6px 0 0">Bookings not checked in within <b class="gold">${S.settings.grace_minutes} minutes</b> of their start time are automatically marked <i>late / no-show</i>, and the slot reopens for online booking.</p></div></div></div>`;
  const go = (d) => (location.hash = '#/bookings/' + d);
  $('#prev').onclick = () => go(addDays(date, -1)); $('#next').onclick = () => go(addDays(date, 1));
  $('#bd').onchange = (e) => go(e.target.value);
  $('#newB').onclick = () => newBookingModal(date);
  bindShare(); bindBookingActions(() => VIEWS.bookings(date));
};
function newBookingModal(date) {
  const svc = S.services.filter((s) => s.active && s.bookable);
  modal({ title: 'New booking (phone / walk-in)', body: `<form id="nb">
    <div class="grid2">${field('Service', `<select name="service_id">${svc.map((s) => `<option value="${s.id}">${esc(s.name)} · ${money(s.price)}</option>`).join('')}</select>`)}
    ${field('Barber', `<select name="staff_id"><option value="">First available</option>${S.staff.filter((s) => s.active && s.bookable).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`)}</div>
    <div class="grid2">${field('Date', `<input type="date" name="date" value="${date < S.today ? S.today : date}" min="${S.today}">`)}${field('Time', '<select name="time" required></select>')}</div>
    <div class="grid2">${field('Client name', '<input name="name" required>')}${field('Phone (WhatsApp)', '<input name="phone" type="tel" required>')}</div>
    <div class="grid2">${field('Email (optional)', '<input name="email" type="email">')}${field('Referral code (optional)', '<input name="referral">')}</div>
    ${field('Notes', '<input name="notes">')}</form>`,
    foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="save">Book</button>',
    mount: (el, close) => {
      const f = $('#nb', el);
      const load = async () => {
        const r = await api('GET', `/api/pos/availability?date=${f.date.value}&service=${f.service_id.value}&staff=${f.staff_id.value}`).catch(() => ({ slots: [] }));
        const av = r.slots.filter((s) => s.available);
        f.time.innerHTML = av.length ? av.map((s) => `<option value="${s.time}">${fmt12(s.time)}</option>`).join('') : '<option value="">No free slots</option>';
      };
      ['service_id', 'staff_id', 'date'].forEach((n) => (f[n].onchange = load)); load();
      $('#save', el).onclick = async () => {
        try { const b = await api('POST', '/api/pos/bookings', formData(f)); close(); toast(`Booked ${b.name} · ${fmt12(b.time)} · ${b.ref}`); location.hash = '#/bookings/' + b.date; route(); }
        catch (e) { fail(e); }
      };
    } });
}

// ------------------------------------------------------------------ register
function cartTotals() {
  const subtotal = cart.items.reduce((a, l) => a + l.price * l.qty, 0);
  let discount = 0; const v = num(cart.discount_value);
  if (v) discount = Math.min(subtotal, cart.discount_type === 'pct' ? Math.round(subtotal * Math.min(v, 100) / 100) : Math.round(v));
  const pv = Number(S.settings.point_value) || 10;
  let redeem = Math.min(Math.floor(num(cart.redeem)), cart.client ? cart.client.points : 0);
  redeem = Math.min(redeem, Math.floor((subtotal - discount) / pv));
  const pointsValue = redeem * pv;
  return { subtotal, discount, redeem, pointsValue, total: subtotal - discount - pointsValue };
}
VIEWS.register = async () => {
  setTitle('New sale', `<button class="btn ghost" id="clearCart">Clear</button>`);
  const cats = {};
  S.services.filter((s) => s.active).forEach((s) => (cats[s.category] = cats[s.category] || []).push(s));
  const tabs = [...Object.keys(cats), 'Products', 'Custom'];
  $('#view').innerHTML = `<div class="register">
    <div><div class="tabs" id="catTabs">${tabs.map((t, i) => `<button class="${i ? '' : 'on'}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div><div id="catalogue"></div></div>
    <div class="card ticket" id="ticket"></div></div>`;
  const showCat = (t) => {
    $$('#catTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'Custom') {
      $('#catalogue').innerHTML = `<div class="card card-b" style="max-width:460px"><form id="cf">${field('Description', '<input name="name" placeholder="e.g. Hair dye, home service" required>')}
        ${field('Price (₦)', '<input name="price" inputmode="numeric" required>')}<button class="btn gold">Add to ticket</button></form></div>`;
      $('#cf').onsubmit = (e) => { e.preventDefault(); const d = formData(e.target); if (!d.name || !num(d.price)) return; addItem({ type: 'custom', name: d.name, price: num(d.price) }); e.target.reset(); };
      return;
    }
    const list = t === 'Products' ? S.products.filter((p) => p.active) : cats[t];
    $('#catalogue').innerHTML = list.length ? `<div class="tiles">${list.map((x) => `<button class="tile" data-id="${x.id}"><b>${esc(x.name)}</b><div class="row" style="justify-content:space-between"><span>${priceLabel(x)}</span><small>${t === 'Products' ? `${x.stock} in stock` : x.duration + ' min'}</small></div></button>`).join('')}</div>` : '<div class="empty">Nothing here yet — add items in Settings.</div>';
    $$('#catalogue .tile').forEach((b) => (b.onclick = () => {
      const x = list.find((i) => i.id == b.dataset.id);
      if (t !== 'Products' && x.price_max > x.price) return pickPrice(x);
      addItem(t === 'Products' ? { type: 'product', id: x.id, name: x.name, price: x.price } : { type: 'service', id: x.id, name: x.name, price: x.price, category: x.category });
    }));
  };
  $$('#catTabs button').forEach((b) => (b.onclick = () => showCat(b.dataset.t)));
  $('#clearCart').onclick = () => { cart = newCart(); renderTicket(); };
  showCat(tabs[0]); renderTicket();
};
function pickPrice(x) {
  modal({ title: x.name, body: `${field(`Price (${priceLabel(x)})`, `<input id="pp" inputmode="numeric" value="${x.price}">`)}
    <div class="row">${[x.price, Math.round((x.price + x.price_max) / 2 / 500) * 500, x.price_max].filter((v, i, a) => a.indexOf(v) === i).map((v) => `<button class="btn sm" data-v="${v}">${money(v)}</button>`).join('')}</div>`,
    foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="ok">Add to ticket</button>',
    mount: (el, close) => {
      const add = (v) => {
        const price = Math.round(num(v));
        if (price < x.price || price > x.price_max) return toast(`Price must be between ${money(x.price)} and ${money(x.price_max)}.`, true);
        close(); addItem({ type: 'service', id: x.id, name: x.name, price, category: x.category });
      };
      $$('[data-v]', el).forEach((b) => (b.onclick = () => add(b.dataset.v)));
      $('#ok', el).onclick = () => add($('#pp', el).value);
      $('#pp', el).onkeydown = (e) => e.key === 'Enter' && add(e.target.value);
    } });
}
function addItem(it) {
  const same = cart.items.find((l) => l.type === it.type && l.id === it.id && l.price === it.price && it.type !== 'custom');
  if (same) same.qty++;
  else cart.items.push({ key: Math.random(), qty: 1, staff_id: it.type === 'service' ? (cart.items.find((l) => l.staff_id)?.staff_id || '') : '', ...it });
  renderTicket();
}
function totalsHTML(t) {
  return `<div><span>Subtotal</span><span class="money">${money(t.subtotal)}</span></div>
    ${t.discount ? `<div><span>Discount</span><span class="money">−${money(t.discount)}</span></div>` : ''}
    ${t.pointsValue ? `<div><span>Points (${t.redeem})</span><span class="money">−${money(t.pointsValue)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span class="money">${money(t.total)}</span></div>`;
}
function updateTotals() {
  const t = cartTotals();
  $('#tot').innerHTML = totalsHTML(t);
  $('#charge').textContent = 'Charge ' + money(t.total);
  const ch = $('#change'); if (ch) ch.innerHTML = num(cart.tendered) >= t.total && t.total ? 'Change: <b class="gold">' + money(num(cart.tendered) - t.total) + '</b>' : '';
}
function renderTicket() {
  const el = $('#ticket'); if (!el) return;
  const t = cartTotals(); const c = cart.client; const minR = Number(S.settings.min_redeem_points);
  el.innerHTML = `<div class="card-h"><h3>Ticket</h3>${cart.booking_id ? '<span class="pill booked">From booking</span>' : ''}</div><div class="card-b">
    <div style="margin-bottom:14px">${c ? `<div class="client-box"><div class="row" style="justify-content:space-between"><div><b>${esc(c.name)}</b><div class="muted" style="font-size:12.5px">${esc(fmtPhone(c.phone))}${c.email ? ' · ' + esc(c.email) : ''}</div></div><button class="x" id="rmClient" title="Remove client">✕</button></div>
        <div class="row" style="margin-top:8px;font-size:13px;gap:16px"><span><b class="gold">${c.points}</b> pts</span><span>${c.visits} visits</span><span class="muted">Code ${esc(c.referral_code || '')}</span></div></div>`
      : `<div style="position:relative"><div class="row" style="flex-wrap:nowrap;gap:6px"><input id="cq" placeholder="Find client by name or phone…" autocomplete="off"><button class="btn" id="addClient" title="New client">${I.plus}</button></div><div class="suggest" id="sug" hidden></div>
         <div class="hint">Attach a client to earn loyalty points and send their receipt.</div></div>`}</div>
    ${cart.items.length ? cart.items.map((l) => `<div class="line" data-k="${l.key}"><div><div class="nm">${esc(l.name)}</div><div class="muted" style="font-size:12.5px">${money(l.price)} each</div></div><div class="money">${money(l.price * l.qty)}</div>
      <div class="ctl">${l.type !== 'product' ? `<select data-staff>${staffOptions(l.staff_id, l.category)}</select>` : '<span style="flex:1"></span>'}
      <div class="qty"><button data-q="-1" aria-label="Less">−</button><span>${l.qty}</span><button data-q="1" aria-label="More">+</button></div><button class="x" data-rm aria-label="Remove">✕</button></div></div>`).join('')
      : '<div class="empty" style="padding:26px 0">Tap a service to start the ticket.</div>'}
    <div style="margin-top:14px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="muted" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase">Discount</span>
      <div class="seg"><button data-dt="pct" class="${cart.discount_type === 'pct' ? 'on' : ''}">%</button><button data-dt="amount" class="${cart.discount_type === 'amount' ? 'on' : ''}">₦</button></div></div>
      <div class="grid2" style="gap:6px"><input id="dv" inputmode="decimal" placeholder="${cart.discount_type === 'pct' ? 'e.g. 10' : 'e.g. 1000'}" value="${esc(cart.discount_value)}"><input id="dr" placeholder="Reason (optional)" value="${esc(cart.discount_reason)}"></div></div>
    ${c && c.points >= minR ? `<div style="margin-top:12px"><div class="muted" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px">Redeem points <span class="gold" style="letter-spacing:0;text-transform:none">· ${c.points} available · ₦${S.settings.point_value}/pt</span></div>
      <div class="row" style="flex-wrap:nowrap;gap:6px"><input id="rp" inputmode="numeric" placeholder="Min ${minR}" value="${esc(cart.redeem)}"><button class="btn" id="maxPts">Use max</button></div></div>` : ''}
    <div class="totals" style="margin-top:16px" id="tot">${totalsHTML(t)}</div>
    <div class="pay" style="margin-top:14px">${Object.entries(METHODS).map(([k, v]) => `<button data-pm="${k}" class="${cart.method === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    ${cart.method === 'cash' ? `<div class="grid2" style="margin-top:8px;gap:6px;align-items:center"><input id="tend" inputmode="numeric" placeholder="Cash received" value="${esc(cart.tendered)}"><div class="muted" id="change">${num(cart.tendered) >= t.total && t.total ? 'Change: <b class="gold">' + money(num(cart.tendered) - t.total) + '</b>' : ''}</div></div>` : ''}
    <button class="btn gold block lg" style="margin-top:14px" id="charge" ${cart.items.length && cart.method ? '' : 'disabled'}>Charge ${money(t.total)}</button>
  </div>`;
  bindTicket();
}
let sugTimer;
function bindTicket() {
  const el = $('#ticket');
  $$('.line', el).forEach((row) => {
    const l = cart.items.find((x) => String(x.key) === row.dataset.k);
    $$('[data-q]', row).forEach((b) => (b.onclick = () => { l.qty = Math.max(1, l.qty + Number(b.dataset.q)); renderTicket(); }));
    $('[data-rm]', row).onclick = () => { cart.items = cart.items.filter((x) => x !== l); renderTicket(); };
    const s = $('[data-staff]', row); if (s) s.onchange = () => (l.staff_id = s.value);
  });
  $$('[data-dt]', el).forEach((b) => (b.onclick = () => { cart.discount_type = b.dataset.dt; renderTicket(); }));
  const live = (id, key) => { const i = $(id, el); if (i) i.oninput = () => { cart[key] = i.value; updateTotals(); }; };
  live('#dv', 'discount_value'); live('#rp', 'redeem');
  const dr = $('#dr', el); dr.oninput = () => (cart.discount_reason = dr.value);
  const tend = $('#tend', el);
  if (tend) tend.oninput = () => { cart.tendered = tend.value; updateTotals(); };
  const mx = $('#maxPts', el); if (mx) mx.onclick = () => { cart.redeem = String(cart.client.points); renderTicket(); };
  $$('[data-pm]', el).forEach((b) => (b.onclick = () => { cart.method = b.dataset.pm; renderTicket(); }));
  const rc = $('#rmClient', el); if (rc) rc.onclick = () => { cart.client = null; cart.redeem = ''; renderTicket(); };
  const cq = $('#cq', el);
  if (cq) cq.oninput = () => {
    clearTimeout(sugTimer);
    if (cq.value.trim().length < 2) return ($('#sug').hidden = true);
    sugTimer = setTimeout(async () => {
      const list = await api('GET', '/api/pos/clients?q=' + encodeURIComponent(cq.value.trim().replace(/^0/, ''))).catch(() => []);
      const sug = $('#sug'); if (!sug) return; sug.hidden = false;
      sug.innerHTML = list.length ? list.slice(0, 8).map((c) => `<div data-c="${c.id}"><b>${esc(c.name)}</b> <span class="muted">${esc(fmtPhone(c.phone))} · ${c.points} pts</span></div>`).join('') : '<div class="muted" data-new>No match — tap to add new client</div>';
      $$('[data-c]', sug).forEach((d) => (d.onclick = () => { cart.client = list.find((c) => c.id == d.dataset.c); renderTicket(); }));
      const n = $('[data-new]', sug); if (n) n.onclick = () => clientForm(null, (c) => { cart.client = c; renderTicket(); }, cq.value);
    }, 220);
  };
  const ac = $('#addClient', el); if (ac) ac.onclick = () => clientForm(null, (c) => { cart.client = c; renderTicket(); });
  $('#charge', el).onclick = charge;
}
async function charge() {
  const t = cartTotals();
  if (cart.method === 'cash' && cart.tendered && num(cart.tendered) < t.total) return toast('Cash received is less than the total.', true);
  const missing = cart.items.some((l) => l.type === 'service' && !l.staff_id);
  if (missing && !(await confirmBox('No barber selected', 'Some services have no barber assigned, so no commission will be recorded for them. Continue?', 'Continue'))) return;
  $('#charge').disabled = true;
  try {
    const sale = await api('POST', '/api/pos/sales', {
      items: cart.items.map((l) => ({ type: l.type, id: l.id, name: l.name, price: l.price, qty: l.qty, staff_id: l.staff_id || null })),
      client_id: cart.client?.id || null, discount_type: cart.discount_type, discount_value: num(cart.discount_value), discount_reason: cart.discount_reason,
      redeem_points: t.redeem, payment_method: cart.method, amount_tendered: num(cart.tendered) || null, booking_id: cart.booking_id,
    });
    cart = newCart(); renderTicket(); refreshCatalogue().catch(() => {});
    toast(`${sale.number} — ${money(sale.total)} recorded.`);
    saleModal(sale.id, true);
  } catch (e) { fail(e); $('#charge') && ($('#charge').disabled = false); }
}

// ------------------------------------------------------------------ sale / receipt modal
async function saleModal(id, fresh) {
  const s = await api('GET', '/api/pos/sales/' + id).catch(fail); if (!s) return;
  modal({ title: fresh ? 'Payment received' : `Sale ${s.number}`, wide: true,
    body: `<div class="cols" style="grid-template-columns:1fr 1fr;gap:20px">
      <iframe class="receipt-frame" src="${esc(s.receipt_url)}" title="Receipt preview"></iframe>
      <div>
        ${fresh ? `<div class="big-points">${money(s.total)}</div><p class="muted" style="margin:6px 0 18px">${esc(s.number)} · ${METHODS[s.payment_method]}${s.client_id ? ` · +${s.points_earned} pts to ${esc(s.client_name)}` : ''}</p>` :
          `<dl class="kv" style="margin-bottom:18px"><dt>Status</dt><dd><span class="pill ${s.status}">${STATUS[s.status]}</span>${s.void_reason ? ' ' + esc(s.void_reason) : ''}</dd><dt>Client</dt><dd>${esc(s.client_name || 'Walk-in')}</dd><dt>Cashier</dt><dd>${esc(s.cashier || '')}</dd><dt>Paid</dt><dd>${money(s.total)} · ${METHODS[s.payment_method]}</dd><dt>Time</dt><dd>${esc(s.created_at)}</dd></dl>`}
        <div class="field"><span>Send by WhatsApp</span><div class="send-row"><input id="waP" type="tel" placeholder="0803 000 0000" value="${esc(fmtPhone(s.client_phone))}"><button class="btn gold" id="waB">${I.wa} WhatsApp</button></div></div>
        <div class="field"><span>Send by email</span><div class="send-row"><input id="emA" type="email" placeholder="client@email.com" value="${esc(s.client_email || '')}"><button class="btn" id="emB">${I.mail} Email</button></div>
          ${S.email_enabled ? '' : '<div class="hint">Email sending is not configured yet — see README. WhatsApp works now.</div>'}</div>
        <div class="muted" style="font-size:12.5px">${s.whatsapped_at ? 'WhatsApp opened ' + esc(s.whatsapped_at.slice(11, 16)) + '. ' : ''}${s.emailed_at ? 'Emailed ' + esc(s.emailed_at.slice(11, 16)) + '.' : ''}</div>
        <div class="row" style="margin-top:18px"><a class="btn ghost" href="${esc(s.receipt_url)}" target="_blank">Open receipt</a>
          <button class="btn ghost" id="cpR">${I.copy} Copy link</button>${isAdmin() && s.status === 'paid' ? '<button class="btn danger" id="voidB">Void sale</button>' : ''}</div>
      </div></div>`,
    foot: fresh ? '<button class="btn gold" data-close>New sale</button>' : '<button class="btn" data-close>Close</button>',
    mount: (el, close) => {
      $('#waB', el).onclick = () => openWhatsApp(api('POST', `/api/pos/sales/${s.id}/whatsapp`, { phone: $('#waP', el).value })).then(() => toast('WhatsApp opened with the receipt — tap send.')).catch(fail);
      $('#emB', el).onclick = async (e) => { e.target.disabled = true; try { const r = await api('POST', `/api/pos/sales/${s.id}/email`, { email: $('#emA', el).value }); toast('Receipt emailed to ' + r.to); } catch (err) { fail(err); } e.target.disabled = false; };
      $('#cpR', el).onclick = () => navigator.clipboard.writeText(s.receipt_url).then(() => toast('Receipt link copied.'));
      const v = $('#voidB', el);
      if (v) v.onclick = () => modal({ title: 'Void ' + s.number, body: field('Reason', '<input id="vr" placeholder="e.g. Charged twice">', 'Points, visit count and product stock will be reversed.'),
        foot: '<button class="btn ghost" data-close>Back</button><button class="btn danger" id="vok">Void sale</button>',
        mount: (m, c2) => { $('#vok', m).onclick = async () => { try { await api('POST', `/api/pos/sales/${s.id}/void`, { reason: $('#vr', m).value }); c2(); close(); toast('Sale voided.'); route(); } catch (e) { fail(e); } }; } });
    } });
}

// ------------------------------------------------------------------ sales list
function rangeBar(from, to, base) {
  return `<input type="date" id="rf" value="${from}" style="width:auto"><span class="muted">to</span><input type="date" id="rt" value="${to}" style="width:auto">`;
}
function bindRange(base) {
  const go = () => (location.hash = `#/${base}/${$('#rf').value}/${$('#rt').value}`);
  $('#rf').onchange = go; $('#rt').onchange = go;
}
VIEWS.sales = async (from, to) => {
  from = from || S.today; to = to || from;
  setTitle('Sales & receipts', rangeBar(from, to) + `<a class="btn" href="/api/pos/export/sales?from=${from}&to=${to}">${I.dl} CSV</a>`);
  bindRange('sales');
  const rows = await api('GET', `/api/pos/sales?from=${from}&to=${to}`);
  const paid = rows.filter((r) => r.status === 'paid');
  const tot = (k) => paid.reduce((a, r) => a + r[k], 0);
  $('#view').innerHTML = `<div class="kpis"><div class="kpi"><small>Revenue</small><b class="gold">${money(tot('total'))}</b></div><div class="kpi"><small>Transactions</small><b>${paid.length}</b></div>
    <div class="kpi"><small>Discounts given</small><b>${money(tot('discount_amount'))}</b></div><div class="kpi"><small>Points redeemed</small><b>${money(tot('points_value'))}</b></div></div>
    <div class="card scroll-x">${rows.length ? `<table class="t"><thead><tr><th>Receipt</th><th>Time</th><th>Client</th><th>Method</th><th>Sent</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="click" data-sale="${r.id}"><td>${esc(r.number)}</td><td>${shortDate(r.created_at.slice(0, 10))} · ${stampTime(r.created_at)}</td><td>${esc(r.client_name || 'Walk-in')}</td><td>${METHODS[r.payment_method]}</td>
      <td class="muted">${[r.whatsapped_at && 'WhatsApp', r.emailed_at && 'Email'].filter(Boolean).join(', ') || '—'}</td><td><span class="pill ${r.status}">${STATUS[r.status]}</span></td><td class="r money">${money(r.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No sales in this period.</div>'}</div>`;
  $$('[data-sale]').forEach((r) => (r.onclick = () => saleModal(r.dataset.sale)));
};

// ------------------------------------------------------------------ clients
function clientForm(c, onSaved, preset = '') {
  const isPhone = /^\+?\d[\d\s]{5,}$/.test(preset);
  modal({ title: c ? 'Edit client' : 'New client', body: `<form id="cf">
    ${field('Full name', `<input name="name" value="${esc(c?.name || (isPhone ? '' : preset))}" required>`)}
    <div class="grid2">${field('Phone (WhatsApp)', `<input name="phone" type="tel" value="${esc(c ? fmtPhone(c.phone) : isPhone ? preset : '')}">`)}${field('Email', `<input name="email" type="email" value="${esc(c?.email || '')}">`)}</div>
    ${c ? '' : field('Referred by (code or phone)', '<input name="referral" placeholder="Optional">', `Referrer earns ${S.settings.referral_bonus} pts after this client's first paid visit.`)}
    ${field('Notes', `<textarea name="notes" rows="2" placeholder="Preferred style, barber, allergies…">${esc(c?.notes || '')}</textarea>`)}</form>`,
    foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="save">Save</button>',
    mount: (el, close) => {
      $('#save', el).onclick = async () => {
        try { const r = await api(c ? 'PUT' : 'POST', '/api/pos/clients' + (c ? '/' + c.id : ''), formData($('#cf', el))); close(); toast('Client saved.'); onSaved && onSaved(r); }
        catch (e) { fail(e); }
      };
    } });
}
VIEWS.clients = async (q = '') => {
  q = decodeURIComponent(q);
  setTitle('Clients & loyalty', `<a class="btn" href="/api/pos/export/clients">${I.dl} CSV</a><button class="btn gold" id="nc">${I.plus} New client</button>`);
  $('#nc').onclick = () => clientForm(null, () => route());
  $('#view').innerHTML = `<div class="row" style="margin-bottom:14px"><input id="cs" placeholder="Search name, phone, email or referral code…" value="${esc(q)}" style="max-width:420px"></div>
    <div class="card scroll-x" id="clist"><div class="empty">Loading…</div></div>`;
  const load = async () => {
    const rows = await api('GET', '/api/pos/clients?q=' + encodeURIComponent($('#cs').value.trim().replace(/^0/, '')));
    $('#clist').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Client</th><th>Phone</th><th class="r">Visits</th><th class="r">Spent</th><th class="r">Points</th><th>Referral code</th><th>Referred by</th></tr></thead><tbody>
      ${rows.map((c) => `<tr class="click" data-c="${c.id}"><td><b>${esc(c.name)}</b>${c.email ? `<div class="muted" style="font-size:12px">${esc(c.email)}</div>` : ''}</td><td>${esc(fmtPhone(c.phone))}</td><td class="r">${c.visits}</td><td class="r money">${money(c.total_spent)}</td>
      <td class="r gold">${c.points}</td><td>${esc(c.referral_code || '')}</td><td class="muted">${esc(c.referred_by_name || '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No clients found.</div>';
    $$('[data-c]').forEach((r) => (r.onclick = () => clientModal(r.dataset.c)));
  };
  let t; $('#cs').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  load();
};
async function clientModal(id) {
  const c = await api('GET', '/api/pos/clients/' + id).catch(fail); if (!c) return;
  const S2 = S.settings;
  const nextMilestone = Number(S2.visit_milestone) - (c.visits % Number(S2.visit_milestone));
  const refMsg = `Hey! I get my cuts at *Medici Cutz* — Abuja's premium barber shop ✂️\nBook with my code *${c.referral_code}* and we both earn rewards:\n${location.origin}/book?ref=${c.referral_code}`;
  modal({ title: c.name, wide: true, body: `
    <div class="cols" style="grid-template-columns:1fr 1.3fr;gap:20px"><div>
      <div class="card card-b" style="margin-bottom:14px"><div class="muted" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase">Points balance</div>
        <div class="big-points">${c.points}</div><div class="muted">Worth ${money(c.points * Number(S2.point_value))} · ${nextMilestone} visit${nextMilestone === 1 ? '' : 's'} to next ${S2.visit_milestone_bonus}-pt bonus</div>
        ${isAdmin() ? '<button class="btn sm" id="adj" style="margin-top:10px">Adjust points</button>' : ''}</div>
      <dl class="kv"><dt>Phone</dt><dd>${esc(fmtPhone(c.phone)) || '—'}</dd><dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Visits</dt><dd>${c.visits}</dd><dt>Total spent</dt><dd>${money(c.total_spent)}</dd>
        <dt>Client since</dt><dd>${esc(String(c.created_at).slice(0, 10))}</dd><dt>Referred by</dt><dd>${esc(c.referred_by_name || '—')}</dd><dt>Notes</dt><dd>${esc(c.notes || '—')}</dd></dl>
      <div class="card card-b" style="margin-top:14px"><div class="muted" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase">Referral code</div>
        <div class="row" style="justify-content:space-between;margin-top:4px"><b class="serif gold" style="font-size:28px">${esc(c.referral_code)}</b><button class="btn sm" id="shareRef">${I.wa} Send to client</button></div>
        <div class="hint">${c.referrals.length} referral${c.referrals.length === 1 ? '' : 's'} · ${c.referrals.filter((r) => r.referral_rewarded).length} rewarded</div></div>
    </div><div>
      <div class="tabs" id="ct"><button class="on" data-t="sales">Visits</button><button data-t="points">Points history</button><button data-t="refs">Referrals</button><button data-t="bk">Bookings</button></div><div id="cpane"></div>
    </div></div>`,
    foot: `<button class="btn ghost" id="edit">Edit</button><button class="btn gold" id="sell">Start sale</button>`,
    mount: (el, close) => {
      const panes = {
        sales: () => (c.sales.length ? `<table class="t">${c.sales.map((s) => `<tr class="click" data-sale="${s.id}"><td>${esc(s.number)}</td><td class="muted">${esc(s.created_at.slice(0, 16))}</td><td><span class="pill ${s.status}">${STATUS[s.status]}</span></td><td class="r money">${money(s.total)}</td></tr>`).join('')}</table>` : '<div class="empty">No visits yet.</div>'),
        points: () => (c.ledger.length ? `<table class="t">${c.ledger.map((l) => `<tr><td>${esc(l.reason)}</td><td class="muted">${esc(l.created_at.slice(0, 10))}</td><td class="r" style="color:${l.delta > 0 ? 'var(--ok)' : 'var(--bad)'}">${l.delta > 0 ? '+' : ''}${l.delta}</td></tr>`).join('')}</table>` : '<div class="empty">No points activity yet.</div>'),
        refs: () => (c.referrals.length ? `<table class="t">${c.referrals.map((r) => `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.created_at.slice(0, 10))}</td><td class="r">${r.referral_rewarded ? '<span class="pill completed">Rewarded</span>' : '<span class="pill booked">Awaiting first visit</span>'}</td></tr>`).join('')}</table>` : '<div class="empty">No referrals yet. Share their code!</div>'),
        bk: () => (c.bookings.length ? `<table class="t">${c.bookings.map((b) => `<tr><td>${esc(b.service_name)}</td><td class="muted">${shortDate(b.date)} · ${fmt12(b.time)}</td><td class="r"><span class="pill ${b.status}">${STATUS[b.status]}</span></td></tr>`).join('')}</table>` : '<div class="empty">No bookings.</div>'),
      };
      const show = (t) => { $$('#ct button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); $('#cpane', el).innerHTML = panes[t](); $$('[data-sale]', el).forEach((r) => (r.onclick = () => saleModal(r.dataset.sale))); };
      $$('#ct button', el).forEach((b) => (b.onclick = () => show(b.dataset.t))); show('sales');
      $('#shareRef', el).onclick = () => window.open(`https://wa.me/${c.phone || ''}?text=${encodeURIComponent(refMsg)}`, '_blank');
      $('#edit', el).onclick = () => { close(); clientForm(c, () => { route(); clientModal(c.id); }); };
      $('#sell', el).onclick = () => { close(); cart = newCart(); cart.client = c; location.hash = '#/register'; };
      const adj = $('#adj', el);
      if (adj) adj.onclick = () => modal({ title: 'Adjust points', body: `<div class="grid2">${field('Points (+ or −)', '<input id="pd" inputmode="numeric" placeholder="e.g. 50 or -20">')}${field('Reason', '<input id="pr" placeholder="e.g. Birthday gift">')}</div>`,
        foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="pok">Apply</button>',
        mount: (m, c2) => { $('#pok', m).onclick = async () => { try { await api('POST', `/api/pos/clients/${c.id}/points`, { delta: Number($('#pd', m).value), reason: $('#pr', m).value }); c2(); close(); toast('Points updated.'); clientModal(c.id); } catch (e) { fail(e); } }; } });
    } });
}

// ------------------------------------------------------------------ purchases & expenses
VIEWS.purchases = async (from, to) => {
  to = to || S.today; from = from || addDays(to, -30);
  setTitle('Purchases', rangeBar(from, to) + `<a class="btn" href="/api/pos/export/purchases?from=${from}&to=${to}">${I.dl} CSV</a>`);
  bindRange('purchases');
  const rows = await api('GET', `/api/pos/purchases?from=${from}&to=${to}`);
  $('#view').innerHTML = `<div class="cols" style="grid-template-columns:360px 1fr">
    <div class="card"><div class="card-h"><h3>Record purchase</h3></div><form class="card-b" id="pf">
      ${field('Date', `<input type="date" name="date" value="${S.today}">`)}
      ${field('Retail product (adds to stock)', `<select name="product_id"><option value="">— Not a retail product —</option>${S.products.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.stock} in stock)</option>`).join('')}</select>`)}
      ${field('Item / description', '<input name="item" placeholder="e.g. Clipper blades, towels, aftershave">')}
      <div class="grid2">${field('Quantity', '<input name="qty" inputmode="decimal" value="1">')}${field('Unit cost (₦)', '<input name="unit_cost" inputmode="numeric" required>')}</div>
      ${field('Supplier', '<input name="supplier">')}
      ${field('Paid by', `<select name="payment_method">${Object.entries(METHODS).filter(([k]) => k !== 'split').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}
      ${field('Notes', '<input name="notes">')}
      <button class="btn gold block">Save purchase</button></form></div>
    <div class="card scroll-x"><div class="card-h"><h3>${shortDate(from)} – ${shortDate(to)}</h3><b class="gold money">${money(rows.reduce((a, r) => a + r.total, 0))}</b></div>
      ${rows.length ? `<table class="t"><thead><tr><th>Date</th><th>Item</th><th>Supplier</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${shortDate(r.date)}</td><td>${esc(r.item)}${r.product_id ? ' <span class="pill booked">stock</span>' : ''}<div class="muted" style="font-size:12px">${esc(r.recorded_by || '')}${r.notes ? ' · ' + esc(r.notes) : ''}</div></td><td>${esc(r.supplier || '—')}</td><td class="r">${r.qty}</td><td class="r money">${money(r.unit_cost)}</td><td class="r money">${money(r.total)}</td>
      <td class="r">${isAdmin() ? `<button class="x" data-del="${r.id}" title="Delete">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No purchases recorded in this period.</div>'}</div></div>`;
  const f = $('#pf');
  f.product_id.onchange = () => { const p = S.products.find((x) => x.id == f.product_id.value); if (p) { f.item.value = p.name; f.unit_cost.value = p.cost || ''; } };
  f.onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/pos/purchases', formData(f)); toast('Purchase recorded.'); await refreshCatalogue(); route(); } catch (err) { fail(err); } };
  $$('[data-del]').forEach((b) => (b.onclick = async () => { if (await confirmBox('Delete purchase', 'Remove this purchase record? Stock added by it will be reversed.', 'Delete', true)) { await api('DELETE', '/api/pos/purchases/' + b.dataset.del).catch(fail); await refreshCatalogue(); route(); } }));
};
VIEWS.expenses = async (from, to) => {
  to = to || S.today; from = from || addDays(to, -30);
  setTitle('Expenses', rangeBar(from, to) + `<a class="btn" href="/api/pos/export/expenses?from=${from}&to=${to}">${I.dl} CSV</a>`);
  bindRange('expenses');
  const { categories, rows } = await api('GET', `/api/pos/expenses?from=${from}&to=${to}`);
  const byCat = {}; rows.forEach((r) => (byCat[r.category] = (byCat[r.category] || 0) + r.amount));
  $('#view').innerHTML = `<div class="cols" style="grid-template-columns:360px 1fr">
    <div class="stack"><div class="card"><div class="card-h"><h3>Record expense</h3></div><form class="card-b" id="ef">
      ${field('Date', `<input type="date" name="date" value="${S.today}">`)}
      ${field('Category', `<select name="category">${categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select>`)}
      ${field('Description', '<input name="description" placeholder="e.g. Diesel for generator">')}
      <div class="grid2">${field('Amount (₦)', '<input name="amount" inputmode="numeric" required>')}${field('Paid by', `<select name="payment_method">${Object.entries(METHODS).filter(([k]) => k !== 'split').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}</div>
      ${field('Paid to', '<input name="payee" placeholder="Optional">')}
      <button class="btn gold block">Save expense</button></form></div>
      ${Object.keys(byCat).length ? `<div class="card"><div class="card-h"><h3>By category</h3></div><table class="t">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r money">${money(v)}</td></tr>`).join('')}</table></div>` : ''}</div>
    <div class="card scroll-x"><div class="card-h"><h3>${shortDate(from)} – ${shortDate(to)}</h3><b class="gold money">${money(rows.reduce((a, r) => a + r.amount, 0))}</b></div>
      ${rows.length ? `<table class="t"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${shortDate(r.date)}</td><td>${esc(r.category)}</td><td>${esc(r.description || '')}${r.payee ? `<div class="muted" style="font-size:12px">to ${esc(r.payee)}</div>` : ''}</td><td>${METHODS[r.payment_method] || esc(r.payment_method)}</td><td class="r money">${money(r.amount)}</td>
      <td class="r">${isAdmin() ? `<button class="x" data-del="${r.id}" title="Delete">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No expenses recorded in this period.</div>'}</div></div>`;
  $('#ef').onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/pos/expenses', formData(e.target)); toast('Expense recorded.'); route(); } catch (err) { fail(err); } };
  $$('[data-del]').forEach((b) => (b.onclick = async () => { if (await confirmBox('Delete expense', 'Remove this expense record?', 'Delete', true)) { await api('DELETE', '/api/pos/expenses/' + b.dataset.del).catch(fail); route(); } }));
};

// ------------------------------------------------------------------ reports
VIEWS.reports = async (from, to) => {
  to = to || S.today; from = from || to.slice(0, 8) + '01';
  const pre = (f, t) => `#/reports/${f}/${t}`;
  const m0 = S.today.slice(0, 8) + '01', lmEnd = addDays(m0, -1), lm0 = lmEnd.slice(0, 8) + '01';
  const wd = dObj(S.today).getUTCDay(), w0 = addDays(S.today, -((wd + 6) % 7));
  setTitle('Reports', `<div class="seg"><button onclick="location.hash='${pre(S.today, S.today)}'">Today</button><button onclick="location.hash='${pre(w0, S.today)}'">This week</button><button onclick="location.hash='${pre(m0, S.today)}'">This month</button><button onclick="location.hash='${pre(lm0, lmEnd)}'">Last month</button></div>` + rangeBar(from, to));
  bindRange('reports');
  const r = await api('GET', `/api/pos/reports?from=${from}&to=${to}`);
  const max = Math.max(1, ...r.daily.map((d) => d.revenue));
  const bk = r.bookings, bkTotal = Object.values(bk).reduce((a, b) => a + b, 0);
  $('#view').innerHTML = `
  <div class="kpis"><div class="kpi"><small>Revenue</small><b class="gold">${money(r.revenue)}</b><div class="sub">${r.sales_count} sales</div></div>
    <div class="kpi"><small>Purchases + expenses</small><b>${money(r.purchases + r.expenses)}</b></div>
    <div class="kpi"><small>Net position</small><b style="color:${r.net >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(r.net)}</b><div class="sub">${r.revenue ? Math.round((r.net / r.revenue) * 100) + '% margin' : '—'}</div></div>
    <div class="kpi"><small>Average ticket</small><b>${money(r.sales_count ? r.revenue / r.sales_count : 0)}</b></div></div>
  <div class="cols">
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Daily revenue</h3><span class="muted">${shortDate(from)} – ${shortDate(to)}</span></div><div class="card-b"><div class="bars" style="gap:${r.daily.length > 20 ? 2 : 6}px">
        ${r.daily.map((d) => `<div class="b" title="${shortDate(d.date)}: ${money(d.revenue)}"><i style="height:${(d.revenue / max) * 100}%"></i>${r.daily.length <= 14 ? `<small>${dObj(d.date).getUTCDate()}</small>` : ''}</div>`).join('')}</div></div></div>
      <div class="card scroll-x"><div class="card-h"><h3>Services & products</h3></div>${r.by_item.length ? `<table class="t"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Net sales</th></tr></thead><tbody>${r.by_item.map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${i.qty}</td><td class="r money">${money(i.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No sales.</div>'}</div>
      <div class="card scroll-x"><div class="card-h"><h3>Staff commissions</h3><b class="gold money">${money(r.commissions)}</b></div>${r.by_staff.length ? `<table class="t"><thead><tr><th>Staff</th><th class="r">Services</th><th class="r">Net sales</th><th class="r">Rate</th><th class="r">Commission</th></tr></thead><tbody>
        ${r.by_staff.map((s) => `<tr><td>${esc(s.name)}</td><td class="r">${s.services}</td><td class="r money">${money(s.sales)}</td><td class="r">${s.pct}%</td><td class="r money gold">${money(s.commission)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No staff-attributed services.</div>'}
        <p class="hint" style="padding:0 18px 14px">Commission is calculated on service value after discounts. Record payouts under Expenses → Commissions.</p></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Profit & loss</h3></div><div class="card-b"><table class="pl" style="width:100%;border-collapse:collapse">
        <tr><td>Gross sales</td><td class="money">${money(r.gross)}</td></tr>
        <tr class="ind"><td>Less discounts</td><td class="money">−${money(r.discounts)}</td></tr>
        <tr class="ind"><td>Less points redeemed</td><td class="money">−${money(r.points_redeemed_value)}</td></tr>
        <tr><td><b>Net revenue</b></td><td class="money"><b>${money(r.revenue)}</b></td></tr>
        <tr class="ind"><td>Purchases</td><td class="money">−${money(r.purchases)}</td></tr>
        ${r.expenses_by_cat.map((e) => `<tr class="ind"><td>${esc(e.category)}</td><td class="money">−${money(e.amount)}</td></tr>`).join('')}
        <tr class="tot"><td>Net</td><td class="money" style="color:${r.net >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(r.net)}</td></tr></table></div></div>
      <div class="card"><div class="card-h"><h3>Payment methods</h3></div><table class="t">${Object.entries(r.by_method).map(([k, v]) => `<tr><td>${METHODS[k] || k}</td><td class="r money">${money(v)}</td></tr>`).join('') || '<tr><td class="muted">No payments.</td></tr>'}</table></div>
      <div class="card"><div class="card-h"><h3>Bookings & loyalty</h3></div><div class="card-b"><dl class="kv"><dt>Online bookings</dt><dd>${bkTotal}</dd><dt>Completed</dt><dd>${bk.completed || 0}</dd><dt>Late / no-show</dt><dd>${bk.forfeited || 0}${bkTotal ? ` (${Math.round(((bk.forfeited || 0) / bkTotal) * 100)}%)` : ''}</dd><dt>Cancelled</dt><dd>${bk.cancelled || 0}</dd><dt>Points issued</dt><dd>${r.points_issued}</dd></dl></div></div>
      <div class="card card-b"><b class="serif" style="font-size:19px">Export for your accountant</b><div class="row" style="margin-top:10px">
        ${['sales', 'expenses', 'purchases'].map((t) => `<a class="btn sm" href="/api/pos/export/${t}?from=${from}&to=${to}">${I.dl} ${t[0].toUpperCase() + t.slice(1)}</a>`).join('')}</div></div>
    </div></div>`;
};

// ------------------------------------------------------------------ settings
VIEWS.settings = async (tab) => {
  setTitle('Settings');
  const tabs = isAdmin() ? [['business', 'Business'], ['booking', 'Booking & hours'], ['loyalty', 'Loyalty & discounts'], ['services', 'Services'], ['products', 'Products'], ['staff', 'Staff'], ['users', 'POS users'], ['me', 'My password']] : [['me', 'My password']];
  tab = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];
  $('#view').innerHTML = `<div class="tabs">${tabs.map(([k, v]) => `<button class="${k === tab ? 'on' : ''}" onclick="location.hash='#/settings/${k}'">${v}</button>`).join('')}</div><div id="sp"></div>`;
  const st = S.settings, sp = $('#sp');
  const settingsForm = (inner) => {
    sp.innerHTML = `<form class="card card-b" id="sf" style="max-width:760px">${inner}<button class="btn gold">Save changes</button></form>`;
    $('#sf').onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (tab === 'booking') {
        const hours = {}; for (let i = 0; i < 7; i++) hours[i] = d['open' + i] ? [d['from' + i], d['to' + i]] : null;
        Object.keys(d).forEach((k) => /^(open|from|to)\d$/.test(k) && delete d[k]); d.hours = JSON.stringify(hours);
      }
      try { S.settings = await api('PUT', '/api/pos/settings', d); toast('Settings saved.'); } catch (err) { fail(err); }
    };
  };
  const inp = (k, label, hint = '', type = 'text') => field(label, `<input name="${k}" type="${type}" value="${esc(st[k])}">`, hint);
  if (tab === 'business') settingsForm(`<div class="grid2">${inp('business_name', 'Business name')}${inp('tagline', 'Tagline')}</div>${inp('address', 'Address')}
    <div class="grid2">${inp('phone', 'Phone (display)')}${inp('whatsapp', 'WhatsApp number', 'International format, digits only — e.g. 2348031234567')}</div>
    <div class="grid2">${inp('email', 'Email')}${inp('instagram', 'Instagram handle')}</div>
    ${inp('bank_details', 'Bank details on receipt', 'Optional — e.g. GTBank · 0123456789 · Medici Cutz Ltd')}${inp('receipt_footer', 'Receipt thank-you message')}`);
  if (tab === 'booking') {
    const h = JSON.parse(st.hours);
    settingsForm(`<div class="grid3">${inp('grace_minutes', 'Arrival grace (minutes)', 'After this, the booking is released.', 'number')}${inp('slot_minutes', 'Slot interval (minutes)', '', 'number')}${inp('booking_days_ahead', 'Book up to (days ahead)', '', 'number')}</div>
      <div class="muted" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin:8px 0">Opening hours</div>
      <table class="t" style="margin-bottom:16px">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<tr><td style="width:150px"><label class="row" style="gap:8px"><input type="checkbox" name="open${i}" ${h[i] ? 'checked' : ''}> ${DAYS[i]}</label></td>
        <td><input type="time" name="from${i}" value="${h[i]?.[0] || '09:00'}" style="color-scheme:dark"></td><td><input type="time" name="to${i}" value="${h[i]?.[1] || '20:00'}" style="color-scheme:dark"></td></tr>`).join('')}</table>`);
  }
  if (tab === 'loyalty') settingsForm(`<div class="grid3">${inp('points_per_visit', 'Points per visit', '', 'number')}${inp('points_per_1000', 'Extra points per ₦1,000', '', 'number')}${inp('point_value', 'Value of 1 point (₦)', '', 'number')}</div>
    <div class="grid3">${inp('visit_milestone', 'Milestone every N visits', '', 'number')}${inp('visit_milestone_bonus', 'Milestone bonus points', '', 'number')}${inp('min_redeem_points', 'Minimum points to redeem', '', 'number')}</div>
    <div class="grid3">${inp('referral_bonus', 'Referrer reward (points)', 'Awarded when the new client pays for their first visit.', 'number')}${inp('referee_bonus', 'New client welcome bonus', '', 'number')}${inp('max_discount_pct', 'Cashier discount cap (%)', 'Larger discounts need an admin.', 'number')}</div>`);
  const listEditor = (kind, cols, fields, title) => {
    const rows = S[kind];
    sp.innerHTML = `<div class="card scroll-x"><div class="card-h"><h3>${title}</h3><button class="btn gold sm" id="add">${I.plus} Add</button></div>
      <table class="t"><thead><tr>${cols.map((c) => `<th class="${c[2] || ''}">${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${r.id}" style="${r.active ? '' : 'opacity:.45'}">${cols.map((c) => `<td class="${c[2] || ''}">${c[3] ? c[3](r) : esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const edit = (r) => modal({ title: (r ? 'Edit ' : 'Add ') + title.toLowerCase().replace(/s$/, ''), body: `<form id="ef">${fields.map(([k, label, type, hint]) => type === 'bool'
        ? `<label class="row" style="gap:8px;margin-bottom:12px"><input type="checkbox" name="${k}" ${(r ? r[k] : 1) ? 'checked' : ''}> ${label}</label>`
        : field(label, `<input name="${k}" type="${type || 'text'}" value="${esc(r ? r[k] ?? '' : '')}">`, hint || '')).join('')}</form>`,
      foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="sv">Save</button>',
      mount: (el, close) => {
        $('#sv', el).onclick = async () => {
          const f = $('#ef', el); const d = {};
          fields.forEach(([k, , type]) => (d[k] = type === 'bool' ? f[k].checked : type === 'number' ? Number(f[k].value) || 0 : f[k].value.trim()));
          try { await api(r ? 'PUT' : 'POST', `/api/pos/${kind}${r ? '/' + r.id : ''}`, d); close(); await refreshCatalogue(); toast('Saved.'); route(); } catch (e) { fail(e); }
        };
      } });
    $('#add').onclick = () => edit(null);
    $$('[data-id]', sp).forEach((tr) => (tr.onclick = () => edit(rows.find((r) => r.id == tr.dataset.id))));
  };
  const yes = (k) => (r) => (r[k] ? 'Yes' : '—');
  if (tab === 'services') listEditor('services', [['name', 'Service'], ['category', 'Category'], ['duration', 'Minutes', 'r'], ['price', 'Price', 'r', priceLabel], ['bookable', 'Online', '', yes('bookable')]],
    [['name', 'Name'], ['description', 'Description'], ['category', 'Category', 'text', 'Staff skills match on this (e.g. Hair Cuts, Shaving, Nails &amp; Hand/Foot Care)'], ['price', 'Price (₦)', 'number', 'For a price range, this is the lowest price.'], ['price_max', 'Maximum price (₦)', 'number', 'Only for price ranges, e.g. ₦1,000 – ₦2,000. Leave 0 for a fixed price.'], ['duration', 'Duration (minutes)', 'number'], ['sort', 'Display order', 'number'], ['bookable', 'Bookable online', 'bool'], ['active', 'Active', 'bool']], 'Services');
  if (tab === 'products') listEditor('products', [['name', 'Product'], ['price', 'Price', 'r', (r) => money(r.price)], ['cost', 'Cost', 'r', (r) => money(r.cost)], ['stock', 'Stock', 'r']],
    [['name', 'Name'], ['price', 'Selling price (₦)', 'number'], ['cost', 'Unit cost (₦)', 'number'], ['stock', 'In stock', 'number', 'Purchases linked to this product add stock automatically.'], ['active', 'Active', 'bool']], 'Products');
  if (tab === 'staff') listEditor('staff', [['name', 'Name'], ['title', 'Role'], ['commission_pct', 'Commission', 'r', (r) => r.commission_pct + '%'], ['skills', 'Service categories'], ['bookable', 'Online', '', yes('bookable')]],
    [['name', 'Name'], ['title', 'Role / title'], ['commission_pct', 'Commission (%)', 'number'], ['skills', 'Service categories', 'text', 'Comma-separated service categories, e.g. Hair Cuts, Shaving, Dreadlocks. Leave blank for all.'], ['bookable', 'Clients can book online', 'bool'], ['active', 'Active', 'bool']], 'Staff');
  if (tab === 'users') {
    sp.innerHTML = `<div class="card scroll-x"><div class="card-h"><h3>POS users</h3><button class="btn gold sm" id="addU">${I.plus} Add user</button></div><table class="t"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.role === 'admin' ? 'Administrator' : 'Cashier'}</td><td>${u.active ? 'Active' : '<span class="muted">Disabled</span>'}</td>
      <td class="r"><button class="btn sm" data-pw="${u.id}">Reset password</button> ${u.id !== S.user.id ? `<button class="btn sm ghost" data-tg="${u.id}">${u.active ? 'Disable' : 'Enable'}</button>` : ''}</td></tr>`).join('')}</tbody></table>
      <p class="hint" style="padding:0 18px 14px">Cashiers can sell, book, record purchases & expenses and send receipts. Only administrators can void sales, delete records, adjust points, give large discounts and change settings.</p></div>`;
    $('#addU').onclick = () => modal({ title: 'Add POS user', body: `<form id="uf"><div class="grid2">${field('Full name', '<input name="name">')}${field('Username', '<input name="username" autocapitalize="none">')}</div>
      <div class="grid2">${field('Password', '<input name="password" type="password" minlength="8">', 'At least 8 characters')}${field('Role', '<select name="role"><option value="cashier">Cashier</option><option value="admin">Administrator</option></select>')}</div></form>`,
      foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="sv">Create</button>',
      mount: (el, close) => { $('#sv', el).onclick = async () => { try { await api('POST', '/api/pos/users', formData($('#uf', el))); close(); await refreshCatalogue(); toast('User created.'); route(); } catch (e) { fail(e); } }; } });
    $$('[data-pw]').forEach((b) => (b.onclick = () => modal({ title: 'Reset password', body: field('New password', '<input id="np" type="password">', 'At least 8 characters. The user will be signed out.'),
      foot: '<button class="btn ghost" data-close>Cancel</button><button class="btn gold" id="sv">Reset</button>',
      mount: (el, close) => { $('#sv', el).onclick = async () => { try { await api('PUT', '/api/pos/users/' + b.dataset.pw, { password: $('#np', el).value }); close(); toast('Password reset.'); } catch (e) { fail(e); } }; } })));
    $$('[data-tg]').forEach((b) => (b.onclick = async () => { const u = S.users.find((x) => x.id == b.dataset.tg); await api('PUT', '/api/pos/users/' + u.id, { active: !u.active }).catch(fail); await refreshCatalogue(); route(); }));
  }
  if (tab === 'me') {
    sp.innerHTML = `<form class="card card-b" id="mf" style="max-width:420px">${field('Current password', '<input name="current" type="password" autocomplete="current-password">')}${field('New password', '<input name="next" type="password" autocomplete="new-password">', 'At least 8 characters')}<button class="btn gold">Change password</button></form>`;
    $('#mf').onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/auth/password', formData(e.target)); e.target.reset(); toast('Password changed.'); } catch (err) { fail(err); } };
  }
};

boot();
