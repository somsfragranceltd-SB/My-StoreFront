import { readCurrentCatalogue } from "./catalog.mjs";

function jsonResponse(body, status = 200, cacheControl = "no-store") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
  };
  if (cacheControl.startsWith("public")) {
    headers["Netlify-CDN-Cache-Control"] = "public, s-maxage=5";
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse({ error: "The store catalogue is not configured on Netlify." }, 503);
  }

  try {
    const { products, storeSettings } = await readCurrentCatalogue(token);
    return jsonResponse({ products, storeSettings }, 200, "public, max-age=0, s-maxage=5");
  } catch (error) {
    console.error("Could not load the public store catalogue.", error.message);
    return jsonResponse({ error: "Could not load the latest store catalogue." }, 502);
  }
}
