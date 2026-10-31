# Milestone 6 security notes

Date: 31 October 2026.

These notes record what the automated tests exercise. They are not a penetration test, a PDPA certification, or a production sign-off.

## Exercised

- Society A cannot read society B members, and a swapped society id on configuration is ignored.
- A caller without `config.write` receives 403.
- Critical configuration requires a second user. Self-approval of a claim route is rejected unless the route stores `allowSelfApproval`.
- Posted journal lines cannot be updated. Reversal inserts a new document and leaves the original posted.
- A claim can be paid once.
- Login failure audit does not store the password. TOTP enrollment audit does not store the secret.
- Settings responses are limited to the public key allow-list.
- WhatsApp sending is rejected.
- Production boot requires `MFA_REQUIRED=true`. Tests do not set that flag, so local sign-in stays usable.

## Not exercised

- A hosted production deploy, backup restore on that host, or a 100,000-member timing run.
- External email, SMS, or push delivery.
- File malware scanning. No hosting decision supplies a scanner.
- Independent translation review of Sinhala and Tamil. The catalogs are drafts.
