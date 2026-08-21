# Ramishka Trade Lookbook

A standalone trade lookbook and line sheet for Ramishka — built for exhibition heads,
buyers, and business partners. Static HTML/CSS/JS, no build step, no framework.

This is a **separate deliverable** from the main Ramishka website
(`/Users/sambhavjain/Ramishka website /ramishka`). It reuses that codebase's design
tokens, product copy, and photography as a read-only source — nothing in the website
repo was modified to produce this.

## What's here

- `index.html` — the full lookbook: cover, brand statement, editorial spread, six
  silhouette-family chapters (Bloom, Muse, Fleur, Fleur Co-ord, Lily, Rivière) covering
  all 16 current pieces, fabric guide, line sheet, trade terms, and an enquiry form.
- `assets/css/lookbook.css` — design tokens ported from the website's
  `app/globals.css` `@theme` block (colour, type scale, radius, shadow, motion easing),
  plus layout, scroll-reveal, and a `@media print` stylesheet for a clean paginated
  PDF export.
- `assets/js/reveal.js` — `IntersectionObserver`-driven scroll reveals (respects
  `prefers-reduced-motion`).
- `assets/js/enquiry.js` — posts the enquiry form to a Supabase table via the REST API.
- `assets/images/` — ~40 images curated and downscaled (via macOS `sips`, 1800px/JPEG
  q82) from the website's `public/images/hero`, `editorial`, `products`, and `brand`
  folders. Total ~14MB, versus 197MB of untouched source.

## Viewing it locally

No build step. Either:
- Double-click `index.html`, or
- `cd "/Users/sambhavjain/Ramishkan Lookbook" && npx serve .`

## Deploying to Netlify

Netlify CLI isn't installed globally; use `npx` (Node 22 is already present):

```bash
cd "/Users/sambhavjain/Ramishkan Lookbook"
npx netlify-cli deploy          # draft URL first — check it before going live
npx netlify-cli deploy --prod   # promote once confirmed
```

`netlify.toml` sets the publish directory to `.` and adds basic security headers plus
long-cache headers for images/CSS/JS.

## Wiring up the enquiry form (Supabase)

The form is written, but **not yet connected** — `assets/js/enquiry.js` has two
placeholder constants (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) that need real values.

1. Create a new Supabase project (a fresh one — the only existing project on this
   account, "InkFlow Dashboard", is unrelated and paused).
2. Run this SQL in the project's SQL editor:

   ```sql
   create table public.enquiries (
     id uuid primary key default gen_random_uuid(),
     created_at timestamptz not null default now(),
     name text not null,
     business text,
     email text not null,
     phone text,
     enquiry_type text,
     message text
   );
   alter table public.enquiries enable row level security;

   create policy "anon can submit enquiries"
     on public.enquiries for insert to anon with check (true);
   ```

   Deliberately **no SELECT policy** — the anon key ships in client-side JS (normal for
   a static site), so anyone can submit an enquiry but nobody can read the leads table
   through the public API. Read submissions from the Supabase dashboard's Table Editor.

3. In `assets/js/enquiry.js`, replace:
   - `__SUPABASE_URL__` with the project's API URL (Settings → API)
   - `__SUPABASE_ANON_KEY__` with the `anon` public key (same page)

Until those are filled in, the form shows a friendly fallback message pointing to
`labelramishka@gmail.com` instead of silently failing.

## Commercial content still needed

The website's product catalogue only has **retail** pricing (₹4,500–6,000 base,
+₹0–1,500 per fabric upgrade) — no wholesale terms exist anywhere in the source. The
line sheet publishes retail prices, clearly labelled, and the Trade Terms section has
visible `[ To be confirmed ]` placeholders for:

- Minimum order quantity
- Wholesale / trade margin
- Payment & delivery terms
- Exhibition schedule dates

Fill these in directly in `index.html` (search for `placeholder` in the Trade Terms
section) once the real terms are set.

## Asset provenance note

`products/verdelle-dress-*.png` in the source website is a legacy filename that
actually holds photography for the **Lime Rivière Dress** (not a "Verdelle" garment) —
this lookbook labels it correctly. If re-running the asset pipeline from source, watch
for this and for the unused duplicate files with spaces in their names
(`reviere dress 1.png`, `Wine fleur co-ord set 4.png`, etc.).
