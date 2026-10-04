"use strict";

// Vercel entry point for the Shopify catalogue. The logic lives in the Netlify
// function; this adapts its { statusCode, headers, body } result to Vercel.
const { handler } = require("../netlify/functions/products");

module.exports = async function products(req, res) {
  const result = await handler({ httpMethod: req.method, headers: req.headers });

  for (const [name, value] of Object.entries(result.headers)) {
    if (name === "Netlify-CDN-Cache-Control") {
      res.setHeader("Vercel-CDN-Cache-Control", value.replace("durable, ", ""));
    } else {
      res.setHeader(name, value);
    }
  }

  res.statusCode = result.statusCode;
  res.end(result.body);
};
