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
    displaySurfaces: Object.hasOwn(overrides, "displaySurfaces")
      ? overrides.displaySurfaces
      : { value: JSON.stringify(["main", "lookbook"]) },
    lookbookOrder: Object.hasOwn(overrides, "lookbookOrder")
      ? overrides.lookbookOrder
      : { value: "10" },
  };
}

test("filters out products whose display surfaces do not contain lookbook", () => {
  const products = normalizeLookbookProducts([
    rawProduct({ title: "Lookbook", handle: "lookbook", lookbookOrder: { value: "20" } }),
    rawProduct({
      title: "Main only",
      handle: "main-only",
      displaySurfaces: { value: JSON.stringify(["main"]) },
      lookbookOrder: null,
    }),
  ]);

  assert.deepEqual(products.map((product) => product.title), ["Lookbook"]);
});

test("sorts lookbook products by numeric order rather than API or lexical order", () => {
  const products = normalizeLookbookProducts([
    rawProduct({ title: "Hundred", handle: "hundred", lookbookOrder: { value: "100" } }),
    rawProduct({ title: "Twenty", handle: "twenty", lookbookOrder: { value: "20" } }),
  ]);

  assert.deepEqual(products.map((product) => product.order), [20, 100]);
});

for (const value of [null, "", "not-a-number", "2.5"]) {
  test(`rejects a missing or invalid lookbook order: ${String(value)}`, () => {
    const lookbookOrder = value === null ? null : { value };

    assert.throws(
      () => normalizeLookbookProducts([rawProduct({ lookbookOrder })]),
      /valid integer lookbook order/i,
    );
  });
}

test("rejects duplicate lookbook order values", () => {
  assert.throws(
    () =>
      normalizeLookbookProducts([
        rawProduct({ title: "First", handle: "first", lookbookOrder: { value: "10" } }),
        rawProduct({ title: "Second", handle: "second", lookbookOrder: { value: "10" } }),
      ]),
    /duplicate lookbook order 10/i,
  );
});

test("rejects an empty Shopify catalogue", () => {
  assert.throws(() => normalizeLookbookProducts([]), /no lookbook products/i);
});

test("normalizes canonical Ramishka product URLs and only the first two images", () => {
  const [product] = normalizeLookbookProducts([
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
  ]);

  assert.equal(product.url, "https://ramishkalabel.com/products/rose-bloom-dress");
  assert.deepEqual(product.images, [
    { url: "https://cdn.shopify.com/one.jpg", alt: "One" },
    { url: "https://cdn.shopify.com/two.jpg", alt: "Two" },
  ]);
  assert.equal(Object.hasOwn(product, "id"), false);
  assert.equal(Object.hasOwn(product, "displaySurfaces"), false);
});

test("rejects a lookbook product without the two images required by hover treatment", () => {
  assert.throws(
    () =>
      normalizeLookbookProducts([
        rawProduct({
          images: {
            nodes: [{ url: "https://cdn.shopify.com/one.jpg", altText: "One" }],
          },
        }),
      ]),
    /two valid Shopify images/i,
  );
});

test("derives the existing editorial chapter when Shopify product type is generic", () => {
  const [bloom] = normalizeLookbookProducts([
    rawProduct({ title: "Rosé Bloom Dress", productType: "Dress" }),
  ]);

  assert.equal(bloom.family, "Bloom");
});

test("derives a colourway label from the Shopify title when no colour option is present", () => {
  const [product] = normalizeLookbookProducts([
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
  ]);

  assert.equal(product.colour, "Mint Green");
});

test("places a newly surfaced product into the existing chapter ranges by lookbook order", () => {
  const [product] = normalizeLookbookProducts([
    rawProduct({
      title: "Future Capsule Dress",
      handle: "future-capsule-dress",
      productType: "Dress",
      lookbookOrder: { value: "170" },
    }),
  ]);

  assert.equal(product.family, "Rivière");
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
    logger: { error() {} },
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
    logger: { error() {} },
  });

  const response = await handler({ httpMethod: "GET", headers: {} });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Cache-Control"], /max-age=0/);
  assert.match(response.headers["Netlify-CDN-Cache-Control"], /s-maxage=300/);
  assert.match(response.headers["Netlify-CDN-Cache-Control"], /durable/);
  assert.equal(response.body.includes("never-return-this-token"), false);
  assert.equal(JSON.parse(response.body).products.length, 1);
});
