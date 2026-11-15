# Family Savings Envelopes: no-cost payment bridge

Research checked: 2026-11-15. Scope: fictional, memory-only prototype. This document defines the supported manual workflow; it does not claim a provider connection exists. See [master mission](MASTER_MISSION_CHORES_SAVINGS_INTELLIGENT_JOURNAL.md) and [financial boundaries](security/FINANCE_BOUNDARIES.md).

## What the app records

Family Savings Envelopes tracks approved chore earnings, goal earmarks, payout requests and parent declarations. Money stays with the family or its chosen provider. Between Us holds no money, reads no provider balances and charges no payment-service fee. Restarting the prototype clears its financial records.

| Record | Meaning | User-facing wording |
| --- | --- | --- |
| Earned | Parent approved a chore reward | Approved earnings |
| Earmarked | Eligible unpaid earnings assigned to one goal | Earmarked for Bike |
| Held declaration | Parent says the goal amount is retained | Parent says funds are held |
| Prepared payout | Eligible cents reserved against duplicate requests | Ready for parent action |
| Partial/full manual payment | Parent reports an external payment | Parent reported paid; transfer not verified |
| Child acknowledgment | Child says they received a recorded payment | Child confirmed received; transfer not verified |
| Match pledge | Separate parent commitment | Parent plans to contribute |
| Provider confirmation | Unavailable in this prototype | Never display Provider-confirmed |

Earmarking creates no new income. A payout hold removes those cents from further allocation or cash-out. Cancellation releases an unpaid hold; a payment correction appends an adjustment without erasing the original report. Partial payments reduce the remaining request only by the amount actually reported.

## Parent payout workflow

1. Review the fictional child, payout period, request ID, eligible amount and savings holdback. The amount excludes goal allocations and other active payout holds.
2. Choose Cash/manual, Cash App or Venmo. Choosing a provider is a worksheet preference, not account linking or a transfer.
3. Copy the amount or a short payout note only after an explicit action. Include the fictional recipient, amount and request reference. Exclude journal text, private contacts and unrevealed matching. Preview exactly what will be copied. Clipboard output is an intentional export to the operating system, so use fictional records only.
4. Open a verified public provider page or open the provider independently. Between Us supplies no recipient identifier, credentials or transfer parameters in a URL.
5. The parent verifies the recipient, available funds, fees and age eligibility in that provider's own interface and completes the payment there, or gives cash. Prototype testing stops before any real payment.
6. Return to Between Us. Enter the amount, method, actual payment date and optional note; confirm **Record parent-reported payment**. Opening a provider page or copying a summary never marks a request paid.
7. The child may acknowledge receipt. This adds family acknowledgment, not provider verification. A mismatch remains visible for parent reconciliation.

Use Cash/manual without a finance account. The app must retain a working manual path if a provider page fails to open; show a retry and the ordinary public address. No automation, scraping, password capture, account-balance import or guessed deep links are part of this bridge.

## Cash App handoff

The official family product currently supports managed accounts for ages 6–12, operated through the parent's app, and sponsored accounts for ages 13–17. Teens can have their own app access under sponsor oversight. The page describes scheduled allowances and savings tools. Availability, account approval and controls belong to Cash App; Between Us cannot operate or guarantee them. The family page is the setup handoff: [Cash App Families](https://cash.app/families).

For a payout, the parent independently selects the correct family member and completes the transfer inside Cash App. For parent-held savings, no external transfer is necessary: record an earmark and, if appropriate, the parent's declaration that funds are held. Fixed recurring allowance in Cash App does not automatically reconcile irregular chore rewards, matches or holdbacks in Between Us.

Cash App's merchant Payouts API is restricted to Cash App Pay PSP partners acting for onboarded merchants; merchants cannot integrate directly. It can involve fees and recipient notifications. It is not an approved direct family P2P integration for this project. [Official Cash App Payouts documentation](https://developers.cash.app/cash-app-pay-partner-api/guides/technical-guides/payouts/about).

## Venmo handoff

Venmo Teen Accounts are for ages 13–17 and are connected to a parent or guardian's adult account. The adult must meet Venmo's verification and eligibility requirements. Do not offer under-13 teen onboarding. Between Us directs adults to the provider's current instructions rather than collecting onboarding data. [Teen Account FAQ for Parents & Guardians](https://help.venmo.com/cs/articles/teen-account-faq-for-parents-guardians-vhel117).

The app's ordinary public handoff URL was also checked: [Venmo Teen Debit Card](https://venmo.com/about/teendebitcard). It describes the same 13–17 eligibility and parent-linked setup. Opening this information page does not create an account or payment.

Venmo documents adding money by sending a payment from the parent's linked teen-account view. The parent enters the amount and note in Venmo and returns to record a declaration in Between Us. Between Us cannot lock that money into a goal, read the teen balance or prevent spending. [Managing my linked Teen Account](https://help.venmo.com/cs/articles/managing-my-linked-teen-account-vhel157).

Braintree's Venmo integration is a merchant checkout product. Its unsupported uses explicitly include facilitating peer-to-peer transactions between Venmo users. It is not a workaround for family payouts. [Braintree Venmo integration](https://developer.paypal.com/braintree/articles/guides/payment-methods/venmo?product=service).

## Fees and truthful claims

Between Us requires no paid payment API or provider subscription for this manual prototype. External actions can still carry fees. Cash App's terms list paid options including expedited withdrawals, some ATM activity and credit-card funding; consult the live terms before choosing an external action. [Cash App terms and fee disclosures](https://cash.app/us/en/legal/tos).

Venmo's current fee page lists free account holding and some domestic personal-payment methods, alongside charged methods such as credit-card-funded sends and Instant Transfer. These are provider terms, not a promise from Between Us. The parent reviews the fee displayed by Venmo before proceeding. [Venmo fees](https://venmo.com/resources/our-fees).

Surprise matching is hidden only within Between Us until reveal. Provider activity and notifications may disclose an external contribution; do not promise secrecy outside the app or attempt to suppress provider alerts.

## Validation and release gate

Test partial/manual settlement, duplicate request and duplicate payment IDs, holds, cancellation, acknowledgment and correction history. Assert no provider-confirmed status can be reached through any prototype command. Check the copied preview contains only authorized financial fields. Test provider-opening failure without losing the request.

Provider links were read for documentation research; no provider account, API sandbox, transfer or recipient-specific link was used. Before real use, recheck country/age/identity eligibility, fees and terms, and complete authenticated authorization, secure persistence, consent, retention and independent child-safety review. A verified provider integration would require separately approved scope and reconciliation evidence.
