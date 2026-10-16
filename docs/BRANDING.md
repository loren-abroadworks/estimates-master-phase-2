# Estimate Master branding rules

These rules are taken from the production source code of the live app (`paint-estimate-master-ui`, commit `18c849d9`, exported 9 Sep 2026 to the "production design" Drive folder). Production is the reference. When this file and an older note (phase-1 prototype, `docs/UI_CHANGES.md`) disagree, this file wins.

Where each rule comes from:

| Area | Production file |
| --- | --- |
| Colors | `packages/ui/src/color-palette.ts` |
| Buttons | `packages/ui/src/button/index.tsx` |
| Inputs | `packages/ui/src/input/index.tsx` |
| Selects | `packages/ui/src/select/form.tsx` |
| Textareas | `packages/ui/src/textarea/index.tsx` |
| Labels | `packages/ui/src/label/index.tsx` |
| Headings | `packages/ui/src/heading/index.tsx` |
| Badges, chips | `packages/ui/src/badge`, `packages/ui/src/chip` |
| Modals | `packages/ui/src/dialog/components/modal.tsx` |
| Tabs, switch, tooltip | `packages/ui/src/tabs`, `switch`, `tooltip` |
| Search | `packages/table/src/components/search.tsx` |
| App frame | `apps/main/src/components/layouts/AppLayout.tsx`, `features/(main)/layout/*` |
| Lead form | `apps/main/src/features/(main)/leads/listings/modals/lead-form.tsx` |

The export leaves out stylesheets, so the primary blue and the gray scale come from the phase-1 design system. That system uses the same class names as production (`primary-600`, `gray-500`).

## 1. Color

**Primary (actions, links, active nav, focus):** royal blue.

| Token | Hex | Use |
| --- | --- | --- |
| `primary-50` | `#eff6ff` | Active nav fill, selected row, hover tint |
| `primary-100` | `#dbeafe` | Focus ring on inputs, badge fill |
| `primary-400` | `#60a5fa` | Focused input border |
| `primary-600` | `#2563eb` | Primary button, links |
| `primary-700` | `#1d4ed8` | Primary button hover, active nav text, switch on |

**Neutrals:** Tailwind gray, exact hex values in `app/globals.css`.
- Page background: `gray-50`.
- Cards: `white` with a `gray-200` border.
- Input borders: `gray-300`.
- Body text: `gray-600`. Headings: `gray-900`. Secondary text and labels: `gray-500`. Placeholders and icons: `gray-400`.

**State colors** (badges, banners, validation):
- Success: `green-*`.
- Warning: `amber-*`.
- Error: `red-*`. Validation uses `red-600` for borders and messages.
- Info: `blue-*`.

**Brand palette** (charts, tags, color-coded crews and stages; never for buttons). Bases from `color-palette.ts`:

| Name | Base | Name | Base |
| --- | --- | --- | --- |
| purple | `#7A5FFF` | space-cadet | `#283044` |
| green | `#5ED4B2` | amaranth-purple | `#A30B37` |
| yellow | `#EAD94C` | lavender | `#E8E1EF` |
| red | `#D62839` | gunmetal | `#30343F` |
| orange | `#FF9F1C` | electric-blue | `#18E8FF` |
| reseda-green | `#646F58` | mantis | `#5FB54E` |

The five most used are available as `brand-purple`, `brand-green`, `brand-yellow`, `brand-red` and `brand-orange`.

## 2. Type

- Headings use **Manrope** (`font-heading`). Everything else uses **Roboto** (`font-sans`).
- **Page title on every list page** (Leads, Estimates, Contacts, Jobs, Work Orders, Invoices, Presentations, Reports, Calendar, Job Scheduling): `text-3xl md:text-4xl font-black tracking-tight text-gray-900 mb-4`, so 30px on phones and 36px from md up. Every production listings template writes this by hand.
  - The lead line under it is `text-lg text-gray-500 font-medium` on most pages. Exceptions: Leads uses `text-gray-600` without `font-medium`. Jobs, Contacts and Job Scheduling use `text-lg md:text-xl leading-relaxed`. Presentations uses `text-base`. Reports uses `text-base md:text-lg`.
  - The page's main button sits beside the title: `md` size with `shadow-xl shadow-primary-500/20` on Estimates and Invoices; `lg` at `h-14` on Leads (both buttons).
- **Large display title:** the kit's `Heading h1` (`font-extrabold text-3xl md:text-5xl lg:text-6xl`) is not used for list pages. Production uses that size only for documents and hero sections: the invoice document (`text-3xl md:text-5xl`), the contact header (`text-2xl sm:text-3xl md:text-5xl`) and the client estimate preview (`text-4xl md:text-6xl`).
- **Detail page titles:** job `text-3xl md:text-4xl font-extrabold`, lead `text-3xl font-extrabold`, work order `text-xl md:text-2xl font-extrabold`. The dashboard greeting is `text-3xl font-black tracking-tighter`.
- Section title (`h2`): `font-bold tracking-tight text-2xl md:text-4xl leading-tight text-gray-900`.
- Card or modal title (`h3`): `font-bold text-xl md:text-2xl leading-snug text-gray-900`.
- Sub-heading (`h4`): `font-heading font-bold text-lg md:text-xl text-gray-800`.
- Field label: `text-xs font-bold uppercase tracking-wider text-gray-500 mb-2`. A required field adds a red `*` (`text-red-500 ml-1`).
- Section label inside a form ("SERVICE ADDRESS"): `text-xs font-bold uppercase tracking-widest text-gray-500`.
- Micro labels on cards and boards may use `text-[10px]` bold uppercase, as production does.

## 3. Shape and depth

| Element | Radius |
| --- | --- |
| Buttons | `rounded-md` |
| Inputs, selects (default size) | `rounded-[0.63rem]` (10px) |
| Search box | `rounded-xl` |
| Cards, panels, list rows | `rounded-2xl` (small inner cards `rounded-xl`) |
| Modals | `rounded-3xl`, top corners only on phones (`rounded-t-3xl`) |
| Badges, chips, pills | `rounded-full` |

Shadows:
- Cards and secondary buttons: `shadow-sm`, rising to `shadow-md` on hover for clickable cards.
- Primary buttons: `shadow-sm` with `hover:shadow-primary-500/20`.
- Modals: `shadow-2xl`.

## 4. Components

### Button
- **Base:** `font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-md`.
- **Sizes:**
  - `sm`: `px-3 py-1.5 text-sm`
  - `md` (default): `px-5 py-2.5 text-sm md:text-base`
  - `lg`: `px-6 py-3.5 text-base md:text-lg font-bold`
- **Variants:**
  - `primary`: `bg-primary-600 text-white hover:bg-primary-700 shadow-sm border-transparent hover:shadow-primary-500/20`
  - `secondary`: `bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm`
  - `ghost`: `text-gray-500 hover:bg-gray-100 hover:text-gray-900`
  - `danger`: `bg-red-50 text-red-600 hover:bg-red-100 border-red-100 hover:border-red-200`. This soft red is the destructive style, used in confirm dialogs too.
  - `outline`: `border-2 border-primary-600 text-gray-900 hover:bg-primary-50`
- **Icons:** `size-4` (`size-5` on `lg`).
- **One primary per view.** A page's main action ("Create New Estimate", "Add New Lead") carries `shadow-xl shadow-primary-500/20` and is full width on phones (`w-full md:w-auto`). Its size follows the page (section 2).

### Input
- **Outlined box, default size:** `bg-white border border-gray-300 rounded-[0.63rem] px-3`, 48px tall (`h-12`).
- **Text:** `text-sm font-medium text-gray-600`. Placeholder `gray-400`.
- **Focus:** `ring-4 ring-primary-100 border-primary-400`.
- **Error:** `border-red-600`, a warning icon on the right, and the message below as `text-sm text-red-600 ml-3`.
- **Hint:** `text-sm text-gray-500 ml-3` below the box.
- **Clear button:** a small × on the right when the field has a value.
- **Left icon:** `size-4 text-gray-400`, with a 10px gap before the text.
- **Disabled:** `opacity-50 cursor-not-allowed`.

### Select
- **Trigger:** same box as an input: `border-gray-300 rounded-[0.625rem] h-12 px-3`, value `text-sm font-medium text-gray-600`, placeholder `gray-400`, chevron `size-4 fill-gray-400`. `hover:bg-gray-50`.
- **Dropdown:** `rounded-[0.625rem]`. Items `px-4 py-3`. Selected or hovered items `bg-primary-50`.
- **Compact size (`xs`):** `h-9 rounded-lg`.

### Textarea
Same border, focus and error rules as the input, with `py-3`.

### Search
The input with a magnifier on the left (`#9CA3AF`) and `rounded-xl`, 48px tall. List pages put it on the left of the filter row at `w-full lg:max-w-md`.

### Badge
- **Base:** `px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1`, with a 1px border in the same hue.
- **Colors** (all fill `-100`, text `-700`, border `-200`): gray, blue, green, amber, red, purple. `primary` is the exception, with text `primary-900`.

### Chip (filter or choice)
`rounded-[2.25rem] border border-gray-100 text-sm font-medium text-gray-800 py-[0.4rem] px-3`. Focus ring: `ring-[1.5px] ring-gray-300`.

### Modal
- **Panel:** `bg-white rounded-t-3xl md:rounded-3xl shadow-2xl border overflow-hidden`. Max height `95dvh` on phones, `90dvh` from md up.
- **Header:** `px-6 py-5 md:px-8 md:py-6 border-b border-gray-100`. Title `text-xl md:text-2xl font-bold text-gray-900`. Close button `p-2 rounded-full`, icon `w-6 h-6 text-gray-400`.
- **Body:** `p-6 md:p-8`, scrolls.
- **Widths:** `sm` 384, `md` 448, `lg` 512, `xl` 576, `2xl` 672 (the default, used by the lead form), `3xl` 768, `4xl` 896 px.
- **Form buttons:** at the end of the body as a two-column grid (`grid grid-cols-2 gap-3 pt-2`): Cancel (secondary), then the action (primary).

### Tabs
- **Track:** `p-1 rounded-xl` (`md`: `p-1.5 rounded-2xl`).
- **Tabs:** `h-8 px-3 text-sm font-medium rounded-xl text-gray-600`. The active tab sits on a sliding pill.
- **View toggles** (Job/Crew, Day/Week/Month, Board/Table): `bg-gray-100 p-1 rounded-xl border border-gray-200`, active item `bg-white shadow-sm text-primary-700 font-bold`.

### Switch and checkbox
- **Switch:** `h-[1.15rem] w-8 rounded-full`, on `bg-primary-700`, thumb `size-4`.
- **Checkbox:** checked `bg-primary-600 border-primary-600` with a white check.

### Tooltip
`bg-gray-600 text-lavender-50 rounded-md px-3 py-1.5 text-xs` with a small arrow.

## 5. App frame

- **Shell:** `flex h-screen bg-gray-50`. Sidebar, then content `flex-1 flex flex-col min-w-0 overflow-hidden`.
- **Sidebar:**
  - Collapsed to a 104px icon rail. It expands to 320px (`w-80`) on hover, and a round toggle pins it open.
  - White, with a `gray-200` right border.
  - Items `px-4 py-3 rounded-xl gap-4`, icons `w-6 h-6`.
  - Active item: `bg-primary-50 text-primary-700 border border-primary-100 shadow-sm font-bold`. Idle: `text-gray-500 hover:bg-gray-50`.
  - Help, Settings and Logout sit in the footer above a `gray-100` divider.
- **Header:**
  - `bg-white border-b border-gray-200 h-16 md:h-20 px-4 md:px-6 shadow-sm`, sticky.
  - Back and forward arrows `w-6 h-6`, then a divider.
  - Breadcrumbs `text-base md:text-lg font-medium text-gray-600` separated by `|`. The current page is a chip: `bg-white border border-gray-200 shadow-sm px-3 py-1 rounded-lg font-bold text-gray-900`.
- **Page content:** `px-4 md:px-8 lg:px-12 py-8`, full width.
- **Page header:** title and lead on the left, actions on the right, `mb-8` to `mb-10`. It stacks on phones (`flex-col md:flex-row md:items-end gap-6`).

## 6. Page patterns

- **Stat cards:** `bg-white p-6 rounded-2xl border border-gray-200 shadow-sm`.
  - Label: `text-xs font-bold uppercase tracking-widest text-gray-500`, with a `w-4 h-4 text-gray-400` icon.
  - Value: `text-3xl font-black font-heading text-gray-900`.
  - Sub-line: `text-sm font-medium text-gray-400`.
- **List rows (Jobs, Work Orders):** `bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:border-primary-300 hover:shadow-md`, with a chevron at the right on desktop.
- **Kanban boards:**
  - Four columns fill the board (never under 280px), and further stages scroll sideways.
  - Column header: `p-4 rounded-t-2xl border-b-4` in the stage color, `text-sm font-bold uppercase`.
  - Cards: `p-4 rounded-xl`, name `text-lg font-bold`.
- **Empty states:** dashed `rounded-3xl` panel, a round `w-16 h-16` icon, a bold title and one line saying what to do next.

## 7. Forms (the lead form is the model)

- Two-column grid on md and up (`grid-cols-1 md:grid-cols-2 gap-4`), sections `gap-6`.
- Every field is a label, then the input, then its error.
- Group related fields in a tinted panel (`bg-gray-50 p-4 rounded-xl border border-gray-100`) with an uppercase section label. An action link may sit at its right, for example "+ Add New" (`text-xs font-semibold text-primary-600`).
- "Pick an existing record" is a full-width dashed button (`border-2 border-dashed border-gray-300 rounded-xl py-3 font-bold text-gray-500`, hover primary).
- A picked record shows as a card: a `bg-primary-50` header strip with an icon and a title, and the details below.
- Validation messages follow production: "First name is required", "Invalid email address", "ZIP code must be in format 12345 or 12345-6789", "Secondary phone must be different from primary phone".
- Phone numbers are typed as digits and shown as `(555) 123-4567`. State is two capital letters.

## 8. Where the rules live in this repo

| Rule | File |
| --- | --- |
| Colors, fonts, gray scale | `app/globals.css` (`@theme`) |
| Button | `components/ui/button.tsx` |
| Input, select, textarea, label, switch, checkbox | `components/ui/form.tsx` |
| Badge, card, page header, search, stat card | `components/ui/display.tsx` |
| Modal, confirm dialog | `components/Modals/Modal.tsx` |
| Feature-module kit (same brand rules, compact heights for dense screens) | `features/components/ui/*` |

New screens use these components. Hand-written class strings repeat the values above rather than inventing new ones.
