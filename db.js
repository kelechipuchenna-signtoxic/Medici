// Medici Cutz — data layer (built-in node:sqlite, no native build step needed)
process.removeAllListeners('warning');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'medici.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, role TEXT NOT NULL DEFAULT 'cashier',
  pw_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, title TEXT, commission_pct REAL DEFAULT 0, skills TEXT DEFAULT '',
  bookable INTEGER DEFAULT 1, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL,
  duration INTEGER NOT NULL DEFAULT 45, category TEXT DEFAULT 'Hair Cuts', bookable INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, cost INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT, notes TEXT,
  referral_code TEXT UNIQUE, referred_by INTEGER REFERENCES clients(id), referral_rewarded INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0, visits INTEGER DEFAULT 0, total_spent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), delta INTEGER NOT NULL,
  reason TEXT, sale_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, ref TEXT UNIQUE NOT NULL, client_id INTEGER REFERENCES clients(id),
  name TEXT, phone TEXT, email TEXT, service_id INTEGER REFERENCES services(id), staff_id INTEGER REFERENCES staff(id),
  date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, notes TEXT,
  status TEXT NOT NULL DEFAULT 'booked', referral_input TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked_in_at TEXT, sale_id INTEGER);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE, receipt_token TEXT UNIQUE, client_id INTEGER REFERENCES clients(id),
  booking_id INTEGER, items TEXT NOT NULL, subtotal INTEGER NOT NULL, discount_type TEXT, discount_value REAL DEFAULT 0,
  discount_amount INTEGER DEFAULT 0, discount_reason TEXT, points_redeemed INTEGER DEFAULT 0, points_value INTEGER DEFAULT 0,
  total INTEGER NOT NULL, payment_method TEXT NOT NULL, amount_tendered INTEGER, points_earned INTEGER DEFAULT 0,
  notes TEXT, user_id INTEGER, status TEXT DEFAULT 'paid', void_reason TEXT,
  emailed_at TEXT, whatsapped_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, supplier TEXT, item TEXT NOT NULL, product_id INTEGER,
  qty REAL DEFAULT 1, unit_cost INTEGER NOT NULL, total INTEGER NOT NULL, payment_method TEXT, notes TEXT,
  user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL, description TEXT, amount INTEGER NOT NULL,
  payment_method TEXT, payee TEXT, user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
`);

if (!db.prepare('PRAGMA table_info(services)').all().some((c) => c.name === 'price_max')) db.exec('ALTER TABLE services ADD COLUMN price_max INTEGER');

// ---------- helpers ----------
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

const DEFAULT_SETTINGS = {
  business_name: 'Medici Cutz',
  tagline: 'Premium Barber Shop',
  address: 'Prime Plaza, Central Business District, Abuja',
  phone: '+234 800 000 0000',
  whatsapp: '2348000000000',
  email: 'hello@medicicutz.com',
  instagram: 'medicicutz',
  bank_details: '',
  receipt_footer: 'Thank you for choosing Medici Cutz. Stay sharp.',
  hours: JSON.stringify({ 0: ['12:00', '18:00'], 1: ['09:00', '20:00'], 2: ['09:00', '20:00'], 3: ['09:00', '20:00'], 4: ['09:00', '20:00'], 5: ['09:00', '21:00'], 6: ['08:00', '21:00'] }),
  slot_minutes: '30',
  grace_minutes: '10',
  booking_days_ahead: '21',
  // Loyalty
  points_per_visit: '10',
  points_per_1000: '1',          // extra points per ₦1,000 spent
  visit_milestone: '5',          // every Nth visit…
  visit_milestone_bonus: '50',   // …earns this bonus
  referral_bonus: '100',         // to the referrer, after the new client's first paid visit
  referee_bonus: '50',           // welcome points to the new client
  point_value: '10',             // ₦ value of one point when redeemed
  min_redeem_points: '100',
  max_discount_pct: '50',        // cashier cap; admins unlimited
};

function getSettings() {
  const s = { ...DEFAULT_SETTINGS };
  for (const r of all('SELECT key, value FROM settings')) s[r.key] = r.value;
  return s;
}
function setSettings(obj) {
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(obj)) if (k in DEFAULT_SETTINGS) st.run(k, String(v));
}

function genReferralCode(name) {
  const base = String(name || 'MC').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4) || 'MC';
  for (;;) {
    const code = base + crypto.randomInt(100, 999);
    if (!one('SELECT 1 FROM clients WHERE referral_code = ?', code)) return code;
  }
}

// ---------- service catalogue (Medici Cutz price list) ----------
// Each row: [category, name, price, durationMinutes, priceMax?]. priceMax marks a price range.
const BARBER_CATEGORIES = ['Hair Cuts', 'Cuts + Style / Colour', 'Wash & Treatment', 'Shaving', 'Dreadlocks'];
const NAIL_CATEGORY = 'Nails & Hand/Foot Care';
const CATALOG_VERSION = 'pricelist-2026-11';
const CATALOG = [
  ['Hair Cuts', 'Adult Cut', 5000, 45],
  ['Hair Cuts', 'European Hair Cut', 7000, 60],
  ['Hair Cuts', 'Ladies Hair Cut', 5000, 45],
  ['Hair Cuts', 'Kid Hair Cut', 3000, 30],
  ['Hair Cuts', 'European Kid Cut', 5000, 45],
  ['Hair Cuts', 'Haircut with Blade', 5000, 45],
  ['Hair Cuts', 'Haircut with Dye Carving', 5000, 60],
  ['Hair Cuts', 'Losing of Hair', 1000, 30, 2000],
  ['Cuts + Style / Colour', 'Hair Cut & Dye', 6000, 60],
  ['Cuts + Style / Colour', 'Hair Cut & Texturing', 6000, 60],
  ['Cuts + Style / Colour', 'Kid Hair Cut & Dye', 5000, 45],
  ['Cuts + Style / Colour', 'Kid Hair Cut & Texturing', 5000, 45],
  ['Cuts + Style / Colour', 'Texture Only', 3000, 30],
  ['Cuts + Style / Colour', 'Hair Colour', 8000, 60],
  ['Cuts + Style / Colour', 'Hair Dye', 3000, 30],
  ['Wash & Treatment', 'Washing of Hair', 1000, 15],
  ['Wash & Treatment', 'Washing of Woman Long Hair', 3000, 30],
  ['Wash & Treatment', 'Washing of Dreadlocks', 4000, 30],
  ['Wash & Treatment', 'Barbing & Scrub', 5000, 60],
  ['Wash & Treatment', 'Complete Facial Treatment', 10000, 45],
  ['Wash & Treatment', 'Beard Treatment', 2000, 20],
  ['Shaving', 'Shaving', 2000, 20],
  ['Shaving', 'European Shaving', 4000, 30],
  ['Dreadlocks', 'Dread Lock', 30000, 180],
  ['Dreadlocks', 'Dread Re-lock (New)', 20000, 120],
  [NAIL_CATEGORY, 'Manicure', 5000, 45],
  [NAIL_CATEGORY, 'Pedicure', 8000, 60],
  [NAIL_CATEGORY, 'Manicure & Pedicure', 12000, 90],
  [NAIL_CATEGORY, 'Nails – Hands Only', 3000, 30],
  [NAIL_CATEGORY, 'Nails – Both Hands & Feet', 5000, 60],
];

// One-time switch to the price list. Old services are deleted, or hidden if a booking still points at them.
// Sales keep their own copy of item names and prices, so past receipts and reports are unaffected.
if ((one("SELECT value FROM settings WHERE key = 'catalog_version'") || {}).value !== CATALOG_VERSION) {
  tx(() => {
    for (const s of all('SELECT id FROM services')) {
      if (one('SELECT 1 FROM bookings WHERE service_id = ? LIMIT 1', s.id)) run('UPDATE services SET active = 0, bookable = 0 WHERE id = ?', s.id);
      else run('DELETE FROM services WHERE id = ?', s.id);
    }
    const ins = db.prepare('INSERT INTO services (name, description, price, price_max, duration, category, sort) VALUES (?,?,?,?,?,?,?)');
    CATALOG.forEach(([cat, name, price, duration, max], i) => ins.run(name, '', price, max || null, duration, cat, i));
    // Point existing staff at the new categories.
    const map = { Barbing: BARBER_CATEGORIES, 'Nail Care': [NAIL_CATEGORY], Packages: [] };
    for (const st of all("SELECT id, skills FROM staff WHERE skills IS NOT NULL AND skills != ''")) {
      const next = [...new Set(st.skills.split(',').map((x) => x.trim()).flatMap((x) => map[x] || [x]))];
      run('UPDATE staff SET skills = ? WHERE id = ?', next.join(','), st.id);
    }
    run("INSERT INTO settings (key, value) VALUES ('catalog_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", CATALOG_VERSION);
  });
}

// ---------- seed ----------
if (!one('SELECT 1 FROM users LIMIT 1')) {
  const pw = process.env.ADMIN_PASSWORD || 'medici2026';
  run('INSERT INTO users (username, name, role, pw_hash) VALUES (?,?,?,?)', 'admin', 'Administrator', 'admin', hashPassword(pw));
}
if (!one('SELECT 1 FROM staff LIMIT 1')) {
  const st = db.prepare('INSERT INTO staff (name, title, commission_pct, skills) VALUES (?,?,?,?)');
  const barber = BARBER_CATEGORIES.join(',');
  st.run('Lorenzo', 'Lead Barber', 30, barber);
  st.run('Cosimo', 'Senior Barber', 25, barber);
  st.run('Giuliano', 'Senior Barber', 25, barber);
  st.run('Bianca', 'Pedicurist', 25, NAIL_CATEGORY);
}
if (!one('SELECT 1 FROM products LIMIT 1')) {
  run("INSERT INTO products (name, price, cost, stock) VALUES ('Beard Oil (30ml)', 6500, 3500, 12)");
  run("INSERT INTO products (name, price, cost, stock) VALUES ('Pomade — Matte', 7500, 4000, 10)");
  run("INSERT INTO products (name, price, cost, stock) VALUES ('Aftershave Balm', 5500, 2800, 8)");
}

module.exports = { db, one, all, run, tx, hashPassword, verifyPassword, getSettings, setSettings, genReferralCode, DEFAULT_SETTINGS };
