---
target: leads
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Administrator\\Downloads\\emts-replica\\emts-replica\\app\\leads\\page.tsx"
target_fingerprint: "sha256:4041540cecbedf7d5e840f91bf071abe0b635e0ea16bc787d27ca043a8e894b1"
target_path: "C:\\Users\\Administrator\\Downloads\\emts-replica\\emts-replica\\app\\leads\\page.tsx"
timestamp: 2026-10-15T22-11-00Z
slug: app-leads-page-tsx
---
# Critique: Lead Pipeline (app/leads/page.tsx)

Method: two independent reviews, run in parallel. One was a design review of the source code, the other the automated detector plus code searches. Neither could open a browser, so nothing was checked on screen.

## Usability scores
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Toasts and column counts work, but the remembered Sources filter quietly hides leads the next day |
| 2 | Match with the real world | 3 | Trade wording is right; the LEAD/CONTACT/CLIENT badge competes with the stage |
| 3 | User control and freedom | 2 | Archive has no confirm or undo; Restore always sends a lead to Contacted |
| 4 | Consistency and standards | 2 | 3 different empty-column texts, 2 toast systems; Contacted and Pending are both purple |
| 5 | Error prevention | 3 | Blocked columns dim, but a drop still lands and then shows an error |
| 6 | Recognition rather than recall | 2 | Card actions only appear on hover; the arrow names its target only in a tooltip |
| 7 | Flexibility and efficiency | 1 | No bulk select, no keyboard shortcuts, no "Move to…"; table shows 10 rows a page |
| 8 | Aesthetic and minimalist design | 2 | About 13 elements per card; the date shows twice |
| 9 | Recovering from errors | 2 | Blocked-move messages are good; the delete dialog doesn't mention a linked estimate or appointment |
| 10 | Help and documentation | 2 | Tours exist, but help is otherwise tooltips |
| Total | | 22/40 | Acceptable |

## Specific to this product?
- **Design review:** the look is clearly Estimate Master. The structure is a generic CRM board, built up over time: four stacked rows of controls, with version tags (CRM-M1, CRM-C1) showing it was assembled ticket by ticket. The things that would make it a painting product are mostly missing from the card: estimate value, interior or exterior, when the walkthrough is. The page isn't built around "who do I call next?".
- **Detector:** 7 findings.
  - 4 false alarms: the colored column-header lines at KanbanBoard.tsx:141 and PipelineBoards.tsx:33, and the print-only Arial font and black text at LeadsTable.tsx:173.
  - 3 real, all text sizes off the scale: 8px at LeadCard.tsx:62, 11px at LeadsTable.tsx:131 and leadFeatures.tsx:72.
- **Code searches:** 8 more places with 10px text, 2 with text-xxs, gray-300 empty-column text, and drag and drop with no keyboard alternative.

## What's working
1. Drag knows the rules: columns a lead can't enter dim, and blocked moves say what to do instead.
2. The "No estimator assigned" warning on Scheduled cards.
3. Excel export and print follow the view's filters and sort.

## Priority issues
- **[P0] Archive and "Move to next stage" do nothing on custom-pipeline boards.** PipelineBoards.tsx:135 renders LeadCard without the handlers, but the buttons still show.
  - Fix: pass the handlers through, or hide the buttons.
  - Command: harden.
- **[P1] Nothing tells the office manager who to call next.**
  - Fix: sort each column by time since last contact; show "Last contact 6d" or an overdue chip instead of the duplicate age chip; show the dollar total in each column header.
  - Command: clarify + distill.
- **[P1] A lead can't be moved to Sold or Lost without a mouse.** Dragging is the only way, and the arrow only steps forward.
  - Fix: a "Move to…" menu on each card, listing only the stages the lead may enter.
  - Command: harden.
- **[P1] Too many controls above the board.** About 12 controls, so the board starts about 350px down the page.
  - Fix: put pipeline, Sources and Group by on one row with the view switch; make Archived a tab or filter; hide version badges unless "Show NEW badges" is on.
  - Command: layout + quieter.
- **[P2] The biggest moments happen with no guardrails.** Lost and Archive are instant; Sold only shows a toast.
  - Fix: ask for a reason on Lost; add Undo to the toasts; restore to the previous stage; offer "Create job" on Sold.
  - Command: harden + clarify.

## Persona red flags
- **Alex (power user):** no bulk actions or shortcuts; sorting only in the 10-row table; card actions hidden until hover.
- **Sam (keyboard and screen reader):**
  - Sold and Lost only reachable by dragging.
  - 8px and 10px text; gray-300 text; stage-tinted count bubbles fail contrast on yellow and amber.
  - A clickable × nested inside the Sources button.
  - The source list is labeled a menu but has no arrow-key support.
  - The view toggle doesn't announce which view is selected.
- **Dana (office manager):** can't see overdue leads; counts but no dollars; a remembered Sources filter hides leads.

## Minor observations
- The loading skeleton draws 6 columns, but the board shows 4 plus scrolling.
- Group by Source can't be dragged, and nothing says so.
- The lead form requires an email; production does too, so changing it needs a decision.
- The Archive and Move circles are different grays.
- The table shows status twice.

## Questions to consider
- If Dana saw only the five leads to call today, what would she lose?
- Should Sold hand off to creating the job?
- Does the LEAD/CONTACT/CLIENT badge earn its spot on the card?
