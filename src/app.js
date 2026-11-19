// PINT-AE Preflight: product UI.
const WHY = {
  'ibr-125-ae': ['Item description missing', 'Every invoice line needs an item description.', 'Open the item in the item master and add a description. Every future invoice for this item inherits it.'],
  'ibr-126-ae': ['Price base quantity missing', 'Gross price and price base quantity must travel with each line.', 'Set the base quantity on the item price list, usually 1.'],
  'MF-41': ['Unit is free text', 'Units must be UN/ECE codes, not words typed by staff.', 'Change the unit of measure on the item to the code. The ERP keeps the label your team sees.'],
  'ibr-144-ae': ['Emirate missing on buyer address', 'A UAE buyer address must carry its emirate code.', 'Add the emirate to the customer address in the customer master.'],
  'ibr-143-ae': ['Emirate missing on company address', 'Your own address must carry its emirate code.', 'Add the emirate to the company address in company setup.'],
  'ibr-128-ae': ['Emirate written as text', 'The network only accepts AUH, DXB, SHJ, UAQ, FUJ, AJM, RAK.', 'Replace the text with the code in the customer address.'],
  'ibr-127-ae': ['Due date missing', 'An invoice with an amount due must state its due date.', 'The customer has no payment terms, so the ERP leaves the due date empty. Set terms on the customer.'],
  'ibr-132-ae': ['TRN format invalid', 'A TRN is 15 digits, starts with 1 and ends with 03.', 'Correct the TRN from the customer\'s VAT certificate. This needs a person, not a guess.'],
  'ibr-148-ae': ['TIN format invalid', 'The TIN is 10 digits in the format 1XXXXXXXXX.', 'Correct the TIN in company setup.'],
  'ibr-147-ae': ['Line total does not add up', 'Line amount must equal quantity times price.', 'The line total was edited by hand. Re-post the invoice from the order.'],
  'ibr-120-ae': ['Zero rated line charged VAT', 'A zero rated line must carry 0% VAT.', 'The export tax code still charges 5%. Fix the rate on that tax code once.'],
  'aligned-ibrp-s-05': ['Standard rate not 5%', 'Standard rated lines carry the 5% rate.', 'Check the rate on the standard tax code.'],
  'ibr-139-ae': ['Unknown VAT category', 'VAT categories must be S, E, O, AE, Z or N.', 'Map internal tax codes to the UAE categories.'],
  'ibr-145-ae': ['VAT category missing', 'Every line needs a VAT category.', 'Assign a tax code to the item or the line.'],
  'ibr-154-ae': ['Transaction type malformed', 'The transaction type code is 8 flags of 0 and 1.', 'An older integration writes 7 flags. Update the field mapping to 8.'],
  'ibr-104-ae': ['AED amounts missing', 'Foreign currency invoices need line amounts in AED.', 'Enable AED reporting amounts on foreign currency invoices.'],
  'ibr-140-ae': ['Accounting currency not AED', 'VAT accounting currency must be AED.', 'Set the tax reporting currency to AED.'],
};
const RULE_URL = id => (id.startsWith('MF') ? 'https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoice-mandatory-fields_V-1.0-23Feb2026.pdf' : `https://docs.peppol.eu/poac/ae/pint-ae/trn-invoice/rule/${id}/`);
const XML_HINT = { buyer_subdivision: 'CountrySubentity', seller_subdivision: 'CountrySubentity', uom: 'unitCode', item_description: 'cbc:Description', due_date: 'IssueDate', buyer_trn: 'PartyTaxScheme', line_net: 'LineExtensionAmount', tax_rate: 'cbc:Percent', transaction_flags: 'ProfileExecutionID', base_qty: 'BaseQuantity', gross_price: 'BaseAmount' };

const S = { applied: [], raw: [], company: null, invoices: [], report: null, log: [], undo: [], mapping: null, pending: null, view: 'overview', invFilter: 'all', q: '', open: null, source: 'Raml Home Trading LLC', loadedAt: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const aed = v => 'AED ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const total = inv => inv.lines.reduce((a, l) => a + Number(l.line_net || 0) * (1 + Number(l.tax_rate || 0) / 100), 0);
const sevOf = g => (g.fix ? 'fixable' : 'manual');

function run() { S.report = validateBatch(S.invoices); render(); }
function rebuild() { let inv = applyCompany(S.raw, S.company); for (const g of S.applied) inv = applyFix(inv, g); return inv; }
function load(invoices, label) {
  S.raw = invoices; S.applied = []; invoices = applyCompany(invoices, S.company);
  S.invoices = invoices; S.log = []; S.source = label; S.loadedAt = new Date();
  document.body.classList.remove('empty');
  run(); nav('overview');
}

function nav(v) {
  S.view = v;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === v));
  document.querySelectorAll('.page').forEach(p => p.hidden = p.id !== 'pg-' + v);
  $('#crumb').textContent = { overview: 'Overview', issues: 'Issues', invoices: 'Invoices', activity: 'Activity', rules: 'Rules', company: 'Company details' }[v];
  if (v === 'company') renderCompany();
  render();
}

function render() {
  if (!S.report) return;
  const r = S.report, fixable = r.groups.filter(g => g.fix);
  let trial = S.invoices; for (const g of fixable) trial = applyFix(trial, g);
  const after = validateBatch(trial);
  const blockedValue = S.invoices.filter(i => r.findings.some(f => f.invoice === i.invoice_no)).reduce((a, i) => a + total(i), 0);
  // sidebar
  $('#src-name').textContent = S.source;
  $('#org-av').textContent = (S.company?.seller_name || S.source).replace(/[^A-Za-z\u0600-\u06FF ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'PF';
  $('#crumb-org').textContent = S.company?.seller_name || S.source;
  $('#src-meta').textContent = `${r.total} invoices · loaded ${S.loadedAt.toTimeString().slice(0, 5)}`;
  $('#n-issues').textContent = r.groups.length; $('#n-inv').textContent = r.total;
  // overview
  $('#k-ready').textContent = r.passing; $('#k-block').textContent = r.failing;
  $('#k-value').textContent = aed(blockedValue).replace('.00', '');
  $('#k-fix').textContent = `${fixable.length} of ${r.groups.length}`;
  $('#k-fix-sub').textContent = `clear ${r.failing - after.failing} invoices`;
  const pct = r.total ? r.passing / r.total : 0;
  $('#bar-ok').style.width = (pct * 100) + '%';
  $('#bar-fix').style.width = ((r.failing - after.failing) / r.total * 100) + '%';
  $('#bar-label').textContent = `${Math.round(pct * 100)}% ready to send`;
  $('#bar-after').textContent = `${Math.round((r.passing + r.failing - after.failing) / r.total * 100)}% after available fixes`;
  $('#top-issues').innerHTML = issueRows(r.groups.slice(0, 5));
  $('#bysrc').innerHTML = Object.entries(SOURCES).map(([k, label]) => {
    const n = new Set(r.findings.filter(f => f.source === k).map(f => f.invoice)).size;
    return `<tr><td>${label}</td><td class="num">${n}</td><td class="barcell"><span style="width:${r.total ? n / r.total * 100 : 0}%"></span></td></tr>`;
  }).join('');
  // issues page
  const q = S.q.toLowerCase();
  const gs = r.groups.filter(g => !q || (g.record + g.rule + (WHY[g.rule]?.[0] || '')).toLowerCase().includes(q));
  $('#all-issues').innerHTML = issueRows(gs) || `<tr><td colspan="6" class="emptyrow">No issues. Every invoice passes.</td></tr>`;
  // invoices page
  const bad = new Map(); for (const f of r.findings) bad.set(f.invoice, (bad.get(f.invoice) || 0) + 1);
  const list = S.invoices.filter(i => (S.invFilter === 'all' || (S.invFilter === 'blocked' ? bad.has(i.invoice_no) : !bad.has(i.invoice_no))) && (!q || (i.invoice_no + i.buyer_name).toLowerCase().includes(q)));
  document.querySelectorAll('[data-if]').forEach(b => { b.classList.toggle('on', b.dataset.if === S.invFilter); b.querySelector('i').textContent = b.dataset.if === 'all' ? r.total : b.dataset.if === 'blocked' ? r.failing : r.passing; });
  $('#inv-rows').innerHTML = list.map(i => `<tr data-inv="${esc(i.invoice_no)}">
    <td class="mono">${esc(i.invoice_no)}</td><td>${esc(i.buyer_name)}</td><td class="mute hide-s">${esc(i.invoice_date)}</td>
    <td class="num">${aed(total(i))}</td>
    <td>${bad.has(i.invoice_no) ? `<span class="st st-bad">Blocked</span>` : `<span class="st st-ok">Ready</span>`}</td>
    <td class="num mute hide-s">${bad.get(i.invoice_no) || ''}</td>
    <td class="act">${bad.has(i.invoice_no) ? '' : `<button class="ghost sm" data-xml="${esc(i.invoice_no)}">XML</button>`}</td></tr>`).join('');
  document.querySelectorAll('[data-xml]').forEach(b => b.onclick = e => { e.stopPropagation(); dl(`${b.dataset.xml.replace(/[^\w.-]/g, '_')}.xml`, toUBL(S.invoices.find(i => i.invoice_no === b.dataset.xml)), 'application/xml'); });
  document.querySelectorAll('[data-inv]').forEach(tr => tr.onclick = () => openInvoice(tr.dataset.inv));
  // activity
  $('#log').innerHTML = S.log.length ? S.log.map(l => `<tr><td class="mono mute">${esc(l.time)}</td><td>${esc(l.who)}</td><td>${esc(l.text)}</td><td class="num">${l.cleared ? `−${l.cleared}` : ''}</td></tr>`).join('') : `<tr><td colspan="4" class="emptyrow">No changes approved yet.</td></tr>`;
  $('#exp-n').textContent = r.passing;
  document.querySelectorAll('[data-issue]').forEach(tr => tr.onclick = () => openIssue(tr.dataset.issue));
  document.querySelectorAll('[data-quick]').forEach(b => b.onclick = e => { e.stopPropagation(); approve(r.groups.find(g => g.key === b.dataset.quick)); });
}

function issueRows(gs) {
  const max = Math.max(1, ...gs.map(g => g.invoices.length));
  return gs.map(g => `<tr data-issue="${esc(g.key)}">
    <td><span class="dot ${sevOf(g)}"></span></td>
    <td><b>${esc(WHY[g.rule]?.[0] || g.message)}</b><span class="sub">${esc(g.record)}</span></td>
    <td class="mute hide-s">${esc(SOURCES[g.source])}</td>
    <td class="mono mute hide-s">${esc(g.rule)}</td>
    <td class="num"><span class="cnt">${g.invoices.length}</span><span class="minibar"><span style="width:${g.invoices.length / max * 100}%"></span></span></td>
    <td class="act">${g.fix ? `<button class="sm" data-quick="${esc(g.key)}">Fix → <code>${esc(g.fix.value)}</code></button>` : `<span class="mute sm2">Manual</span>`}</td></tr>`).join('');
}

function snippet(g, invNo) {
  const inv = S.invoices.find(i => i.invoice_no === invNo);
  const xml = toUBL(inv).split('\n');
  const hint = XML_HINT[g.field];
  let at = hint ? xml.findIndex(l => l.includes(hint)) : -1;
  if (g.field === 'buyer_subdivision') { const c = xml.findIndex(x => x.includes('AccountingCustomerParty')); at = xml.findIndex((l, i) => i > c && l.includes('CountrySubentity')); }
  if (g.source === 'item' && hint) {
    const code = String(g.record).split(' · ')[1];
    const ref = xml.findIndex(l => l.includes(`<cbc:ID>${code}</cbc:ID>`));
    if (ref >= 0) { let i = ref; while (i > 0 && !xml[i].includes(hint) && !xml[i].includes('<cac:InvoiceLine>')) i--; if (xml[i].includes(hint)) at = i; else { i = ref; while (i < xml.length - 1 && !xml[i].includes(hint) && !xml[i].includes('</cac:InvoiceLine>')) i++; if (xml[i].includes(hint)) at = i; } }
  }
  if (at < 0) at = 12;
  const from = Math.max(0, at - 3), to = Math.min(xml.length, at + 4);
  return xml.slice(from, to).map((l, i) => `<span class="${from + i === at ? 'hit' : ''}"><i>${from + i + 1}</i>${esc(l.replace(/^ {2}/, ''))}</span>`).join('');
}

function currentValue(g) {
  const inv = S.invoices.find(i => i.invoice_no === g.invoices[0]);
  if (g.source === 'item') { const l = inv.lines.find(l => recordKey('item', inv, l) === g.record); return l?.[g.field]; }
  return inv[g.field];
}

function drawer(html) { $('#dr-body').innerHTML = html; document.body.classList.add('dr-open'); }
function closeDrawer() { document.body.classList.remove('dr-open'); }

function openIssue(k) {
  const g = S.report.groups.find(x => x.key === k); if (!g) return;
  const [title, why, where] = WHY[g.rule] || [g.message, g.message, 'Correct the source record in the ERP.'];
  drawer(`
    <div class="dr-k"><span class="dot ${sevOf(g)}"></span>${g.fix ? 'Fixable at source' : 'Needs a person'} · <a href="${RULE_URL(g.rule)}" target="_blank" rel="noopener" class="mono">${esc(g.rule)} ↗</a></div>
    <h3>${esc(title)}</h3>
    <p class="dr-why">${esc(why)}</p>
    <dl class="kv">
      <div><dt>Record</dt><dd>${esc(g.record)}</dd></div>
      <div><dt>Fix in</dt><dd>${esc(SOURCES[g.source])}</dd></div>
      <div><dt>Invoices blocked</dt><dd>${g.invoices.length}</dd></div>
      <div><dt>Example message</dt><dd>${esc(g.message)}</dd></div>
    </dl>
    <div class="sec">How to fix</div><p class="dr-p">${esc(where)}</p>
    ${g.fix ? `<div class="change"><span class="mono mute">${esc(g.field)}</span><span class="from">${esc(currentValue(g) || 'empty')}</span><span>→</span><b>${esc(g.fix.value)}</b></div>
      <button class="primary" id="dr-approve">Approve change and re-check</button><p class="fine">Applied to every invoice that uses this record. Logged with your name and time.</p>` : ''}
    <div class="sec">What your ASP would receive <span class="mono mute">${esc(g.invoices[0])}</span></div>
    <pre class="code">${snippet(g, g.invoices[0])}</pre>
    <div class="sec">Affected invoices</div>
    <div class="chips">${g.invoices.map(n => `<code>${esc(n)}</code>`).join('')}</div>`);
  if (g.fix) $('#dr-approve').onclick = () => approve(g);
}

function openInvoice(no) {
  const inv = S.invoices.find(i => i.invoice_no === no);
  const fs = S.report.findings.filter(f => f.invoice === no);
  drawer(`
    <div class="dr-k">${fs.length ? '<span class="st st-bad">Blocked</span>' : '<span class="st st-ok">Ready</span>'} · ${esc(INVOICE_TYPES[inv.type_code] || inv.type_code)}</div>
    <h3 class="mono">${esc(no)}</h3>
    <dl class="kv">
      <div><dt>Buyer</dt><dd>${esc(inv.buyer_name)}</dd></div>
      <div><dt>Issue date</dt><dd>${esc(inv.invoice_date)}</dd></div>
      <div><dt>Due date</dt><dd>${esc(inv.due_date || '—')}</dd></div>
      <div><dt>Total incl. VAT</dt><dd>${aed(total(inv))}</dd></div>
    </dl>
    <div class="sec">Lines</div>
    <table class="mini"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Net</th></tr></thead><tbody>
    ${inv.lines.map(l => `<tr><td>${esc(l.item_name)}</td><td class="num">${esc(l.qty)}</td><td class="mono">${esc(l.uom)}</td><td class="num">${Number(l.line_net).toFixed(2)}</td></tr>`).join('')}</tbody></table>
    <div class="sec">${fs.length ? `${fs.length} issue${fs.length > 1 ? 's' : ''}` : 'Validation'}</div>
    ${fs.length ? `<ul class="flist">${fs.map(f => `<li><span class="mono mute">${esc(f.rule)}</span>${esc(f.message)}</li>`).join('')}</ul>` : `<p class="dr-p">Passes every check. Ready to hand to your ASP.</p><button class="primary" id="dr-xml">Download PINT AE XML</button>`}`);
  const b = $('#dr-xml'); if (b) b.onclick = () => dl(`${no.replace(/[^\w.-]/g, '_')}.xml`, toUBL(inv), 'application/xml');
}

function approve(g) {
  if (!g?.fix) return;
  const before = S.report.failing;
  S.applied.push({ source: g.source, record: g.record, field: g.field, fix: { ...g.fix } });
  S.invoices = rebuild();
  S.report = validateBatch(S.invoices);
  const t = new Date();
  S.log.unshift({ time: t.toISOString().slice(0, 16).replace('T', ' '), who: 'Finance reviewer', text: `${SOURCES[g.source]} · ${g.record}: ${g.field} set to ${g.fix.value}`, cleared: before - S.report.failing });
  closeDrawer(); render(); toast(`${before - S.report.failing} invoices cleared`, 'Undo', undo);
}

function toast(t, label, fn) {
  const el = $('#toast'); el.innerHTML = `<span>${esc(t)}</span>${label ? `<button>${esc(label)}</button>` : ''}`;
  if (label) el.querySelector('button').onclick = () => { el.classList.remove('on'); fn(); };
  el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), label ? 6000 : 2600);
}
function undo() {
  if (!S.applied.length) return;
  S.applied.pop(); S.invoices = rebuild(); const l = S.log.shift();
  S.log.unshift({ time: new Date().toISOString().slice(0, 16).replace('T', ' '), who: 'Finance reviewer', text: `Undone: ${l ? l.text : 'last change'}`, cleared: 0 });
  run(); toast('Change undone');
}

// Import: decode, detect delimiter, map columns (remembered per column set), then load.
async function importFile(f) {
  try {
    const { text, encoding } = decodeBytes(await f.arrayBuffer());
    const { columns, rows } = parseCSV(text);
    const sig = 'pf-map:' + columns.join('|');
    let map = null; try { map = JSON.parse(localStorage.getItem(sig) || 'null'); } catch {}
    map = map || guessMapping(columns);
    S.pending = { name: f.name, encoding, columns, rows, sig };
    if (missingRequired(map).length) return openMapping(map);
    finishImport(map);
  } catch (e) { toast(e instanceof ImportError ? e.message : 'Could not read this file. Use the CSV template.'); }
}
function renderCompany() {
  const c = S.company || {}, first = S.raw[0] || {};
  const label = { seller_name: 'Registered name', seller_tin: 'TIN (10 digits)', seller_trn: 'TRN (15 digits)', seller_legal_id: 'Trade licence or legal ID', seller_legal_type: 'Legal ID type', seller_address: 'Address line 1', seller_city: 'City', seller_subdivision: 'Emirate', seller_country: 'Country code' };
  const opts = { seller_legal_type: ['TL', 'EID', 'PAS', 'CD'], seller_subdivision: SUBDIVISIONS, seller_country: ['AE'] };
  $('#co-form').innerHTML = SELLER_FIELDS.map(f => {
    const v = c[f] || first[f] || (f === 'seller_country' ? 'AE' : '');
    return `<label class="maprow"><span>${label[f]}</span>${opts[f] ? `<select data-co="${f}"><option value=""></option>${opts[f].map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input data-co="${f}" value="${esc(v)}">`}</label>`;
  }).join('');
}
function saveCompany() {
  const c = {}; document.querySelectorAll('[data-co]').forEach(el => { c[el.dataset.co] = el.value.trim(); });
  S.company = c; try { localStorage.setItem('pf-company', JSON.stringify(c)); } catch {}
  S.invoices = rebuild(); run(); toast('Company details applied to every invoice. Approved fixes kept.');
}
function finishImport(map) {
  const p = S.pending; if (!p) return;
  try { localStorage.setItem(p.sig, JSON.stringify(map)); } catch {}
  S.mapping = map; S.pending = null; S.undo = [];
  load(rowsToInvoices(p.rows, map), p.name);
  const noSeller = SELLER_FIELDS.some(f => !map[f]) && !S.company;
  if (noSeller) toast(`${p.rows.length.toLocaleString()} rows read. Add your company details once.`, 'Add', () => nav('company'));
  else toast(`${p.rows.length.toLocaleString()} rows read · ${p.encoding}`);
}
function openMapping(map) {
  const p = S.pending, label = f => f.replace(/_/g, ' ');
  drawer(`<div class="dr-k">Import · ${esc(p.name)} · ${esc(p.encoding)}</div><h3>Match your columns</h3>
    <p class="dr-why">Your export names some columns differently. Pick the matching column once. It is remembered for this file layout.</p>
    <div class="sec">Required</div><div class="maprows">${REQUIRED.map(f => row(f, true)).join('')}</div>
    <div class="sec">Optional, used by the checks</div><div class="maprows">${FIELDS.filter(f => !REQUIRED.includes(f)).map(f => row(f, false)).join('')}</div>
    <button class="primary" id="map-go">Check invoices</button><p class="fine" id="map-msg"></p>`);
  function row(f, req) {
    return `<label class="maprow"><span>${label(f)}${req ? ' <b>*</b>' : ''}</span><select data-f="${f}"><option value="">Not in file</option>${p.columns.map(c => `<option ${map[f] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
  }
  $('#map-go').onclick = () => {
    const m = {}; document.querySelectorAll('[data-f]').forEach(s => { if (s.value) m[s.dataset.f] = s.value; });
    const miss = missingRequired(m);
    if (miss.length) { $('#map-msg').textContent = 'Still needed: ' + miss.map(label).join(', '); return; }
    closeDrawer(); finishImport(m);
  };
}

function managerReport() {
  const r = S.report, ready = r.passing, d = new Date().toISOString().slice(0, 10);
  const rows = r.groups.map(g => `<tr><td>${esc(WHY[g.rule]?.[0] || g.message)}</td><td>${esc(g.record)}</td><td>${esc(SOURCES[g.source])}</td><td style="text-align:right">${g.invoices.length}</td><td>${g.fix ? 'Fix ready' : 'Needs a person'}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>E-invoicing readiness ${d}</title><style>body{font:13px/1.5 system-ui,sans-serif;color:#18181B;margin:40px;max-width:900px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{text-align:left;padding:8px;border-bottom:1px solid #E7E7E4}th{color:#71717A;font-weight:500}.k{display:flex;gap:40px;margin-top:16px}.k b{display:block;font-size:24px}@media print{body{margin:16mm}}</style></head><body>
  <h1>UAE e-invoicing readiness · ${esc(S.source)}</h1><p>${d} · Checked against PINT AE 1.0.4 and the Ministry of Finance mandatory fields V1.0.</p>
  <div class="k"><div><b>${ready}</b>ready to send</div><div><b>${r.failing}</b>would be rejected</div><div><b>${r.groups.length}</b>root causes</div></div>
  <table><thead><tr><th>Issue</th><th>Record</th><th>Fix in</th><th style="text-align:right">Invoices</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
  <h2 style="font-size:15px;margin-top:28px">Approved changes</h2><table><tbody>${S.log.map(l => `<tr><td>${esc(l.time)}</td><td>${esc(l.who)}</td><td>${esc(l.text)}</td></tr>`).join('') || '<tr><td>None yet</td></tr>'}</tbody></table>
  <p style="color:#71717A;margin-top:24px">Pre-submission check. The Accredited Service Provider runs final validation.</p></body></html>`;
}

let host = null;
if (window.claude?.use) window.claude.use('downloads').then(d => { host = d; }).catch(() => {});
async function dlBlob(name, blob) {
  if (host) { try { await host.save({ filename: name, data: blob }); } catch {} return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function dl(name, text, type = 'text/plain') {
  if (host && /\.xml$/.test(name)) return dlBlob(name.replace(/\.xml$/, '.zip'), zip([{ name, text }])); // xml is not on the host's download allowlist
  if (host) { try { await host.save({ filename: name, data: text }); } catch {} return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-nav]').forEach(a => a.onclick = e => { e.preventDefault(); nav(a.dataset.nav); document.body.classList.remove('nav-open'); });
  document.querySelectorAll('[data-if]').forEach(b => b.onclick = () => { S.invFilter = b.dataset.if; render(); });
  $('#search').oninput = e => { S.q = e.target.value; render(); };
  $('#dr-x').onclick = closeDrawer; $('#scrim').onclick = closeDrawer;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#search').focus(); } });
  const file = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  $('#file').onchange = file; $('#file2').onchange = file;
  $('#demo').onclick = () => { S.company = null; load(sampleInvoices(), 'Raml Home Trading LLC (demo)'); };
  $('#rerun').onclick = () => { run(); toast('Re-checked against PINT AE 1.0.4'); };
  document.querySelectorAll('.tpl').forEach(b => b.onclick = () => dl('pint-ae-preflight-template.csv', invoicesToCSV(sampleInvoices().slice(0, 3)), 'text/csv'));
  $('#exp-csv').onclick = () => dl('invoices-corrected.csv', invoicesToCSV(S.invoices), 'text/csv');
  $('#exp-zip').onclick = () => {
    const ready = S.invoices.filter(i => !S.report.findings.some(f => f.invoice === i.invoice_no));
    const ok = ready.filter(i => String(i.currency).toUpperCase() === 'AED');
    if (ready.length > ok.length) toast(`${ready.length - ok.length} foreign-currency invoices left out: XML export currently covers AED invoices only.`);
    if (!ok.length) return ready.length ? null : toast('No invoices are ready yet.');
    dlBlob(`pint-ae-ready-${ok.length}.zip`, zip(ok.map(i => ({ name: `${i.invoice_no.replace(/[^\w.-]/g, '_')}.xml`, text: toUBL(i) }))));
  };
  $('#exp-report').onclick = () => dl(`readiness-report-${new Date().toISOString().slice(0, 10)}.html`, managerReport(), 'text/html');
  $('#exp-log').onclick = () => dl('approval-log.csv', 'time,reviewer,change,invoices_cleared\n' + S.log.map(l => [l.time, l.who, l.text, l.cleared].map(safeCell).join(',')).join('\n'), 'text/csv');
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  $('#co-save').onclick = saveCompany;
  try { S.company = JSON.parse(localStorage.getItem('pf-company') || 'null'); } catch {}
  load(sampleInvoices(), 'Raml Home Trading LLC (demo)');
});
