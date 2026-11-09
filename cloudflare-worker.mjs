import adminAccess from "./netlify/edge-functions/admin-access.js";
import catalogHandler from "./netlify/functions/catalog.mjs";
import storeCatalogHandler from "./netlify/functions/store-catalog.mjs";

async function routeRequest(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/catalog") return catalogHandler(request, env);
  if (pathname === "/api/store-catalog") return storeCatalogHandler(request, env);

  const assetRequest = pathname === "/"
    ? new Request(new URL("/index.html", request.url), request)
    : request;
  const response = await env.ASSETS.fetch(assetRequest);
  if (pathname === "/catalog-data.js") {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}

export default {
  async fetch(request, env) {
    const context = {
      env,
      next: () => routeRequest(request, env),
    };
    const response = await adminAccess(request, context);
    return response ?? routeRequest(request, env);
  },
};
