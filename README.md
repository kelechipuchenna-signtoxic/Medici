# Medici Cutz: Website, Online Booking & Point of Sale

One small app with three parts:

| URL | What it is | Who uses it |
|---|---|---|
| `/` | The Medici Cutz website: hero, service menu, experience, rewards, hours and contact | The public |
| `/book` | **The booking page. Share this link on WhatsApp.** | Clients |
| `/pos` | Point of sale and accounting, behind a login | Staff |

## Run it

You need Node.js 22.5 or newer. No other database is needed, because data is stored in `data/medici.db` (SQLite).

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. To use the POS, go to `/pos` and sign in as **admin** with password **medici2026**.
**Change this password straight away** in Settings → My password.

## Put it online (so the WhatsApp link works)

Any Node host with a **persistent disk** will do. Render, Railway, Fly.io and a basic VPS all work.

1. Upload this folder (or push it to GitHub) and use `npm start` as the start command.
2. Mount a persistent disk and set `DATA_DIR` to its path (for example `/var/data`). If you skip this, your sales history can be lost when the host redeploys.
3. Set `BASE_URL` to your public address, for example `https://medicicutz.com`. Receipt links and WhatsApp previews use it.
4. Point your domain at the host. The link to share is `https://<your-domain>/book`.

Environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | The port to listen on (default 3000) |
| `BASE_URL` | Your public address, used in receipt links and link previews |
| `DATA_DIR` | Where the database lives (use a persistent disk) |
| `ADMIN_PASSWORD` | The first admin password, used only on the very first start |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email receipts |

## Booking rules

* Clients choose a service, a barber (or "First available"), a date and a time. The page shows only slots that are really free, matched to the barber's skills (for example, a pedicure goes to the pedicurist).
* Clients **must tick the arrival policy box**: arrive no later than **10 minutes** after the booked time.
* If a booking isn't checked in by start time + 10 minutes, it is **automatically marked "Late / no-show"** and the slot opens up for others. At the desk, staff can still choose "Check in anyway" if the barber is free.
* Clients get a booking pass with a reference, an "Add to calendar" button (with a 1-hour reminder), "WhatsApp us" and "Cancel" (they confirm it with their phone number).
* A client can hold at most 2 upcoming bookings, which stops spam.
* You can change the grace minutes, opening hours, slot length and how far ahead clients can book in **Settings → Booking & hours**.

## POS features

* **New sale:** tap services and products, assign a barber to each line, attach a client, apply a discount (% or ₦, with a reason), redeem loyalty points, choose the payment method (cash with change shown, transfer, card or split), then charge.
* **Soft-copy receipts:** each sale has a private receipt page (`/r/<code>`) that can be saved as a PDF.
  * **WhatsApp:** opens WhatsApp with the receipt summary and link already typed. Press send. This works immediately with no setup.
  * **Email:** sends a branded HTML receipt once SMTP is set up (see below).
* **Loyalty** (all values can be changed in Settings → Loyalty & discounts):
  * 10 points per visit, plus 1 point per ₦1,000 spent.
  * A 50-point bonus on every 5th visit.
  * Referrals: every client gets a code such as `TOBI379`. When a referred client pays for their first visit, the referrer gets 100 points and the new client gets 50. Referral links look like `/book?ref=CODE`.
  * Points are worth ₦10 each, and at least 100 points must be redeemed at a time.
* **Bookings:** today's chairs, check-in, "Bill" (turns a booking into a sale), no-show, cancel, and phone or walk-in bookings. It also has a copy/share button for the booking link.
* **Purchases:** stock and supplies. Linking a purchase to a retail product adds to that product's stock.
* **Expenses:** categories include rent, salaries, diesel, commissions and others.
* **Reports:** a profit and loss statement, daily revenue, sales by service, payment methods, **staff commissions** (30% and 25% as in the deck, editable per staff member), booking no-show rate, and CSV exports for your accountant.
* **Roles:**
  * Cashiers can sell, book, record entries and send receipts.
  * Only **admins** can void sales (which reverses points and stock), delete records, adjust points, give discounts above 50%, or change settings.

## Email receipts (SMTP)

You can use any email provider. Two examples:

* **Gmail / Google Workspace:**
  1. Turn on 2-step verification.
  2. Create an *App password*.
  3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>` and `MAIL_FROM="Medici Cutz <you@gmail.com>"`.
* **Zoho, Brevo, Mailgun:** use the SMTP details those services give you.

## Before launch: checklist

- [ ] Settings → Business: enter your real address, phone, **WhatsApp number** (`234…`), email, Instagram and bank details.
- [ ] Settings → Staff: replace the placeholder names (Lorenzo, Cosimo, Giuliano, Bianca) with your team.
- [ ] Settings → Services/Products: check prices (they are loaded from the deck), durations and stock.
- [ ] Settings → POS users: create a cashier login for the shop manager.
- [ ] Change the admin password.
- [ ] Back up `data/medici.db` regularly. It holds everything.
