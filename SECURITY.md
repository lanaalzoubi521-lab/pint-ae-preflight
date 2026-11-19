# Security

## Data handling

- Invoice files are read and checked entirely in the browser. Nothing is uploaded, stored on a server, or sent to any third party.
- The public build ships with a Content Security Policy that blocks network requests (`connect-src 'none'`) and all remote code. It reduces, but does not remove, the impact of an injected script, which is why every value is also escaped before display.
- Two things are kept in the browser's local storage, by choice: the column mapping for a file layout, and the company details entered once. Clearing site data removes them.

## Hardening covered by tests

| Threat | Handling |
|---|---|
| Script injection through invoice text (names, items, numbers) | Every value is escaped before it reaches the page. Tested with hostile CSV input. |
| Formula injection in exported CSV files | Cells starting with `=`, `+`, `-`, `@` (also after leading spaces, and their full-width forms), tab or carriage return are prefixed so spreadsheets treat them as text. |
| Malformed XML from hostile text | All XML output is escaped, and control characters that XML forbids are removed. |
| Oversized files freezing the browser | Files over 20 MB or 200,000 rows are refused with a clear message. |
| Unsafe download names | Invoice numbers are sanitised before being used as file names. |

## Scope

This is a pre-submission check on ERP data. It does not transmit invoices. The Accredited Service Provider performs the legally binding validation.

## Reporting

Please report a vulnerability by email to lanaalzoubi521@gmail.com rather than opening a public issue.
