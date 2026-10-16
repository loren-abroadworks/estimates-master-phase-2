# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** owners and office managers of residential and commercial painting companies. They run the whole business in one place: lead → estimate → job → schedule → work order → invoice.
- **Secondary roles:**
  - Estimators: build and send estimates.
  - Project managers.
  - Crew leads and painters: work orders, the crew clock and time logs, often on a phone at the job site.
- The demo switches between these roles from the Prototype bar ("Viewing as").

## Product Purpose

This repository is a front-end replica of the live Estimate Master app (app.estimate-master.com), built as the **Phase 2 prototype**. Its job is to let the client, the PM, developers and QA see and review new features inside the real screens before the production team builds them.
- **Data:** it runs on local mock data and can share one demo copy through Supabase.
- **Success:** a Phase 2 feature reads as a believable part of the live product and is clear enough to hand off.

## Positioning

Estimate Master is built for painting contractors specifically, not general field service:
- Estimates are priced from painting production rates, surfaces, coats and paint products.
- Paint history and color cards follow the property across repaints.
- Crew scheduling, work orders and invoicing sit in the same record chain as the estimate.

## Operating Context

- **Office work:** a desktop browser.
  - Lead Pipeline board, contacts, estimate builder, job and work order pages.
  - Job Scheduling (Job and Crew views; Day, Week and Month).
  - Invoices, reports, settings.
- **Field work:** a phone. Crew clock in and out, work order checklists, crew time.
- **Customer-facing pages:** the estimate client view and proposal, invoice payment, presentations, the public paint record and QR links, the website lead form.
- **Phase 2 modules added in this prototype:** Time, Supplier Orders, Repaint Alerts, Accounting (QuickBooks and Books), Marketing, Automation. They are switched on and off in the dashboard's New Features panel, with feature tours.

## Capabilities and Constraints

- **Design authority:** `docs/BRANDING.md`, derived from the production source code. New work matches the live product and introduces no new visual world. The phase-1 prototype (estimates-master-phase-1) is the reference for Job Scheduling behavior, which is ported under `components/scheduling/phase1`.
- **Painting-industry terms stay as the trade uses them:** coats, surfaces, sheens, gallons, production rates, work orders, change orders, touch-ups, repaints.
- **Role-based access shapes every screen:** Owner, Admin (office manager), Estimator, Project Manager, Crew Lead and Painter permissions decide what is shown and what can be changed. For example, only the office manager or owner changes the schedule.
- **Crew-facing screens must work on phones in the field.**
- **Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS v4, Radix UI. State is held in local stores, kept in step with the feature prototype store through `lib/bridge`.
- Sending email and SMS is sandboxed in the prototype. Nothing leaves it unless a provider is configured.

## Brand Commitments

- **Name:** Estimate Master, with the EM logo (blue "EM" in a dark ring, with a brush and hammer).
- **Visual identity:** the live product's, as recorded in `docs/BRANDING.md`: royal-blue primary, Manrope headings, Roboto body text, production component styles.
- **Spelling:** US English in screen text.

## Evidence on Hand

- **Demo data:** all records are mock sample data (`lib/data`, `features/data`).
- **Not on hand:** real customer testimonials, metrics, pricing or case studies. Do not invent them.
- **Production source:** exported as PDFs to the "production design" Drive folder (commit `18c849d9`). Extracted rules are in `docs/BRANDING.md`.
- **Feature specs and decisions:** `README.md`, `docs/`, `EMTS_BUILD_MINIMAL_COMPLETE.md`, `EMTS_NEW_FEATURES_PANEL.md`.

## Product Principles

1. **Indistinguishable from live:** a new feature should look like it already shipped in production.
2. **One record chain:** a lead, estimate, job, work order and invoice stay linked. A change in one is reflected everywhere it shows.
3. **The trade's language, not software jargon:** say what a painter or office manager would say.
4. **Right screen for the role and the place:** office work is dense and scannable on desktop; crew work is simple and thumb-friendly on a phone.
5. **Review-ready:** every Phase 2 feature can be found, demonstrated and explained (New Features panel, NEW badges, tours) by the client, the PM and QA.
