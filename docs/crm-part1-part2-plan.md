# CRM Part 1 and Part 2: build plan

Status: **plan only, waiting for go-ahead.** No code has changed yet.

Much of this brief is already partly built from the 30 Sep and 2 Oct CRM work (tracked links, a Sources filter, Sales/Production pipelines, Add pipeline, a Journey bar, Website Lead Review). The plan below extends those pieces instead of building second copies. The decisions I need from you are at the end under "Questions before I start".

---

## 1. Where things live today

### Two stores, two UI kits

The repo has two layers, kept in step by `lib/bridge/`:

| Layer | Store | UI kit | Used by |
| --- | --- | --- | --- |
| Replica (the live app copy) | `lib/store.tsx` (`useCollection`, `useLogActivity`) | `components/ui/*`, `components/Modals/Modal.tsx`, `components/ui/toast.tsx` | `/leads`, `/leads/[id]`, `/contacts/[id]`, `/jobs/[id]`, Settings |
| Feature prototype | `features/lib/store` (`act`, `log`) | `features/components/ui/*`, `features/lib/toast.ts` | Website Lead Review, tracked links card, website-form lead creation |

Each new screen will use the kit already used by the screen it sits in. I will not add a third style.

### CRM screens

| Item | File |
| --- | --- |
| Lead Pipeline page (Board / Table / Website views, pipeline switch, Source filter, Group by) | `app/leads/page.tsx` |
| Board (Sales) | `components/leads/KanbanBoard.tsx` |
| Board (Production and custom pipelines) | `components/leads/PipelineBoards.tsx` |
| Table view | `components/leads/LeadsTable.tsx` |
| Lead card | `components/leads/LeadCard.tsx` |
| Lead details | `app/leads/[id]/page.tsx` |
| Contact page | `app/contacts/[id]/page.tsx` (+ `components/contacts/*`) |
| Job Details | `app/jobs/[id]/page.tsx`, cards in `components/jobs/JobDetailCards.tsx` |
| Manual lead form (field rules to copy) | `components/leads/LeadFormModal.tsx` |
| Lead actions (move, sold, archive, pipeline moves) | `components/leads/useLeadActions.ts` |
| Pipeline rules (columns, insert, delete, name checks, sales column for a lead) | `features/lib/rules/lead-pipeline.ts` |
| Pipeline helpers (create pipeline, production cards, baseline) | `lib/crm.ts` |

### Settings

| Item | File |
| --- | --- |
| Settings › Pipeline Stages (tabs per pipeline, drag rows, Save/Discard, Lead sources tab) | `app/settings/pipeline-stages/page.tsx` → `components/settings/config/PipelineStagesView.tsx` |
| Lead sources list | `components/settings/config/LeadSourcesPanel.tsx`, rules in `features/lib/rules/lead-sources.ts` |
| Settings › Automated Messages | `app/settings/automated-messages/page.tsx` → `components/settings/config/AutomatedMessagesView.tsx` |
| Business Profile (name, logo) | `components/settings/org/BusinessProfileView.tsx`, `businessProfile` singleton (`companyName`, `logoUrl`) |

### Stage trackers (to reuse)

| Component | File | What it is |
| --- | --- | --- |
| `JobProgress` | `components/jobs/JobDetailCards.tsx:159` | Circles + connector line + check marks + labels. Reads job status (`PROGRESS_STAGES`), not a pipeline. **This is the tracker I will generalise.** |
| `JourneyBar` | `components/leads/StageHistory.tsx:63` | One thin bar per pipeline, laid out in a grid (side by side). Will be replaced by stacked circle trackers. |
| `PipelineStatusBar` | `components/leads/PipelineStatusBar.tsx` | Sales stage buttons on lead details, with estimate-lifecycle locks. Will be replaced by the Sales tracker card. |

### Website lead capture

| Item | File |
| --- | --- |
| Form links ("Tracked links") card: name, source, link, leads in 30 days, status, Copy / QR / Pause | `components/leads/TrackedLinksCard.tsx` |
| Public form | `app/website-form/page.tsx` (`/website-form?src=&l=`) |
| Form rules (fields, validation, link path) | `lib/website-form.ts` |
| Form endpoint (inbox) and link status check | `app/api/website-form/route.ts`, `app/api/website-form/links/route.ts`, `lib/tracked-link-status.ts` |
| Inbox → lead (polls every 8 s) | `components/WebsiteInboxSync.tsx` → `submitWebsiteForm` in `features/lib/store/actions/marketing.ts:549` |
| Website Lead Review panel (Website leads table, Lead review list, live form, simulator) | `features/components/features/leads/listings/website-leads-panel.tsx` |
| Possible-duplicate chip | `components/leads/leadFeatures.tsx` |

### Mock data

| Data | File |
| --- | --- |
| Pipelines, pipeline stages, tracked links, lead sources, automated messages | `lib/data/settings-config.ts` |
| Replica seed assembly (leads, contacts, jobs) | `lib/sampleData.ts`, `lib/constants.ts` |
| Feature prototype seed (its leads, customers) | `features/data/seed.ts` |
| Saved-data upgrades | `lib/migrate.ts`, `lib/crm.ts` (`migratePipelineStages`) |

### Reusable pieces

- Buttons: `components/ui/button.tsx` / `features/components/ui/button.tsx`
- Popups: `Modal`, `ConfirmDialog` in `components/Modals/Modal.tsx`; `Modal` in `features/components/ui/dialog.tsx`
- Toasts: `useToast()` (`components/ui/toast.tsx`); `toast` (`features/lib/toast.ts`)
- Tables: `Table/THead/TR/TH/TD` in `features/components/ui/table.tsx`; `LeadsTable` styles
- Dropdowns and fields: `NativeSelect`, `Field`, `Input` in `components/ui/form.tsx`
- Menus: `DropdownMenu`, `RowMenu` in `components/ui/menu.tsx`
- Segmented control: the Board/Table switch styles in `app/leads/page.tsx`
- QR: `qrcode.react` (already installed)
- Export: `downloadCsv`, `printElement`, `IS_HOSTED_DEMO` notice in `features/lib/export.ts`
- Activity log: `useLogActivity()` (replica, shown in Reports › Activity Log) and `log()` (feature store, bridged into the same log)
- Feature flags: `useIsOn`, `FeatureGate`, `VersionBadge` (`features/lib/feature-visibility.ts`, `features/components/ui`)

---

## 2. Build order (one commit each)

1. **Data and flag.** Add `dynamicPipelines` flag (demo bar toggle, default off). Extend `TrackedLink` with `startStageId`, `deletedAt`, `submissions`. Add `notDuplicatePairs` and the thank-you message record. Seed: 5 form links (Website, Facebook, Instagram, Google; one Paused), Training pipeline (3 stages), leads in every Sales stage, two sold leads with Production stages, a Strong-match pair (same phone) and two John Smiths. Migration for saved data.
2. **Form Links panel.** Rework `TrackedLinksCard` into the spec table (Link name, Source, Status, Submissions, Created, Actions). Create / Edit popup with name rules and Starting stage. Copy toast "Link copied". QR popup with Download PNG. Pause/Resume. Delete with the inline confirm. Empty state copy. Activity entries.
3. **Public form `/f/[linkId]`.** Business name and logo, fields and required rules from `LeadFormModal`, inline errors, the three status messages, 10-minute double-click guard, lead in the link's starting stage with the link's source. `/website-form` keeps working for old links.
4. **Thank-you email.** Card in Settings › Automated Messages (switch, subject, body, chips). On a form lead with the switch On: lead activity entry, global activity entry, admin toast. Off: nothing.
5. **Sources filter.** Multi-select chips replacing the single dropdown; applies to every column and count, Board and Table; empty column copy.
6. **Lead Review and Merge.** New match check (Strong / Possible, cleaned values, against leads and contacts) run on every form lead. Lead Review panel with count badge, side-by-side compare, Merge popup (radio choices), Retain (saved pair), Remove (inline confirm). Remove the Website leads table, live form and simulator.
7. **Settings › Pipeline Stages.** Pipeline list left, stages right. Rename, System badge, up/down (B), Add / Delete pipeline (B). Stage rows save on blur, preset colours, counts, up/down, lock or Delete, insert-before-end rules, move-then-delete, preview tracker, empty state. Option A hides pipeline add / delete / reorder.
8. **Board pipeline selector.** Selector in Settings order; columns follow the selected pipeline's stages and colours.
9. **Stacked trackers.** Generalise `JobProgress` into a `StageTracker` (38px circles, 4px line, checks, stage colours, labels, sideways scroll inside its card). One card per pipeline, stacked, on lead details and the contact page. Click to move, toast, Lost replaces Sold, Sold starts Production.
10. **Job Progress from Production.** Job Details reads the Production pipeline through the same `StageTracker`.
11. **Export and Print.** Export to Excel (`Leads_{Pipeline}_{YYYY-MM-DD}.xlsx`, visible columns, filters, sort, bold header, real dates, 5,000 cap) and Print view, both disabled with "No leads to export" when empty.
12. **Docs.** Update this file with what was built, gaps and PM questions.

Tests: I'll add Vitest cases for the pure rules (match check, double-click guard, stage insert / delete-with-move, link name rules, export rows) beside the existing `lead-pipeline.test.ts` and `website-form.test.ts`, and run `npm run typecheck` and `npm test` before each commit. I'll then click through the 17 "Done when" checks in the browser.

---

## 3. Conflicts between the brief and the current prototype

These need a decision. My default is in **bold**; I'll use it if you just say "go".

1. **Dark mode.** The app has no dark theme or toggle today. Tailwind's `dark` variant is set up but nothing applies it. **Default: add `dark:` styles to every new or changed screen, plus a small Light/Dark toggle in the demo bar so they can be checked. The rest of the app stays light-only.**
2. **Public form fields.** The brief says "use the same fields as the manual lead form" (first name, phone and email required, full address required). The current public form follows the 2 Oct D5 decision (full name; phone *or* email; address optional) and a US 10-digit phone rule. The brief also says 10 to 15 digits. **Default: follow the brief (manual form fields, 10–15 digits), which overrides D5.**
3. **Form endpoint.** The public form already posts to a real server endpoint (`/api/website-form`) that holds submissions until a signed-in browser picks them up. The brief says no real backend. **Default: keep the existing endpoint (nothing new on the server) so a link opened on a phone still reaches the admin's browser. The new `/f/[linkId]` route posts to it.** The alternative is an in-browser-only simulation, which only works in the same browser.
4. **Lead numbers.** The brief shows `L-2026-032`; the app uses `LEAD-2026-5`. **Default: keep the existing format** so old leads and new leads match.
5. **Production stages and Job Progress.** The brief locks *Confirmed* and *Closed* in Production. The seeded Production pipeline is Pick Colours → Ready to Schedule → Scheduled → In Progress → Touch-ups → Complete. Job Progress shows job statuses (Confirmed → Scheduled → In Production → Touch Up → Inspection → Completed → Marketing). **Default: reseed Production as Confirmed, Scheduled, In Production, Touch Up, Inspection, Closed. Job Progress shows the job's Production card stage, and clicking a stage moves the card. Job status (used by scheduling and closeout) stays as it is and is no longer shown as the progress bar.** Please confirm the job status and the Production stage may differ.
6. **Manual moves vs the estimate lifecycle.** Today Pending and Sold can only be set by the estimate (sending or accepting it); the stage bar locks them. The brief says any stage can be clicked, and check 13 needs Sold to be clickable. **Default: every stage is clickable on the tracker; the estimate lifecycle still moves the lead automatically as it does now.** Repaint follow-up locks stay.
7. **Moving locked stages.** The current rules say system stages can't move and a pipeline holds at most 12 stages. The brief gives every row up/down arrows. **Default: locked end stages (Sold, Lost, Closed) stay at the end; New Lead and Confirmed stay first; other stages move freely. Keep the 12-stage cap.**
8. **Save model.** Pipeline Stages currently has Save / Discard. The brief says names save on blur. **Default: every change saves straight away; Save / Discard go.**
9. **Link sources.** The brief fixes the list at Website, Facebook, Instagram, Google, Other. The app uses the organisation's Lead sources list (D6). **Default: use the organisation's list and make sure those five are on it.**
10. **Duplicate rules.** The current check (phone first, then email, open leads, 90 days, "Possible duplicate" chip, review only when phone and email point at different leads) is replaced by the Strong / Possible rules in the brief, checked against leads and contacts with no time window. **Default: replace.**
11. **Feature flag.** Added pipelines are now behind "CRM Complete" in the New Features panel. **Default: `dynamicPipelines` replaces that gate for pipelines and is toggled from the demo bar.** Other CRM Complete items (Group by Source, Facebook Lead Ads) keep their gate.
12. **Contact page trackers.** A contact can have several leads. **Default: show the trackers for the contact's most recent lead, with a lead picker when there is more than one.**
13. **SheetJS.** Not in the repo. The npm `xlsx` package is stuck at 0.18.5, which has known security advisories; SheetJS now ships from its own CDN. **Default: add `xlsx` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`** (one new dependency, loaded only when Export is clicked).
14. **Uncommitted work in the tree.** There is unrelated, uncommitted automations work (about 30 files), including one-line edits in `PipelineStagesView.tsx` and `lib/constants.ts`, which I need to change. **Default: I stage only my own files per commit. For those two files, the automations line goes in with my commit unless you'd rather commit or stash that work first.**
15. **Website view.** With the Website leads table, live form and simulator removed, the Website view holds Form Links, Lead Review and Facebook Lead Ads. **Default: keep it as a tab called "Website", with the Lead Review count badge on it.**

---

## 4. Not in scope for the prototype

- Real email sending (simulated with an activity entry and a toast).
- Real duplicate merging in a database (merge edits the in-browser data).
- Server-side link status beyond what the existing `/api/website-form/links` route already does.
