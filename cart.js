(() => {
const CART_ITEMS_KEY = "soms-fragrance-cart";
const CART_COUNT_KEY = "soms-fragrance-cart-count";
const cartDialog = document.querySelector(".cart-dialog");
const cartProducts = window.SOMS_PRODUCTS;
let cartItems = [];
let storeSettings = window.SOMS_STORE_SETTINGS || {};

cartDialog.innerHTML = `
  <div class="cart-content">
    <div class="cart-heading">
      <h2 id="cart-dialog-title">Your bag</h2>
      <button class="cart-close" type="button" aria-label="Close shopping bag">×</button>
    </div>
    <div class="cart-lines" aria-live="polite"></div>
    <div class="cart-footer">
      <p class="cart-subtotal"><span>Subtotal</span><strong class="cart-subtotal-value">₦0</strong></p>
      <a class="cart-checkout" href="#" target="_blank" rel="noopener noreferrer">Continue on WhatsApp</a>
      <p class="cart-note">Your order will be sent to Som's Beauty on WhatsApp for confirmation.</p>
      <p class="cart-status" role="status" aria-live="polite"></p>
    </div>
  </div>`;

const cartLines = cartDialog.querySelector(".cart-lines");
const cartStatus = cartDialog.querySelector(".cart-status");
const checkoutLink = cartDialog.querySelector(".cart-checkout");

function escapeCartHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatCartPrice(price) {
  return `₦${new Intl.NumberFormat("en-NG").format(price)}`;
}

function readCart() {
  try {
    const stored = window.localStorage.getItem(CART_ITEMS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved bag data is not a list.");
    return parsed.filter((item) =>
      item
      && typeof item.id === "string"
      && Number.isSafeInteger(item.quantity)
      && item.quantity > 0
    );
  } catch (error) {
    console.error("Could not load the saved shopping bag.", error);
    return [];
  }
}

function syncCartCount() {
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll(".bag-count").forEach((counter) => {
    counter.textContent = String(count);
  });
  document.querySelectorAll(".bag-button").forEach((button) => {
    button.setAttribute("aria-label", `Shopping bag, ${count} ${count === 1 ? "item" : "items"}`);
  });
  try {
    window.localStorage.setItem(CART_COUNT_KEY, String(count));
  } catch (error) {
    console.error("Could not update the shopping bag count.", error);
  }
}

function saveCart() {
  try {
    window.localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(cartItems));
    syncCartCount();
    return true;
  } catch (error) {
    cartStatus.textContent = `Could not save your bag: ${error.message}`;
    return false;
  }
}

function updateCheckout(subtotal, hasUnavailableItems) {
  const phone = storeSettings.whatsappNumber;
  const validPhone = typeof phone === "string" && /^\d{8,15}$/.test(phone);
  const ready = cartItems.length > 0 && !hasUnavailableItems && validPhone;
  checkoutLink.setAttribute("aria-disabled", String(!ready));
  checkoutLink.removeAttribute("href");
  if (!ready) {
    checkoutLink.setAttribute("tabindex", "-1");
    cartStatus.textContent = cartItems.length && !validPhone
      ? "WhatsApp checkout is not configured. Please contact the store."
      : cartItems.length && hasUnavailableItems
        ? "Remove unavailable items or adjust quantities before checkout."
        : "";
    return;
  }

  checkoutLink.setAttribute("tabindex", "0");
  cartStatus.textContent = "";
  const orderLines = cartItems.map((item) => {
    const product = cartProducts.find((entry) => entry.id === item.id);
    return `${product.name} x${item.quantity} — ${formatCartPrice(product.price * item.quantity)}`;
  });
  const message = [
    "Hello Som's Beauty, I would like to place this order:",
    "",
    ...orderLines,
    "",
    `Subtotal: ${formatCartPrice(subtotal)}`,
    "",
    "Please confirm availability and delivery details.",
  ].join("\n");
  checkoutLink.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function renderCart() {
  cartStatus.textContent = "";
  let subtotal = 0;
  let hasUnavailableItems = false;
  const lines = cartItems.map((item) => {
    const product = cartProducts.find((entry) => entry.id === item.id);
    const available = product && product.published !== false && product.stock >= item.quantity;
    if (!available) hasUnavailableItems = true;
    if (available) subtotal += product.price * item.quantity;
    const name = product ? product.name : "Product no longer available";
    const price = product ? formatCartPrice(product.price) : "";
    const lineTotal = available ? formatCartPrice(product.price * item.quantity) : "";
    const maxReached = !product || item.quantity >= product.stock;
    return `<article class="cart-line" data-id="${escapeCartHtml(item.id)}">
      <div>
        <h3 class="cart-line-name">${escapeCartHtml(name)}</h3>
        <p class="cart-line-price">${price}</p>
      </div>
      <span class="cart-line-total">${lineTotal}</span>
      <div class="cart-line-controls">
        <button type="button" data-cart-action="decrease" aria-label="Decrease quantity of ${escapeCartHtml(name)}">−</button>
        <span class="cart-line-quantity">${item.quantity}</span>
        <button type="button" data-cart-action="increase" aria-label="Increase quantity of ${escapeCartHtml(name)}" ${maxReached ? "disabled" : ""}>+</button>
        <button class="cart-line-remove" type="button" data-cart-action="remove">Remove</button>
      </div>
      ${product && product.stock < item.quantity ? `<p class="cart-unavailable">Only ${product.stock} currently in stock.</p>` : ""}
      ${!product || product.published === false ? '<p class="cart-unavailable">This product is no longer available.</p>' : ""}
    </article>`;
  });

  cartLines.innerHTML = lines.length ? lines.join("") : '<p class="cart-empty">Your bag is empty. Explore the collection and add something you love.</p>';
  cartDialog.querySelector(".cart-subtotal-value").textContent = formatCartPrice(subtotal);
  updateCheckout(subtotal, hasUnavailableItems);
  syncCartCount();
}

function updateWhatsAppLinks() {
  const phone = storeSettings.whatsappNumber;
  if (typeof phone !== "string" || !/^\d{8,15}$/.test(phone)) return;
  document.querySelectorAll(".whatsapp-link").forEach((link) => {
    link.href = `https://wa.me/${phone}`;
  });
}

function addToCart(productId) {
  const product = cartProducts.find((entry) => entry.id === productId);
  if (!product || product.published === false || product.stock < 1) {
    cartStatus.textContent = "This product is currently unavailable.";
    return false;
  }

  const item = cartItems.find((entry) => entry.id === productId);
  if (item) {
    if (item.quantity >= product.stock) {
      cartStatus.textContent = `Only ${product.stock} of this product are currently in stock.`;
      return false;
    }
    item.quantity += 1;
  } else {
    cartItems.push({ id: productId, quantity: 1 });
  }
  cartStatus.textContent = "";
  if (!saveCart()) return false;
  renderCart();
  return true;
}

document.querySelectorAll(".bag-button").forEach((button) => {
  button.addEventListener("click", () => {
    renderCart();
    cartDialog.showModal();
  });
});

cartDialog.querySelector(".cart-close").addEventListener("click", () => cartDialog.close());
cartDialog.addEventListener("click", (event) => {
  if (event.target === cartDialog) cartDialog.close();
  const button = event.target.closest("button[data-cart-action]");
  if (!button) return;
  const line = button.closest(".cart-line");
  const item = cartItems.find((entry) => entry.id === line?.dataset.id);
  if (!item) return;

  if (button.dataset.cartAction === "remove") {
    cartItems = cartItems.filter((entry) => entry.id !== item.id);
  } else if (button.dataset.cartAction === "decrease") {
    item.quantity -= 1;
    if (item.quantity === 0) cartItems = cartItems.filter((entry) => entry.id !== item.id);
  } else if (button.dataset.cartAction === "increase") {
    const product = cartProducts.find((entry) => entry.id === item.id);
    if (!product || item.quantity >= product.stock) return;
    item.quantity += 1;
  }

  if (saveCart()) renderCart();
});

window.addEventListener("storage", (event) => {
  if (event.key === CART_ITEMS_KEY) {
    cartItems = readCart();
    renderCart();
  }
});

cartItems = readCart();
updateWhatsAppLinks();
renderCart();
window.SomsCart = { add: addToCart, open: () => cartDialog.showModal() };
})();
