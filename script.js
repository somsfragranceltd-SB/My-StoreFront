const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-nav");
const searchButton = document.querySelector(".search-button");
const searchPanel = document.querySelector(".search-panel");
const searchForm = document.querySelector(".search-panel");
const newsletterForm = document.querySelector(".newsletter-form");
const newsletterMessage = document.querySelector(".form-message");
const bagCount = document.querySelector(".bag-count");
const bagButton = document.querySelector(".bag-button");
const cartToast = document.querySelector(".cart-toast");
const backToTop = document.querySelector(".back-to-top");
const adminAccessButton = document.querySelector(".admin-access-trigger");
const adminAccessDialog = document.querySelector(".admin-access-dialog");
const adminAccessForm = document.querySelector(".admin-access-form");
const adminAccessError = document.querySelector(".admin-access-error");
const storedCartCount = Number(window.localStorage.getItem("soms-fragrance-cart-count") || 0);
let cartItems = Number.isFinite(storedCartCount) && storedCartCount >= 0 ? Math.floor(storedCartCount) : 0;
bagCount.textContent = String(cartItems);
bagButton.setAttribute("aria-label", `Shopping bag, ${cartItems} ${cartItems === 1 ? "item" : "items"}`);
const homeCategories = new Map([
  ["perfumes", "Perfume"],
  ["body-care", "Body care"],
  ["bath", "Bath & body"],
  ["skincare", "Skincare"],
]);
let homeProducts = window.SOMS_PRODUCTS;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function homeImageUrl(image) {
  if (/^https:\/\/[^\s]+$/i.test(image)) return image;
  return `https://images.unsplash.com/${encodeURIComponent(image)}?auto=format&fit=crop&w=600&q=80`;
}

function formatHomePrice(price) {
  return `₦${new Intl.NumberFormat("en-NG").format(price)}`;
}

function renderHomeProducts() {
  const container = document.querySelector(".product-list");
  const publishedProducts = homeProducts
    .filter((product) => product.published !== false)
    .sort((a, b) => a.featured - b.featured);
  const featuredProducts = publishedProducts
    .filter((product) => product.featuredOnHome ?? product.featured <= 4);
  const visibleProducts = (featuredProducts.length ? featuredProducts : publishedProducts).slice(0, 4);
  container.innerHTML = `${container.querySelector(".search-results").outerHTML}${visibleProducts.map((product) => {
    const badge = product.badge ? `<span class="product-tag">${escapeHtml(product.badge)}</span>` : "";
    const oldPrice = product.oldPrice ? `<del>${formatHomePrice(product.oldPrice)}</del>` : "";
    const stockText = product.stock > 0 ? `<button class="cart-button" type="button" data-product-id="${escapeHtml(product.id)}" data-product="${escapeHtml(product.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2 10h10l2-7H7M10 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg><span>Add to Cart</span></button>` : '<button class="cart-button" type="button" disabled>Sold out</button>';
    return `<article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <a class="product-image" href="shop.html?category=${encodeURIComponent(product.category)}" aria-label="View details for ${escapeHtml(product.name)}">
        <img src="${escapeHtml(homeImageUrl(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy">
        ${badge}<span class="quick-view">Discover <span aria-hidden="true">↗</span></span>
      </a>
      <div class="home-product-category">${escapeHtml(homeCategories.get(product.category) || "Beauty")}</div>
      <div class="product-meta"><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.brand)}</p></div><span class="product-price">${formatHomePrice(product.price)}${oldPrice}</span></div>
      <p class="rating"><span>★★★★★</span> (${Number(product.rating).toFixed(1)})</p>
      ${stockText}
    </article>`;
  }).join("")}`;
}
renderHomeProducts();
window.addEventListener("storage", (event) => {
  if (event.key !== "soms-fragrance-cart-count") return;
  const updatedCount = Number(event.newValue || 0);
  if (!Number.isFinite(updatedCount) || updatedCount < 0) return;
  cartItems = Math.floor(updatedCount);
  bagCount.textContent = String(cartItems);
  bagButton.setAttribute("aria-label", `Shopping bag, ${cartItems} ${cartItems === 1 ? "item" : "items"}`);
});
let toastTimeout;
let lastAddedButton;

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

searchButton.addEventListener("click", () => {
  navigation.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open navigation");
  const isOpen = searchPanel.classList.toggle("is-open");
  if (isOpen) document.querySelector("#site-search").focus();
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.querySelector("#site-search").value.trim();
  window.location.href = `shop.html${query ? `?q=${encodeURIComponent(query)}` : ""}`;
});

document.querySelector(".product-list").addEventListener("click", (event) => {
  const button = event.target.closest(".cart-button");
  if (button) {
    if (!window.SomsCart.add(button.dataset.productId)) return;
    if (lastAddedButton) {
      lastAddedButton.classList.remove("is-added");
      lastAddedButton.querySelector("span").textContent = "Add to Cart";
    }
    lastAddedButton = button;
    cartToast.textContent = `${button.dataset.product} added to your bag`;
    cartToast.classList.add("is-visible");
    button.classList.add("is-added");
    button.querySelector("span").textContent = "Added";
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      cartToast.classList.remove("is-visible");
      button.classList.remove("is-added");
      button.querySelector("span").textContent = "Add to Cart";
      lastAddedButton = null;
    }, 2200);
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card || event.target.closest("button")) return;
  event.preventDefault();
  const product = homeProducts.find((item) => item.id === card.dataset.productId);
  if (product) window.SomsProductDetails.open(product);
});

newsletterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!newsletterForm.reportValidity()) return;
  newsletterMessage.textContent = "Thanks for your interest. Newsletter signup is not connected yet.";
  newsletterForm.reset();
});

window.addEventListener("scroll", () => {
  backToTop.classList.toggle("is-visible", window.scrollY > 420);
}, { passive: true });

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function openAdminAccess() {
  adminAccessError.textContent = "";
  adminAccessForm.reset();
  adminAccessDialog.showModal();
  document.querySelector("#admin-password").focus();
}

adminAccessButton.addEventListener("click", openAdminAccess);
document.querySelector(".admin-access-cancel").addEventListener("click", () => adminAccessDialog.close());

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminAccessError.textContent = "";
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
    adminAccessError.textContent = "Secure admin access is available on the deployed Netlify site.";
    return;
  }
  const submitButton = adminAccessForm.querySelector(".admin-access-submit");
  submitButton.disabled = true;
  try {
    const response = await fetch("/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password: document.querySelector("#admin-password").value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not verify the password.");
    window.location.assign("/admin.html");
  } catch (error) {
    adminAccessError.textContent = error.message || "Could not connect to secure admin access.";
  } finally {
    submitButton.disabled = false;
  }
});

if (new URLSearchParams(window.location.search).has("admin")) openAdminAccess();
