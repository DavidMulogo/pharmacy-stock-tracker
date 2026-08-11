# PharmaStock Subscription Plans

Status: approved commercial definition. Feature entitlements, grace periods, payment collection, and automatic plan enforcement described here are not implemented yet.

## Launch Plans

| Plan | Monthly | Annual | Intended customer |
| --- | ---: | ---: | --- |
| Starter | TZS 20,000 | TZS 200,000 | One small pharmacy that needs dependable POS and stock control |
| Business | TZS 45,000 | TZS 450,000 | One established pharmacy that needs operational controls and management reporting |
| Multi-Branch | TZS 90,000 | TZS 900,000 | Up to three connected pharmacy branches; coming later |
| Enterprise | Custom quote | Custom quote | Chains, wholesalers, integrations, and tailored support |

Annual pricing provides approximately two months free. Multi-Branch must not be sold until branch isolation, consolidated reporting, and transfer workflows have been implemented and tested.

## Entitlement Matrix

| Capability | Starter | Business | Multi-Branch |
| --- | :---: | :---: | :---: |
| Pharmacy locations | 1 | 1 | Up to 3 |
| Staff accounts | Owner + 2 | Owner + 9 | Up to 25 |
| Product catalogue | Up to 1,000 | Unlimited for normal single-pharmacy use | Unlimited for normal multi-branch use |
| POS and atomic multi-item checkout | Yes | Yes | Yes |
| Products, batches, CSV import, FEFO, and COGS | Yes | Yes | Yes |
| Expiry and low-stock safety alerts | Yes | Yes | Yes |
| Basic sales and inventory reports | Yes | Yes | Yes |
| Normal product selling-price changes | Yes | Yes | Yes |
| Inventory corrections and audit history | Yes | Yes | Yes |
| Checkout price overrides | No by default | Yes | Yes |
| In-Charge account | No | Yes | Yes |
| Controlled transaction voids | No | Yes | Yes |
| Expenses and gross-profit reports | No | Yes | Yes |
| Override and staff-activity reports | No | Yes | Yes |
| Backup export and validation | Cancellation-safe export only | Yes | Yes |
| Priority support | No | Yes | Yes |
| Consolidated branch dashboard | No | No | Planned |
| Inter-branch stock transfers | No | No | Planned |
| Scheduled encrypted backups | No | Planned | Planned |
| Offline selling and synchronization | No | Planned | Planned |

Starter price overrides remain disabled by default because uncontrolled overrides increase revenue-leakage risk. PharmaStock Admin may later support an explicit exception, but the exception mechanism is not part of the current implementation.

## Pilot and Founding Customers

- New pilot pharmacies receive a 30-day assisted pilot with Business capabilities.
- Payment details are not required to begin the pilot.
- PharmaStock assists with product setup, opening stock, staff training, and workflow feedback.
- The pharmacy selects Starter or Business at the end of the pilot.
- The first three to five suitable pharmacies may receive a 12-month founding-customer rate: Starter at TZS 15,000/month or Business at TZS 30,000/month.
- Founding pricing should be recorded per pharmacy with a clear end date; it must not silently become the public permanent price.

## Renewal and Expiry Policy

The target enforcement policy is:

1. Before expiry: notify the Owner at 7, 3, and 1 day remaining.
2. Days 1-7 after expiry: retain normal access and show a persistent renewal warning.
3. Days 8-30 after expiry: allow read-only access, reports, and a cancellation-safe backup export.
4. After day 30: allow the Owner to sign in only for renewal, account status, and data export.
5. PharmaStock Admin may grant a documented temporary extension for support or payment-resolution cases.

This grace-period model requires new entitlement and access-state implementation. The current application uses its earlier subscription-expiry behavior until that work is deliberately deployed.

## Safety and Data-Ownership Rules

Plan enforcement must never:

- delete pharmacy data automatically;
- alter historical sales, stock, COGS, corrections, or audit records;
- hide an existing critical expiry or medicine-safety record from an otherwise authorized user;
- allow a plan downgrade to corrupt role, branch, or inventory ownership;
- prevent an Owner from obtaining a cancellation-safe export of the pharmacy's data;
- advertise a planned feature as currently available.

Security, tenant isolation, correct stock calculations, historical records, and medicine-safety controls are platform obligations rather than premium add-ons.

## Upgrade and Downgrade Rules

- Upgrades should take effect immediately after confirmed payment.
- Downgrades should take effect at the end of the paid period.
- A downgrade must preserve data belonging to premium features, even when the related editing surface becomes unavailable.
- If staff or product counts exceed the destination plan, existing records remain intact, but new records are blocked until the pharmacy reduces usage or upgrades.
- Downgrading from Business must not invalidate historical In-Charge, override, void, backup, or activity records.
- Multi-Branch downgrade rules must be designed before that plan launches; branches must never be silently merged or deleted.

## Implementation Boundary

This document defines the approved product policy. The implementation phase still requires:

- a stable plan and entitlement data model;
- admin controls for plan, billing period, pilot, founding price, extension, and renewal dates;
- server-side entitlement checks for every gated API;
- matching UI visibility and upgrade messages;
- grace-period and read-only session states;
- usage-limit enforcement without destructive behavior;
- audit events for plan and entitlement changes;
- automated verification for each plan and role combination;
- payment integration in a later phase.
