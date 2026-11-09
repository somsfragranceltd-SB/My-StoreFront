const CATEGORY_LABELS = {
  perfumes: "Perfumes",
  "body-care": "Body care",
  bath: "Bath & soaps",
  skincare: "Skincare",
};
const MAX_CATALOGUE_PRODUCTS = 2000;

const ui = {
  list: document.querySelector("#inventory-list"),
  search: document.querySelector("#admin-search"),
  category: document.querySelector("#admin-category"),
  empty: document.querySelector(".inventory-empty"),
  dialog: document.querySelector(".product-dialog"),
  form: document.querySelector(".product-form"),
  formError: document.querySelector(".form-error"),
  title: document.querySelector("#product-dialog-title"),
  saveButton: document.querySelector(".save-product"),
  status: document.querySelector(".save-status"),
  message: document.querySelector(".admin-message"),
  toast: document.querySelector(".admin-toast"),
  addButton: document.querySelector(".add-product-button"),
  saveWhatsappButton: document.querySelector(".save-whatsapp-number"),
  refreshButton: document.querySelector(".refresh-catalogue"),
};

let catalogue = [];
let storeSettings = {};
let baseSha = "";
let ready = false;
let saving = false;
let loading = false;
let toastTimeout;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function imageUrl(image) {
  return /^https:\/\/[^\s]+$/i.test(image)
    ? image
    : `https://images.unsplash.com/${encodeURIComponent(image)}?auto=format&fit=crop&w=160&q=70`;
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => ui.toast.classList.remove("is-visible"), 2300);
}

function setReady(value) {
  ready = value;
  for (const button of [ui.addButton, ui.saveButton, ui.saveWhatsappButton]) {
    button.disabled = !ready || saving || loading;
  }
  ui.refreshButton.disabled = saving || loading;
}

function updateStats() {
  document.querySelector("#stat-products").textContent = String(catalogue.length);
  document.querySelector("#stat-published").textContent = String(catalogue.filter((product) => product.published !== false).length);
  document.querySelector("#stat-low-stock").textContent = String(catalogue.filter((product) => product.published !== false && product.stock > 0 && product.stock <= 5).length);
  document.querySelector("#stat-out-stock").textContent = String(catalogue.filter((product) => product.published !== false && product.stock === 0).length);
}

function renderInventory() {
  const query = ui.search.value.trim().toLocaleLowerCase();
  const category = ui.category.value;
  const filtered = catalogue.filter((product) => {
    const matchesText = `${product.name} ${product.brand} ${product.description} ${product.tags || ""}`.toLocaleLowerCase().includes(query);
    return matchesText && (!category || product.category === category);
  });

  ui.list.innerHTML = filtered.map((product) => {
    const stockClass = product.stock === 0 ? "out" : product.stock <= 5 ? "low" : "";
    const stockLabel = product.stock === 0 ? "Out of stock" : `${product.stock} in stock`;
    const visibilityLabel = product.published === false ? "Draft" : "";
    return `<article class="inventory-row" data-id="${escapeHtml(product.id)}">
      <div class="inventory-thumb"><img src="${escapeHtml(imageUrl(product.image))}" alt="" loading="lazy"></div>
      <div class="inventory-product">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(CATEGORY_LABELS[product.category] || product.category)} · ₦${new Intl.NumberFormat("en-NG").format(product.price)}${visibilityLabel ? `<small>${visibilityLabel}</small>` : ""}</span>
      </div>
      <span class="inventory-quantity ${stockClass}">${stockLabel}</span>
      <div class="inventory-actions"><button type="button" data-action="edit">Edit</button><button type="button" class="delete-product" data-action="delete">Delete</button></div>
    </article>`;
  }).join("");
  ui.empty.hidden = filtered.length !== 0;
  updateStats();
}

async function catalogueRequest(method, payload) {
  const response = await fetch("/api/catalog", {
    method,
    credentials: "same-origin",
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Catalogue request failed (HTTP ${response.status}).`);
  return result;
}

async function loadCatalogue() {
  if (loading || saving) return;
  loading = true;
  setReady(ready);
  ui.status.textContent = "Loading shared catalogue from GitHub…";
  ui.message.textContent = "";
  try {
    const result = await catalogueRequest("GET");
    validateCatalogue(result.products);
    if (!result.storeSettings || !/^\d{8,15}$/.test(result.storeSettings.whatsappNumber || "")) {
      throw new Error("The shared WhatsApp number is invalid.");
    }
    if (typeof result.baseSha !== "string") throw new Error("GitHub did not return the catalogue revision.");
    catalogue = result.products.map((product) => ({ ...product, published: product.published !== false }));
    storeSettings = { ...result.storeSettings };
    baseSha = result.baseSha;
    document.querySelector("#whatsapp-number").value = storeSettings.whatsappNumber;
    ui.status.textContent = "Shared catalogue connected";
    setReady(true);
    renderInventory();
  } catch (error) {
    setReady(false);
    ui.status.textContent = "Could not load the shared catalogue";
    ui.message.textContent = `${error.message} Check the GitHub repository and Netlify settings, then retry.`;
    ui.list.innerHTML = "";
    ui.empty.hidden = false;
    updateStats();
  } finally {
    loading = false;
    setReady(ready);
  }
}

function validateProduct(product, ids, allowMissingImage = false) {
  if (!product || typeof product !== "object" || Array.isArray(product)) return "Each product must be an object.";
  if (typeof product.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id)) return "Product IDs must use lowercase letters, numbers, and hyphens.";
  if (ids.has(product.id)) return `The product ID "${product.id}" is used more than once.`;
  if (typeof product.name !== "string" || !product.name.trim()) return `Product ${product.id} needs a name.`;
  if (!Object.hasOwn(CATEGORY_LABELS, product.category)) return `Product ${product.name} has an unknown category.`;
  if (typeof product.brand !== "string" || !product.brand.trim()) return `Product ${product.name} needs a brand.`;
  if (!Number.isSafeInteger(product.price) || product.price < 1) return `Product ${product.name} needs a whole-number price above zero.`;
  if (product.oldPrice !== undefined && (!Number.isSafeInteger(product.oldPrice) || product.oldPrice <= product.price)) return `Product ${product.name} compare-at price must be greater than its current price.`;
  if (!Number.isSafeInteger(product.stock) || product.stock < 0) return `Product ${product.name} needs a stock quantity of zero or more.`;
  if (!allowMissingImage && (typeof product.image !== "string" || !product.image.trim())) return `Product ${product.name} needs an image URL or Unsplash photo ID.`;
  if (product.image && !/^photo-[a-zA-Z0-9-]+$/.test(product.image)) {
    try {
      if (new URL(product.image).protocol !== "https:") return `Product ${product.name} image URL must use HTTPS.`;
    } catch {
      return `Product ${product.name} image must be an HTTPS URL or Unsplash photo ID.`;
    }
  }
  if (typeof product.description !== "string" || !product.description.trim()) return `Product ${product.name} needs a description.`;
  if (typeof product.rating !== "number" || product.rating < 0 || product.rating > 5) return `Product ${product.name} rating must be between zero and five.`;
  if (!Number.isSafeInteger(product.reviews) || product.reviews < 0) return `Product ${product.name} review count must be zero or more.`;
  if (!Number.isSafeInteger(product.featured) || product.featured < 0) return `Product ${product.name} needs a valid catalogue position.`;
  if (product.published !== undefined && typeof product.published !== "boolean") return `Product ${product.name} publish status must be true or false.`;
  if (product.featuredOnHome !== undefined && typeof product.featuredOnHome !== "boolean") return `Product ${product.name} homepage feature status must be true or false.`;
  ids.add(product.id);
  return "";
}

function validateCatalogue(items) {
  if (!Array.isArray(items)) throw new Error("The catalogue must be a list of products.");
  if (items.length > MAX_CATALOGUE_PRODUCTS) {
    throw new Error(`The catalogue can contain no more than ${MAX_CATALOGUE_PRODUCTS.toLocaleString()} products.`);
  }
  const ids = new Set();
  let homepageFeatured = 0;
  for (const product of items) {
    const error = validateProduct(product, ids);
    if (error) throw new Error(error);
    if (product.published !== false && (product.featuredOnHome ?? product.featured <= 4)) homepageFeatured += 1;
  }
  if (homepageFeatured > 4) throw new Error("Only four products can be featured on the homepage.");
}

function makeSlug(value) {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-product";
}

function createUniqueId(name, currentId = "") {
  const base = makeSlug(name);
  let candidate = base;
  let suffix = 2;
  while (catalogue.some((product) => product.id === candidate && product.id !== currentId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function openProductForm(product = null) {
  ui.form.reset();
  ui.formError.textContent = "";
  ui.title.textContent = product ? "Edit product" : "Add a product";
  ui.saveButton.textContent = product ? "Save changes" : "Save product";
  ui.form.elements.originalId.value = product?.id || "";
  if (product) {
    for (const [key, value] of Object.entries(product)) {
      if (key === "featuredOnHome") continue;
      const field = ui.form.elements[key];
      if (!field) continue;
      if (field.type === "checkbox") field.checked = value !== false;
      else field.value = value ?? "";
    }
    ui.form.elements.featuredOnHome.checked = product.featuredOnHome ?? product.featured <= 4;
  } else {
    ui.form.elements.published.checked = true;
  }
  ui.dialog.showModal();
  ui.form.elements.name.focus();
}

function readProductForm() {
  const formData = new FormData(ui.form);
  const originalId = String(formData.get("originalId") || "");
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price"));
  const oldPriceValue = String(formData.get("oldPrice") || "").trim();
  const image = String(formData.get("image") || "").trim();
  const imageFile = ui.form.elements.imageFile.files[0] || null;
  const originalProduct = catalogue.find((item) => item.id === originalId);
  const isFeatured = ui.form.elements.featuredOnHome.checked;
  const wasFeatured = originalProduct?.featuredOnHome ?? (originalProduct ? originalProduct.featured <= 4 : false);
  const featuredProducts = catalogue.filter((item) => item.published !== false && (item.featuredOnHome ?? item.featured <= 4));
  if (isFeatured && ui.form.elements.published.checked && featuredProducts.filter((item) => item.id !== originalId).length >= 4) {
    throw new Error("The homepage already has four featured products. Unfeature one first.");
  }
  if (imageFile && (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type) || imageFile.size > 2 * 1024 * 1024)) {
    throw new Error("Choose a JPG, PNG, or WebP image smaller than 2 MB.");
  }
  const featuredRank = isFeatured
    ? wasFeatured
      ? originalProduct.featured
      : Math.max(...featuredProducts.map((item) => item.featured), 0) + 1
    : wasFeatured
      ? Math.max(...featuredProducts.filter((item) => item.id !== originalId).map((item) => item.featured), 0) + 1
      : originalProduct?.featured ?? Math.max(...catalogue.map((item) => item.featured), 0) + 1;
  const isUnsplashId = /^photo-[a-zA-Z0-9-]+$/.test(image);
  let validImageUrl = false;
  try {
    validImageUrl = new URL(image).protocol === "https:";
  } catch {
    validImageUrl = false;
  }
  const product = {
    id: createUniqueId(name, originalId),
    name,
    category: String(formData.get("category")),
    brand: String(formData.get("brand") || "").trim() || "Som's Beauty",
    price,
    rating: Number(formData.get("rating")),
    reviews: Number(formData.get("reviews")),
    stock: Number(formData.get("stock")),
    badge: String(formData.get("badge") || ""),
    featured: featuredRank,
    featuredOnHome: isFeatured,
    image: image || (imageFile ? "" : originalProduct?.image || ""),
    description: String(formData.get("description") || "").trim(),
    tags: String(formData.get("tags") || "").trim(),
    published: ui.form.elements.published.checked,
  };
  if (oldPriceValue) product.oldPrice = Number(oldPriceValue);
  if (!imageFile && !isUnsplashId && !validImageUrl) throw new Error("Add a valid HTTPS image URL or upload a product image.");
  if (product.oldPrice !== undefined && (!Number.isSafeInteger(product.oldPrice) || product.oldPrice <= price)) {
    throw new Error("Compare-at price must be greater than the current price.");
  }
  const duplicate = catalogue.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== originalId);
  if (duplicate) throw new Error(`"${duplicate.name}" already exists in your catalogue.`);
  const validation = validateProduct(product, new Set(catalogue.filter((item) => item.id !== originalId).map((item) => item.id)), Boolean(imageFile));
  if (validation) throw new Error(validation);
  return { product, originalId, imageFile };
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function persistCatalogue(nextProducts, nextSettings = storeSettings, imageUpload = null) {
  if (!ready || saving || loading) return false;
  saving = true;
  ui.status.textContent = "Saving changes to GitHub…";
  ui.message.textContent = "";
  setReady(true);
  try {
    const result = await catalogueRequest("PUT", {
      products: nextProducts,
      storeSettings: nextSettings,
      baseSha,
      ...(imageUpload ? { imageUpload } : {}),
    });
    catalogue = result.products.map((product) => ({ ...product, published: product.published !== false }));
    storeSettings = { ...result.storeSettings };
    baseSha = result.baseSha;
    document.querySelector("#whatsapp-number").value = storeSettings.whatsappNumber;
    renderInventory();
    ui.status.textContent = "Saved to GitHub · Netlify deployment started";
    return true;
  } catch (error) {
    ui.status.textContent = "Could not save catalogue changes";
    ui.message.textContent = error.message;
    if (error.message.includes("another session")) setReady(false);
    return false;
  } finally {
    saving = false;
    setReady(ready);
  }
}

ui.addButton.addEventListener("click", () => openProductForm());
document.querySelector(".dialog-close").addEventListener("click", () => ui.dialog.close());
document.querySelector(".cancel-product").addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("click", (event) => {
  if (event.target === ui.dialog) ui.dialog.close();
});

ui.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  ui.formError.textContent = "";
  try {
    const { product, originalId, imageFile } = readProductForm();
    const nextProducts = originalId
      ? catalogue.map((item) => item.id === originalId ? product : item)
      : [...catalogue, product];
    let imageUpload = null;
    if (imageFile) {
      ui.saveButton.disabled = true;
      ui.status.textContent = "Preparing product image…";
      imageUpload = {
        productId: product.id,
        mimeType: imageFile.type,
        contentBase64: await fileToBase64(imageFile),
      };
    }
    const saved = await persistCatalogue(nextProducts, storeSettings, imageUpload);
    if (!saved) return;
    ui.dialog.close();
    showToast(originalId ? "Product updated and publishing." : "Product added and publishing.");
  } catch (error) {
    ui.formError.textContent = error.message;
  }
});

ui.list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !ready || saving) return;
  const row = button.closest(".inventory-row");
  const product = catalogue.find((item) => item.id === row?.dataset.id);
  if (!product) return;
  if (button.dataset.action === "edit") openProductForm(product);
  if (button.dataset.action === "delete" && window.confirm(`Remove "${product.name}" from the shared catalogue?`)) {
    const nextProducts = catalogue.filter((item) => item.id !== product.id);
    if (await persistCatalogue(nextProducts)) showToast("Product deleted and publishing.");
  }
});

ui.search.addEventListener("input", renderInventory);
ui.category.addEventListener("change", renderInventory);
ui.refreshButton.addEventListener("click", loadCatalogue);

ui.saveWhatsappButton.addEventListener("click", async () => {
  const phone = document.querySelector("#whatsapp-number").value.trim();
  if (!/^\d{8,15}$/.test(phone)) {
    ui.message.textContent = "Enter 8–15 digits, including your country code, with no +, spaces, or hyphens.";
    return;
  }
  if (await persistCatalogue(catalogue, { ...storeSettings, whatsappNumber: phone })) {
    showToast("WhatsApp number saved and publishing.");
  }
});

const logoutButton = document.querySelector(".admin-logout");
if (window.location.protocol !== "file:") {
  logoutButton.hidden = false;
  logoutButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/admin-logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("The sign-out request was rejected.");
      window.location.replace("/");
    } catch (error) {
      ui.message.textContent = `Could not sign out: ${error.message}`;
    }
  });
}

loadCatalogue();
