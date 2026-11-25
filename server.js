// Medici Cutz — website, booking & point of sale server
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { db, one, all, run, tx, hashPassword, verifyPassword, getSettings, setSettings, genReferralCode } = require('./db');
const { receiptPage, receiptEmail, money } = require('./receipt');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------- utilities
const TZ_OFFSET_MIN = 60; // Africa/Lagos, UTC+1, no daylight saving
const lagos = () => new Date(Date.now() + TZ_OFFSET_MIN * 60000);
const todayStr = () => lagos().toISOString().slice(0, 10);
const nowMinutes = () => { const d = lagos(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const stamp = () => lagos().toISOString().slice(0, 19).replace('T', ' ');
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const toTime = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1);
  else if (d.length === 10 && /^[789]/.test(d)) d = '234' + d;
  return d;
}
const validEmail = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const baseUrl = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };

// Simple in-memory rate limiter
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'Too many attempts. Please wait a little and try again.');
  arr.push(now); hits.set(key, arr);
}

// ------------------------------------------------------- booking engine
function sweepNoShows() {
  const S = getSettings();
  const grace = int(S.grace_minutes, 10);
  const today = todayStr(), now = nowMinutes();
  for (const b of all("SELECT id, date, time FROM bookings WHERE status = 'booked' AND date <= ?", today)) {
    if (b.date < today || toMin(b.time) + grace < now) run("UPDATE bookings SET status = 'forfeited' WHERE id = ?", b.id);
  }
}

function staffFor(service, staffId) {
  let list = all('SELECT * FROM staff WHERE active = 1 AND bookable = 1 ORDER BY id');
  list = list.filter((s) => !s.skills || s.skills.split(',').map((x) => x.trim()).includes(service.category));
  if (staffId) list = list.filter((s) => s.id === int(staffId));
  return list;
}

function availability(date, serviceId, staffId) {
  const S = getSettings();
  const service = one('SELECT * FROM services WHERE id = ? AND active = 1', int(serviceId));
  if (!service) throw new HttpError(400, 'Please choose a service.');
  const today = todayStr();
  const ahead = int(S.booking_days_ahead, 21);
  if (!isDate(date) || date < today || date > addDays(today, ahead)) return { open: false, slots: [] };
  const hours = JSON.parse(S.hours)[weekday(date)];
  if (!hours) return { open: false, slots: [] };
  const [open, close] = hours.map(toMin);
  const step = int(S.slot_minutes, 30);
  const staff = staffFor(service, staffId);
  const booked = all("SELECT staff_id, time, duration FROM bookings WHERE date = ? AND status IN ('booked','checked_in')", date);
  const earliest = date === today ? nowMinutes() + 20 : 0;
  const slots = [];
  for (let t = open; t + service.duration <= close; t += step) {
    if (t < earliest) continue;
    const free = staff.filter((s) => !booked.some((b) => b.staff_id === s.id && t < toMin(b.time) + b.duration && toMin(b.time) < t + service.duration));
    slots.push({ time: toTime(t), available: free.length > 0, staff: free.map((s) => s.id) });
  }
  return { open: true, hours, slots };
}

function findOrCreateClient({ name, phone, email, referral }) {
  const p = normPhone(phone);
  let c = p ? one('SELECT * FROM clients WHERE phone = ?', p) : null;
  if (c) {
    const upd = {};
    if (email && !c.email) upd.email = email;
    if (name && name !== c.name && c.name === 'Guest') upd.name = name;
    for (const [k, v] of Object.entries(upd)) run(`UPDATE clients SET ${k} = ? WHERE id = ?`, v, c.id);
    return one('SELECT * FROM clients WHERE id = ?', c.id);
  }
  let referredBy = null;
  if (referral) {
    const r = one('SELECT id FROM clients WHERE referral_code = ? OR phone = ?', clean(referral, 40).toUpperCase(), normPhone(referral) || '-');
    if (r) referredBy = r.id;
  }
  const info = run('INSERT INTO clients (name, phone, email, referral_code, referred_by, created_at) VALUES (?,?,?,?,?,?)',
    name || 'Guest', p || null, email || null, genReferralCode(name), referredBy, stamp());
  return one('SELECT * FROM clients WHERE id = ?', Number(info.lastInsertRowid));
}

function createBooking(body, { byStaff = false } = {}) {
  const S = getSettings();
  const name = clean(body.name, 80), email = clean(body.email, 120).toLowerCase(), phone = normPhone(body.phone);
  if (!name) throw new HttpError(400, 'Please tell us your name.');
  if (!phone || phone.length < 10) throw new HttpError(400, 'Please enter a valid phone number (WhatsApp preferred).');
  if (!validEmail(email)) throw new HttpError(400, 'That email address does not look right.');
  if (!byStaff && !body.accept_policy) throw new HttpError(400, `Please accept the ${S.grace_minutes}-minute arrival policy.`);
  const service = one('SELECT * FROM services WHERE id = ? AND active = 1 AND bookable = 1', int(body.service_id));
  if (!service) throw new HttpError(400, 'Please choose a service.');
  if (!isDate(body.date) || !/^\d{2}:\d{2}$/.test(body.time || '')) throw new HttpError(400, 'Please choose a date and time.');

  return tx(() => {
    sweepNoShows();
    if (!byStaff) {
      const active = one("SELECT COUNT(*) n FROM bookings WHERE phone = ? AND status = 'booked' AND date >= ?", phone, todayStr()).n;
      if (active >= 2) throw new HttpError(409, 'You already have upcoming bookings with us. Please cancel one before booking another.');
    }
    const av = availability(body.date, service.id, body.staff_id || null);
    const slot = av.slots.find((s) => s.time === body.time);
    if (!slot || !slot.available) throw new HttpError(409, 'Sorry — that slot was just taken. Please pick another time.');
    const staffId = body.staff_id ? int(body.staff_id) : slot.staff[0];
    const client = findOrCreateClient({ name, phone, email, referral: body.referral });
    let ref;
    do { ref = 'MC' + crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (one('SELECT 1 FROM bookings WHERE ref = ?', ref));
    run(`INSERT INTO bookings (ref, client_id, name, phone, email, service_id, staff_id, date, time, duration, notes, referral_input, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ref, client.id, name, phone, email || null, service.id, staffId, body.date, body.time, service.duration,
      clean(body.notes, 400) || null, clean(body.referral, 40) || null, stamp());
    return bookingView(ref);
  });
}

function bookingView(ref) {
  const b = one(`SELECT b.*, s.name service_name, s.price, st.name staff_name, st.title staff_title
                 FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN staff st ON st.id = b.staff_id WHERE b.ref = ?`, ref);
  if (!b) return null;
  const grace = int(getSettings().grace_minutes, 10);
  return { ref: b.ref, name: b.name, phone: b.phone, email: b.email, service: b.service_name, price: b.price, staff: b.staff_name,
    staff_title: b.staff_title, date: b.date, time: b.time, duration: b.duration, status: b.status, notes: b.notes,
    latest_arrival: toTime(toMin(b.time) + grace), grace };
}

// ------------------------------------------------------- public API
app.get('/api/public/info', wrap((req, res) => {
  const S = getSettings();
  res.json({
    business: { name: S.business_name, tagline: S.tagline, address: S.address, phone: S.phone, whatsapp: S.whatsapp, email: S.email, instagram: S.instagram },
    hours: JSON.parse(S.hours), grace: int(S.grace_minutes), days_ahead: int(S.booking_days_ahead), today: todayStr(),
    services: all('SELECT id, name, description, price, duration, category FROM services WHERE active = 1 AND bookable = 1 ORDER BY sort, id'),
    staff: all('SELECT id, name, title, skills FROM staff WHERE active = 1 AND bookable = 1 ORDER BY id'),
    loyalty: { per_visit: int(S.points_per_visit), milestone: int(S.visit_milestone), milestone_bonus: int(S.visit_milestone_bonus), referral: int(S.referral_bonus), point_value: int(S.point_value) },
  });
}));

app.get('/api/public/availability', wrap((req, res) => {
  sweepNoShows();
  res.json(availability(req.query.date, req.query.service, req.query.staff || null));
}));

app.post('/api/public/bookings', wrap((req, res) => {
  limit('book:' + req.ip, 8, 60 * 60 * 1000);
  res.json(createBooking(req.body || {}));
}));

app.get('/api/public/bookings/:ref', wrap((req, res) => {
  sweepNoShows();
  const b = bookingView(clean(req.params.ref, 12).toUpperCase());
  if (!b) throw new HttpError(404, 'Booking not found.');
  res.json(b);
}));

app.post('/api/public/bookings/:ref/cancel', wrap((req, res) => {
  const ref = clean(req.params.ref, 12).toUpperCase();
  const b = one('SELECT * FROM bookings WHERE ref = ?', ref);
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (normPhone(req.body?.phone) !== b.phone) throw new HttpError(403, 'Please confirm with the phone number used to book.');
  if (b.status !== 'booked') throw new HttpError(409, 'This booking can no longer be cancelled.');
  run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", b.id);
  res.json(bookingView(ref));
}));

app.get('/api/public/bookings/:ref/ics', wrap((req, res) => {
  const b = bookingView(clean(req.params.ref, 12).toUpperCase());
  if (!b) throw new HttpError(404, 'Booking not found.');
  const S = getSettings();
  const dt = (d, m) => d.replace(/-/g, '') + 'T' + toTime(m).replace(':', '') + '00';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Medici Cutz//Booking//EN', 'BEGIN:VEVENT',
    `UID:${b.ref}@medicicutz`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Africa/Lagos:${dt(b.date, toMin(b.time))}`, `DTEND;TZID=Africa/Lagos:${dt(b.date, toMin(b.time) + b.duration)}`,
    `SUMMARY:${b.service} — ${S.business_name}`, `LOCATION:${S.address.replace(/,/g, '\\,')}`,
    `DESCRIPTION:Booking ${b.ref}. Please arrive by ${b.latest_arrival} at the latest — after ${b.grace} minutes the slot is released.`,
    'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Medici Cutz in 1 hour', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  res.set('Content-Type', 'text/calendar; charset=utf-8').set('Content-Disposition', `attachment; filename="medici-${b.ref}.ics"`).send(ics);
}));

// Public soft-copy receipt
app.get('/r/:token', wrap((req, res) => {
  const sale = saleFull(one('SELECT id FROM sales WHERE receipt_token = ?', clean(req.params.token, 64))?.id);
  if (!sale) return res.status(404).send('Receipt not found.');
  res.set('X-Robots-Tag', 'noindex').send(receiptPage(sale, getSettings(), baseUrl(req)));
}));

// ------------------------------------------------------- auth
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((x) => x[0]));
}
function auth(req, res, next) {
  const token = parseCookies(req).mc_sess;
  const s = token && one('SELECT * FROM sessions WHERE token = ? AND expires_at > ?', token, Date.now());
  const u = s && one('SELECT id, username, name, role FROM users WHERE id = ? AND active = 1', s.user_id);
  if (!u) return res.status(401).json({ error: 'Please sign in.' });
  req.user = u; next();
}
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Only an administrator can do that.' }));

app.post('/api/auth/login', wrap((req, res) => {
  limit('login:' + req.ip, 10, 15 * 60 * 1000);
  const u = one('SELECT * FROM users WHERE username = ? AND active = 1', clean(req.body?.username, 60).toLowerCase());
  if (!u || !verifyPassword(String(req.body?.password || ''), u.pw_hash)) throw new HttpError(401, 'Incorrect username or password.');
  const token = crypto.randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)', token, u.id, Date.now() + 12 * 3600e3);
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `mc_sess=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${12 * 3600}${secure}`);
  res.json({ id: u.id, username: u.username, name: u.name, role: u.role });
}));
app.post('/api/auth/logout', wrap((req, res) => {
  const t = parseCookies(req).mc_sess; if (t) run('DELETE FROM sessions WHERE token = ?', t);
  res.set('Set-Cookie', 'mc_sess=; Path=/; Max-Age=0').json({ ok: true });
}));
app.get('/api/auth/me', auth, (req, res) => res.json(req.user));
app.post('/api/auth/password', auth, wrap((req, res) => {
  const u = one('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(String(req.body?.current || ''), u.pw_hash)) throw new HttpError(400, 'Current password is incorrect.');
  if (String(req.body?.next || '').length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');
  run('UPDATE users SET pw_hash = ? WHERE id = ?', hashPassword(req.body.next), u.id);
  res.json({ ok: true });
}));

// ------------------------------------------------------- POS API
const pos = express.Router();
pos.use(auth);

pos.get('/bootstrap', wrap((req, res) => {
  const S = getSettings();
  res.json({
    user: req.user, settings: S, today: todayStr(),
    services: all('SELECT * FROM services ORDER BY active DESC, sort, id'),
    products: all('SELECT * FROM products ORDER BY active DESC, name'),
    staff: all('SELECT * FROM staff ORDER BY active DESC, id'),
    users: req.user.role === 'admin' ? all('SELECT id, username, name, role, active FROM users ORDER BY id') : [],
    email_enabled: !!process.env.SMTP_HOST,
  });
}));

// Dashboard
pos.get('/dashboard', wrap((req, res) => {
  sweepNoShows();
  const d = isDate(req.query.date) ? req.query.date : todayStr();
  const monthStart = d.slice(0, 8) + '01';
  const sum = (sql, ...p) => one(sql, ...p).v || 0;
  const today = {
    revenue: sum("SELECT SUM(total) v FROM sales WHERE status='paid' AND substr(created_at,1,10) = ?", d),
    sales: sum("SELECT COUNT(*) v FROM sales WHERE status='paid' AND substr(created_at,1,10) = ?", d),
    expenses: sum('SELECT SUM(amount) v FROM expenses WHERE date = ?', d) + sum('SELECT SUM(total) v FROM purchases WHERE date = ?', d),
    discounts: sum("SELECT SUM(discount_amount + points_value) v FROM sales WHERE status='paid' AND substr(created_at,1,10) = ?", d),
  };
  const month = {
    revenue: sum("SELECT SUM(total) v FROM sales WHERE status='paid' AND substr(created_at,1,10) BETWEEN ? AND ?", monthStart, d),
    expenses: sum('SELECT SUM(amount) v FROM expenses WHERE date BETWEEN ? AND ?', monthStart, d),
    purchases: sum('SELECT SUM(total) v FROM purchases WHERE date BETWEEN ? AND ?', monthStart, d),
    new_clients: sum('SELECT COUNT(*) v FROM clients WHERE substr(created_at,1,10) BETWEEN ? AND ?', monthStart, d),
  };
  month.net = month.revenue - month.expenses - month.purchases;
  const bookings = all(`SELECT b.*, s.name service_name, s.price, st.name staff_name FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id LEFT JOIN staff st ON st.id = b.staff_id
    WHERE b.date = ? ORDER BY b.time`, d);
  const recent = all(`SELECT s.id, s.number, s.total, s.payment_method, s.created_at, s.status, c.name client_name
    FROM sales s LEFT JOIN clients c ON c.id = s.client_id ORDER BY s.id DESC LIMIT 8`);
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(d, -i);
    week.push({ date: day, revenue: sum("SELECT SUM(total) v FROM sales WHERE status='paid' AND substr(created_at,1,10) = ?", day) });
  }
  const lowStock = all('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock');
  res.json({ date: d, today, month, bookings, recent, week, lowStock });
}));

// Bookings
pos.get('/bookings', wrap((req, res) => {
  sweepNoShows();
  const from = isDate(req.query.from) ? req.query.from : todayStr();
  const to = isDate(req.query.to) ? req.query.to : from;
  res.json(all(`SELECT b.*, s.name service_name, s.price, st.name staff_name, c.points client_points FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id LEFT JOIN staff st ON st.id = b.staff_id LEFT JOIN clients c ON c.id = b.client_id
    WHERE b.date BETWEEN ? AND ? ORDER BY b.date, b.time`, from, to));
}));
pos.get('/availability', wrap((req, res) => res.json(availability(req.query.date, req.query.service, req.query.staff || null))));
pos.post('/bookings', wrap((req, res) => res.json(createBooking(req.body || {}, { byStaff: true }))));
pos.patch('/bookings/:id', wrap((req, res) => {
  const b = one('SELECT * FROM bookings WHERE id = ?', int(req.params.id));
  if (!b) throw new HttpError(404, 'Booking not found.');
  const status = req.body?.status;
  if (!['booked', 'checked_in', 'cancelled', 'forfeited', 'completed'].includes(status)) throw new HttpError(400, 'Invalid status.');
  if (status === 'checked_in' && b.status === 'forfeited' && !req.body.override) {
    throw new HttpError(409, `This client arrived after the ${getSettings().grace_minutes}-minute grace window, so the slot was released. Check them in anyway only if the barber is free.`);
  }
  run('UPDATE bookings SET status = ?, checked_in_at = COALESCE(checked_in_at, ?) WHERE id = ?', status, status === 'checked_in' ? stamp() : null, b.id);
  res.json(one('SELECT * FROM bookings WHERE id = ?', b.id));
}));

// Clients
pos.get('/clients', wrap((req, res) => {
  const q = '%' + clean(req.query.q, 60) + '%';
  res.json(all(`SELECT c.*, r.name referred_by_name FROM clients c LEFT JOIN clients r ON r.id = c.referred_by
    WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.referral_code LIKE ? ORDER BY c.name LIMIT 200`, q, q, q, q));
}));
pos.get('/clients/:id', wrap((req, res) => {
  const c = one('SELECT c.*, r.name referred_by_name FROM clients c LEFT JOIN clients r ON r.id = c.referred_by WHERE c.id = ?', int(req.params.id));
  if (!c) throw new HttpError(404, 'Client not found.');
  c.sales = all('SELECT id, number, total, status, created_at, receipt_token FROM sales WHERE client_id = ? ORDER BY id DESC LIMIT 50', c.id);
  c.ledger = all('SELECT * FROM points_ledger WHERE client_id = ? ORDER BY id DESC LIMIT 50', c.id);
  c.referrals = all('SELECT id, name, referral_rewarded, created_at FROM clients WHERE referred_by = ?', c.id);
  c.bookings = all(`SELECT b.ref, b.date, b.time, b.status, s.name service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id
    WHERE b.client_id = ? ORDER BY b.date DESC, b.time DESC LIMIT 20`, c.id);
  res.json(c);
}));
pos.post('/clients', wrap((req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80); const phone = normPhone(b.phone); const email = clean(b.email, 120).toLowerCase();
  if (!name) throw new HttpError(400, 'Name is required.');
  if (!validEmail(email)) throw new HttpError(400, 'Invalid email.');
  if (phone && one('SELECT 1 FROM clients WHERE phone = ?', phone)) throw new HttpError(409, 'A client with that phone number already exists.');
  const c = findOrCreateClient({ name, phone, email, referral: b.referral });
  if (b.notes) run('UPDATE clients SET notes = ? WHERE id = ?', clean(b.notes, 500), c.id);
  res.json(one('SELECT * FROM clients WHERE id = ?', c.id));
}));
pos.put('/clients/:id', wrap((req, res) => {
  const b = req.body || {}; const id = int(req.params.id);
  const phone = normPhone(b.phone); const email = clean(b.email, 120).toLowerCase();
  if (!clean(b.name)) throw new HttpError(400, 'Name is required.');
  if (!validEmail(email)) throw new HttpError(400, 'Invalid email.');
  if (phone && one('SELECT 1 FROM clients WHERE phone = ? AND id != ?', phone, id)) throw new HttpError(409, 'Another client has that phone number.');
  run('UPDATE clients SET name = ?, phone = ?, email = ?, notes = ? WHERE id = ?', clean(b.name, 80), phone || null, email || null, clean(b.notes, 500) || null, id);
  res.json(one('SELECT * FROM clients WHERE id = ?', id));
}));
pos.post('/clients/:id/points', adminOnly, wrap((req, res) => {
  const id = int(req.params.id); const delta = int(req.body?.delta);
  const c = one('SELECT * FROM clients WHERE id = ?', id);
  if (!c || !delta) throw new HttpError(400, 'Enter a points adjustment.');
  if (c.points + delta < 0) throw new HttpError(400, 'Balance cannot go below zero.');
  tx(() => {
    run('UPDATE clients SET points = points + ? WHERE id = ?', delta, id);
    run('INSERT INTO points_ledger (client_id, delta, reason, created_at) VALUES (?,?,?,?)', id, delta, 'Manual: ' + (clean(req.body.reason, 120) || 'adjustment'), stamp());
  });
  res.json(one('SELECT * FROM clients WHERE id = ?', id));
}));

// Sales
function saleFull(id) {
  if (!id) return null;
  const s = one(`SELECT s.*, c.name client_name, c.phone client_phone, c.email client_email, c.points client_points,
    c.referral_code client_referral_code, u.name cashier FROM sales s LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id);
  if (!s) return null;
  s.items = JSON.parse(s.items);
  return s;
}

function computeSale(body, user) {
  const S = getSettings();
  const lines = [];
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const qty = Math.max(1, int(it.qty, 1));
    const staff = it.staff_id ? one('SELECT id, name FROM staff WHERE id = ?', int(it.staff_id)) : null;
    if (it.type === 'service') {
      const s = one('SELECT * FROM services WHERE id = ?', int(it.id));
      if (!s) throw new HttpError(400, 'Unknown service.');
      lines.push({ type: 'service', id: s.id, name: s.name, price: s.price, qty, amount: s.price * qty, staff_id: staff?.id || null, staff_name: staff?.name || null });
    } else if (it.type === 'product') {
      const p = one('SELECT * FROM products WHERE id = ?', int(it.id));
      if (!p) throw new HttpError(400, 'Unknown product.');
      lines.push({ type: 'product', id: p.id, name: p.name, price: p.price, qty, amount: p.price * qty, staff_id: staff?.id || null, staff_name: staff?.name || null });
    } else if (it.type === 'custom') {
      const price = Math.max(0, int(it.price)); const name = clean(it.name, 80);
      if (!name) throw new HttpError(400, 'Custom items need a description.');
      lines.push({ type: 'custom', name, price, qty, amount: price * qty, staff_id: staff?.id || null, staff_name: staff?.name || null });
    }
  }
  if (!lines.length) throw new HttpError(400, 'Add at least one item.');
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);

  let discountType = body.discount_type === 'pct' ? 'pct' : body.discount_type === 'amount' ? 'amount' : null;
  let discountValue = Math.max(0, Number(body.discount_value) || 0);
  let discount = 0;
  if (discountType && discountValue) {
    discount = discountType === 'pct' ? Math.round(subtotal * Math.min(discountValue, 100) / 100) : Math.round(discountValue);
    discount = Math.min(discount, subtotal);
    const cap = int(S.max_discount_pct, 50);
    if (user.role !== 'admin' && discount > subtotal * cap / 100) throw new HttpError(403, `Discounts above ${cap}% need an administrator.`);
  } else { discountType = null; discountValue = 0; }

  const client = body.client_id ? one('SELECT * FROM clients WHERE id = ?', int(body.client_id)) : null;
  let redeem = Math.max(0, int(body.redeem_points));
  let pointsValue = 0;
  if (redeem) {
    if (!client) throw new HttpError(400, 'Select a client to redeem points.');
    if (redeem > client.points) throw new HttpError(400, `${client.name} only has ${client.points} points.`);
    if (redeem < int(S.min_redeem_points)) throw new HttpError(400, `Minimum redemption is ${S.min_redeem_points} points.`);
    const pv = int(S.point_value, 10);
    redeem = Math.min(redeem, Math.floor((subtotal - discount) / pv));
    pointsValue = redeem * pv;
  }
  const total = subtotal - discount - pointsValue;
  return { S, lines, subtotal, discountType, discountValue, discount, client, redeem, pointsValue, total };
}

pos.post('/sales/preview', wrap((req, res) => {
  const c = computeSale(req.body || {}, req.user);
  res.json({ subtotal: c.subtotal, discount: c.discount, points_redeemed: c.redeem, points_value: c.pointsValue, total: c.total });
}));

pos.post('/sales', wrap((req, res) => {
  const body = req.body || {};
  const method = ['cash', 'transfer', 'card', 'split'].includes(body.payment_method) ? body.payment_method : null;
  if (!method) throw new HttpError(400, 'Choose how the client paid.');
  const id = tx(() => {
    const c = computeSale(body, req.user);
    const { S, client } = c;
    const token = crypto.randomBytes(12).toString('base64url');
    const info = run(`INSERT INTO sales (receipt_token, client_id, booking_id, items, subtotal, discount_type, discount_value, discount_amount,
        discount_reason, points_redeemed, points_value, total, payment_method, amount_tendered, notes, user_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      token, client?.id || null, body.booking_id ? int(body.booking_id) : null, JSON.stringify(c.lines), c.subtotal, c.discountType, c.discountValue,
      c.discount, clean(body.discount_reason, 120) || null, c.redeem, c.pointsValue, c.total, method,
      body.amount_tendered ? int(body.amount_tendered) : null, clean(body.notes, 300) || null, req.user.id, stamp());
    const saleId = Number(info.lastInsertRowid);
    run('UPDATE sales SET number = ? WHERE id = ?', 'MC-' + String(saleId).padStart(6, '0'), saleId);

    for (const l of c.lines) if (l.type === 'product') run('UPDATE products SET stock = stock - ? WHERE id = ?', l.qty, l.id);

    let earned = 0;
    if (client) {
      const ledger = (cid, delta, reason) => {
        if (!delta) return;
        run('UPDATE clients SET points = points + ? WHERE id = ?', delta, cid);
        run('INSERT INTO points_ledger (client_id, delta, reason, sale_id, created_at) VALUES (?,?,?,?,?)', cid, delta, reason, saleId, stamp());
      };
      if (c.redeem) ledger(client.id, -c.redeem, `Redeemed for ${money(c.pointsValue)} off`);
      const visits = client.visits + 1;
      run('UPDATE clients SET visits = ?, total_spent = total_spent + ? WHERE id = ?', visits, c.total, client.id);
      const perVisit = int(S.points_per_visit); const spend = Math.floor(c.total / 1000) * int(S.points_per_1000);
      ledger(client.id, perVisit + spend, `Visit #${visits}`); earned += perVisit + spend;
      const m = int(S.visit_milestone);
      if (m > 0 && visits % m === 0) { ledger(client.id, int(S.visit_milestone_bonus), `Loyalty milestone — ${visits} visits`); earned += int(S.visit_milestone_bonus); }
      if (client.referred_by && !client.referral_rewarded) {
        const referrer = one('SELECT id, name FROM clients WHERE id = ?', client.referred_by);
        if (referrer) {
          ledger(referrer.id, int(S.referral_bonus), `Referral reward — ${client.name}`);
          ledger(client.id, int(S.referee_bonus), `Welcome bonus — referred by ${referrer.name}`); earned += int(S.referee_bonus);
        }
        run('UPDATE clients SET referral_rewarded = 1 WHERE id = ?', client.id);
      }
      run('UPDATE sales SET points_earned = ? WHERE id = ?', earned, saleId);
    }
    if (body.booking_id) run("UPDATE bookings SET status = 'completed', sale_id = ? WHERE id = ?", saleId, int(body.booking_id));
    return saleId;
  });
  res.json(saleFull(id));
}));

pos.get('/sales', wrap((req, res) => {
  const from = isDate(req.query.from) ? req.query.from : todayStr();
  const to = isDate(req.query.to) ? req.query.to : from;
  res.json(all(`SELECT s.id, s.number, s.total, s.subtotal, s.discount_amount, s.points_value, s.payment_method, s.status, s.created_at,
    s.emailed_at, s.whatsapped_at, s.receipt_token, c.name client_name, u.name cashier
    FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.user_id
    WHERE substr(s.created_at,1,10) BETWEEN ? AND ? ORDER BY s.id DESC`, from, to));
}));
pos.get('/sales/:id', wrap((req, res) => {
  const s = saleFull(int(req.params.id));
  if (!s) throw new HttpError(404, 'Sale not found.');
  s.receipt_url = baseUrl(req) + '/r/' + s.receipt_token;
  res.json(s);
}));
pos.post('/sales/:id/void', adminOnly, wrap((req, res) => {
  const s = saleFull(int(req.params.id));
  if (!s || s.status !== 'paid') throw new HttpError(400, 'Only paid sales can be voided.');
  const reason = clean(req.body?.reason, 200);
  if (!reason) throw new HttpError(400, 'Give a reason for voiding.');
  tx(() => {
    run("UPDATE sales SET status = 'void', void_reason = ? WHERE id = ?", reason, s.id);
    for (const l of s.items) if (l.type === 'product') run('UPDATE products SET stock = stock + ? WHERE id = ?', l.qty, l.id);
    for (const r of all('SELECT client_id, SUM(delta) d FROM points_ledger WHERE sale_id = ? GROUP BY client_id', s.id)) {
      if (!r.d) continue;
      run('UPDATE clients SET points = MAX(0, points - ?) WHERE id = ?', r.d, r.client_id);
      run('INSERT INTO points_ledger (client_id, delta, reason, sale_id, created_at) VALUES (?,?,?,?,?)', r.client_id, -r.d, `Reversed — ${s.number} voided`, s.id, stamp());
    }
    if (s.client_id) run('UPDATE clients SET visits = MAX(0, visits - 1), total_spent = MAX(0, total_spent - ?) WHERE id = ?', s.total, s.client_id);
  });
  res.json(saleFull(s.id));
}));

// Receipt delivery
let transporter = null;
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: int(process.env.SMTP_PORT, 587), secure: int(process.env.SMTP_PORT, 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}
pos.post('/sales/:id/email', wrap(async (req, res) => {
  const s = saleFull(int(req.params.id));
  if (!s) throw new HttpError(404, 'Sale not found.');
  const to = clean(req.body?.email || s.client_email, 120).toLowerCase();
  if (!to || !validEmail(to)) throw new HttpError(400, 'Enter the client\'s email address.');
  const t = mailer();
  if (!t) throw new HttpError(503, 'Email is not set up yet. Add your SMTP details (see README → Email receipts), or send via WhatsApp for now.');
  const S = getSettings(); const url = baseUrl(req);
  await t.sendMail({
    from: process.env.MAIL_FROM || `${S.business_name} <${process.env.SMTP_USER}>`, to, replyTo: S.email,
    subject: `Your ${S.business_name} receipt — ${s.number}`,
    html: receiptEmail(s, S, url), text: `Receipt ${s.number} — ${money(s.total)}. View online: ${url}/r/${s.receipt_token}`,
  });
  if (s.client_id && !s.client_email) run('UPDATE clients SET email = ? WHERE id = ?', to, s.client_id);
  run('UPDATE sales SET emailed_at = ? WHERE id = ?', stamp(), s.id);
  res.json({ ok: true, to });
}));
pos.post('/sales/:id/whatsapp', wrap((req, res) => {
  const s = saleFull(int(req.params.id));
  if (!s) throw new HttpError(404, 'Sale not found.');
  const phone = normPhone(req.body?.phone || s.client_phone);
  if (!phone) throw new HttpError(400, 'Enter the client\'s WhatsApp number.');
  const S = getSettings(); const url = baseUrl(req) + '/r/' + s.receipt_token;
  const first = (s.client_name || '').split(' ')[0];
  const lines = [
    `Hello${first ? ' ' + first : ''}, thank you for visiting *${S.business_name}* ✂️`, '',
    `*Receipt ${s.number}*`,
    ...s.items.map((i) => `• ${i.name}${i.qty > 1 ? ' ×' + i.qty : ''} — ${money(i.amount)}`),
    s.discount_amount ? `Discount: −${money(s.discount_amount)}` : null,
    s.points_value ? `Points redeemed: −${money(s.points_value)}` : null,
    `*Total paid: ${money(s.total)}*`, '',
    s.client_id ? `Loyalty: +${s.points_earned} pts · balance ${s.client_points} pts` : null,
    s.client_referral_code ? `Refer a friend with code *${s.client_referral_code}* and earn ${S.referral_bonus} pts.` : null, '',
    `View your receipt: ${url}`, '', S.receipt_footer,
  ].filter((l) => l !== null);
  run('UPDATE sales SET whatsapped_at = ? WHERE id = ?', stamp(), s.id);
  res.json({ link: `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}` });
}));

// Purchases & expenses
const EXPENSE_CATS = ['Rent', 'Salaries & Wages', 'Commissions', 'Electricity & Diesel', 'Water & Utilities', 'Internet & Phone', 'Consumables & Supplies', 'Repairs & Maintenance', 'Marketing', 'Cleaning', 'Transport', 'Bank Charges', 'Taxes & Levies', 'Other'];
pos.get('/purchases', wrap((req, res) => {
  const from = isDate(req.query.from) ? req.query.from : addDays(todayStr(), -30), to = isDate(req.query.to) ? req.query.to : todayStr();
  res.json(all('SELECT p.*, u.name recorded_by FROM purchases p LEFT JOIN users u ON u.id = p.user_id WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC', from, to));
}));
pos.post('/purchases', wrap((req, res) => {
  const b = req.body || {};
  const date = isDate(b.date) ? b.date : todayStr();
  const qty = Math.max(0.01, Number(b.qty) || 1), unit = Math.max(0, int(b.unit_cost));
  const product = b.product_id ? one('SELECT * FROM products WHERE id = ?', int(b.product_id)) : null;
  const item = clean(b.item, 120) || product?.name;
  if (!item || !unit) throw new HttpError(400, 'Enter the item and unit cost.');
  const id = tx(() => {
    const info = run('INSERT INTO purchases (date, supplier, item, product_id, qty, unit_cost, total, payment_method, notes, user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      date, clean(b.supplier, 120) || null, item, product?.id || null, qty, unit, Math.round(qty * unit), clean(b.payment_method, 20) || 'cash', clean(b.notes, 300) || null, req.user.id, stamp());
    if (product) run('UPDATE products SET stock = stock + ?, cost = ? WHERE id = ?', Math.round(qty), unit, product.id);
    return Number(info.lastInsertRowid);
  });
  res.json(one('SELECT * FROM purchases WHERE id = ?', id));
}));
pos.delete('/purchases/:id', adminOnly, wrap((req, res) => {
  const p = one('SELECT * FROM purchases WHERE id = ?', int(req.params.id));
  if (!p) throw new HttpError(404, 'Not found.');
  tx(() => { if (p.product_id) run('UPDATE products SET stock = stock - ? WHERE id = ?', Math.round(p.qty), p.product_id); run('DELETE FROM purchases WHERE id = ?', p.id); });
  res.json({ ok: true });
}));
pos.get('/expenses', wrap((req, res) => {
  const from = isDate(req.query.from) ? req.query.from : addDays(todayStr(), -30), to = isDate(req.query.to) ? req.query.to : todayStr();
  res.json({ categories: EXPENSE_CATS, rows: all('SELECT e.*, u.name recorded_by FROM expenses e LEFT JOIN users u ON u.id = e.user_id WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC', from, to) });
}));
pos.post('/expenses', wrap((req, res) => {
  const b = req.body || {};
  const amount = Math.max(0, int(b.amount));
  const category = EXPENSE_CATS.includes(b.category) ? b.category : 'Other';
  if (!amount) throw new HttpError(400, 'Enter an amount.');
  const info = run('INSERT INTO expenses (date, category, description, amount, payment_method, payee, user_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
    isDate(b.date) ? b.date : todayStr(), category, clean(b.description, 200) || null, amount, clean(b.payment_method, 20) || 'cash', clean(b.payee, 120) || null, req.user.id, stamp());
  res.json(one('SELECT * FROM expenses WHERE id = ?', Number(info.lastInsertRowid)));
}));
pos.delete('/expenses/:id', adminOnly, wrap((req, res) => { run('DELETE FROM expenses WHERE id = ?', int(req.params.id)); res.json({ ok: true }); }));

// Reports
function report(from, to) {
  const sales = all("SELECT * FROM sales WHERE status = 'paid' AND substr(created_at,1,10) BETWEEN ? AND ?", from, to).map((s) => ({ ...s, items: JSON.parse(s.items) }));
  const r = { from, to, revenue: 0, gross: 0, discounts: 0, points_redeemed_value: 0, sales_count: sales.length, by_method: {}, by_item: {}, by_staff: {}, daily: {} };
  const staff = Object.fromEntries(all('SELECT id, name, commission_pct FROM staff').map((s) => [s.id, s]));
  for (const s of sales) {
    r.revenue += s.total; r.gross += s.subtotal; r.discounts += s.discount_amount; r.points_redeemed_value += s.points_value;
    r.by_method[s.payment_method] = (r.by_method[s.payment_method] || 0) + s.total;
    const day = s.created_at.slice(0, 10); r.daily[day] = (r.daily[day] || 0) + s.total;
    const ratio = s.subtotal ? s.total / s.subtotal : 0; // spread discounts across lines
    for (const l of s.items) {
      const k = l.name; r.by_item[k] = r.by_item[k] || { name: k, type: l.type, qty: 0, amount: 0 };
      r.by_item[k].qty += l.qty; r.by_item[k].amount += Math.round(l.amount * ratio);
      if (l.staff_id && staff[l.staff_id] && l.type !== 'product') {
        const st = staff[l.staff_id];
        const row = r.by_staff[st.id] = r.by_staff[st.id] || { name: st.name, pct: st.commission_pct, services: 0, sales: 0, commission: 0 };
        row.services += l.qty; row.sales += Math.round(l.amount * ratio);
      }
    }
  }
  for (const row of Object.values(r.by_staff)) row.commission = Math.round(row.sales * row.pct / 100);
  r.purchases = one('SELECT COALESCE(SUM(total),0) v FROM purchases WHERE date BETWEEN ? AND ?', from, to).v;
  r.expenses_by_cat = all('SELECT category, SUM(amount) amount FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC', from, to);
  r.expenses = r.expenses_by_cat.reduce((a, e) => a + e.amount, 0);
  r.commissions = Object.values(r.by_staff).reduce((a, s) => a + s.commission, 0);
  r.net = r.revenue - r.purchases - r.expenses;
  r.by_item = Object.values(r.by_item).sort((a, b) => b.amount - a.amount);
  r.by_staff = Object.values(r.by_staff).sort((a, b) => b.sales - a.sales);
  const days = []; for (let d = from; d <= to && days.length < 92; d = addDays(d, 1)) days.push({ date: d, revenue: r.daily[d] || 0 });
  r.daily = days;
  r.bookings = Object.fromEntries(all('SELECT status, COUNT(*) n FROM bookings WHERE date BETWEEN ? AND ? GROUP BY status', from, to).map((x) => [x.status, x.n]));
  r.points_issued = one('SELECT COALESCE(SUM(delta),0) v FROM points_ledger WHERE delta > 0 AND substr(created_at,1,10) BETWEEN ? AND ?', from, to).v;
  return r;
}
pos.get('/reports', wrap((req, res) => {
  const to = isDate(req.query.to) ? req.query.to : todayStr();
  const from = isDate(req.query.from) ? req.query.from : to.slice(0, 8) + '01';
  res.json(report(from, to));
}));

// CSV export
const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => { const v = r[c] ?? ''; return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(','))].join('\n');
pos.get('/export/:type', wrap((req, res) => {
  const to = isDate(req.query.to) ? req.query.to : todayStr();
  const from = isDate(req.query.from) ? req.query.from : to.slice(0, 8) + '01';
  let rows, cols;
  if (req.params.type === 'sales') {
    rows = all(`SELECT s.number, s.created_at, c.name client, s.subtotal, s.discount_amount, s.points_value, s.total, s.payment_method, s.status, u.name cashier, s.items
      FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.user_id WHERE substr(s.created_at,1,10) BETWEEN ? AND ? ORDER BY s.id`, from, to)
      .map((r) => ({ ...r, items: JSON.parse(r.items).map((i) => `${i.name} x${i.qty}`).join('; ') }));
    cols = ['number', 'created_at', 'client', 'items', 'subtotal', 'discount_amount', 'points_value', 'total', 'payment_method', 'status', 'cashier'];
  } else if (req.params.type === 'expenses') {
    rows = all('SELECT date, category, description, payee, amount, payment_method FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date', from, to);
    cols = ['date', 'category', 'description', 'payee', 'amount', 'payment_method'];
  } else if (req.params.type === 'purchases') {
    rows = all('SELECT date, supplier, item, qty, unit_cost, total, payment_method FROM purchases WHERE date BETWEEN ? AND ? ORDER BY date', from, to);
    cols = ['date', 'supplier', 'item', 'qty', 'unit_cost', 'total', 'payment_method'];
  } else if (req.params.type === 'clients') {
    rows = all('SELECT name, phone, email, referral_code, points, visits, total_spent, created_at FROM clients ORDER BY name');
    cols = ['name', 'phone', 'email', 'referral_code', 'points', 'visits', 'total_spent', 'created_at'];
  } else throw new HttpError(404, 'Unknown export.');
  res.set('Content-Type', 'text/csv').set('Content-Disposition', `attachment; filename="medici-${req.params.type}-${from}_${to}.csv"`).send(csv(rows, cols));
}));

// Settings & catalogue (admin)
pos.put('/settings', adminOnly, wrap((req, res) => { setSettings(req.body || {}); res.json(getSettings()); }));
function crud(table, fields) {
  const pick = (b) => fields.map((f) => (typeof b[f] === 'boolean' ? (b[f] ? 1 : 0) : b[f] ?? null));
  pos.post('/' + table, adminOnly, wrap((req, res) => {
    const info = run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, ...pick(req.body || {}));
    res.json(one(`SELECT * FROM ${table} WHERE id = ?`, Number(info.lastInsertRowid)));
  }));
  pos.put('/' + table + '/:id', adminOnly, wrap((req, res) => {
    run(`UPDATE ${table} SET ${fields.map((f) => f + ' = ?').join(',')} WHERE id = ?`, ...pick(req.body || {}), int(req.params.id));
    res.json(one(`SELECT * FROM ${table} WHERE id = ?`, int(req.params.id)));
  }));
}
crud('services', ['name', 'description', 'price', 'duration', 'category', 'bookable', 'active', 'sort']);
crud('products', ['name', 'price', 'cost', 'stock', 'active']);
crud('staff', ['name', 'title', 'commission_pct', 'skills', 'bookable', 'active']);
pos.post('/users', adminOnly, wrap((req, res) => {
  const b = req.body || {}; const username = clean(b.username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(username)) throw new HttpError(400, 'Username: at least 3 letters/numbers.');
  if (String(b.password || '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (one('SELECT 1 FROM users WHERE username = ?', username)) throw new HttpError(409, 'Username taken.');
  run('INSERT INTO users (username, name, role, pw_hash) VALUES (?,?,?,?)', username, clean(b.name, 80) || username, b.role === 'admin' ? 'admin' : 'cashier', hashPassword(b.password));
  res.json({ ok: true });
}));
pos.put('/users/:id', adminOnly, wrap((req, res) => {
  const id = int(req.params.id), b = req.body || {};
  if (id === req.user.id && (b.active === false || b.role === 'cashier')) throw new HttpError(400, 'You cannot demote or deactivate yourself.');
  run('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?',
    b.name ?? null, b.role ? (b.role === 'admin' ? 'admin' : 'cashier') : null, typeof b.active === 'boolean' ? (b.active ? 1 : 0) : null, id);
  if (b.password) {
    if (String(b.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    run('UPDATE users SET pw_hash = ? WHERE id = ?', hashPassword(b.password), id);
    run('DELETE FROM sessions WHERE user_id = ?', id);
  }
  res.json({ ok: true });
}));

app.use('/api/pos', pos);

// ------------------------------------------------------- pages
const pub = path.join(__dirname, 'public');
const fs = require('fs');
const bookPage = (req, res) => res.type('html').send(fs.readFileSync(path.join(pub, 'book.html'), 'utf8').replaceAll('{{BASE}}', baseUrl(req)));
app.get(['/book', '/book.html', '/booking/:ref'], bookPage);
app.get('/pos', (req, res) => res.sendFile(path.join(pub, 'pos', 'index.html')));
app.use(express.static(pub, { maxAge: '1h', extensions: ['html'] }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
});

if (require.main === module) app.listen(PORT, () => console.log(`Medici Cutz running → http://localhost:${PORT}  (booking: /book · POS: /pos)`));
module.exports = app;
