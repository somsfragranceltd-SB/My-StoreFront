const categories = [
  { id: "perfumes", label: "Perfumes" },
  { id: "body-care", label: "Body Creams & Lotions" },
  { id: "bath", label: "Soaps & Bath Essentials" },
  { id: "skincare", label: "Skincare & Beauty" },
];
let products = window.SOMS_PRODUCTS;

if (!Array.isArray(products)) {
  throw new Error("The product catalogue did not load. Check catalog-data.js.");
}

const elements = {
  categoryOptions: document.querySelector(".category-options"),
  filtersForm: document.querySelector(".filters-form"),
  minPrice: document.querySelector("#price-min"),
  maxPrice: document.querySelector("#price-max"),
  inStock: document.querySelector("#in-stock"),
  onSale: document.querySelector("#on-sale"),
  query: document.querySelector("#catalog-query"),
  clearSearch: document.querySelector(".clear-search"),
  sort: document.querySelector("#sort-products"),
  resultCount: document.querySelector(".result-count"),
  productGrid: document.querySelector(".product-grid"),
  catalogStatus: document.querySelector(".catalog-sync-status"),
  activeFilters: document.querySelector(".active-filters"),
  emptyState: document.querySelector(".empty-state"),
  catalogSummary: document.querySelector(".catalog-summary"),
  filterToggle: document.querySelector(".filter-toggle"),
  filterPanel: document.querySelector(".filter-panel"),
  filterBackdrop: document.querySelector(".filter-backdrop"),
  filterCount: document.querySelector(".filter-count"),
  cartCount: document.querySelector(".bag-count"),
  bagButton: document.querySelector(".bag-button"),
  cartToast: document.querySelector(".cart-toast"),
};

const categoryById = new Map(categories.map((category) => [category.id, category]));
const selectedCategories = new Set();
const queryParams = new URLSearchParams(window.location.search);
const allowedSorts = new Set(["featured", "newest", "price-asc", "price-desc", "rating", "name"]);
let toastTimeout;

function categoryLabel(categoryId) {
  return categoryById.get(categoryId)?.label ?? "Beauty";
}

function currentRating() {
  return Number(elements.filtersForm.querySelector('input[name="rating"]:checked').value);
}

function normalizedPrice(input) {
  if (!input.value.trim()) return null;
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function getFilterState() {
  return {
    categories: new Set(selectedCategories),
    min: normalizedPrice(elements.minPrice),
    max: normalizedPrice(elements.maxPrice),
    rating: currentRating(),
    inStock: elements.inStock.checked,
    onSale: elements.onSale.checked,
    query: elements.query.value.trim().toLocaleLowerCase(),
    sort: elements.sort.value,
  };
}

function matchesProduct(product, state, includeCategory = true) {
  const searchableText = `${product.name} ${product.brand} ${categoryLabel(product.category)} ${product.description} ${product.tags}`.toLocaleLowerCase();
  return product.published !== false
    && (!includeCategory || state.categories.size === 0 || state.categories.has(product.category))
    && (!state.query || searchableText.includes(state.query))
    && (state.min === null || product.price >= state.min)
    && (state.max === null || product.price <= state.max)
    && (state.rating === 0 || product.rating >= state.rating)
    && (!state.inStock || product.stock > 0)
    && (!state.onSale || product.oldPrice !== undefined);
}

function formatPrice(price) {
  return `₦${new Intl.NumberFormat("en-NG").format(price)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function productImageUrl(image) {
  if (/^https:\/\/[^\s]+$/i.test(image)) return image;
  return `https://images.unsplash.com/${encodeURIComponent(image)}?auto=format&fit=crop&w=700&q=82`;
}

function renderCategoryOptions(state) {
  const facetCounts = new Map(categories.map((category) => [category.id, 0]));
  products.filter((product) => matchesProduct(product, state, false))
    .forEach((product) => facetCounts.set(product.category, facetCounts.get(product.category) + 1));

  elements.categoryOptions.innerHTML = categories.map((category) => {
    const checked = state.categories.has(category.id) ? "checked" : "";
    const count = facetCounts.get(category.id);
    return `<label class="check-option">
      <input type="checkbox" name="category" value="${category.id}" ${checked}>
      <span>${category.label}</span><span class="facet-count">${count}</span>
    </label>`;
  }).join("");
}

function renderProduct(product) {
  const category = categoryLabel(product.category);
  const badge = product.badge
    ? `<span class="shop-product-badge${product.oldPrice ? " sale" : ""}">${escapeHtml(product.badge)}</span>`
    : "";
  const stockLabel = product.stock > 0
    ? `<p class="stock-status">${product.stock <= 5 ? "Only a few left" : "In stock"}</p>`
    : '<p class="stock-status out-of-stock">Sold out</p>';
  const oldPrice = product.oldPrice ? `<del>${formatPrice(product.oldPrice)}</del>` : "";
  const addButton = product.stock > 0
    ? `<button class="shop-add-button" type="button" data-product-id="${escapeHtml(product.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2 10h10l2-7H7M10 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg><span>Add to bag</span></button>`
    : '<button class="shop-add-button" type="button" disabled>Sold out</button>';

  return `<article class="shop-product" data-id="${escapeHtml(product.id)}">
    <div class="shop-product-photo">
      ${badge}<img src="${escapeHtml(productImageUrl(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy">
      <button class="shop-product-quick-view" type="button" aria-label="View details for ${escapeHtml(product.name)}">View details</button>
    </div>
    <div class="shop-product-info">
      <p class="shop-product-category">${escapeHtml(category)}</p>
      <h2 class="shop-product-name">${escapeHtml(product.name)}</h2>
      <p class="shop-product-rating"><span aria-label="${product.rating} out of 5 stars">★★★★★</span> ${product.rating.toFixed(1)} <span class="review-count">(${product.reviews})</span></p>
      <div class="shop-product-buy"><div><p class="shop-product-price">${formatPrice(product.price)}${oldPrice}</p>${stockLabel}</div>${addButton}</div>
    </div>
  </article>`;
}

function renderActiveFilters(state) {
  const chips = [];
  state.categories.forEach((category) => chips.push({ key: "category", value: category, label: categoryLabel(category) }));
  if (state.min !== null || state.max !== null) {
    const label = `${state.min === null ? "₦0" : formatPrice(state.min)} – ${state.max === null ? "No limit" : formatPrice(state.max)}`;
    chips.push({ key: "price", label });
  }
  if (state.rating > 0) chips.push({ key: "rating", value: "0", label: `${state.rating}+ stars` });
  if (state.inStock) chips.push({ key: "stock", label: "In stock" });
  if (state.onSale) chips.push({ key: "sale", label: "On sale" });
  if (state.query) chips.push({ key: "query", label: `Search: ${elements.query.value.trim()}` });
  elements.activeFilters.innerHTML = chips.map((chip) =>
    `<button class="filter-chip" type="button" data-filter="${chip.key}"${chip.value ? ` data-value="${chip.value}"` : ""}>${escapeHtml(chip.label)}<span aria-hidden="true">×</span></button>`
  ).join("");

  const count = chips.length;
  elements.filterCount.textContent = String(count);
  elements.filterCount.hidden = count === 0;
}

function sortProducts(list, sort) {
  const sorters = {
    featured: (a, b) => a.featured - b.featured,
    newest: (a, b) => b.featured - a.featured,
    "price-asc": (a, b) => a.price - b.price || a.featured - b.featured,
    "price-desc": (a, b) => b.price - a.price || a.featured - b.featured,
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...list].sort(sorters[sort] ?? sorters.featured);
}

function syncUrl(state) {
  const params = new URLSearchParams();
  if (state.categories.size) params.set("category", [...state.categories].join(","));
  if (state.query) params.set("q", elements.query.value.trim());
  if (state.min !== null) params.set("min", String(state.min));
  if (state.max !== null) params.set("max", String(state.max));
  if (state.rating > 0) params.set("rating", String(state.rating));
  if (state.inStock) params.set("stock", "1");
  if (state.onSale) params.set("sale", "1");
  if (state.sort !== "featured") params.set("sort", state.sort);
  const queryString = params.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function render() {
  const state = getFilterState();
  const activeElement = document.activeElement;
  const focusedFilter = activeElement instanceof HTMLInputElement && ["category", "rating"].includes(activeElement.name)
    ? { name: activeElement.name, value: activeElement.value }
    : null;
  const minInvalid = elements.minPrice.value.trim() !== "" && (!Number.isFinite(Number(elements.minPrice.value)) || Number(elements.minPrice.value) < 0);
  const maxInvalid = elements.maxPrice.value.trim() !== "" && (!Number.isFinite(Number(elements.maxPrice.value)) || Number(elements.maxPrice.value) < 0);
  const invalidRange = (state.min !== null && state.max !== null && state.min > state.max) || minInvalid || maxInvalid;
  const results = invalidRange ? [] : sortProducts(products.filter((product) => matchesProduct(product, state)), state.sort);

  renderCategoryOptions(state);
  if (focusedFilter) {
    elements.filtersForm.querySelector(`input[name="${focusedFilter.name}"][value="${focusedFilter.value}"]`)?.focus();
  }
  renderActiveFilters(state);
  elements.productGrid.innerHTML = results.map(renderProduct).join("");
  elements.resultCount.textContent = `${results.length} ${results.length === 1 ? "product" : "products"}`;
  elements.catalogSummary.textContent = invalidRange
    ? "Check your price range"
    : `Showing all ${results.length} matching products`;
  elements.emptyState.hidden = results.length !== 0;
  elements.productGrid.hidden = results.length === 0;
  elements.productGrid.setAttribute("aria-busy", "false");
  elements.clearSearch.hidden = elements.query.value.length === 0;
  document.querySelector(".price-error").hidden = !invalidRange;
  document.querySelectorAll(".price-presets button").forEach((preset) => {
    const min = preset.dataset.min ? Number(preset.dataset.min) : null;
    const max = preset.dataset.max ? Number(preset.dataset.max) : null;
    preset.classList.toggle("is-active", min === state.min && max === state.max);
  });
  syncUrl(state);
}

function closeFilters() {
  const wasOpen = elements.filterPanel.classList.contains("is-open");
  elements.filterPanel.classList.remove("is-open");
  elements.filterBackdrop.classList.remove("is-open");
  elements.filterToggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("filters-open");
  if (wasOpen) elements.filterToggle.focus();
}

function clearAllFilters() {
  selectedCategories.clear();
  elements.minPrice.value = "";
  elements.maxPrice.value = "";
  elements.filtersForm.querySelector('input[name="rating"][value="0"]').checked = true;
  elements.inStock.checked = false;
  elements.onSale.checked = false;
  elements.query.value = "";
  elements.sort.value = "featured";
  render();
}

function initializeFromUrl() {
  queryParams.get("category")?.split(",").forEach((category) => {
    if (categoryById.has(category)) selectedCategories.add(category);
  });
  elements.query.value = queryParams.get("q") || "";
  elements.minPrice.value = queryParams.get("min") || "";
  elements.maxPrice.value = queryParams.get("max") || "";
  const initialRating = queryParams.get("rating");
  if (["4", "4.5"].includes(initialRating)) {
    elements.filtersForm.querySelector(`input[name="rating"][value="${initialRating}"]`).checked = true;
  }
  elements.inStock.checked = queryParams.get("stock") === "1";
  elements.onSale.checked = queryParams.get("sale") === "1";
  const initialSort = queryParams.get("sort");
  elements.sort.value = allowedSorts.has(initialSort) ? initialSort : "featured";
}

elements.filtersForm.addEventListener("change", (event) => {
  if (event.target.name === "category") {
    if (event.target.checked) selectedCategories.add(event.target.value);
    else selectedCategories.delete(event.target.value);
  }
  render();
});

elements.filtersForm.addEventListener("input", (event) => {
  if (event.target.type === "number") render();
});

document.querySelector(".price-presets").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-min]");
  if (!button) return;
  elements.minPrice.value = button.dataset.min;
  elements.maxPrice.value = button.dataset.max;
  document.querySelectorAll(".price-presets button").forEach((preset) => preset.classList.toggle("is-active", preset === button));
  render();
});

elements.query.addEventListener("input", render);
elements.clearSearch.addEventListener("click", () => {
  elements.query.value = "";
  render();
  elements.query.focus();
});
document.querySelector(".catalog-search").addEventListener("submit", (event) => {
  event.preventDefault();
  render();
});
elements.sort.addEventListener("change", render);

document.querySelector(".clear-filters").addEventListener("click", clearAllFilters);
document.querySelector(".empty-clear").addEventListener("click", clearAllFilters);
document.querySelector(".active-filters").addEventListener("click", (event) => {
  const chip = event.target.closest(".filter-chip");
  if (!chip) return;
  if (chip.dataset.filter === "category") selectedCategories.delete(chip.dataset.value);
  if (chip.dataset.filter === "price") {
    elements.minPrice.value = "";
    elements.maxPrice.value = "";
    document.querySelectorAll(".price-presets button").forEach((preset) => preset.classList.remove("is-active"));
  }
  if (chip.dataset.filter === "rating") elements.filtersForm.querySelector('input[name="rating"][value="0"]').checked = true;
  if (chip.dataset.filter === "stock") elements.inStock.checked = false;
  if (chip.dataset.filter === "sale") elements.onSale.checked = false;
  if (chip.dataset.filter === "query") elements.query.value = "";
  render();
});

elements.filterToggle.addEventListener("click", () => {
  const isOpen = elements.filterPanel.classList.toggle("is-open");
  elements.filterBackdrop.classList.toggle("is-open", isOpen);
  elements.filterToggle.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("filters-open", isOpen);
  if (isOpen) document.querySelector(".filter-close").focus();
});
document.querySelector(".filter-close").addEventListener("click", closeFilters);
document.querySelector(".apply-filters").addEventListener("click", closeFilters);
elements.filterBackdrop.addEventListener("click", closeFilters);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.filterPanel.classList.contains("is-open")) closeFilters();
});

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-nav");
menuButton.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  navigation.classList.toggle("is-open", !isOpen);
});
navigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    navigation.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
  }
});

document.querySelector(".catalog-bottom").addEventListener("click", (event) => {
  if (event.target.closest(".back-to-top-link")) window.scrollTo({ top: 0, behavior: "smooth" });
});

elements.productGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".shop-add-button");
  if (button) {
    if (button.disabled) return;
    const product = products.find((item) => item.id === button.dataset.productId);
    if (!product) return;
    if (!window.SomsCart.add(product.id)) return;
    elements.cartToast.textContent = `${product.name} added to your bag`;
    elements.cartToast.classList.add("is-visible");
    button.classList.add("is-added");
    button.querySelector("span").textContent = "Added";
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      elements.cartToast.classList.remove("is-visible");
      button.classList.remove("is-added");
      button.querySelector("span").textContent = "Add to bag";
    }, 1800);
    return;
  }

  const card = event.target.closest(".shop-product");
  if (!card || (event.target.closest("button, a") && !event.target.closest(".shop-product-quick-view"))) return;
  const product = products.find((item) => item.id === card.dataset.id);
  if (product) window.SomsProductDetails.open(product);
});

document.querySelector(".search-button").addEventListener("click", () => {
  document.querySelector("#catalog-query").focus();
  document.querySelector(".catalog-search").scrollIntoView({ behavior: "smooth", block: "center" });
});

initializeFromUrl();
elements.catalogStatus.textContent = "Checking for the latest products…";
render({ preservePage: true });
window.addEventListener("soms-catalog-updated", () => {
  elements.catalogStatus.textContent = "";
  render({ preservePage: true });
});
window.addEventListener("soms-catalog-error", () => {
  elements.catalogStatus.textContent = "Showing saved products. The latest catalogue could not be loaded.";
});
window.SomsCatalog.refresh().catch((error) => {
  console.error("Could not load the latest shop catalogue.", error);
  window.dispatchEvent(new CustomEvent("soms-catalog-error", { detail: error }));
});
