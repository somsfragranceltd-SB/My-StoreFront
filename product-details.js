(() => {
  const dialog = document.querySelector(".product-details-dialog");
  const categoryLabels = new Map([
    ["perfumes", "Perfumes"],
    ["body-care", "Body care"],
    ["bath", "Bath & body"],
    ["skincare", "Skincare"],
  ]);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function formatPrice(price) {
    return `₦${new Intl.NumberFormat("en-NG").format(price)}`;
  }

  function imageUrl(image) {
    if (/^https:\/\/[^\s]+$/i.test(image)) return image;
    return `https://images.unsplash.com/${encodeURIComponent(image)}?auto=format&fit=crop&w=900&q=85`;
  }

  function showProduct(product) {
    const badge = product.badge
      ? `<span class="product-details-badge">${escapeHtml(product.badge)}</span>`
      : "";
    const oldPrice = product.oldPrice
      ? `<del>${formatPrice(product.oldPrice)}</del>`
      : "";
    const stockText = product.stock > 0
      ? `${product.stock <= 5 ? "Only a few left" : "In stock"}`
      : "Sold out";
    const addButton = product.stock > 0
      ? `<button class="product-details-add" type="button" data-product-id="${escapeHtml(product.id)}">Add to bag</button>`
      : '<button class="product-details-add" type="button" disabled>Sold out</button>';

    dialog.innerHTML = `
      <div class="product-details-content">
        <div class="product-details-photo">
          ${badge}
          <img src="${escapeHtml(imageUrl(product.image))}" alt="${escapeHtml(product.name)}">
        </div>
        <section class="product-details-info">
          <button class="product-details-close" type="button" aria-label="Close product details">×</button>
          <p class="product-details-category">${escapeHtml(categoryLabels.get(product.category) || "Beauty")}</p>
          <h2 id="product-details-title">${escapeHtml(product.name)}</h2>
          <p class="product-details-brand">${escapeHtml(product.brand)}</p>
          <p class="product-details-rating"><span aria-label="${product.rating} out of 5 stars">★★★★★</span> ${Number(product.rating).toFixed(1)} <span class="product-details-reviews">(${Number(product.reviews)} reviews)</span></p>
          <p class="product-details-description">${escapeHtml(product.description)}</p>
          <p class="product-details-price">${formatPrice(product.price)}${oldPrice}</p>
          <p class="product-details-stock${product.stock > 0 ? "" : " out-of-stock"}">${stockText}</p>
          ${addButton}
          <p class="product-details-status" role="status" aria-live="polite"></p>
        </section>
      </div>`;
    dialog.showModal();
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest(".product-details-close")) {
      dialog.close();
      return;
    }

    const button = event.target.closest(".product-details-add");
    if (!button || button.disabled) return;

    const status = dialog.querySelector(".product-details-status");
    if (window.SomsCart.add(button.dataset.productId)) {
      status.textContent = "Added to your bag.";
    } else {
      status.textContent = "This product could not be added. Please check its availability.";
    }
  });

  window.SomsProductDetails = { open: showProduct };
})();
