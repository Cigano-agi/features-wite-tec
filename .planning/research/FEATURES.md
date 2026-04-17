# Feature Research

**Domain:** Billing Links / Payment Links — Brazilian market (B2B seller tool)
**Researched:** 2026-04-16
**Confidence:** HIGH (core features verified against Stripe docs, iugu, Pagar.me, BACEN PIX spec; Brazilian market specifics cross-referenced with BACEN publications)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features sellers assume exist. Missing any of these makes the product feel broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| PIX QR code image in charge response | PIX is 40%+ of e-commerce in Brazil; sellers expect QR at confirmation | MEDIUM | Requires PSP dynamic QR generation (txid-based, one-per-charge); already flagged as PoC gap |
| PIX copia-e-cola string in charge response | ~60% of mobile payers prefer paste over scan; without it, completion rates drop sharply | MEDIUM | Same dynamic payload from PSP; both QR and string must ship together |
| Credit card payment method | Second most used method; sellers without card lose customers who have no PIX key set up | HIGH | PSP tokenization + 3DS required; .NET service already owns PSP integration |
| Fixed-amount link (FIXED type) | Standard product sale: seller sets price, payer cannot change it | LOW | Already in scope; `type: FIXED` + `amount` field on BillingLink model |
| Open-amount link (OPEN type) | Donations, "pay what you want", manual quotes where amount varies per payer | LOW | `type: OPEN` — payer submits amount in charge request body |
| Public pay page (`/pay/:slug`) | Human-readable URL sharable on WhatsApp, Instagram; linkId UUIDs are unprofessional and brittle | LOW | Slug uniqueness enforced at DB level; already planned as PoC fix |
| Link expiry (expiresAt) | Time-limited offers, event registrations; sellers expect this universally | LOW | Nullable timestamp; charge endpoint validates `expiresAt > now()` |
| Payment method toggles (allowPix / allowCard) | Seller may want PIX-only (lower fees) or card-only (recurring context); mixed is not always desired | LOW | Boolean flags on BillingLink; charge handler rejects disallowed method |
| Seller dashboard: per-link totals | "How much did this link make?" is the first question a seller asks | MEDIUM | Requires joining billing_links + transactions; total, approved, pending per link |
| Transaction listing per link | Seller must be able to see who paid, when, and with what method | MEDIUM | Paginated GET `/v1/billing-links/:id/transactions`; PII (name/CPF) visible only to owning seller |
| Link activate/deactivate (soft delete) | Seller needs to stop a link without losing transaction history | LOW | `status: active/inactive` already exists in PoC; PATCH endpoint |
| Idempotent charge endpoint | Payers retry on mobile (slow connections); double-charge = refund hell | MEDIUM | Redis SETNX already proven in PoC; must ship atomic (not exists+save) |
| CPF format validation on payer form | PSPs require CPF for PIX and fraud scoring; invalid CPF = declined charge | LOW | Frontend regex + backend DTO class-validator; 11-digit Luhn-like checksum |

### Differentiators (Competitive Advantage)

Features that separate a well-built billing module from a bare-bones one. These do not all need to be in v1, but the ones marked HIGH value should be roadmapped early.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Webhook on transaction status change | Sellers integrate billing links into their own systems (CRM, fulfillment, etc.); without webhooks they must poll or check the dashboard manually | HIGH | POST to seller-configured URL on Pending→Approved and Pending→Failed; exponential backoff retry (immediately, 5 min, 30 min, 2 h, 5 h); seller registers URL via API |
| Real-time dashboard aggregates | Sellers make pricing decisions based on live revenue; "total pago hoje" is a signal, not a report | MEDIUM | Requires transaction aggregation from .NET service into Node-API metrics; currently hardcoded 0 — this is the most visible PoC gap after PIX |
| Per-link conversion funnel (views vs charges) | Sellers can see if a link is getting traffic but not converting (link text problem) vs not getting traffic (distribution problem) | HIGH | Requires anonymous event tracking (page view counter in Redis or DB); lightweight, does not need full analytics |
| Link slug customization | Branded URLs (`/pay/black-friday-2025`) vs auto-generated slugs; improves trust and shareability | LOW | Seller-supplied slug with uniqueness check; fall back to nanoid if omitted |
| Email notification to payer on success | "Your payment was received" email reduces support ("did it work?") tickets significantly | MEDIUM | Requires email provider integration (SendGrid/SES); payer email collected at charge time |
| QR code image for card link | Even card-paying customers appreciate a QR to open the pay page on mobile from desktop | LOW | Generate QR pointing to `/pay/:slug` using any QR library; no PSP dependency |
| Charge limit per link (maxCharges) | Flash sales, event registrations with seat caps, sample offers; prevents overselling | LOW | Counter in DB or Redis; check on charge before PSP call |
| Installment options on credit card | Brazilian payers strongly expect parcelas (2x, 3x, 6x, 12x sem juros or com juros); absent installments = cart abandonment for ticket > R$200 | HIGH | PSP must support installment plans; .NET service must pass installment count to PSP; payer selects in form |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly not build in v1, and reasons why.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Boleto as payment method | Historically dominant in Brazil; sellers ask for it | Boleto has 1-3 day settlement, high non-payment rate (~30%), expiry management complexity, and FEBRABAN compliance requirements. Adds a third payment integration path when PIX + card already covers 90%+ of digital payers. PROJECT.md already rules it out for v1. | Ship PIX + card first. Add boleto only if sellers explicitly request and conversion data justifies the cost. |
| Real-time push notifications (WebSocket) | Sellers want live payment alerts in dashboard | Adds WebSocket infrastructure (or Server-Sent Events) to a system that does not yet have reliable webhook delivery. The incremental value over polling or page refresh is marginal for v1. | Dashboard can poll the metrics endpoint every 30 s. Webhooks cover the integration case. |
| Subscription / recurring billing | Some sellers want monthly charges from one link | Requires mandate management, retry logic, proration, LGPD consent records for recurring debit. This is a separate product vertical, not a billing link feature. Scope creep would derail v1. | Build recurring as a separate module after billing links are stable. |
| OAuth / social login for sellers | Reducing seller friction at signup | Not in scope per PROJECT.md; email+password is sufficient for v1. Adding OAuth adds security surface and dependency on external auth providers without proportional v1 value. | Standard JWT email/password. |
| Multi-currency support | International expansion | Brazilian PSPs operate in BRL; currency conversion adds forex risk, compliance complexity, and PSP renegotiation. The market is domestic. | BRL only. |
| Payer accounts / saved payment methods | Repeat customers expect one-click | Card tokenization per-payer requires PCI-DSS SAQ-D scope expansion, consent flows, and a payer identity model. Disproportionate complexity for a billing links module inside a larger platform. | PSP-level tokenization (Link by Stripe, Mercado Pago's vault) can provide this later without owning it. |
| Custom checkout branding (logo, colors) | Sellers want white-label look | Nice to have but not a conversion driver when the link is shared from a known seller. Requires frontend theming system and storage for uploaded assets. | Use a clean, neutral pay page design. Add branding as a v2 differentiator once usage is established. |

---

## Feature Dependencies

```
PIX QR code + copia-e-cola
    └──requires──> Dynamic PIX generation by .NET service (PSP call)
                       └──requires──> txid per charge (unique transaction ID)

Credit card charge
    └──requires──> Card tokenization in .NET / PSP
                       └──requires──> 3DS flow in frontend pay page

Webhook delivery
    └──requires──> Transaction status transitions (Pending→Approved/Failed) emitted as events
                       └──requires──> Transaction state machine (.NET) already exists
    └──requires──> Seller webhook URL registered on BillingLink or seller account

Dashboard aggregates (real-time totals)
    └──requires──> Transaction listing per link (Node-API queries .NET or shared DB)
                       └──requires──> Transactions persisted to PostgreSQL (not in-memory)

Transaction listing per link
    └──requires──> seller_id isolation (already exists via JWT guard)

Link expiry enforcement
    └──requires──> expiresAt field on BillingLink (needs schema migration)

Payment method toggles (allowPix/allowCard)
    └──requires──> BillingLink model complete (name, slug, FIXED/OPEN, allowPix, allowCard, expiresAt)

Charge limit per link (maxCharges)
    └──requires──> Per-link charge counter (atomic Redis INCR or DB counter)

Installments on credit card
    └──requires──> Credit card charge (above)
    └──requires──> PSP installment plan support in .NET service

Email to payer on success
    └──requires──> Webhook delivery or event bus (status change event)
    └──requires──> Email provider integration (new dependency)

Per-link conversion funnel
    └──requires──> Anonymous page-view event on GET /pay/:slug (lightweight counter)
    └──enhances──> Dashboard aggregates
```

### Dependency Notes

- **PIX QR + copia-e-cola requires .NET dynamic PIX:** The Node-API must relay `txid` to .NET, which calls the PSP for a dynamic QR payload (EMV BR Code). Cannot be faked with a static QR. This is the most critical unblocked dependency for v1.
- **Dashboard aggregates requires transactions in PostgreSQL:** The .NET service currently uses in-memory storage. Before any seller-facing metrics are real, transaction writes must persist to PostgreSQL. This is a pre-condition for any meaningful dashboard.
- **Webhook delivery is independent of but benefits from PostgreSQL transactions:** Can deliver based on .NET callback to Node-API even before shared DB, but reliable retry and deduplication require a persistent webhook_deliveries table.
- **Installments conflicts with OPEN amount:** An OPEN-amount link where the payer sets the amount cannot pre-calculate installment fees. Either restrict installments to FIXED links, or require the payer to choose amount before installment selection.

---

## MVP Definition

### Launch With (v1)

These are non-negotiable for a production billing links feature.

- [ ] BillingLink model complete (name, slug, FIXED/OPEN, allowPix, allowCard, expiresAt, active) — without this nothing else is coherent
- [ ] `/pay/:slug` public endpoint replacing `/pay/:linkId` — URL format affects all shared links; cannot change post-launch without breaking them
- [ ] PIX QR code + copia-e-cola in charge response — PIX is the dominant payment method; partial PIX support (no QR) means sellers cannot use the product
- [ ] Credit card as payment method — without card, sellers with high-ticket items cannot use the product
- [ ] Idempotent charge with atomic Redis SET NX — race condition in PoC will cause duplicate charges in production; this is a correctness blocker
- [ ] Seller dashboard: per-link totals (total, approved, pending) — without this, the seller has no feedback loop; hardcoded 0 in PoC is not shippable
- [ ] Transaction listing per link — sellers need audit trail; regulatory expectation for financial products
- [ ] PiiSanitizer on all error paths — name/CPF in logs is a compliance violation; non-negotiable per project constraints
- [ ] seller_id always from JWT (never body/query) — security invariant; any deviation is a privilege escalation vector

### Add After Validation (v1.x)

Add once v1 is live and sellers are actively using links.

- [ ] Webhook on transaction status change — trigger: first seller asks "how do I automate my order fulfillment"; HIGH value, MEDIUM complexity
- [ ] Email notification to payer on success — trigger: support tickets about "did my payment go through"
- [ ] Link slug customization (seller-supplied) — trigger: sellers asking for branded URLs
- [ ] Charge limit per link (maxCharges) — trigger: use cases like event registration or limited offers emerge
- [ ] Per-link conversion funnel (views vs charges) — trigger: sellers asking "why isn't this link converting"

### Future Consideration (v2+)

Defer until product-market fit is established and usage patterns justify the investment.

- [ ] Credit card installments (parcelas) — HIGH user value but requires PSP renegotiation and frontend installment selector; defer until card volume justifies it
- [ ] Boleto as payment method — explicitly out of scope per PROJECT.md; revisit only if seller demand is sustained
- [ ] Custom checkout branding — low conversion impact in v1; add as paid tier differentiator in v2
- [ ] Recurring/subscription billing — separate product vertical; do not contaminate billing links model
- [ ] Pix Automático integration — BACEN launched mid-2025; PSP support is still maturing; adopt when PSP exposes it cleanly

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| BillingLink complete model | HIGH | LOW | P1 |
| `/pay/:slug` endpoint | HIGH | LOW | P1 |
| PIX QR + copia-e-cola | HIGH | MEDIUM | P1 |
| Credit card payment | HIGH | HIGH | P1 |
| Atomic idempotency (SET NX) | HIGH | LOW | P1 |
| PiiSanitizer | HIGH | LOW | P1 |
| Dashboard per-link totals | HIGH | MEDIUM | P1 |
| Transaction listing per link | HIGH | MEDIUM | P1 |
| Webhook on status change | HIGH | MEDIUM | P2 |
| Email to payer | MEDIUM | MEDIUM | P2 |
| Slug customization | MEDIUM | LOW | P2 |
| Charge limit (maxCharges) | MEDIUM | LOW | P2 |
| Per-link conversion funnel | MEDIUM | MEDIUM | P2 |
| Credit card installments | HIGH | HIGH | P3 |
| Custom checkout branding | LOW | HIGH | P3 |
| Boleto | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — absent = product is not shippable
- P2: Should have — add immediately after v1 launch when sellers start using the product
- P3: Nice to have — future consideration, requires validated demand

---

## Competitor Feature Analysis

| Feature | iugu | Stripe Payment Links | Mercado Pago | Our Approach |
|---------|------|---------------------|--------------|--------------|
| PIX QR + copia-e-cola | Yes | N/A (PIX not in Stripe global) | Yes | Yes — dynamic per-charge via .NET/PSP |
| Credit card | Yes | Yes (40+ methods) | Yes | Yes — .NET PSP integration |
| Boleto | Yes | N/A | Yes | No (v1 out of scope) |
| Fixed/open amount | Yes | Yes (fixed; adjustable qty) | Yes | Yes — FIXED/OPEN enum on model |
| Link expiry | Yes | No (30-day sub update links only) | Yes | Yes — expiresAt nullable timestamp |
| Webhooks | Yes | Yes (Stripe events) | Yes | Yes — v1.x, after core |
| Seller dashboard | Yes | Via Stripe Dashboard | Yes | Yes — per-link totals + transaction list |
| Installments (parcelas) | Yes | No (Brazil feature) | Yes | v2+ |
| Recurring billing | Yes | Yes (subscription links) | Yes | Explicitly out of scope |
| Slug customization | Yes | No | No | v1.x |
| Charge limits | Yes | Yes (quantity limits) | Yes | v1.x |

---

## Brazilian Market Specifics

These are facts about the Brazilian payment ecosystem that directly affect feature decisions:

1. **PIX dominance:** PIX holds ~40% of e-commerce payment share (2025) and is growing toward 51% by 2027. Any billing link without full PIX support (QR + copia-e-cola) is missing the primary payment method.

2. **Dynamic vs static PIX QR:** Static QR codes cannot carry a unique transaction reference. For a billing link, every charge must generate a dynamic QR code with a unique `txid` (BACEN specification). This is non-trivial and requires PSP support — it is not "just show a QR".

3. **CPF mandatory for PSP anti-fraud:** All major Brazilian PSPs require CPF at charge time for PIX and card transactions. Collecting CPF is not optional; it is required by the payment rails. CPF validation (11-digit checksum) must be enforced at both frontend and backend.

4. **Parcelas expectation:** Brazilian consumers expect installment options for purchases above ~R$200. This is table stakes for card in Brazilian commerce — but it requires PSP negotiation (merchant discount rate per installment tier) and is genuinely complex to implement correctly. Explicitly defer to v2.

5. **PIX Parcelado (2025):** BACEN is rolling out Pix Parcelado (installment PIX) in late 2025. PSP support is uneven. Do not design the FIXED/OPEN model assuming installment PIX — it will complicate the data model before PSP APIs stabilize.

6. **LGPD (Lei Geral de Proteção de Dados):** CPF and payer name are LGPD-sensitive personal data. Logging them is a compliance violation. The PiiSanitizer constraint in PROJECT.md is not optional hygiene — it is a legal requirement.

7. **Boleto non-payment rate:** Boleto has a ~30% non-payment rate and a 1-3 business day settlement window. For a billing links product targeting real-time confirmation (seller sees paid immediately), boleto's settlement model is architecturally mismatched. This validates PROJECT.md's decision to exclude it from v1.

---

## Sources

- [Stripe Payment Links Documentation](https://docs.stripe.com/payment-links) — feature set reference (MEDIUM confidence, global product)
- [iugu — Link de Pagamento](https://www.iugu.com/blog/link-de-pagamento) — Brazilian market feature reference (HIGH confidence)
- [iugu — O que é link de pagamento](https://www.iugu.com/blog/o-que-e-link-de-pagamento) — use case patterns
- [Pagar.me Dashboard](https://www.pagar.me/blog/pagarme-dashboard/) — seller dashboard feature reference
- [BACEN — Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf) — PIX QR/copia-e-cola spec (HIGH confidence)
- [BACEN — bacen/pix-api GitHub discussions](https://github.com/bacen/pix-api/discussions/238) — dynamic QR generation implementation (HIGH confidence)
- [PYMNTS — Pix Surges 53%](https://www.pymnts.com/news/international/latin-america/2025/pix-surges-53percent-digital-payments-overtake-cards-brazil/) — PIX market share data (HIGH confidence)
- [Hookdeck — Webhook Retry Best Practices](https://hookdeck.com/outpost/guides/outbound-webhook-retry-best-practices) — webhook delivery patterns (MEDIUM confidence)
- [Cashfree — Webhook Idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency) — webhook idempotency patterns (MEDIUM confidence)
- [Agência Brasil — Pix Automático](https://agenciabrasil.ebc.com.br/economia/noticia/2025-06/pix-automatico-beneficiara-60-milhoes-de-pessoas-sem-cartao-de-credito) — Pix Automático launch (HIGH confidence)
- [Agência Brasil — Pix Parcelado](https://agenciabrasil.ebc.com.br/economia/noticia/2025-04/pix-parcelado-deve-ser-lancado-em-setembro-diz-banco-central) — Pix Parcelado timeline (HIGH confidence)

---

*Feature research for: Billing Links / Payment Links — Brazilian market*
*Researched: 2026-04-16*
