(() => {
  const products = window.SOMS_PRODUCTS;
  const storeSettings = window.SOMS_STORE_SETTINGS;
  const refreshInterval = 5_000;
  let lastRefresh = 0;
  let pendingRefresh;

  if (!Array.isArray(products) || !storeSettings || typeof storeSettings !== "object") {
    throw new Error("The saved product catalogue did not load correctly.");
  }

  async function refresh({ force = false } = {}) {
    if (!force && Date.now() - lastRefresh < refreshInterval) return products;
    if (pendingRefresh) return pendingRefresh;

    pendingRefresh = (async () => {
      const response = await fetch("/api/store-catalog", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || `Catalogue refresh failed (HTTP ${response.status}).`);
      }
      if (!Array.isArray(result?.products) || result.products.length > 2000) {
        throw new Error("The latest catalogue has an invalid product list.");
      }
      if (!result.storeSettings || typeof result.storeSettings !== "object" || Array.isArray(result.storeSettings)) {
        throw new Error("The latest catalogue has invalid store settings.");
      }

      products.splice(0, products.length, ...result.products);
      Object.assign(storeSettings, result.storeSettings);
      window.dispatchEvent(new CustomEvent("soms-catalog-updated"));
      lastRefresh = Date.now();
      return products;
    })();

    try {
      return await pendingRefresh;
    } finally {
      pendingRefresh = null;
    }
  }

  window.SomsCatalog = { refresh };

  async function refreshWhenActive() {
    if (document.visibilityState !== "visible") return;
    try {
      await refresh();
    } catch (error) {
      console.error("Could not refresh the latest product catalogue.", error);
      window.dispatchEvent(new CustomEvent("soms-catalog-error", { detail: error }));
    }
  }

  window.addEventListener("focus", refreshWhenActive);
  document.addEventListener("visibilitychange", refreshWhenActive);
})();
