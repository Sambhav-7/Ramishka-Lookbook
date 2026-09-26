"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCatalogMarkup,
  renderCatalog,
} = require("../assets/js/products");

function product(overrides = {}) {
  return {
    title: "Rosé Bloom Dress",
    handle: "rose-bloom-dress",
    description: "A considered cotton dress.",
    family: "Bloom",
    colour: "Blush Pink",
    sizes: "XS – XL",
    badge: "Best Seller",
    images: [
      { url: "https://cdn.shopify.com/one.jpg", alt: "Front view" },
      { url: "https://cdn.shopify.com/two.jpg", alt: "Alternate view" },
    ],
    price: { amount: "5000.00", currencyCode: "INR" },
    order: 10,
    url: "https://ramishkalabel.com/products/rose-bloom-dress",
    ...overrides,
  };
}

test("builds both card and line-sheet markup from the same normalized product array", () => {
  const products = [product()];
  const markup = buildCatalogMarkup(products);

  assert.match(markup.cardsByFamily.Bloom, /Rosé Bloom Dress/);
  assert.match(markup.cardsByFamily.Bloom, /piece__img--main/);
  assert.match(markup.cardsByFamily.Bloom, /piece__img--alt/);
  assert.match(markup.lineRows, /Rosé Bloom Dress/);
  assert.match(markup.lineRows, /Blush Pink/);
});

test("keeps product cards non-clickable to preserve the existing interaction pattern", () => {
  const markup = buildCatalogMarkup([product()]);

  assert.equal(markup.cardsByFamily.Bloom.includes("<a "), false);
});

test("does not crash the catalogue when a product belongs to an unmounted/unknown family", () => {
  const bloomMount = { dataset: { productsFamily: "Bloom" }, innerHTML: "unchanged" };
  const lineSheetMount = { innerHTML: "unchanged" };
  const documentStub = {
    querySelectorAll() {
      return [bloomMount];
    },
    querySelector() {
      return lineSheetMount;
    },
    dispatchEvent() {},
  };
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    renderCatalog([product(), product({ family: "Unknown", title: "Stray Piece" })], documentStub);
  } finally {
    console.warn = originalWarn;
  }

  assert.match(bloomMount.innerHTML, /Rosé Bloom Dress/);
  assert.match(lineSheetMount.innerHTML, /Stray Piece/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no chapter mount/i);
});

test("renders the Halter Neck chapter mount alongside existing chapters", () => {
  const bloomMount = { dataset: { productsFamily: "Bloom" }, innerHTML: "" };
  const halterMount = { dataset: { productsFamily: "Halter Neck" }, innerHTML: "" };
  const lineSheetMount = { innerHTML: "" };
  const documentStub = {
    querySelectorAll() {
      return [bloomMount, halterMount];
    },
    querySelector() {
      return lineSheetMount;
    },
    dispatchEvent() {},
  };

  renderCatalog(
    [
      product(),
      product({
        family: "Halter Neck",
        title: "Butter Yellow Halter Neck Dress",
        colour: "Butter Yellow",
      }),
    ],
    documentStub,
  );

  assert.match(bloomMount.innerHTML, /Rosé Bloom Dress/);
  assert.match(halterMount.innerHTML, /Butter Yellow Halter Neck Dress/);
  assert.match(lineSheetMount.innerHTML, /Butter Yellow Halter Neck Dress/);
});

test("renders every product into both the chapter cards and line sheet", () => {
  const bloomMount = { dataset: { productsFamily: "Bloom" }, innerHTML: "" };
  const lineSheetMount = { innerHTML: "" };
  const documentStub = {
    querySelectorAll() {
      return [bloomMount];
    },
    querySelector() {
      return lineSheetMount;
    },
    dispatchEvent() {},
  };

  renderCatalog([product()], documentStub);

  assert.match(bloomMount.innerHTML, /Rosé Bloom Dress/);
  assert.match(lineSheetMount.innerHTML, /Rosé Bloom Dress/);
});

