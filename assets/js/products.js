(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.RamishkaProducts = api;
    api.initCatalog(root.document, root.fetch.bind(root));
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMoney(price) {
    var amount = Number(price.amount);
    if (!Number.isFinite(amount)) throw new Error("A product has an invalid price.");

    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: price.currencyCode,
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      }).format(amount);
    } catch (_error) {
      return price.currencyCode + " " + amount.toFixed(2);
    }
  }

  function validateProduct(product) {
    if (
      !product ||
      typeof product.title !== "string" ||
      !product.title ||
      typeof product.family !== "string" ||
      !product.family ||
      typeof product.colour !== "string" ||
      !product.colour ||
      typeof product.sizes !== "string" ||
      !product.sizes ||
      !Array.isArray(product.images) ||
      !product.images.length ||
      !product.price
    ) {
      throw new Error("The product catalogue response is incomplete.");
    }
  }

  function buildCard(product, familyIndex) {
    var primary = product.images[0];
    var secondary = product.images[1];
    var badge = product.badge
      ? '<span class="piece__badge">' + escapeHtml(product.badge) + "</span>"
      : "";
    var alternateImage = secondary
      ? '<img class="piece__img--alt" src="' +
        escapeHtml(secondary.url) +
        '" alt="' +
        escapeHtml(secondary.alt) +
        '" loading="lazy" />'
      : "";

    return (
      '<article class="piece reveal" data-delay="' +
      String((familyIndex % 3) * 80) +
      '">' +
      '<div class="piece__frame">' +
      '<img class="piece__img--main" src="' +
      escapeHtml(primary.url) +
      '" alt="' +
      escapeHtml(primary.alt) +
      '" loading="lazy" />' +
      alternateImage +
      badge +
      "</div>" +
      '<h4 class="piece__name">' +
      escapeHtml(product.title) +
      "</h4>" +
      '<p class="piece__colour">' +
      escapeHtml(product.colour) +
      "</p>" +
      '<p class="piece__desc">' +
      escapeHtml(product.description || "") +
      "</p>" +
      '<p class="piece__price"><span class="label">Retail</span>' +
      escapeHtml(formatMoney(product.price)) +
      "</p>" +
      "</article>"
    );
  }

  function buildLineRow(product) {
    return (
      "<tr>" +
      '<td class="linesheet__family">' +
      escapeHtml(product.family) +
      "</td>" +
      '<td class="linesheet__piece">' +
      escapeHtml(product.title) +
      "</td>" +
      "<td>" +
      escapeHtml(product.colour) +
      "</td>" +
      "<td>" +
      escapeHtml(product.sizes) +
      "</td>" +
      "<td>" +
      escapeHtml(formatMoney(product.price)) +
      "</td>" +
      "</tr>"
    );
  }

  function buildCatalogMarkup(products) {
    if (!Array.isArray(products) || !products.length) {
      throw new Error("The product catalogue is empty.");
    }

    var cardsByFamily = Object.create(null);
    var familyCounts = Object.create(null);
    var lineRows = "";

    products.forEach(function (product) {
      validateProduct(product);
      var familyIndex = familyCounts[product.family] || 0;
      cardsByFamily[product.family] =
        (cardsByFamily[product.family] || "") + buildCard(product, familyIndex);
      familyCounts[product.family] = familyIndex + 1;
      lineRows += buildLineRow(product);
    });

    return { cardsByFamily: cardsByFamily, lineRows: lineRows };
  }

  function renderCatalog(products, documentRef) {
    var markup = buildCatalogMarkup(products);
    var mounts = Array.prototype.slice.call(
      documentRef.querySelectorAll("[data-products-family]"),
    );
    var mountsByFamily = Object.create(null);

    mounts.forEach(function (mount) {
      mountsByFamily[mount.dataset.productsFamily] = mount;
    });

    Object.keys(markup.cardsByFamily).forEach(function (family) {
      if (!mountsByFamily[family] && typeof console !== "undefined" && console.warn) {
        console.warn(
          'Ramishka lookbook: no chapter mount for product family "' +
            family +
            '" — its pieces are omitted from the chapters but still appear in the line sheet.',
        );
      }
    });

    var lineSheetBody = documentRef.querySelector("[data-products-linesheet]");
    if (!lineSheetBody) throw new Error("The line-sheet product mount is missing.");

    mounts.forEach(function (mount) {
      mount.innerHTML = markup.cardsByFamily[mount.dataset.productsFamily] || "";
      mount.setAttribute && mount.setAttribute("aria-busy", "false");
    });
    lineSheetBody.innerHTML = markup.lineRows;

    if (typeof documentRef.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
      documentRef.dispatchEvent(new CustomEvent("ramishka:catalog-rendered"));
    }
  }

  async function initCatalog(documentRef, fetchImpl) {
    var status = documentRef.getElementById("catalog-status");
    try {
      var response = await fetchImpl("/.netlify/functions/products", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Product request failed.");
      var payload = await response.json();
      renderCatalog(payload.products, documentRef);
      if (status) status.hidden = true;
      if (documentRef.body && documentRef.body.classList) {
        documentRef.body.classList.remove("catalog-loading", "catalog-error");
        documentRef.body.classList.add("catalog-ready");
      }
    } catch (_error) {
      if (status) {
        status.hidden = false;
        status.textContent =
          "The collection is temporarily unavailable. Please try again shortly.";
      }
      if (documentRef.body && documentRef.body.classList) {
        documentRef.body.classList.remove("catalog-loading");
        documentRef.body.classList.add("catalog-error");
      }
    }
  }

  return {
    buildCatalogMarkup: buildCatalogMarkup,
    formatMoney: formatMoney,
    initCatalog: initCatalog,
    renderCatalog: renderCatalog,
  };
});

