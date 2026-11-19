import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInvoice, validateBatch, applyFix } from '../src/rules.js';
import { sampleInvoices, parseCSV, rowsToInvoices, invoicesToCSV } from '../src/data.js';
import { toUBL } from '../src/ubl.js';

const base = () => {
  const i = structuredClone(sampleInvoices().find(i => i.buyer_name === 'Hatta Retreats FZ-LLC'));
  i.lines = [{ line_id: '1', item_code: 'CR-VAS-07', item_name: 'Ceramic vase, tall', item_description: 'Hand-glazed ceramic vase, 42 cm', qty: '2', uom: 'H87', net_price: '240.00', gross_price: '240.00', base_qty: '1', line_net: '480.00', tax_category: 'S', tax_rate: '5', line_vat_aed: '24.00', line_amount_aed: '504.00' }];
  return i;
};
const rules = inv => validateInvoice(inv).map(f => f.rule);

test('a clean invoice passes', () => assert.deepEqual(validateInvoice(base()), []));
test('ibr-132-ae rejects a 14-digit TRN', () => { const i = base(); i.buyer_trn = '10099341200003'; assert.ok(rules(i).includes('ibr-132-ae')); });
test('ibr-132-ae accepts 1...03 with 15 digits', () => { const i = base(); i.buyer_trn = '100000000000003'; assert.ok(!validateInvoice(i).some(f => f.field === 'buyer_trn')); });
test('ibr-148-ae TIN format', () => { const i = base(); i.seller_tin = '204587213'; assert.ok(rules(i).includes('ibr-148-ae')); });
test('ibr-128-ae city name instead of code, with fix', () => { const i = base(); i.buyer_subdivision = 'Sharjah'; const f = validateInvoice(i).find(f => f.rule === 'ibr-128-ae'); assert.equal(f.fix.value, 'SHJ'); });
test('ibr-144-ae empty buyer subdivision', () => { const i = base(); i.buyer_subdivision = ''; assert.ok(rules(i).includes('ibr-144-ae')); });
test('ibr-127-ae missing due date', () => { const i = base(); i.due_date = ''; assert.ok(rules(i).includes('ibr-127-ae')); });
test('ibr-127-ae not for credit notes', () => { const i = base(); i.due_date = ''; i.type_code = '381'; assert.ok(!rules(i).includes('ibr-127-ae')); });
test('ibr-154-ae 7 flags', () => { const i = base(); i.transaction_flags = '0000000'; assert.ok(rules(i).includes('ibr-154-ae')); });
test('ibr-120-ae zero rated at 5%', () => { const i = base(); i.lines[0].tax_category = 'Z'; assert.ok(rules(i).includes('ibr-120-ae')); });
test('ibr-147-ae line arithmetic', () => { const i = base(); i.lines[0].line_net = String(Number(i.lines[0].line_net) + 0.4); assert.ok(rules(i).includes('ibr-147-ae')); });
test('ibr-139-ae unknown category', () => { const i = base(); i.lines[0].tax_category = 'X'; assert.ok(rules(i).includes('ibr-139-ae')); });
test('MF-41 free-text unit maps to Rec 20', () => { const i = base(); i.lines[0].uom = 'pcs'; const f = validateInvoice(i).find(f => f.rule === 'MF-41'); assert.equal(f.fix.value, 'H87'); });
test('sample batch has root causes and fixes reduce failures', () => {
  let inv = sampleInvoices();
  const r1 = validateBatch(inv);
  assert.ok(r1.failing > 0 && r1.groups.length > 0);
  for (const g of r1.groups.filter(g => g.fix)) inv = applyFix(inv, g);
  const r2 = validateBatch(inv);
  assert.ok(r2.failing < r1.failing, `${r2.failing} < ${r1.failing}`);
});
test('CSV round trip', () => { const inv = sampleInvoices(); const back = rowsToInvoices(parseCSV(invoicesToCSV(inv))); assert.equal(back.length, inv.length); assert.deepEqual(back[3].lines, inv[3].lines); });
test('UBL has PINT AE identifiers', () => { const xml = toUBL(base()); assert.match(xml, /urn:peppol:pint:billing-1@ae-1/); assert.match(xml, /schemeID="0235"/); });
