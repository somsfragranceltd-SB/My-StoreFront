import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import handler from "../netlify/functions/catalog.mjs";

const sessionSecret = "test-secret-that-is-long-enough-for-signing";
const storeSettings = { whatsappNumber: "2348109266876" };

function createProducts(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `test-product-${index + 1}`,
    name: `Test Product ${index + 1}`,
    category: "perfumes",
    brand: "Som's Beauty",
    price: 1000,
    rating: 5,
    reviews: 0,
    stock: 1,
    featured: index + 1,
    featuredOnHome: false,
    image: "photo-sample",
    description: "Test product description.",
    published: true,
  }));
}

function createRequest(products) {
  const expiresAt = String(Date.now() + 60 * 60 * 1000);
  const signature = createHmac("sha256", sessionSecret)
    .update(`soms-fragrance-admin:${expiresAt}`)
    .digest("base64url");
  return new Request("https://store.example/api/catalog", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(JSON.stringify({ products, storeSettings, baseSha: "a".repeat(40) }))),
      Origin: "https://store.example",
      Cookie: `soms_admin_session=${expiresAt}.${signature}`,
    },
    body: JSON.stringify({ products, storeSettings, baseSha: "a".repeat(40) }),
  });
}

test("catalogue API accepts up to 2,000 products", async () => {
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const requests = [];
  process.env.ADMIN_SESSION_SECRET = sessionSecret;
  process.env.GITHUB_TOKEN = "test-token";
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).includes("/git/ref/heads/main")) return Response.json({ object: { sha: "a".repeat(40) } });
    if (String(url).includes("/git/commits/") && !String(url).endsWith("/git/commits")) {
      return Response.json({ tree: { sha: "base-tree" } });
    }
    if (String(url).endsWith("/git/trees")) return Response.json({ sha: "new-tree" });
    if (String(url).endsWith("/git/commits")) return Response.json({ sha: "b".repeat(40) });
    if (String(url).endsWith("/git/refs/heads/main")) return Response.json({ object: { sha: "b".repeat(40) } });
    throw new Error(`Unexpected GitHub request: ${url}`);
  };

  try {
    const response = await handler(createRequest(createProducts(2000)));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).products.length, 2000);
    assert.equal(requests.length, 5);
    const treeRequest = requests.find((request) => request.url.endsWith("/git/trees"));
    assert.equal(JSON.parse(treeRequest.body).tree[0].content.includes('"id":"test-product-2000"'), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalSecret;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

test("catalogue API rejects more than 2,000 products before publishing", async () => {
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  process.env.ADMIN_SESSION_SECRET = sessionSecret;
  process.env.GITHUB_TOKEN = "test-token";
  globalThis.fetch = async () => {
    fetchCalled = true;
    return Response.json({});
  };

  try {
    const response = await handler(createRequest(createProducts(2001)));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /2000/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalSecret;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
