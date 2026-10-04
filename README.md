# Ramishka Trade Lookbook

A standalone trade lookbook and line sheet for Ramishka — built for exhibition heads,
buyers, and business partners. The presentation is static HTML/CSS/JS; live product
content comes from Shopify through a Netlify Function.

This is a **separate deliverable** from the main Ramishka website
(`/Users/sambhavjain/Ramishka website /ramishka`). It reuses that codebase's design
tokens and editorial photography as a read-only source — nothing in the website repo
was modified to produce this.

## What's here

- `index.html` — the full lookbook: cover, brand statement, seven
  silhouette-family chapters (Bloom, Muse, Fleur, Fleur Co-ord, Lily, Rivière, Halter
  Neck), fabric guide, line sheet, trade terms, and an enquiry form. Product cards and
  line-sheet rows are render mounts rather than separate hardcoded catalogues.
- `netlify/functions/products.js` — queries Shopify Storefront API `2026-07` for every
  product in the store, ordered `CREATED_AT` descending (newest first) — no metafield
  gates and no manual ordering. Each product is validated and normalized independently;
  a malformed or unclassifiable product is skipped with a server-side warning rather
  than failing the whole response.
- `assets/js/products.js` — loads the normalized response once and renders both product
  cards and line-sheet rows from the same in-memory dataset.
- `assets/css/lookbook.css` — design tokens ported from the website's
  `app/globals.css` `@theme` block (colour, type scale, radius, shadow, motion easing),
  plus layout, scroll-reveal, and a `@media print` stylesheet for a clean paginated
  PDF export.
- `assets/js/reveal.js` — `IntersectionObserver`-driven scroll reveals, including
  dynamically rendered product cards, and respects `prefers-reduced-motion`.
- `assets/js/enquiry.js` — posts the enquiry form to a Supabase table via the REST API.
- `assets/images/` — curated editorial imagery and the previous local product images.
  Product cards now use the first two Shopify CDN images returned by the function.

## Shopify environment

Copy `.env.example` to `.env` and supply the live values for:

- `SHOPIFY_STORE_DOMAIN` — the store's `*.myshopify.com` hostname.
- `SHOPIFY_STOREFRONT_PRIVATE_TOKEN` — a private Storefront API token with product
  listing access.

The private token is read only inside the Netlify Function. Do not put it in HTML,
browser JavaScript, query parameters, or committed files. No Admin API credential is
used or required. In Netlify, configure both values in the site environment with the
Functions runtime scope.

## Viewing it locally

Because the product catalogue uses a Netlify Function, run the site through Netlify
Dev rather than opening `index.html` directly:

```bash
cd "/Users/sambhavjain/Ramishkan Lookbook"
npx netlify-cli dev
```

Open the local URL printed by Netlify. The browser calls
`/.netlify/functions/products`, just as it will in production.

## Tests

The test suite uses Node's built-in runner and has no package dependencies:

```bash
npm test
```

It covers Storefront pagination and failure handling, CREATED_AT ordering, family
classification (including Halter Neck) and colour derivation, per-product integrity
checks (a malformed or unmapped-family product is skipped, not fatal), response
normalization, canonical URLs, token non-disclosure, and reuse of the same response
dataset for product cards and line-sheet rows.

## Deploying to Netlify

Netlify CLI isn't installed globally; use `npx`:

```bash
cd "/Users/sambhavjain/Ramishkan Lookbook"
npx netlify-cli deploy          # draft URL first — check it before going live
npx netlify-cli deploy --prod   # promote only after explicit approval
```

`netlify.toml` sets the publish and function directories, enables function bundling,
and adds basic security headers plus cache headers for static assets. The product
function separately sets a five-minute durable CDN cache on successful responses.

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

The product catalogue publishes retail prices from Shopify. No wholesale terms exist
in the current source. The Trade Terms section has visible `[ To be confirmed ]`
placeholders for:

- Minimum order quantity
- Wholesale / trade margin
- Payment & delivery terms
- Exhibition schedule dates

Fill these in directly in `index.html` (search for `placeholder` in the Trade Terms
section) once the real terms are set.

## Asset provenance note

`products/verdelle-dress-*.png` in the source website is a legacy filename that
actually holds photography for the **Lime Rivière Dress** (not a "Verdelle" garment).
If re-running the old local asset pipeline from source, watch for this and for unused
duplicate files with spaces in their names (`reviere dress 1.png`,
`Wine fleur co-ord set 4.png`, etc.). These local product images are no longer used by
the live catalogue renderer.
