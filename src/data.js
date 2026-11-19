// CSV in, invoices out. One CSV row = one invoice line; header columns repeat per line.
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v !== '')) rows.push(row);
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export const LINE_FIELDS = ['line_id', 'item_code', 'item_name', 'item_description', 'qty', 'uom', 'net_price', 'gross_price', 'base_qty', 'line_net', 'tax_category', 'tax_rate', 'line_vat_aed', 'line_amount_aed'];

export function rowsToInvoices(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.invoice_no)) {
      const head = {};
      for (const [k, v] of Object.entries(r)) if (!LINE_FIELDS.includes(k)) head[k] = v;
      map.set(r.invoice_no, { ...head, lines: [] });
    }
    const line = {};
    for (const k of LINE_FIELDS) line[k] = r[k] ?? '';
    map.get(r.invoice_no).lines.push(line);
  }
  return [...map.values()];
}

export function invoicesToCSV(invoices) {
  const headKeys = Object.keys(invoices[0]).filter(k => k !== 'lines');
  const cols = [...headKeys, ...LINE_FIELDS];
  const esc = v => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  const out = [cols.join(',')];
  for (const inv of invoices) for (const l of inv.lines) out.push(cols.map(c => esc(LINE_FIELDS.includes(c) ? l[c] : inv[c])).join(','));
  return out.join('\n');
}

// Demo dataset: Raml Home, a fictional Dubai homeware retailer.
// Its ERP export carries the kind of master-data gaps most UAE businesses discover late.
export function sampleInvoices() {
  const seller = {
    seller_name: 'Raml Home Trading LLC', seller_tin: '1004587213', seller_trn: '100458721300003',
    seller_legal_id: 'DED-1187642', seller_legal_type: 'TL', seller_address: 'Warehouse 14, Al Quoz Industrial 3',
    seller_city: 'Dubai', seller_subdivision: 'DXB', seller_country: 'AE', accounting_currency: 'AED',
  };
  const customers = [
    { buyer_name: 'Al Noor Hospitality LLC', buyer_endpoint: '1008821457', buyer_trn: '100882145700003', buyer_vat_registered: 'yes', buyer_address: 'Office 902, Bay Square 4', buyer_city: 'Dubai', buyer_subdivision: '', buyer_country: 'AE', payment_means: '30', terms: 30 },
    { buyer_name: 'Saadiyat Living Interiors', buyer_endpoint: '1009934120', buyer_trn: '10099341200003', buyer_vat_registered: 'yes', buyer_address: 'Villa 21, Saadiyat Cultural District', buyer_city: 'Abu Dhabi', buyer_subdivision: 'AUH', buyer_country: 'AE', payment_means: '30', terms: 45 },
    { buyer_name: 'Corniche Stays Hotel Apartments', buyer_endpoint: '1007712093', buyer_trn: '100771209300003', buyer_vat_registered: 'yes', buyer_address: 'Al Majaz 2, Corniche Street', buyer_city: 'Sharjah', buyer_subdivision: 'Sharjah', buyer_country: 'AE', payment_means: '30', terms: 30 },
    { buyer_name: 'Marina Key Property Management', buyer_endpoint: '1006620981', buyer_trn: '100662098100003', buyer_vat_registered: 'yes', buyer_address: 'Marina Plaza, Level 18', buyer_city: 'Dubai', buyer_subdivision: 'DXB', buyer_country: 'AE', payment_means: '30', terms: null },
    { buyer_name: 'Hatta Retreats FZ-LLC', buyer_endpoint: '1005519876', buyer_trn: '100551987600003', buyer_vat_registered: 'yes', buyer_address: 'Hatta Road, Plot 7', buyer_city: 'Dubai', buyer_subdivision: 'DXB', buyer_country: 'AE', payment_means: '30', terms: 30 },
    { buyer_name: 'Gulf Coast Fit-Out Co.', buyer_endpoint: '1004410765', buyer_trn: '100441076500003', buyer_vat_registered: 'yes', buyer_address: 'Industrial Area 6', buyer_city: 'Ajman', buyer_subdivision: 'AJM', buyer_country: 'AE', payment_means: '30', terms: 60 },
  ];
  const items = [
    { item_code: 'LN-THR-01', item_name: 'Washed linen throw', item_description: 'Washed linen throw, 130 x 170 cm, sand', uom: 'pcs', price: 185 },
    { item_code: 'CR-VAS-07', item_name: 'Ceramic vase, tall', item_description: 'Hand-glazed ceramic vase, 42 cm', uom: 'H87', price: 240 },
    { item_code: 'CT-CUS-03', item_name: 'Cotton cushion cover', item_description: '', uom: 'H87', price: 65 },
    { item_code: 'OK-TBL-12', item_name: 'Oak side table', item_description: 'Solid oak side table, oiled finish', uom: 'H87', price: 890 },
    { item_code: 'RT-BSK-02', item_name: 'Rattan basket set', item_description: 'Set of three rattan storage baskets', uom: 'SET', price: 320 },
    { item_code: 'SV-INS-01', item_name: 'Styling and installation', item_description: 'On-site styling and installation, per hour', uom: 'hours', price: 150 },
  ];
  // deterministic pseudo-random
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const invoices = [];
  const start = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 84; i++) {
    const c = customers[Math.floor(rnd() * customers.length)];
    const date = new Date(start + Math.floor(i * 0.9) * 86400000);
    const due = c.terms ? new Date(date.getTime() + c.terms * 86400000) : null;
    const no = `RH-INV-${String(2026001 + i)}`;
    const n = 1 + Math.floor(rnd() * 3);
    const lines = [];
    const used = new Set();
    for (let k = 0; k < n; k++) {
      let it = items[Math.floor(rnd() * items.length)];
      if (used.has(it.item_code)) continue;
      used.add(it.item_code);
      const qty = 1 + Math.floor(rnd() * 12);
      let net = +(qty * it.price).toFixed(2);
      if (i === 37 && k === 0) net = +(net + 0.4).toFixed(2); // rounding drift from a manual edit
      lines.push({
        line_id: String(lines.length + 1), item_code: it.item_code, item_name: it.item_name, item_description: it.item_description,
        qty: String(qty), uom: it.uom, net_price: it.price.toFixed(2), gross_price: it.price.toFixed(2), base_qty: '1',
        line_net: net.toFixed(2), tax_category: 'S', tax_rate: '5',
        line_vat_aed: (net * 0.05).toFixed(2), line_amount_aed: (net * 1.05).toFixed(2),
      });
    }
    const { terms, ...cust } = c;
    invoices.push({
      invoice_no: no, invoice_date: date.toISOString().slice(0, 10), type_code: '380', currency: 'AED',
      transaction_flags: '00000000', due_date: due ? due.toISOString().slice(0, 10) : '',
      ...seller, ...cust, lines,
    });
  }
  // An export with the wrong rate, and a legacy flag value from an old integration.
  invoices[52] = { ...invoices[52], buyer_name: 'Muscat Design House SAOC', buyer_endpoint: '0198823401', buyer_trn: '', buyer_vat_registered: 'no', buyer_address: 'Al Khuwair, Way 3013', buyer_city: 'Muscat', buyer_subdivision: 'MA', buyer_country: 'OM', transaction_flags: '00000001', lines: invoices[52].lines.map(l => ({ ...l, tax_category: 'Z', tax_rate: '5' })) };
  invoices[61] = { ...invoices[61], transaction_flags: '0000000' };
  return invoices;
}
