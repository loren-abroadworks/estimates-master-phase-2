---
name: Estimate Master
description: The painting contractor's command desk: leads to invoices in one dependable, blue-for-action workspace.
colors:
  primary: "#2563eb"
  primary-deep: "#1d4ed8"
  primary-wash: "#eff6ff"
  primary-halo: "#dbeafe"
  primary-focus: "#60a5fa"
  ink: "#111827"
  graphite: "#374151"
  slate-text: "#4b5563"
  muted-label: "#6b7280"
  quiet: "#9ca3af"
  field-line: "#d1d5db"
  hairline: "#e5e7eb"
  wash: "#f3f4f6"
  canvas: "#f9fafb"
  surface: "#ffffff"
  danger: "#dc2626"
  danger-wash: "#fef2f2"
  brand-purple: "#7A5FFF"
  brand-green: "#5ED4B2"
  brand-yellow: "#EAD94C"
  brand-red: "#D62839"
  brand-orange: "#FF9F1C"
typography:
  display:
    fontFamily: "Manrope, Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.375
  title:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  lead:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.05em"
  micro:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.05em"
rounded:
  control: "6px"
  field: "10px"
  tile: "12px"
  card: "16px"
  sheet: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  gutter: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.canvas}"
  button-danger:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "48px"
  badge:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "24px"
  nav-item-active:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.tile}"
    padding: "12px 16px"
---

# Design System: Estimate Master

## Overview

**Creative North Star: "The Contractor's Command Desk"**

Estimate Master is the one desk where a painting company's office runs the whole job chain: the lead comes in, the estimate goes out, the crew is booked, the work order is printed and the invoice is paid. The system is built for someone who sits at it all day and also for the crew lead checking a work order from a truck. It is calm, dependable and dense where density helps: boards, lists and records carry a lot of information at a glance, and nothing on the screen is there to be admired.

Blue is the only voice that says "act here." Everything else is gray working surface: a light gray page, white cards with hairline borders, and gray text in four weights of importance. Components are sturdy and plain-spoken. Targets are big, labels are bold and uppercase, and states are obvious, so the interface reads the same at 8 a.m. on a laptop and at noon on a phone in the sun. Depth is flat with a soft lift: things sit on the page and only rise when they are being touched or float above it.

The visual system is the live production app's (see `docs/BRANDING.md`, taken from the production source). New screens extend it; they never introduce a second look.

**Key Characteristics:**
- One accent: royal blue for actions, links, focus and the active place in the navigation.
- Gray working surfaces with white cards and hairline borders.
- Manrope for the big titles, Roboto for everything you read and type.
- Bold uppercase micro labels over every field and stat.
- Large, obvious controls (48px fields, padded buttons) suitable for office and field use.
- Flat at rest, lifted on hover and for overlays.

## Colors

A single working blue on a quiet gray desk, with a bright brand palette held back for data and categories.

### Primary
- **Command Blue** (`primary`): primary buttons, links, the selected tab or filter, checked boxes, the today marker, progress bars. If it is blue, it can be clicked or it is where you are.
- **Pressed Blue** (`primary-deep`): primary hover and pressed state, active navigation text, switches that are on.
- **Blue Wash** (`primary-wash`): the active navigation item's fill, selected rows and options, hover on menu items, the existing-client card header.
- **Blue Halo** (`primary-halo`): the 4px focus ring around fields; badge fills in the primary color.
- **Focus Edge** (`primary-focus`): the border of a focused field.

### Neutral
- **Ink** (`ink`): page titles, card titles, names on records. The darkest text in the app.
- **Graphite** (`graphite`): secondary button text, badge text, strong table text.
- **Slate Text** (`slate-text`): body copy and typed values in fields.
- **Muted Label** (`muted-label`): field labels, stat labels, page lead lines, helper text.
- **Quiet** (`quiet`): placeholders, icons beside text, "days ago" meta.
- **Field Line** (`field-line`): the outline of inputs and selects.
- **Hairline** (`hairline`): card borders, dividers, table rules.
- **Wash** (`wash`): segmented-control tracks, gray badges, inactive tabs, skeletons.
- **Canvas** (`canvas`): the page behind every screen.
- **Surface** (`surface`): cards, header, sidebar, modals, fields.

### Tertiary
- **Brand palette** (`brand-purple`, `brand-green`, `brand-yellow`, `brand-red`, `brand-orange`, plus reseda-green, space-cadet, amaranth-purple, lavender, gunmetal, electric-blue and mantis in the production palette): pipeline stage colors, crew colors on the schedule, chart series, category tags. Never for buttons or text links.

### State
Success is green, warning is amber, error is red (`danger`, with `danger-wash` behind destructive buttons), information is blue. Badges use the `-100` fill, `-700` text and `-200` border of their hue.

### Named Rules
**The Blue Means Go Rule.** Command Blue appears only on things you can act on or on the place you are. A blue that is just decoration breaks the rule.

**The Brand Palette Stays In The Data Rule.** Purple, green, yellow, orange and the other brand hues color stages, crews and charts. They never become a button, a link or a page accent.

## Typography

**Display Font:** Manrope (with Roboto, system-ui)
**Body Font:** Roboto (with system-ui)

**Character:** Manrope gives the page titles a heavy, confident geometric voice; Roboto keeps every number, name and field plain and readable. Weight does the hierarchy work far more than size.

### Hierarchy
- **Display** (900, 30px on phones / 36px from tablet up, tight tracking): the page title on every list page ("Lead Pipeline", "Estimates", "Job Scheduling"), with a lead line under it.
- **Headline** (700, 20–24px): modal titles and section titles.
- **Title** (700, 18–20px): names on cards and list rows ("Tom Whitaker", job titles).
- **Lead** (500, 18px, relaxed leading): the one line under a page title that says what the page is for.
- **Body** (500 in fields, 400 in prose, 14px): typed values, table cells, card details.
- **Label** (700, 12px, uppercase, wide tracking): every field label, stat label and form section heading ("FIRST NAME", "SERVICE ADDRESS").
- **Micro** (700, 10px, uppercase): chips on cards, schedule eyebrows, board column metadata.

### Named Rules
**The Label Before Value Rule.** Every field and every number has a bold uppercase label above it. Values are never left to explain themselves.

**The Heavy Title, Plain Body Rule.** Only page titles are heavy display type; everything below the title stays in Roboto at 14–18px.

## Layout

The app is a fixed frame: a white icon rail on the left (104px, expanding to 320px on hover or when pinned), a white header bar (64px, 80px from tablet up) with back and forward arrows and breadcrumbs, and a gray canvas that scrolls. Below 1024px the rail becomes a slide-in drawer opened from the header.

Content runs full width inside gutters of 16px on phones, 32px on tablets and 48px on desktop, with 32px of top padding. Every list page follows the same column: title and lead on the left with the main action on the right (stacked on phones), then a row of stat cards (1, 2, then 4 across), then search and filters, then the list or board. Section spacing is 24–40px; spacing inside cards is 24px; field grids use 16px gaps and two columns from tablet up.

Boards scroll sideways rather than squeezing: four lead columns fill the board (each at least 280px) and further stages sit off to the right. Tables become stacked cards below 768px. Primary actions go full width on phones.

## Elevation & Depth

Flat with a soft lift. Surfaces sit on the canvas with a hairline border and the faintest shadow; depth comes mostly from white cards on gray, not from shadows. Shadow grows only as a response: a card lifts on hover, a menu or modal floats above the page, and the one main action on a page carries a blue glow so it reads as the way forward.

### Shadow Vocabulary
- **Rest** (`0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`, Tailwind v4 `shadow-sm`): cards, secondary buttons, the header bar, column headers.
- **Lift** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): a clickable card or row on hover.
- **Main action glow** (`0 20px 25px -5px rgb(59 130 246 / 0.2), 0 8px 10px -6px rgb(59 130 246 / 0.2)`): the page's primary button only.
- **Float** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): dropdowns, popovers, menus.
- **Overlay** (`0 25px 50px -12px rgb(0 0 0 / 0.25)`): modals and the expanded sidebar.

### Named Rules
**The Flat-At-Rest Rule.** Nothing casts more than the rest shadow until it is hovered, opened or floating. A heavy shadow on a resting card is wrong.

## Shapes

Corners get rounder as things get bigger and more container-like: controls are crisp, fields are slightly softer, cards are generously rounded and sheets are the softest. Pills are reserved for status and filters.

- **Controls** (6px): every button.
- **Fields** (10px): inputs, selects, textareas, dropdown panels.
- **Tiles** (12px): navigation items, segmented tracks, small inner cards, lead cards, the search box.
- **Cards** (16px): stat cards, list rows, panels, board columns.
- **Sheets** (24px): modals (top corners only on phones, where they rise from the bottom), empty states.
- **Pills** (fully round): badges, chips, avatars, count bubbles, switches.

Borders are 1px hairlines everywhere except two signatures: the 4px colored rule under each board column header, and the 2px dashed outline of "pick an existing record" buttons and empty drop zones.

## Components

### Buttons
Sturdy and plain-spoken: padded, medium weight, a slight press-in when clicked.
- **Shape:** crisp corners (6px).
- **Primary:** Command Blue with white text, 10px × 20px (14px text, 16px from tablet up). Large: 14px × 24px, bold, 16–18px text.
- **Hover / Focus:** primary deepens to Pressed Blue and picks up a faint blue glow; everything presses to 95% on click; keyboard focus shows a 2px blue ring.
- **Secondary:** white with a hairline border and rest shadow, graphite text; hover tints to canvas and darkens the border.
- **Ghost:** no border, muted gray text; hover adds a wash background.
- **Danger:** soft red wash with red text and a pale red border. Destructive confirms use this, never solid red.
- **Outline:** 2px blue border, ink text, blue-wash hover.

### Chips
- **Style:** fully round, hairline border, 14px medium text; small badges are 12px bold with a tinted fill.
- **State:** selected filters fill with Command Blue and white text; unselected stay white with gray text.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** surface white on the canvas; tinted inner panels (canvas with a light border, 12px corners) group related fields.
- **Shadow Strategy:** rest shadow; lift on hover when the whole card is clickable (see Elevation & Depth).
- **Border:** 1px hairline; hover on clickable cards turns it a light blue.
- **Internal Padding:** 24px (16px on lead cards).

### Inputs / Fields
- **Style:** white field, 1px field-line outline, 10px corners, 48px tall, 12px side padding, 14px medium slate text, quiet placeholder. A label always sits above (12px bold uppercase, muted).
- **Focus:** the border turns Focus Edge and a 4px Blue Halo ring appears.
- **Error / Disabled:** a red border, a red warning icon on the right and the message in 14px red below; disabled fields fade to half opacity. A small clear (×) appears when a field has a value.
- **Selects** use the same box with a chevron; their panel has 10px corners, 12px × 16px options and a blue-wash highlight. Multi-select panels add a checkbox per option.

### Navigation
- **Rail:** white with a hairline right edge. Items are 24px icons with 16px medium labels, 12px corners and 16px × 12px padding.
- **Default:** muted gray icon and text, canvas tint on hover.
- **Active:** blue-wash fill, Pressed Blue icon and bold text, a light blue border and rest shadow.
- **Header:** back and forward arrows, a divider, breadcrumbs in 16–18px medium gray split by bars, and the current page as a white chip with a hairline border and bold ink text.
- **Mobile:** the rail becomes a drawer from the header's menu button.

### Segmented Controls
View switches (Job / Crew, Day / Week / Month, Board / Table) sit in a wash track with 12px corners and 4px padding. The active segment is white with a rest shadow and bold Pressed Blue text.

### Board Column (signature)
Each pipeline stage is a column at least 280px wide, rounded 16px, on a light wash. Its white header carries the stage name in 14px bold uppercase, a count pill tinted with the stage color, and a 4px rule in the stage color along the bottom. Cards stack beneath with 12px gaps; an empty column shows a dashed "Drop leads here" zone.

### Modal
Rises from the bottom on phones and centers from tablet up. White, 24px corners, overlay shadow over a dimmed, blurred page. Header: 20–24px bold title and a round close button; body padding 24–32px; form actions at the end as two equal buttons, Cancel then the action.

## Do's and Don'ts

### Do:
- **Do** use Command Blue (`#2563eb`) only for actions, links, focus and the current place.
- **Do** put a bold uppercase 12px label above every field and stat.
- **Do** build fields at 48px with 10px corners, a field-line outline and the 4px Blue Halo on focus.
- **Do** give every list page the same header: a 36px black-weight title, an 18px lead line and the main action at the right, full width on phones.
- **Do** keep surfaces flat with a hairline border and rest shadow, lifting only on hover or for overlays.
- **Do** use the brand palette for stage, crew and chart colors only.
- **Do** let boards scroll sideways (four 280px+ columns visible) instead of shrinking columns.

### Don't:
- **Don't** introduce a second accent color, gradients or decorative color on buttons and links.
- **Don't** use solid red for destructive buttons; use the soft red danger style.
- **Don't** round buttons beyond 6px or put pill shapes on buttons.
- **Don't** use the 60px display size for list-page titles; it belongs to documents and hero sections (invoice document, client estimate preview).
- **Don't** give resting cards a heavy shadow.
- **Don't** create new class strings when a shared kit component (`components/ui`, `components/Modals/Modal.tsx`, `features/components/ui`) already covers it.
