// Soft-copy receipt rendering: a shareable web page and an HTML email.
const money = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const METHOD = { cash: 'Cash', transfer: 'Bank transfer', card: 'Card (POS)', split: 'Split payment' };
function niceDate(stamp) {
  const d = new Date(stamp.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function receiptPage(s, S, base) {
  const rows = s.items.map((i) => `<tr><td>${esc(i.name)}${i.qty > 1 ? ` <span class="q">× ${i.qty}</span>` : ''}${i.staff_name ? `<div class="by">with ${esc(i.staff_name)}</div>` : ''}</td><td class="r">${money(i.amount)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(s.number)} · ${esc(S.business_name)}</title><link rel="icon" href="/img/favicon.png">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{--gold:#d4af6a;--gold2:#a9803c;--ink:#0b0a08;--card:#14120e;--line:#2c271d;--muted:#9a917f;--text:#efe8da}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 50% -10%,#1d1810,#0b0a08 60%);color:var(--text);font:15px/1.55 Jost,system-ui,sans-serif;min-height:100vh;padding:32px 16px}
.wrap{max-width:460px;margin:0 auto}.card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:36px 28px;position:relative}
.card:before{content:"";position:absolute;inset:6px;border:1px solid rgba(212,175,106,.18);pointer-events:none}
.head{text-align:center;border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:20px}
.head img{width:72px;height:72px;border-radius:50%}
.brand{font:600 30px/1.1 "Cormorant Garamond",serif;letter-spacing:.02em;margin:10px 0 2px;background:linear-gradient(180deg,#f3d99a,#b8893f);-webkit-background-clip:text;background-clip:text;color:transparent}
.tag{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--gold)}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;font-size:13px;margin-bottom:18px}.meta b{display:block;font-weight:400;color:var(--muted);font-size:11px;letter-spacing:.14em;text-transform:uppercase}
table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px dashed var(--line);vertical-align:top}.r{text-align:right;white-space:nowrap;padding-left:12px}
.q{color:var(--muted)}.by{color:var(--muted);font-size:12px}
.sum td{border:0;padding:4px 0;color:var(--muted)}.total td{padding-top:14px;border-top:1px solid var(--gold2);font:600 24px "Cormorant Garamond",serif;color:var(--text)}
.total td.r{color:var(--gold)}
.loyal{margin-top:22px;padding:16px;border:1px solid var(--line);background:rgba(212,175,106,.05);font-size:13px;text-align:center}
.loyal strong{color:var(--gold);font-weight:500}
.foot{text-align:center;color:var(--muted);font-size:12.5px;margin-top:22px;line-height:1.7}
.void{background:#4a1d1d;color:#ffd5d5;text-align:center;padding:8px;letter-spacing:.2em;font-size:12px;margin-bottom:16px}
.actions{display:flex;gap:10px;justify-content:center;margin-top:20px}
.btn{font:500 12px Jost,sans-serif;letter-spacing:.18em;text-transform:uppercase;padding:12px 18px;border:1px solid var(--gold);color:var(--gold);background:none;cursor:pointer;text-decoration:none}
.btn.solid{background:linear-gradient(180deg,#e2c27f,#b48a42);color:#120f09;border-color:transparent}
@media print{body{background:#fff;color:#000;padding:0}.card{background:#fff;border:0}.card:before{display:none}.brand{color:#000;-webkit-text-fill-color:#000}
.tag,.total td.r,.loyal strong{color:#000}.meta b,.q,.by,.sum td,.foot{color:#555}.actions{display:none}td{border-color:#ccc}.loyal{border-color:#ccc;background:none}}
</style></head><body><div class="wrap"><div class="card">
${s.status === 'void' ? '<div class="void">VOID — THIS RECEIPT HAS BEEN CANCELLED</div>' : ''}
<div class="head"><img src="${base}/img/emblem-sm.png" alt=""><div class="brand">${esc(S.business_name)}</div><div class="tag">${esc(S.tagline)}</div></div>
<div class="meta"><div><b>Receipt</b>${esc(s.number)}</div><div><b>Date</b>${niceDate(s.created_at)}</div>
<div><b>Client</b>${esc(s.client_name || 'Walk-in guest')}</div><div><b>Paid by</b>${METHOD[s.payment_method] || esc(s.payment_method)}</div></div>
<table>${rows}</table>
<table class="sum"><tr><td>Subtotal</td><td class="r">${money(s.subtotal)}</td></tr>
${s.discount_amount ? `<tr><td>Discount${s.discount_type === 'pct' ? ` (${s.discount_value}%)` : ''}${s.discount_reason ? ' · ' + esc(s.discount_reason) : ''}</td><td class="r">−${money(s.discount_amount)}</td></tr>` : ''}
${s.points_value ? `<tr><td>Loyalty points (${s.points_redeemed} pts)</td><td class="r">−${money(s.points_value)}</td></tr>` : ''}
<tr class="total"><td>Total paid</td><td class="r">${money(s.total)}</td></tr></table>
${s.client_id ? `<div class="loyal">You earned <strong>${s.points_earned} loyalty points</strong> today.<br>Balance: <strong>${s.client_points} pts</strong> (worth ${money(s.client_points * Number(S.point_value || 10))})${s.client_referral_code ? `<br><br>Share your code <strong>${esc(s.client_referral_code)}</strong> — earn ${esc(S.referral_bonus)} pts for every friend who visits.` : ''}</div>` : ''}
<div class="foot">${esc(S.receipt_footer)}<br>${esc(S.address)}<br>${esc(S.phone)} · ${esc(S.email)}${S.bank_details ? '<br>' + esc(S.bank_details) : ''}</div>
</div><div class="actions"><button class="btn solid" onclick="print()">Save as PDF</button><a class="btn" href="${base}/book">Book next visit</a></div></div></body></html>`;
}

function receiptEmail(s, S, base) {
  const td = 'padding:10px 0;border-bottom:1px dashed #2c271d;font-size:14px;color:#efe8da;';
  const rows = s.items.map((i) => `<tr><td style="${td}">${esc(i.name)}${i.qty > 1 ? ' × ' + i.qty : ''}${i.staff_name ? `<br><span style="color:#9a917f;font-size:12px">with ${esc(i.staff_name)}</span>` : ''}</td><td align="right" style="${td}white-space:nowrap">${money(i.amount)}</td></tr>`).join('');
  const sumRow = (l, v) => `<tr><td style="padding:4px 0;color:#9a917f;font-size:13px">${l}</td><td align="right" style="padding:4px 0;color:#9a917f;font-size:13px">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#0b0a08;padding:24px 12px;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#14120e;border:1px solid #3a3122" cellpadding="0" cellspacing="0">
<tr><td style="padding:0"><img src="${base}/img/logo-email.jpg" width="480" alt="${esc(S.business_name)} — ${esc(S.tagline)}" style="display:block;width:100%;height:auto"></td></tr>
<tr><td style="padding:8px 28px 28px">
<p style="color:#efe8da;font-size:15px;line-height:1.6;margin:0 0 18px">Thank you${s.client_name ? ', ' + esc(s.client_name.split(' ')[0]) : ''}. Here is your receipt from today’s visit.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#9a917f;margin-bottom:10px">
<tr><td>RECEIPT<br><span style="color:#efe8da;font-size:14px">${esc(s.number)}</span></td><td align="right">DATE<br><span style="color:#efe8da;font-size:14px">${niceDate(s.created_at)}</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
${sumRow('Subtotal', money(s.subtotal))}
${s.discount_amount ? sumRow('Discount' + (s.discount_reason ? ' · ' + esc(s.discount_reason) : ''), '−' + money(s.discount_amount)) : ''}
${s.points_value ? sumRow(`Loyalty points (${s.points_redeemed} pts)`, '−' + money(s.points_value)) : ''}
${sumRow('Paid by', METHOD[s.payment_method] || esc(s.payment_method))}
<tr><td style="padding-top:14px;border-top:1px solid #a9803c;font-family:Georgia,serif;font-size:22px;color:#efe8da">Total paid</td>
<td align="right" style="padding-top:14px;border-top:1px solid #a9803c;font-family:Georgia,serif;font-size:22px;color:#d4af6a">${money(s.total)}</td></tr></table>
${s.client_id ? `<div style="margin-top:22px;padding:14px;border:1px solid #2c271d;background:#1a170f;color:#efe8da;font-size:13px;text-align:center;line-height:1.7">
You earned <b style="color:#d4af6a">${s.points_earned} points</b> today · Balance <b style="color:#d4af6a">${s.client_points} pts</b>
${s.client_referral_code ? `<br>Your referral code: <b style="color:#d4af6a">${esc(s.client_referral_code)}</b> — ${esc(S.referral_bonus)} pts per friend.` : ''}</div>` : ''}
<p style="text-align:center;margin:26px 0 8px"><a href="${base}/r/${s.receipt_token}" style="display:inline-block;padding:12px 22px;border:1px solid #d4af6a;color:#d4af6a;text-decoration:none;font-size:12px;letter-spacing:2px">VIEW / SAVE RECEIPT</a>
&nbsp;<a href="${base}/book" style="display:inline-block;padding:12px 22px;background:#c9a25a;color:#120f09;text-decoration:none;font-size:12px;letter-spacing:2px">BOOK NEXT VISIT</a></p>
<p style="text-align:center;color:#9a917f;font-size:12px;line-height:1.7;margin:18px 0 0">${esc(S.receipt_footer)}<br>${esc(S.address)}<br>${esc(S.phone)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

module.exports = { receiptPage, receiptEmail, money, esc };
