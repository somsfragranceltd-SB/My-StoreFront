import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "soms_admin_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_CATALOGUE_PRODUCTS = 2000;
const MAX_REQUEST_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const REPOSITORY_OWNER = "somsfragranceltd-SB";
const REPOSITORY_NAME = "My-StoreFront";
const BRANCH = "main";
const CATALOG_PATH = "catalog-data.js";
const CATEGORIES = new Set(["perfumes", "body-care", "bath", "skincare"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function hasExpectedImageSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function hasValidSession(request, secret) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1) || "";
  const [expiresAt, signature, extra] = cookie.split(".");
  if (extra !== undefined || !/^\d{13}$/.test(expiresAt) || !/^[A-Za-z0-9_-]+$/.test(signature)) return false;

  const expiration = Number(expiresAt);
  if (expiration <= Date.now() || expiration > Date.now() + SESSION_DURATION_MS) return false;

  try {
    const expected = createHmac("sha256", secret)
      .update(`soms-fragrance-admin:${expiresAt}`)
      .digest();
    const supplied = Buffer.from(signature, "base64url");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function extractCatalogue(source) {
  const marker = "window.SOMS_CATALOG = ";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("The catalogue file has an unsupported format.");

  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonEnd = -1;

  for (let index = jsonStart; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        jsonEnd = index + 1;
        break;
      }
    }
  }

  if (jsonEnd < 0) throw new Error("The catalogue file contains incomplete data.");
  return JSON.parse(source.slice(jsonStart, jsonEnd));
}

function serializeCatalogue(products, storeSettings) {
  const data = JSON.stringify({ products, storeSettings });
  return `window.SOMS_CATALOG = ${data};\nwindow.SOMS_PRODUCTS = window.SOMS_CATALOG.products;\nwindow.SOMS_STORE_SETTINGS = window.SOMS_CATALOG.storeSettings;\n`;
}

function validateCatalogue(products, storeSettings) {
  if (!Array.isArray(products) || products.length > MAX_CATALOGUE_PRODUCTS) {
    return `Catalogue must contain no more than ${MAX_CATALOGUE_PRODUCTS} products.`;
  }
  if (!storeSettings || typeof storeSettings.whatsappNumber !== "string" || !/^\d{8,15}$/.test(storeSettings.whatsappNumber)) {
    return "WhatsApp number must contain 8–15 digits, including country code.";
  }

  const ids = new Set();
  const names = new Set();
  let homepageFeatured = 0;
  for (const product of products) {
    if (!product || typeof product !== "object" || Array.isArray(product)) return "Each product must be an object.";
    if (typeof product.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id) || ids.has(product.id)) return "Product IDs must be unique and use lowercase letters, numbers, and hyphens.";
    if (typeof product.name !== "string" || !product.name.trim() || product.name.length > 90) return "Every product needs a name of at most 90 characters.";
    const normalizedName = product.name.trim().toLocaleLowerCase();
    if (names.has(normalizedName)) return `Product name "${product.name}" is used more than once.`;
    if (!CATEGORIES.has(product.category)) return `Product ${product.name} has an unknown category.`;
    if (typeof product.brand !== "string" || !product.brand.trim() || product.brand.length > 60) return `Product ${product.name} needs a valid brand.`;
    if (!Number.isSafeInteger(product.price) || product.price < 1) return `Product ${product.name} needs a whole-number price above zero.`;
    if (product.oldPrice !== undefined && (!Number.isSafeInteger(product.oldPrice) || product.oldPrice <= product.price)) return `Product ${product.name} has an invalid compare-at price.`;
    if (!Number.isSafeInteger(product.stock) || product.stock < 0) return `Product ${product.name} needs a valid stock quantity.`;
    if (typeof product.image !== "string" || !product.image.trim() || product.image.length > 2048) return `Product ${product.name} needs a valid image.`;
    if (!/^photo-[a-zA-Z0-9-]+$/.test(product.image)) {
      try {
        if (new URL(product.image).protocol !== "https:") return `Product ${product.name} image URL must use HTTPS.`;
      } catch {
        return `Product ${product.name} needs an HTTPS image URL or Unsplash photo ID.`;
      }
    }
    if (typeof product.description !== "string" || !product.description.trim() || product.description.length > 240) return `Product ${product.name} needs a valid description.`;
    if (typeof product.rating !== "number" || !Number.isFinite(product.rating) || product.rating < 0 || product.rating > 5) return `Product ${product.name} has an invalid rating.`;
    if (!Number.isSafeInteger(product.reviews) || product.reviews < 0) return `Product ${product.name} has an invalid review count.`;
    if (!Number.isSafeInteger(product.featured) || product.featured < 0) return `Product ${product.name} has an invalid catalogue position.`;
    if (product.badge !== undefined && typeof product.badge !== "string") return `Product ${product.name} has an invalid badge.`;
    if (product.tags !== undefined && typeof product.tags !== "string") return `Product ${product.name} has invalid search keywords.`;
    if (product.published !== undefined && typeof product.published !== "boolean") return `Product ${product.name} has an invalid publish status.`;
    if (product.featuredOnHome !== undefined && typeof product.featuredOnHome !== "boolean") return `Product ${product.name} has an invalid homepage feature setting.`;

    ids.add(product.id);
    names.add(normalizedName);
    if (product.published !== false && (product.featuredOnHome ?? product.featured <= 4)) homepageFeatured += 1;
  }

  if (homepageFeatured > 4) return "Only four products can be featured on the homepage.";
  return "";
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Soms-Fragrance-Catalogue-Admin",
  };
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`GitHub API request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function readCurrentCatalogue(token) {
  const reference = await githubRequest(`/git/ref/heads/${BRANCH}`, token);
  const file = await githubRequest(`/contents/${CATALOG_PATH}?ref=${encodeURIComponent(reference.object.sha)}`, token);
  if (file.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error("The catalogue file could not be read from GitHub.");
  }
  const data = extractCatalogue(Buffer.from(file.content, "base64").toString("utf8"));
  const validation = validateCatalogue(data.products, data.storeSettings);
  if (validation) throw new Error(`The GitHub catalogue is invalid: ${validation}`);
  return { ...data, baseSha: reference.object.sha };
}

async function updateCatalogue(token, payload) {
  if (typeof payload.baseSha !== "string" || !/^[a-f0-9]{40}$/i.test(payload.baseSha)) {
    return jsonResponse({ error: "Reload the catalogue before saving your changes." }, 400);
  }
  const reference = await githubRequest(`/git/ref/heads/${BRANCH}`, token);
  if (reference.object.sha !== payload.baseSha) {
    return jsonResponse({ error: "The catalogue changed in another session. Reload the page before saving again." }, 409);
  }

  const products = payload.products.map((product) => ({ ...product }));
  let imagePath;
  let imageBlobSha;
  if (payload.imageUpload !== undefined) {
    const upload = payload.imageUpload;
    if (!upload || typeof upload !== "object" || typeof upload.productId !== "string") {
      return jsonResponse({ error: "Choose a product for the image upload." }, 400);
    }
    const extension = IMAGE_TYPES.get(upload.mimeType);
    if (!extension || typeof upload.contentBase64 !== "string") {
      return jsonResponse({ error: "Upload a JPG, PNG, or WebP product image." }, 400);
    }
    const imageBytes = Buffer.from(upload.contentBase64, "base64");
    if (!imageBytes.length || imageBytes.length > MAX_IMAGE_SIZE || imageBytes.toString("base64") !== upload.contentBase64) {
      return jsonResponse({ error: "Product images must be smaller than 2 MB." }, 413);
    }
    if (!hasExpectedImageSignature(imageBytes, upload.mimeType)) {
      return jsonResponse({ error: "The uploaded file does not match its image format." }, 400);
    }
    const product = products.find((entry) => entry.id === upload.productId);
    if (!product) return jsonResponse({ error: "The uploaded image is not attached to a catalogue product." }, 400);

    imagePath = `product-images/${product.id}-${randomUUID()}.${extension}`;
    product.image = `https://raw.githubusercontent.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/${BRANCH}/${imagePath}`;
    const blob = await githubRequest("/git/blobs", token, {
      method: "POST",
      body: JSON.stringify({ content: upload.contentBase64, encoding: "base64" }),
    });
    imageBlobSha = blob.sha;
  }

  const validation = validateCatalogue(products, payload.storeSettings);
  if (validation) return jsonResponse({ error: validation }, 400);

  const commit = await githubRequest(`/git/commits/${reference.object.sha}`, token);
  const tree = [
    { path: CATALOG_PATH, mode: "100644", type: "blob", content: serializeCatalogue(products, payload.storeSettings) },
  ];
  if (imagePath) tree.push({ path: imagePath, mode: "100644", type: "blob", sha: imageBlobSha });

  const newTree = await githubRequest("/git/trees", token, {
    method: "POST",
    body: JSON.stringify({ base_tree: commit.tree.sha, tree }),
  });
  const newCommit = await githubRequest("/git/commits", token, {
    method: "POST",
    body: JSON.stringify({
      message: "Update Som's Beauty product catalogue",
      tree: newTree.sha,
      parents: [reference.object.sha],
    }),
  });

  try {
    await githubRequest(`/git/refs/heads/${BRANCH}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
  } catch (error) {
    if (error.status === 422 || error.status === 409) {
      return jsonResponse({ error: "The catalogue changed in another session. Reload the page before saving again." }, 409);
    }
    throw error;
  }

  return jsonResponse({
    ok: true,
    products,
    storeSettings: payload.storeSettings,
    baseSha: newCommit.sha,
  });
}

export default async function handler(request) {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  const token = process.env.GITHUB_TOKEN;
  if (!sessionSecret || sessionSecret.length < 32 || !token) {
    return jsonResponse({ error: "Catalogue publishing is not configured on Netlify." }, 503);
  }
  if (!hasValidSession(request, sessionSecret)) return jsonResponse({ error: "Admin session is missing or expired." }, 401);

  if (request.method === "GET") {
    try {
      return jsonResponse(await readCurrentCatalogue(token));
    } catch (error) {
      console.error("Could not load the GitHub catalogue.", error.message);
      return jsonResponse({ error: "Could not load the catalogue from GitHub. Check the repository setup and try again." }, 502);
    }
  }

  if (request.method !== "PUT") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!isSameOrigin(request)) return jsonResponse({ error: "Request rejected." }, 403);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_SIZE) return jsonResponse({ error: "The catalogue update is too large." }, 413);

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength > MAX_REQUEST_SIZE) return jsonResponse({ error: "The catalogue update is too large." }, 413);

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonResponse({ error: "Invalid catalogue update." }, 400);
  }

  if (!payload || !Array.isArray(payload.products) || !payload.storeSettings || typeof payload.storeSettings !== "object") {
    return jsonResponse({ error: "Catalogue products and store settings are required." }, 400);
  }
  const validation = validateCatalogue(payload.products, payload.storeSettings);
  if (validation) return jsonResponse({ error: validation }, 400);

  try {
    return await updateCatalogue(token, payload);
  } catch (error) {
    console.error("Could not update the GitHub catalogue.", error.message);
    return jsonResponse({ error: `Could not save changes to GitHub${error.status ? ` (HTTP ${error.status})` : ""}. Check your Netlify token settings and try again.` }, 502);
  }
}
