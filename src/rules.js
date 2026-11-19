// PINT-AE Preflight: validation rules.
// Sources:
//   MF-xx  = UAE Ministry of Finance, "UAE Electronic Invoice Mandatory Fields" V1.0 (23 Feb 2026)
//   ibr-xxx-ae / aligned-ibrp-* = PINT AE Billing schematron, docs.peppol.eu/poac/ae (v1.0.4)
// Each rule reads ERP-style flat data (one invoice = header + lines) and reports
// findings with the master record that has to change, so one fix can clear many invoices.

export const SUBDIVISIONS = ['AUH', 'DXB', 'SHJ', 'UAQ', 'FUJ', 'AJM', 'RAK'];
export const TAX_CATEGORIES = ['S', 'E', 'O', 'AE', 'Z', 'N'];
export const INVOICE_TYPES = { '380': 'Tax invoice', '381': 'Credit note', '480': 'Invoice out of scope of tax', '389': 'Self-billed invoice', '261': 'Self-billed credit note', '81': 'Credit note related to goods or services' };
export const STANDARD_RATE = 5;

// Common ERP free-text units mapped to UN/ECE Recommendation 20 codes used by Peppol.
export const UOM_MAP = { pcs: 'H87', pc: 'H87', piece: 'H87', pieces: 'H87', each: 'EA', ea: 'EA', unit: 'C62', units: 'C62', kg: 'KGM', kgs: 'KGM', g: 'GRM', m: 'MTR', meter: 'MTR', l: 'LTR', litre: 'LTR', hr: 'HUR', hour: 'HUR', hours: 'HUR', box: 'XBX', set: 'SET' };
export const UOM_CODES = new Set(['H87', 'EA', 'C62', 'KGM', 'GRM', 'MTR', 'LTR', 'HUR', 'XBX', 'SET', 'DAY', 'MON', 'MTK', 'MTQ', 'TNE']);

export const CITY_TO_SUBDIVISION = { 'abu dhabi': 'AUH', 'al ain': 'AUH', dubai: 'DXB', sharjah: 'SHJ', 'umm al quwain': 'UAQ', fujairah: 'FUJ', ajman: 'AJM', 'ras al khaimah': 'RAK' };

const blank = v => v === undefined || v === null || String(v).trim() === '';
const num = v => (blank(v) ? NaN : Number(v));
const r2 = v => Math.round(v * 100) / 100;

// Where the fix lives in the ERP. Drives the "fix once, clear many" grouping.
export const SOURCES = {
  company: 'Company setup',
  customer: 'Customer master',
  item: 'Item master',
  tax: 'Tax setup',
  document: 'Invoice document',
};

function f(rule, inv, source, recordKey, field, message, extra = {}) {
  return { rule, invoice: inv.invoice_no, source, record: recordKey, field, message, ...extra };
}

// Mandatory-field presence (MoF V1.0). Header fields here; lines checked below.
const HEADER_MANDATORY = [
  ['MF-01', 'invoice_no', 'Invoice number', 'document'],
  ['MF-02', 'invoice_date', 'Invoice date', 'document'],
  ['MF-03', 'type_code', 'Invoice type code', 'document'],
  ['MF-04', 'currency', 'Invoice currency code', 'document'],
  ['MF-05', 'transaction_flags', 'Invoice transaction type code', 'document'],
  ['MF-09', 'payment_means', 'Payment means type code', 'customer'],
  ['MF-10', 'seller_name', 'Seller name', 'company'],
  ['MF-11', 'seller_tin', 'Seller electronic address (TIN)', 'company'],
  ['MF-13', 'seller_legal_id', 'Seller legal registration identifier', 'company'],
  ['MF-14', 'seller_legal_type', 'Seller legal registration identifier type', 'company'],
  ['MF-15', 'seller_trn', 'Seller tax identifier (TRN)', 'company'],
  ['MF-17', 'seller_address', 'Seller address line 1', 'company'],
  ['MF-18', 'seller_city', 'Seller city', 'company'],
  ['MF-19', 'seller_subdivision', 'Seller country subdivision', 'company'],
  ['MF-20', 'seller_country', 'Seller country code', 'company'],
  ['MF-21', 'buyer_name', 'Buyer name', 'customer'],
  ['MF-22', 'buyer_endpoint', 'Buyer electronic address', 'customer'],
  ['MF-26', 'buyer_address', 'Buyer address line 1', 'customer'],
  ['MF-27', 'buyer_city', 'Buyer city', 'customer'],
  ['MF-28', 'buyer_subdivision', 'Buyer country subdivision', 'customer'],
  ['MF-29', 'buyer_country', 'Buyer country code', 'customer'],
];

const LINE_MANDATORY = [
  ['MF-40', 'qty', 'Invoiced quantity', 'document'],
  ['MF-41', 'uom', 'Unit of measure code', 'item'],
  ['MF-43', 'net_price', 'Item net price', 'item'],
  ['MF-50', 'item_name', 'Item name', 'item'],
];

export function recordKey(source, inv, line) {
  if (source === 'company') return inv.seller_name || 'Company';
  if (source === 'customer') return inv.buyer_name || 'Unknown customer';
  if (source === 'item') return line ? (line.item_code ? `${line.item_name} · ${line.item_code}` : line.item_name) : '';
  if (source === 'tax') return line ? `VAT code "${line.tax_category}" at ${line.tax_rate}%` : 'Tax setup';
  return inv.invoice_no;
}

export function validateInvoice(inv) {
  const out = [];
  const type = String(inv.type_code || '').trim();
  const isCredit = type === '381' || type === '81' || type === '261';
  const outOfScope = type === '480';

  for (const [rule, key, label, source] of HEADER_MANDATORY) {
    if (outOfScope && key === 'seller_trn') continue;
    if (blank(inv[key])) out.push(f(rule, inv, source, recordKey(source, inv), key, `${label} is missing.`));
  }

  if (!blank(type) && !INVOICE_TYPES[type])
    out.push(f('MF-03', inv, 'document', inv.invoice_no, 'type_code', `Invoice type code "${type}" is not in the PINT AE code list.`));

  if (!blank(inv.transaction_flags) && !/^[01]{8}$/.test(String(inv.transaction_flags)))
    out.push(f('ibr-154-ae', inv, 'document', inv.invoice_no, 'transaction_flags', 'Invoice transaction type code must be exactly 8 characters of 0 and 1.'));

  // ibr-132-ae: TRN = 15 digits, starts with 1, ends with 03
  const trnOk = v => /^1\d{12}03$/.test(String(v));
  if (!blank(inv.seller_trn) && inv.seller_country === 'AE' && !trnOk(inv.seller_trn))
    out.push(f('ibr-132-ae', inv, 'company', recordKey('company', inv), 'seller_trn', `Seller TRN "${inv.seller_trn}" must be 15 digits, starting with 1 and ending with 03.`));
  if (String(inv.buyer_vat_registered).toLowerCase() === 'yes') {
    if (blank(inv.buyer_trn))
      out.push(f('MF-24', inv, 'customer', recordKey('customer', inv), 'buyer_trn', 'Buyer is VAT registered but the TRN is missing.'));
    else if (inv.buyer_country === 'AE' && !trnOk(inv.buyer_trn))
      out.push(f('ibr-132-ae', inv, 'customer', recordKey('customer', inv), 'buyer_trn', `Buyer TRN "${inv.buyer_trn}" must be 15 digits, starting with 1 and ending with 03.`));
  }

  // ibr-148-ae: TIN = 10 digits, 1XXXXXXXXX
  if (!blank(inv.seller_tin) && !/^1\d{9}$/.test(String(inv.seller_tin)))
    out.push(f('ibr-148-ae', inv, 'company', recordKey('company', inv), 'seller_tin', `Seller TIN "${inv.seller_tin}" must be 10 digits in the format 1XXXXXXXXX.`));

  // MF-14 code list
  if (!blank(inv.seller_legal_type) && !['TL', 'EID', 'PAS', 'CD'].includes(inv.seller_legal_type))
    out.push(f('MF-14', inv, 'company', recordKey('company', inv), 'seller_legal_type', `Legal registration type "${inv.seller_legal_type}" must be TL, EID, PAS or CD.`));

  // ibr-128-ae: AE subdivision codes
  for (const side of ['seller', 'buyer']) {
    const c = inv[`${side}_country`], s = inv[`${side}_subdivision`];
    if (c === 'AE' && !blank(s) && !SUBDIVISIONS.includes(String(s).trim())) {
      const src = side === 'seller' ? 'company' : 'customer';
      const guess = CITY_TO_SUBDIVISION[String(s).trim().toLowerCase()];
      out.push(f('ibr-128-ae', inv, src, recordKey(src, inv), `${side}_subdivision`, `Country subdivision "${s}" must be one of ${SUBDIVISIONS.join(', ')}.`, guess ? { fix: { field: `${side}_subdivision`, value: guess } } : {}));
    }
    if (c === 'AE' && blank(s)) {
      const src = side === 'seller' ? 'company' : 'customer';
      const guess = CITY_TO_SUBDIVISION[String(inv[`${side}_city`] || '').trim().toLowerCase()];
      const idx = out.findIndex(x => x.field === `${side}_subdivision` && x.rule.startsWith('MF'));
      const rule = side === 'seller' ? 'ibr-143-ae' : 'ibr-144-ae';
      const finding = f(rule, inv, src, recordKey(src, inv), `${side}_subdivision`, `${side === 'seller' ? 'Seller' : 'Buyer'} postal address has no country subdivision.`, guess ? { fix: { field: `${side}_subdivision`, value: guess } } : {});
      if (idx >= 0) out[idx] = finding; else out.push(finding);
    }
  }

  // ibr-127-ae: payment due date when amount due > 0 (not for credit notes or deemed supply)
  const deemed = /^[01]1[01]{6}$/.test(String(inv.transaction_flags || ''));
  const lines = inv.lines || [];
  const totalNet = r2(lines.reduce((a, l) => a + (num(l.line_net) || 0), 0));
  const totalVat = r2(lines.reduce((a, l) => a + (num(l.line_net) || 0) * (num(l.tax_rate) || 0) / 100, 0));
  const due = r2(totalNet + totalVat);
  if (!isCredit && !deemed && due > 0 && blank(inv.due_date))
    out.push(f('ibr-127-ae', inv, 'customer', recordKey('customer', inv), 'due_date', 'Payment due date is required because an amount is due. Usually caused by missing payment terms on the customer.'));

  // ibr-140-ae
  if (!blank(inv.accounting_currency) && inv.accounting_currency !== 'AED')
    out.push(f('ibr-140-ae', inv, 'company', recordKey('company', inv), 'accounting_currency', 'VAT accounting currency, when present, must be AED.'));

  if (!lines.length) out.push(f('MF-39', inv, 'document', inv.invoice_no, 'lines', 'Invoice has no lines.'));

  for (const l of lines) {
    const lineRef = `line ${l.line_id}`;
    for (const [rule, key, label, source] of LINE_MANDATORY) {
      if (blank(l[key])) out.push(f(rule, inv, source, recordKey(source, inv, l), key, `${label} is missing on ${lineRef}.`, { line: l.line_id }));
    }
    if (blank(l.line_id)) out.push(f('MF-39', inv, 'document', inv.invoice_no, 'line_id', 'Invoice line identifier is missing.'));

    // ibr-125-ae item description
    if (blank(l.item_description))
      out.push(f('ibr-125-ae', inv, 'item', recordKey('item', inv, l), 'item_description', `Item description is missing on ${lineRef}.`, { line: l.line_id }));

    // ibr-126-ae base quantity + gross price
    if (blank(l.base_qty) || blank(l.gross_price))
      out.push(f('ibr-126-ae', inv, 'item', recordKey('item', inv, l), 'gross_price', `Item gross price and price base quantity must both be present on ${lineRef}.`, { line: l.line_id, fix: blank(l.base_qty) && !blank(l.gross_price) ? { field: 'base_qty', value: '1', scope: 'line' } : undefined }));

    // UoM code list (UN/ECE Rec 20)
    if (!blank(l.uom) && !UOM_CODES.has(String(l.uom).trim())) {
      const guess = UOM_MAP[String(l.uom).trim().toLowerCase()];
      out.push(f('MF-41', inv, 'item', recordKey('item', inv, l), 'uom', `Unit "${l.uom}" is free text. It must be a UN/ECE Rec 20 code${guess ? ` (likely ${guess})` : ''}.`, { line: l.line_id, ...(guess ? { fix: { field: 'uom', value: guess, scope: 'item' } } : {}) }));
    }

    // ibr-145-ae + ibr-139-ae tax category
    const cat = String(l.tax_category || '').trim();
    if (blank(cat))
      out.push(f('ibr-145-ae', inv, 'tax', recordKey('tax', inv, l), 'tax_category', `${lineRef} has no VAT category code.`, { line: l.line_id }));
    else if (!TAX_CATEGORIES.includes(cat))
      out.push(f('ibr-139-ae', inv, 'tax', recordKey('tax', inv, l), 'tax_category', `VAT category "${cat}" on ${lineRef} is not in the AE tax category code list (${TAX_CATEGORIES.join(', ')}).`, { line: l.line_id }));

    const rate = num(l.tax_rate);
    if (cat === 'S' && rate !== STANDARD_RATE)
      out.push(f('aligned-ibrp-s-05', inv, 'tax', recordKey('tax', inv, l), 'tax_rate', `Standard rated ${lineRef} carries ${isNaN(rate) ? 'no' : rate + '%'} VAT. Standard rate is ${STANDARD_RATE}%.`, { line: l.line_id }));
    if (cat === 'Z' && rate !== 0)
      out.push(f('ibr-120-ae', inv, 'tax', recordKey('tax', inv, l), 'tax_rate', `Zero rated ${lineRef} carries ${rate}% VAT. Zero rated must be 0.`, { line: l.line_id }));

    // ibr-147-ae line net = qty * (net price / base qty)
    const q = num(l.qty), p = num(l.net_price), b = num(l.base_qty) || 1, n = num(l.line_net);
    if (!isNaN(q) && !isNaN(p) && !isNaN(n) && r2(n) !== r2(q * (p / b)))
      out.push(f('ibr-147-ae', inv, 'document', inv.invoice_no, 'line_net', `${lineRef}: net amount ${n.toFixed(2)} does not equal ${q} × ${p.toFixed(2)}${b !== 1 ? ' / ' + b : ''} = ${r2(q * (p / b)).toFixed(2)}.`, { line: l.line_id }));

    // ibr-104-ae AED amounts when line VAT info present
    if (!blank(cat) && (blank(l.line_vat_aed) || blank(l.line_amount_aed)) && inv.currency !== 'AED')
      out.push(f('ibr-104-ae', inv, 'document', inv.invoice_no, 'line_amount_aed', `${lineRef}: invoice is in ${inv.currency}, so line amount and VAT amount in AED must be provided.`, { line: l.line_id }));
  }
  return out;
}

export function groupFindings(findings) {
  // Group by root cause: same rule + same field + same master record.
  const map = new Map();
  for (const x of findings) {
    const k = `${x.rule}|${x.field}|${x.source}|${x.record}`;
    if (!map.has(k)) map.set(k, { key: k, rule: x.rule, field: x.field, source: x.source, record: x.record, message: x.message, fix: x.fix, invoices: new Set(), count: 0 });
    const g = map.get(k);
    g.invoices.add(x.invoice); g.count++;
    if (!g.fix && x.fix) g.fix = x.fix;
  }
  return [...map.values()].map(g => ({ ...g, invoices: [...g.invoices] })).sort((a, b) => b.invoices.length - a.invoices.length);
}

export function validateBatch(invoices) {
  const findings = invoices.flatMap(validateInvoice);
  const failing = new Set(findings.map(x => x.invoice));
  return { findings, groups: groupFindings(findings), total: invoices.length, failing: failing.size, passing: invoices.length - failing.size };
}

// Apply an approved fix to every invoice that shares the master record.
export function applyFix(invoices, group) {
  const { field, value } = group.fix;
  return invoices.map(inv => {
    const rec = recordKey(group.source, inv);
    if (group.source === 'item') {
      return { ...inv, lines: inv.lines.map(l => (recordKey('item', inv, l) === group.record ? { ...l, [field]: value } : l)) };
    }
    if (rec !== group.record) return inv;
    return { ...inv, [field]: value };
  });
}
