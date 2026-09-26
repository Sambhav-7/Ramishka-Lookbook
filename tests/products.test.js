"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHandler,
  fetchAllProducts,
  normalizeLookbookProducts,
} = require("../netlify/functions/products");

function rawProduct(overrides) {
  const title = overrides.title || "Rosé Bloom Dress";
  const handle = overrides.handle || "rose-bloom-dress";

  return {
    title,
    handle,
    description: overrides.description ?? "A considered cotton dress.",
    productType: overrides.productType ?? "Bloom",
    tags: overrides.tags ?? ["Best Seller"],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    images: overrides.images ?? {
      nodes: [
        { url: `https://cdn.shopify.com/${handle}-1.jpg`, altText: `${title}, front view` },
        { url: `https://cdn.shopify.com/${handle}-2.jpg`, altText: `${title}, alternate view` },
      ],
    },
    options: overrides.options ?? [
      { name: "Colour", optionValues: [{ name: "Blush Pink" }] },
      {
        name: "Size",
        optionValues: ["XS", "S", "M", "L", "XL"].map((name) => ({ name })),
      },
    ],
    priceRange: overrides.priceRange ?? {
      minVariantPrice: { amount: "5000.00", currencyCode: "INR" },
    },
  };
}

function silentLogger() {
  return { warn() {}, error() {} };
}

test("every product returned by the Storefront API is eligible — no display_surfaces filter", () => {
  const products = normalizeLookbookProducts(
    [
      rawProduct({ title: "Any Product", handle: "any-product" }),
      rawProduct({ title: "Another Product", handle: "another-product" }),
    ],
    { logger: silentLogger() },
  );

  assert.deepEqual(
    products.map((product) => product.title),
    ["Any Product", "Another Product"],
  );
});

test("preserves Shopify's CREATED_AT descending order rather than re-sorting by any metafield", () => {
  const products = normalizeLookbookProducts(
    [
      rawProduct({ title: "Newest", handle: "newest", createdAt: "2026-03-01T00:00:00Z" }),
      rawProduct({ title: "Oldest", handle: "oldest", createdAt: "2026-01-01T00:00:00Z" }),
    ],
    { logger: silentLogger() },
  );

  assert.deepEqual(
    products.map((product) => product.title),
    ["Newest", "Oldest"],
  );
});

test("requests products sorted by CREATED_AT descending from Shopify", async () => {
  const calls = [];
  const fetchImpl = async (_url, request) => {
    calls.push(JSON.parse(request.body).query);
    return {
      ok: true,
      json: async () => ({
        data: {
          products: {
            nodes: [rawProduct({})],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    };
  };

  await fetchAllProducts({
    fetchImpl,
    storeDomain: "ramishka.myshopify.com",
    token: "private-secret",
  });

  assert.match(calls[0], /sortKey:\s*CREATED_AT/);
  assert.match(calls[0], /reverse:\s*true/);
});

test("rejects an empty Shopify catalogue", () => {
  assert.throws(
    () => normalizeLookbookProducts([], { logger: silentLogger() }),
    /no lookbook products/i,
  );
});

test("normalizes canonical Ramishka product URLs and only the first two images", () => {
  const [product] = normalizeLookbookProducts(
    [
      rawProduct({
        handle: "rose-bloom-dress",
        images: {
          nodes: [
            { url: "https://cdn.shopify.com/one.jpg", altText: "One" },
            { url: "https://cdn.shopify.com/two.jpg", altText: "Two" },
            { url: "https://cdn.shopify.com/three.jpg", altText: "Three" },
          ],
        },
      }),
    ],
    { logger: silentLogger() },
  );

  assert.equal(product.url, "https://ramishkalabel.com/products/rose-bloom-dress");
  assert.deepEqual(product.images, [
    { url: "https://cdn.shopify.com/one.jpg", alt: "One" },
    { url: "https://cdn.shopify.com/two.jpg", alt: "Two" },
  ]);
  assert.equal(Object.hasOwn(product, "id"), false);
  assert.equal(Object.hasOwn(product, "displaySurfaces"), false);
  assert.equal(Object.hasOwn(product, "lookbookOrder"), false);
});

test("derives the existing editorial chapter when Shopify product type is generic", () => {
  const [bloom] = normalizeLookbookProducts(
    [rawProduct({ title: "Rosé Bloom Dress", productType: "Dress" })],
    { logger: silentLogger() },
  );

  assert.equal(bloom.family, "Bloom");
});

test("derives a colourway label from the Shopify title when no colour option is present", () => {
  const [product] = normalizeLookbookProducts(
    [
      rawProduct({
        title: "Mint Green Fleur Co-ord Set",
        handle: "mint-green-fleur-co-ord-set",
        options: [
          {
            name: "Size",
            optionValues: ["XS", "S", "M", "L", "XL"].map((name) => ({ name })),
          },
        ],
        tags: [],
      }),
    ],
    { logger: silentLogger() },
  );

  assert.equal(product.colour, "Mint Green");
});

test("classifies Halter Neck Dress and Halter Neck titles into the Halter Neck family", () => {
  const products = normalizeLookbookProducts(
    [
      rawProduct({
        title: "Butter Yellow Halter Neck Dress",
        handle: "butter-yellow-halter-neck-dress",
        productType: "Dress",
        options: [{ name: "Size", optionValues: [{ name: "S" }, { name: "M" }, { name: "L" }] }],
        tags: [],
      }),
      rawProduct({
        title: "Liora Halter Neck",
        handle: "liora-halter-neck",
        productType: "Dress",
        options: [{ name: "Size", optionValues: [{ name: "S" }, { name: "M" }, { name: "L" }] }],
        tags: [],
      }),
    ],
    { logger: silentLogger() },
  );

  assert.equal(products[0].family, "Halter Neck");
  assert.equal(products[1].family, "Halter Neck");
});

test("derives Halter Neck colourways from the title, stripping the family suffix", () => {
  const cases = [
    ["Butter Yellow Halter Neck Dress", "butter-yellow-halter-neck-dress", "Butter Yellow"],
    ["Liora Halter Neck Dress", "liora-halter-neck-dress", "Liora"],
    ["Rose Halter Neck Dress", "rose-halter-neck-dress", "Rose"],
    ["Misty Halter Neck Dress", "misty-halter-neck-dress", "Misty"],
  ];

  for (const [title, handle, expectedColour] of cases) {
    const [product] = normalizeLookbookProducts(
      [
        rawProduct({
          title,
          handle,
          productType: "Dress",
          options: [{ name: "Size", optionValues: [{ name: "S" }, { name: "M" }, { name: "L" }] }],
          tags: [],
        }),
      ],
      { logger: silentLogger() },
    );

    assert.equal(product.colour, expectedColour, `expected colour for "${title}"`);
  }
});

test("skips one malformed product without failing the rest of the batch", () => {
  const warnings = [];
  const products = normalizeLookbookProducts(
    [
      rawProduct({ title: "Good One", handle: "good-one" }),
      rawProduct({
        title: "Missing Images",
        handle: "missing-images",
        images: { nodes: [{ url: "https://cdn.shopify.com/only-one.jpg", altText: "Only" }] },
      }),
      rawProduct({ title: "Good Two", handle: "good-two" }),
    ],
    { logger: { warn: (msg) => warnings.push(msg), error() {} } },
  );

  assert.deepEqual(
    products.map((product) => product.title),
    ["Good One", "Good Two"],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /missing-images/i);
});

test("skips a product from an unmapped/unknown family without crashing the catalogue", () => {
  const warnings = [];
  const products = normalizeLookbookProducts(
    [
      rawProduct({ title: "Rosé Bloom Dress", handle: "rose-bloom-dress" }),
      rawProduct({
        title: "Future Capsule Piece",
        handle: "future-capsule-piece",
        productType: "Accessory",
        tags: [],
      }),
    ],
    { logger: { warn: (msg) => warnings.push(msg), error() {} } },
  );

  assert.deepEqual(
    products.map((product) => product.title),
    ["Rosé Bloom Dress"],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /known lookbook chapter family/i);
});

test("normalizes all 20 live Shopify products across the seven chapters", () => {
  const families = {
    Bloom: ["Rosé", "Lime", "Soleil"],
    Muse: ["Midnight", "Blue", "Olive"],
    Fleur: ["Sky", "Soleil", "Violet"],
    "Fleur Co-ord": ["Mint", "Wine"],
    Lily: ["Bleu", "Lemon", "Rosalie"],
    Rivière: ["Lime", "Powder"],
    "Halter Neck": ["Butter Yellow", "Liora", "Rose", "Misty"],
  };

  const rawProducts = [];
  Object.entries(families).forEach(([family, colours]) => {
    colours.forEach((colour) => {
      const suffix =
        family === "Fleur Co-ord"
          ? "Fleur Co-ord Set"
          : family === "Halter Neck"
            ? "Halter Neck Dress"
            : family === "Lily"
              ? "Lily Shirt Dress"
              : `${family} Dress`;
      const title = `${colour} ${suffix}`;
      const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      rawProducts.push(
        rawProduct({
          title,
          handle,
          productType: family === "Halter Neck" ? "Dress" : family,
          tags: [],
          options: [
            {
              name: "Size",
              optionValues: ["XS", "S", "M", "L", "XL"].map((name) => ({ name })),
            },
          ],
        }),
      );
    });
  });

  assert.equal(rawProducts.length, 20);

  const products = normalizeLookbookProducts(rawProducts, { logger: silentLogger() });
  assert.equal(products.length, 20);

  const halterProducts = products.filter((product) => product.family === "Halter Neck");
  assert.equal(halterProducts.length, 4);
  assert.deepEqual(
    halterProducts.map((product) => product.colour).sort(),
    ["Butter Yellow", "Liora", "Misty", "Rose"],
  );

  const originalSixteen = products.filter((product) => product.family !== "Halter Neck");
  assert.equal(originalSixteen.length, 16);
});

test("paginates until Shopify reports no next page", async () => {
  const calls = [];
  const pages = [
    {
      data: {
        products: {
          nodes: [rawProduct({ handle: "first" })],
          pageInfo: { hasNextPage: true, endCursor: "page-2" },
        },
      },
    },
    {
      data: {
        products: {
          nodes: [rawProduct({ handle: "second" })],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  ];
  const fetchImpl = async (_url, request) => {
    calls.push(JSON.parse(request.body).variables);
    return { ok: true, json: async () => pages.shift() };
  };

  const products = await fetchAllProducts({
    fetchImpl,
    storeDomain: "ramishka.myshopify.com",
    token: "private-secret",
  });

  assert.equal(products.length, 2);
  assert.deepEqual(calls, [
    { first: 100, after: null },
    { first: 100, after: "page-2" },
  ]);
});

test("returns a safe 502 response when Shopify fails without leaking the token", async () => {
  const handler = createHandler({
    env: {
      SHOPIFY_STORE_DOMAIN: "ramishka.myshopify.com",
      SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "never-return-this-token",
    },
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "upstream details" }),
    logger: { warn() {}, error() {} },
  });

  const response = await handler({ httpMethod: "GET", headers: {} });

  assert.equal(response.statusCode, 502);
  assert.match(response.headers["Cache-Control"], /no-store/);
  assert.equal(response.body.includes("never-return-this-token"), false);
  assert.deepEqual(JSON.parse(response.body), {
    error: "Lookbook products are temporarily unavailable.",
  });
});

test("returns a cacheable normalized response and never returns the private token", async () => {
  const handler = createHandler({
    env: {
      SHOPIFY_STORE_DOMAIN: "ramishka.myshopify.com",
      SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "never-return-this-token",
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: {
          products: {
            nodes: [rawProduct({})],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    }),
    logger: { warn() {}, error() {} },
  });

  const response = await handler({ httpMethod: "GET", headers: {} });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Cache-Control"], /max-age=0/);
  assert.match(response.headers["Netlify-CDN-Cache-Control"], /s-maxage=300/);
  assert.match(response.headers["Netlify-CDN-Cache-Control"], /durable/);
  assert.equal(response.body.includes("never-return-this-token"), false);
  assert.equal(JSON.parse(response.body).products.length, 1);
});

test("returns a safe 502 when one malformed product would otherwise be the only product, without leaking details", async () => {
  const handler = createHandler({
    env: {
      SHOPIFY_STORE_DOMAIN: "ramishka.myshopify.com",
      SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "never-return-this-token",
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: {
          products: {
            nodes: [
              rawProduct({
                title: "Broken",
                handle: "broken",
                images: { nodes: [] },
              }),
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    }),
    logger: { warn() {}, error() {} },
  });

  const response = await handler({ httpMethod: "GET", headers: {} });

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.includes("never-return-this-token"), false);
});
