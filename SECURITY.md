# Security

## Data handling

- Invoice files are read and checked entirely in the browser. Nothing is uploaded, stored on a server, or sent to any third party.
- The public build ships with a Content Security Policy that blocks every network request (`connect-src 'none'`), so invoice data cannot leave the page even if a script were injected.
- Two things are kept in the browser's local storage, by choice: the column mapping for a file layout, and the company details entered once. Clearing site data removes them.

## Hardening covered by tests

| Threat | Handling |
|---|---|
| Script injection through invoice text (names, items, numbers) | Every value is escaped before it reaches the page. Tested with hostile CSV input. |
| Formula injection in exported CSV files | Cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed so spreadsheets treat them as text. |
| Malformed XML from hostile text | All XML output is escaped. |
| Oversized files freezing the browser | Files over 20 MB or 200,000 rows are refused with a clear message. |
| Unsafe download names | Invoice numbers are sanitised before being used as file names. |

## Scope

This is a pre-submission check on ERP data. It does not transmit invoices. The Accredited Service Provider performs the legally binding validation.

## Reporting

Please report a vulnerability by email to lanaalzoubi521@gmail.com rather than opening a public issue.
