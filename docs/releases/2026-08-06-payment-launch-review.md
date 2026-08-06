# Payment launch review — approval pending

## Completed engineering review

- Finance access is limited to organization owner/finance roles: read/export requires `billing.read`; mutations require `billing.manage`.
- Invoice export is tenant-scoped CSV with fixed columns, spreadsheet escaping, `nosniff`, private/no-store caching, and no provider URL, customer reference, card metadata, credential, or token fields.
- Sandbox coverage validates exact-body signatures, replay/deduplication, ordered subscription and invoice transitions, paid-invoice non-reopening, stale delivery handling, processing-lease recovery, quarantine, reconciliation scope, and idempotent corrections.
- Catalog currently supports USD only. No payment method is approved or stored in production. Credits ledger and plan entitlements remain independent from checkout availability.
- Production has both `billing.live=false` and no `BILLING_LIVE_ENABLED=true`; POST purchase/upgrade returns stable `PAYMENT_APPROVAL_PENDING` without charging.
- Verification evidence: payment/finance targeted suite `21/21`, full regression `266/266`, release suite `31/31`, lint passed, and the production build completed successfully.

## Launch decision

USD and every payment method remain **NO-GO** until the legal billing entity, merchant/payment-provider approval, tax/invoice requirements, refund/chargeback policy, production webhook secret, provider-hosted payment method flow, finance owner sign-off, and security owner sign-off are supplied and verified. CNY and other currencies are not in the published catalog and remain out of scope.

This is the only unfinished item in commercial-platform-foundation. It is an external approval gate, not an unimplemented live-payment bypass.
