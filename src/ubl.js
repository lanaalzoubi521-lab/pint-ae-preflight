// Builds a PINT AE (UBL 2.1) invoice for invoices that pass preflight.
// Intended as the hand-off payload to an Accredited Service Provider, who runs final schematron validation.
const x = s => String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m = v => (Math.round(Number(v) * 100) / 100).toFixed(2);

export function toUBL(inv) {
  const cur = inv.currency;
  const subtotals = new Map();
  for (const l of inv.lines) {
    const k = `${l.tax_category}|${l.tax_rate}`;
    const s = subtotals.get(k) || { cat: l.tax_category, rate: Number(l.tax_rate), base: 0 };
    s.base += Number(l.line_net);
    subtotals.set(k, s);
  }
  const subs = [...subtotals.values()].map(s => ({ ...s, tax: s.base * s.rate / 100 }));
  const net = subs.reduce((a, s) => a + s.base, 0);
  const tax = subs.reduce((a, s) => a + s.tax, 0);

  const party = (p, endpoint, isSeller) => `
    <cac:Party>
      <cbc:EndpointID schemeID="0235">${x(endpoint)}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>${x(inv[p + '_address'])}</cbc:StreetName>
        <cbc:CityName>${x(inv[p + '_city'])}</cbc:CityName>
        <cbc:CountrySubentity>${x(inv[p + '_subdivision'])}</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>${x(inv[p + '_country'])}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${inv[p + '_trn'] ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${x(inv[p + '_trn'])}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${x(inv[p + '_name'])}</cbc:RegistrationName>${isSeller ? `
        <cbc:CompanyID schemeAgencyID="${x(inv.seller_legal_type)}">${x(inv.seller_legal_id)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>`;

  const lines = inv.lines.map(l => `
  <cac:InvoiceLine>
    <cbc:ID>${x(l.line_id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${x(l.uom)}">${x(l.qty)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${x(cur)}">${m(l.line_net)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${x(l.item_description)}</cbc:Description>
      <cbc:Name>${x(l.item_name)}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>${x(l.item_code)}</cbc:ID></cac:SellersItemIdentification>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${x(l.tax_category)}</cbc:ID>
        <cbc:Percent>${x(l.tax_rate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${x(cur)}">${m(l.net_price)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="${x(l.uom)}">${x(l.base_qty)}</cbc:BaseQuantity>
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:Amount currencyID="${x(cur)}">${m(Number(l.gross_price) - Number(l.net_price))}</cbc:Amount>
        <cbc:BaseAmount currencyID="${x(cur)}">${m(l.gross_price)}</cbc:BaseAmount>
      </cac:AllowanceCharge>
    </cac:Price>
  </cac:InvoiceLine>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>
  <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
  <cbc:ProfileExecutionID>${x(inv.transaction_flags)}</cbc:ProfileExecutionID>
  <cbc:ID>${x(inv.invoice_no)}</cbc:ID>
  <cbc:IssueDate>${x(inv.invoice_date)}</cbc:IssueDate>${inv.due_date ? `
  <cbc:DueDate>${x(inv.due_date)}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>${x(inv.type_code)}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${x(cur)}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>${party('seller', inv.seller_tin, true)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party('buyer', inv.buyer_endpoint, false)}
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>${x(inv.payment_means)}</cbc:PaymentMeansCode></cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${x(cur)}">${m(tax)}</cbc:TaxAmount>${subs.map(s => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${x(cur)}">${m(s.base)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${x(cur)}">${m(s.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${x(s.cat)}</cbc:ID>
        <cbc:Percent>${s.rate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('')}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${x(cur)}">${m(net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${x(cur)}">${m(net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${x(cur)}">${m(net + tax)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${x(cur)}">${m(net + tax)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>
`;
}
