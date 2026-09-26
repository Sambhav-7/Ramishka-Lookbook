"use strict";

const SHOPIFY_API_VERSION = "2026-07";
const PAGE_SIZE = 100;
const SUCCESS_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const SUCCESS_CDN_CACHE_CONTROL =
  "public, durable, s-maxage=300, stale-while-revalidate=60";
const ERROR_MESSAGE = "Lookbook products are temporarily unavailable.";

const PRODUCT_QUERY = `
  query LookbookProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes {
        title
        handle
        description
        productType
        tags
        images(first: 2) {
          nodes {
            url
            altText
          }
        }
        options {
          name
          optionValues {
            name
          }
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        displaySurfaces: metafield(namespace: "ramishka", key: "display_surfaces") {
          value
        }
        lookbookOrder: metafield(namespace: "ramishka", key: "lookbook_order") {
          value
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

class ProductIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductIntegrityError";
  }
}

function parseSurfaces(metafield) {
  if (!metafield || typeof metafield.value !== "string") return [];

  try {
    const surfaces = JSON.parse(metafield.value);
    return Array.isArray(surfaces)
      ? surfaces.filter((surface) => typeof surface === "string")
      : [];
  } catch (_error) {
    return [];
  }
}

function readOption(product, names) {
  const acceptedNames = names.map((name) => name.toLowerCase());
  const option = (product.options || []).find(
    (candidate) =>
      candidate &&
      typeof candidate.name === "string" &&
      acceptedNames.includes(candidate.name.toLowerCase()),
  );

  if (!option || !Array.isArray(option.optionValues)) return [];
  return option.optionValues
    .map((value) => (value && typeof value.name === "string" ? value.name.trim() : ""))
    .filter(Boolean);
}

function readTaggedValue(tags, keys) {
  const prefixes = keys.map((key) => `${key.toLowerCase()}:`);
  for (const tag of tags || []) {
    if (typeof tag !== "string") continue;
    const lowerTag = tag.toLowerCase();
    const prefix = prefixes.find((candidate) => lowerTag.startsWith(candidate));
    if (prefix) return tag.slice(prefix.length).trim();
  }
  return "";
}

function canonicalFamily(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const families = {
    bloom: "Bloom",
    muse: "Muse",
    fleur: "Fleur",
    "fleur co ord": "Fleur Co-ord",
    "fleur coord": "Fleur Co-ord",
    lily: "Lily",
    riviere: "Rivière",
  };
  return families[normalized] || "";
}

function familyFromOrder(order) {
  if (order < 40) return "Bloom";
  if (order < 70) return "Muse";
  if (order < 100) return "Fleur";
  if (order < 120) return "Fleur Co-ord";
  if (order < 150) return "Lily";
  return "Rivière";
}

function deriveFamily(product, order) {
  const taggedFamily = readTaggedValue(product.tags, ["family", "lookbook family"]);
  const taggedMatch = canonicalFamily(taggedFamily);
  if (taggedMatch) return taggedMatch;

  const productType = typeof product.productType === "string" ? product.productType.trim() : "";
  const productTypeMatch = canonicalFamily(productType);
  if (productTypeMatch) return productTypeMatch;

  const title = String(product.title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/fleur\s+(?:co-?ord|coord)/.test(title)) return "Fleur Co-ord";
  if (title.includes("bloom")) return "Bloom";
  if (title.includes("muse")) return "Muse";
  if (title.includes("fleur")) return "Fleur";
  if (title.includes("shirt dress")) return "Lily";
  if (title.includes("riviere")) return "Rivière";

  return familyFromOrder(order);
}

function deriveColour(product) {
  const optionValues = readOption(product, ["colour", "color"]);
  const taggedColour = readTaggedValue(product.tags, ["colour", "color", "colourway"]);
  const titleColour = String(product.title || "")
    .replace(/\s+Fleur\s+Co-?ord\s+Set$/i, "")
    .replace(/\s+(?:Bloom|Muse|Fleur|Rivi(?:è|e)re)\s+Dress$/i, "")
    .replace(/\s+Lily\s+Shirt\s+Dress$/i, "")
    .replace(/\s+Shirt\s+Dress$/i, "")
    .trim();
  const colour = optionValues[0] || taggedColour || titleColour;

  if (!colour) {
    throw new ProductIntegrityError(`${product.title || "Product"} is missing a colourway.`);
  }
  return colour;
}

function deriveSizes(product) {
  const sizes = readOption(product, ["size"]);
  if (!sizes.length) {
    throw new ProductIntegrityError(`${product.title || "Product"} is missing size options.`);
  }
  return sizes.length === 1 ? sizes[0] : `${sizes[0]} – ${sizes[sizes.length - 1]}`;
}

function deriveBadge(tags) {
  const supportedBadges = ["Best Seller", "Limited"];
  return (
    supportedBadges.find((badge) =>
      (tags || []).some(
        (tag) => typeof tag === "string" && tag.toLowerCase() === badge.toLowerCase(),
      ),
    ) || null
  );
}

function normalizeImage(image, productTitle, index) {
  if (!image || typeof image.url !== "string") return null;

  let url;
  try {
    url = new URL(image.url);
  } catch (_error) {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const fallbackView = index === 0 ? "front view" : "alternate view";
  return {
    url: url.toString(),
    alt:
      typeof image.altText === "string" && image.altText.trim()
        ? image.altText.trim()
        : `${productTitle}, ${fallbackView}`,
  };
}

function normalizeProduct(product, order) {
  const title = typeof product.title === "string" ? product.title.trim() : "";
  const handle = typeof product.handle === "string" ? product.handle.trim() : "";
  if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
    throw new ProductIntegrityError("A lookbook product has an invalid title or handle.");
  }

  const images = ((product.images && product.images.nodes) || [])
    .slice(0, 2)
    .map((image, index) => normalizeImage(image, title, index))
    .filter(Boolean);
  if (images.length !== 2) {
    throw new ProductIntegrityError(`${title} must have two valid Shopify images.`);
  }

  const money = product.priceRange && product.priceRange.minVariantPrice;
  if (
    !money ||
    typeof money.amount !== "string" ||
    !Number.isFinite(Number(money.amount)) ||
    typeof money.currencyCode !== "string" ||
    !money.currencyCode
  ) {
    throw new ProductIntegrityError(`${title} has an invalid price.`);
  }

  return {
    title,
    handle,
    description: typeof product.description === "string" ? product.description.trim() : "",
    family: deriveFamily(product, order),
    colour: deriveColour(product),
    sizes: deriveSizes(product),
    badge: deriveBadge(product.tags),
    images,
    price: {
      amount: money.amount,
      currencyCode: money.currencyCode,
    },
    order,
    url: `https://ramishkalabel.com/products/${handle}`,
  };
}

function normalizeLookbookProducts(rawProducts) {
  const lookbookProducts = (rawProducts || []).filter((product) =>
    parseSurfaces(product && product.displaySurfaces).includes("lookbook"),
  );

  if (!lookbookProducts.length) {
    throw new ProductIntegrityError("Shopify returned no lookbook products.");
  }

  const seenOrders = new Set();
  const normalizedProducts = lookbookProducts.map((product) => {
    const value = product.lookbookOrder && product.lookbookOrder.value;
    if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
      throw new ProductIntegrityError(
        `${product.title || "Product"} does not have a valid integer lookbook order.`,
      );
    }

    const order = Number(value);
    if (!Number.isSafeInteger(order)) {
      throw new ProductIntegrityError(
        `${product.title || "Product"} does not have a valid integer lookbook order.`,
      );
    }
    if (seenOrders.has(order)) {
      throw new ProductIntegrityError(`Duplicate lookbook order ${order}.`);
    }
    seenOrders.add(order);
    return normalizeProduct(product, order);
  });

  return normalizedProducts.sort((left, right) => left.order - right.order);
}

function normalizeStoreDomain(storeDomain) {
  if (typeof storeDomain !== "string" || !storeDomain.trim()) {
    throw new Error("SHOPIFY_STORE_DOMAIN is not configured.");
  }
  const withoutProtocol = storeDomain.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(withoutProtocol)) {
    throw new Error("SHOPIFY_STORE_DOMAIN must be a myshopify.com hostname.");
  }
  return withoutProtocol.toLowerCase();
}

async function fetchAllProducts({ fetchImpl, storeDomain, token, buyerIp }) {
  if (typeof token !== "string" || !token) {
    throw new Error("SHOPIFY_STOREFRONT_PRIVATE_TOKEN is not configured.");
  }

  const domain = normalizeStoreDomain(storeDomain);
  const endpoint = `https://${domain}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const products = [];
  let after = null;

  do {
    const headers = {
      "Content-Type": "application/json",
      "Shopify-Storefront-Private-Token": token,
    };
    if (buyerIp) headers["Shopify-Storefront-Buyer-IP"] = buyerIp;

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: PRODUCT_QUERY,
        variables: { first: PAGE_SIZE, after },
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify Storefront API returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (Array.isArray(payload.errors) && payload.errors.length) {
      throw new Error("Shopify Storefront API returned GraphQL errors.");
    }

    const connection = payload.data && payload.data.products;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error("Shopify Storefront API returned a malformed product response.");
    }

    products.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
      throw new Error("Shopify Storefront API returned an invalid pagination cursor.");
    }
    after = connection.pageInfo.endCursor;
  } while (after);

  return products;
}

function jsonResponse(statusCode, body, cacheControl, cdnCacheControl) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  };
  if (cdnCacheControl) headers["Netlify-CDN-Cache-Control"] = cdnCacheControl;

  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function createHandler({
  fetchImpl = globalThis.fetch,
  env = process.env,
  logger = console,
} = {}) {
  return async function handler(event = {}) {
    if (event.httpMethod && event.httpMethod !== "GET") {
      return jsonResponse(405, { error: "Method not allowed." }, "no-store");
    }

    try {
      const forwardedFor = event.headers && (event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"]);
      const buyerIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "";
      const rawProducts = await fetchAllProducts({
        fetchImpl,
        storeDomain: env.SHOPIFY_STORE_DOMAIN,
        token: env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN,
        buyerIp,
      });
      const products = normalizeLookbookProducts(rawProducts);
      return jsonResponse(
        200,
        { products },
        SUCCESS_CACHE_CONTROL,
        SUCCESS_CDN_CACHE_CONTROL,
      );
    } catch (error) {
      logger.error("Unable to load Shopify lookbook products:", error);
      return jsonResponse(502, { error: ERROR_MESSAGE }, "no-store");
    }
  };
}

module.exports = {
  ProductIntegrityError,
  PRODUCT_QUERY,
  SHOPIFY_API_VERSION,
  createHandler,
  fetchAllProducts,
  handler: createHandler(),
  normalizeLookbookProducts,
};
