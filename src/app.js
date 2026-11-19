// UI. Depends on rules.js, data.js, ubl.js (inlined at build time).
const WHY = {
  'ibr-125-ae': ['Every invoice line needs an item description.', 'Open the item in the item master and fill the description. Every future invoice for this item inherits it.'],
  'ibr-126-ae': ['Gross price and price base quantity must travel with each line.', 'Set the base quantity on the item price list, usually 1.'],
  'MF-41': ['Units must be UN/ECE codes, not words your team types.', 'Change the unit of measure on the item from free text to the code. The ERP keeps the label your team sees.'],
  'ibr-144-ae': ['A UAE buyer address must carry its emirate code.', 'Add the emirate to the customer address in the customer master.'],
  'ibr-143-ae': ['Your own address must carry its emirate code.', 'Add the emirate to the company address in company setup.'],
  'ibr-128-ae': ['The emirate is written as a word. The network only accepts the seven codes.', 'Replace the text with the code in the customer address.'],
  'ibr-127-ae': ['An invoice with money due must say when it is due.', 'The customer has no payment terms, so the ERP leaves the due date empty. Set terms on the customer.'],
  'ibr-132-ae': ['A TRN is 15 digits, starts with 1 and ends with 03.', 'The TRN on file is mistyped. Correct it from the customer\'s VAT certificate. This one needs a person, not a guess.'],
  'ibr-148-ae': ['The TIN is 10 digits in the format 1XXXXXXXXX.', 'Correct the TIN in company setup.'],
  'ibr-147-ae': ['Line amount must equal quantity times price.', 'Someone edited the line total by hand. Re-post the invoice from the order instead of patching the amount.'],
  'ibr-120-ae': ['A zero rated line must carry 0% VAT.', 'The tax code mapped to exports still charges 5%. Fix the rate on that tax code once.'],
  'aligned-ibrp-s-05': ['Standard rated lines carry the 5% rate.', 'Check the rate on the standard tax code.'],
  'ibr-139-ae': ['VAT categories must come from the UAE list: S, E, O, AE, Z, N.', 'Map your internal tax codes to the UAE categories.'],
  'ibr-145-ae': ['Every line needs a VAT category.', 'Assign a tax code to the item or the line.'],
  'ibr-154-ae': ['The transaction type is 8 flags of 0 and 1.', 'An older integration writes 7 flags. Update the field mapping to 8.'],
  'ibr-104-ae': ['Foreign currency invoices need line amounts in AED.', 'Enable AED reporting amounts on foreign currency invoices.'],
  'ibr-140-ae': ['VAT accounting currency must be AED.', 'Set the tax reporting currency to AED.'],
};
const RULE_URL = id => (id.startsWith('MF') ? 'https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoice-mandatory-fields_V-1.0-23Feb2026.pdf' : `https://docs.peppol.eu/poac/ae/pint-ae/trn-invoice/rule/${id}/`);
const XML_HINT = { buyer_subdivision: 'CountrySubentity', seller_subdivision: 'CountrySubentity', uom: 'unitCode', item_description: 'cbc:Description', due_date: 'IssueDate', buyer_trn: 'PartyTaxScheme', line_net: 'LineExtensionAmount', tax_rate: 'cbc:Percent', transaction_flags: 'ProfileExecutionID', base_qty: 'BaseQuantity', gross_price: 'BaseAmount' };

const S = { invoices: [], report: null, log: [], cause: null, source: 'Raml Home (demo data)' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function go(view) {
  const cur = document.querySelector('.view.on');
  const next = $('#v-' + view);
  if (cur === next) return;
  document.querySelectorAll('[data-step]').forEach(s => s.classList.toggle('on', s.dataset.step === view || (view === 'cause' && s.dataset.step === 'report')));
  if (cur) { cur.classList.add('out'); setTimeout(() => cur.classList.remove('on', 'out'), 420); }
  setTimeout(() => { next.classList.add('on'); window.scrollTo(0, 0); }, cur ? 260 : 0);
}

function count(el, to, ms = 900) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  const t0 = performance.now();
  const tick = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function run() { S.report = validateBatch(S.invoices); renderReport(); }

function load(invoices, label) {
  S.invoices = invoices; S.log = []; S.source = label;
  $('#src').textContent = label;
  run(); go('report');
}

function renderReport() {
  const r = S.report;
  const fixable = r.groups.filter(g => g.fix);
  const clearedByFixes = new Set();
  let trial = S.invoices; for (const g of fixable) trial = applyFix(trial, g);
  const after = validateBatch(trial);
  count($('#n-fail'), r.failing); count($('#n-total'), r.total, 400);
  $('#n-causes').textContent = r.groups.length;
  $('#n-auto').textContent = fixable.length;
  $('#n-after').textContent = r.failing - after.failing;
  $('#lede-fixes').style.display = fixable.length ? '' : 'none';
  $('#ready-n').textContent = r.passing;
  $('#causes').innerHTML = r.groups.map((g, i) => `
    <li class="cause" style="--d:${i * 45}ms">
      <button class="row" data-k="${esc(g.key)}">
        <span class="cnt">${g.invoices.length}</span>
        <span class="txt"><b>${esc(g.record)}</b><span>${esc(WHY[g.rule]?.[0] || g.message)}</span>
          <em>${esc(SOURCES[g.source])} · <code>${esc(g.rule)}</code></em></span>
        <span class="act">${g.fix ? `Fix to <code>${esc(g.fix.value)}</code>` : 'Needs a person'}</span>
      </button>
    </li>`).join('') || '<li class="clear">Every invoice passes. Nothing to fix.</li>';
  document.querySelectorAll('.row').forEach(b => b.onclick = () => openCause(b.dataset.k));
  $('#log').innerHTML = S.log.map(l => `<li><code>${esc(l.time)}</code> ${esc(l.text)}</li>`).join('');
  $('#logwrap').style.display = S.log.length ? '' : 'none';
}

function snippet(g) {
  const inv = S.invoices.find(i => i.invoice_no === g.invoices[0]);
  const xml = toUBL(inv).split('\n');
  const hint = XML_HINT[g.field];
  let at = hint ? xml.findIndex(l => l.includes(hint)) : -1;
  if (g.field === 'buyer_subdivision') at = xml.findIndex((l, i) => i > xml.findIndex(x => x.includes('AccountingCustomerParty')) && l.includes('CountrySubentity'));
  if (g.source === 'item' && hint) {
    const code = String(g.record).split(' · ')[1];
    const ref = xml.findIndex(l => l.includes(`<cbc:ID>${code}</cbc:ID>`));
    if (ref >= 0) {
      let i = ref; while (i > 0 && !xml[i].includes(hint) && !xml[i].includes('<cac:InvoiceLine>')) i--;
      if (xml[i].includes(hint)) at = i; else { i = ref; while (i < xml.length - 1 && !xml[i].includes(hint) && !xml[i].includes('</cac:InvoiceLine>')) i++; if (xml[i].includes(hint)) at = i; }
    }
  }
  if (at < 0) at = 12;
  const from = Math.max(0, at - 3), to = Math.min(xml.length, at + 4);
  return xml.slice(from, to).map((l, i) => `<span class="${from + i === at ? 'hit' : ''}"><i>${from + i + 1}</i>${esc(l.replace(/^ {2}/, ''))}</span>`).join('');
}

function openCause(k) {
  const g = S.report.groups.find(x => x.key === k); if (!g) return;
  S.cause = g;
  const [why, where] = WHY[g.rule] || [g.message, 'Correct the source record in the ERP.'];
  $('#c-count').textContent = g.invoices.length;
  $('#c-record').textContent = g.record;
  $('#c-why').textContent = why;
  $('#c-msg').textContent = g.message;
  $('#c-where').textContent = where;
  $('#c-src').textContent = SOURCES[g.source];
  $('#c-rule').innerHTML = `<a href="${RULE_URL(g.rule)}" target="_blank" rel="noopener">${esc(g.rule)} ↗</a>`;
  $('#c-xml').innerHTML = snippet(g);
  $('#c-inv').innerHTML = g.invoices.map(n => `<code>${esc(n)}</code>`).join('');
  const fx = $('#c-fix');
  if (g.fix) {
    fx.innerHTML = `<p>Proposed change, applied to <b>${esc(g.record)}</b> and every invoice that uses it:</p>
      <div class="diff"><span>${esc(g.field)}</span><s>${esc(currentValue(g) || 'empty')}</s><b>${esc(g.fix.value)}</b></div>
      <button class="primary" id="approve">Approve and re-check</button>
      <small>Nothing changes until you approve. Every approval is logged.</small>`;
    $('#approve').onclick = () => approve(g);
  } else {
    fx.innerHTML = `<p class="human">No safe automatic fix. ${g.rule === 'ibr-132-ae' ? 'Guessing a tax number would create a false invoice.' : 'This needs a decision from finance.'}</p>`;
  }
  go('cause');
}

function currentValue(g) {
  const inv = S.invoices.find(i => i.invoice_no === g.invoices[0]);
  if (g.source === 'item') { const l = inv.lines.find(l => recordKey('item', inv, l) === g.record); return l?.[g.field]; }
  return inv[g.field];
}

function approve(g) {
  const before = S.report.failing;
  S.invoices = applyFix(S.invoices, g);
  S.report = validateBatch(S.invoices);
  const t = new Date();
  S.log.unshift({ time: t.toISOString().slice(0, 19).replace('T', ' '), text: `${SOURCES[g.source]} · ${g.record}: ${g.field} set to ${g.fix.value}. ${before - S.report.failing} invoices cleared.` });
  renderReport(); go('report');
}

function exportView() {
  const ok = S.invoices.filter(i => !S.report.findings.some(f => f.invoice === i.invoice_no));
  $('#e-n').textContent = ok.length; $('#e-w').textContent = ok.length === 1 ? 'invoice' : 'invoices';
  $('#e-list').innerHTML = ok.map(i => `<li><code>${esc(i.invoice_no)}</code><span>${esc(i.buyer_name)}</span><button data-n="${esc(i.invoice_no)}">XML</button></li>`).join('');
  document.querySelectorAll('#e-list button').forEach(b => b.onclick = () => dl(`${b.dataset.n}.xml`, toUBL(S.invoices.find(i => i.invoice_no === b.dataset.n)), 'application/xml'));
  go('export');
}

// Downloads: the claude.ai artifact frame routes them through its downloads capability;
// anywhere else (GitHub Pages, local) a normal blob link is used.
let host = null;
if (window.claude?.use) window.claude.use('downloads').then(d => { host = d; }).catch(() => {});
async function dl(name, text, type = 'text/plain') {
  if (host) { try { await host.save({ filename: name, data: text }); } catch {} return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  $('#demo').onclick = () => load(sampleInvoices(), 'Raml Home (demo data)');
  $('#file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { const inv = rowsToInvoices(parseCSV(t)); if (!inv.length) throw 0; load(inv, f.name); } catch { $('#file').closest('label').querySelector('small').textContent = 'Could not read this file. Use the CSV template.'; } });
  };
  $('#tpl').onclick = () => dl('pint-ae-preflight-template.csv', invoicesToCSV(sampleInvoices().slice(0, 3)), 'text/csv');
  $('#back').onclick = () => go('report');
  $('#to-export').onclick = exportView;
  $('#e-back').onclick = () => go('report');
  $('#e-csv').onclick = () => dl('invoices-corrected.csv', invoicesToCSV(S.invoices), 'text/csv');
  $('#e-log').onclick = () => dl('fix-log.txt', S.log.map(l => `${l.time}  ${l.text}`).join('\n') || 'No fixes approved.');
  document.querySelectorAll('[data-step]').forEach(s => s.onclick = () => { if (s.dataset.step === 'intro') go('intro'); else if (S.report) s.dataset.step === 'export' ? exportView() : go('report'); });
  go('intro');
});
