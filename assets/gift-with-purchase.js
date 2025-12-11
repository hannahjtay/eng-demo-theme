import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartUpdateEvent, CartAddEvent } from '@theme/events';
import { sectionRenderer, morphSection } from '@theme/section-renderer';

/**
 * GiftWithPurchaseComponent
 *
 * Responsibilities:
 *  - Manage the Gift-with-Purchase (GWP) UI: selection, add/change/cancel,
 *    progress bar and visibility based on cart totals and thresholds.
 *  - Handle VIP gift behavior which can be independent of regular GWP enablement:
 *    auto-add/remove VIP product when VIP customer has regular products in cart.
 *  - Keep component state in sync with the store cart (via Theme cart JSON endpoints)
 *  - Dispatch cart events so other parts of the app can react.
 */

class GiftWithPurchaseComponent extends Component {

  async connectedCallback() {
    // Call base class connected callback (keeps upstream behavior)
    super.connectedCallback();

    this.#initState();
    this.#cacheElements();

    this.#bindEvents();

    this.#updateComponentVisibility();
    this.#updateButtonStates();
    this.#updateProgressBar();

    await this.#delay(100);
    await this.#handleVipGiftLogic();
  }

  updatedCallback() {
    // When the host signals it was updated (section re-render), refresh cached nodes and events
    super.updatedCallback();
    this.#cacheElements();
    this.#bindElementEvents();
    this.#updateButtonStates();
    this.#updateProgressBar();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unbindEvents();
  }

  /* ---------------------------------------------------------------------------
   * State & DOM caching
   * ------------------------------------------------------------------------- */

  #initState() {
    const data = this.dataset || {};

    this.gwpEnabled = data.gwpEnabled === 'true';
    this.cartThreshold = parseInt(data.cartThreshold || '0', 10);

    this.currentGiftVariantId = data.currentGiftVariantId
      ? parseInt(data.currentGiftVariantId, 10)
      : null;

    this.hasGiftInCart = data.hasGiftInCart === 'true';
    this.sectionId = data.sectionId || 'gift-with-purchase';
    this.isEditing = false;
    this.cartTotal = parseInt(data.cartTotal || '0', 10);

    // VIP state
    this.vipEnabled = data.vipEnabled === 'true';
    this.isVipCustomer = data.isVipCustomer === 'true';
    this.vipProductVariantId = data.vipProductVariantId
      ? parseInt(data.vipProductVariantId, 10)
      : null;
    this.hasVipGiftInCart = data.hasVipGiftInCart === 'true';
  }

  #cacheElements() {
    this.radioInputs = Array.from(this.querySelectorAll('.gwp__product-radio') || []);

    this.addButton = this.querySelector('.gwp__add-button');

    this.productContainers = Array.from(this.querySelectorAll('.gwp__product') || []);

    this.closeButton = this.querySelector('[data-gwp-close-button]');
    this.progressContainer = this.querySelector('[data-gwp-progress]');
    this.progressText = this.querySelector('[data-gwp-progress-text]');
    this.progressPercentage = this.querySelector('[data-gwp-progress-percentage]');
    this.progressFill = this.querySelector('[data-gwp-progress-fill]');
    this.productsSection = this.querySelector('[data-gwp-products]');
    this.actionsSection = this.querySelector('[data-gwp-actions]');
  }


  /* ---------------------------------------------------------------------------
   * Event binding / unbinding
   * ------------------------------------------------------------------------- */

  #bindEvents() {
    this.#bindElementEvents();

    document.addEventListener('click', this.#handleEditGiftClick);
    document.addEventListener('cart:update', this.#handleCartUpdate);
  }

  #bindElementEvents() {
    this.#bindRadioEvents();
    this.#bindProductContainers();
    this.#bindAddButton();
    this.#bindCloseButton();
  }

  #unbindEvents() {
    this.radioInputs?.forEach((r) =>
      r.removeEventListener('change', this.#handleSelectionChange)
    );

    this.productContainers?.forEach((c) => {
      if (c._gwpClickHandler) {
        c.removeEventListener('click', c._gwpClickHandler);
        delete c._gwpClickHandler;
      }
    });

    this.addButton?.removeEventListener('click', this.#handleAddGift);
    this.closeButton?.removeEventListener('click', this.#handleClose);

    document.removeEventListener('click', this.#handleEditGiftClick);
    document.removeEventListener('cart:update', this.#handleCartUpdate);
  }

  #bindRadioEvents() {
    this.radioInputs?.forEach((radio) => {
      radio.removeEventListener('change', this.#handleSelectionChange);
      radio.addEventListener('change', this.#handleSelectionChange);
    });
  }

  #bindProductContainers() {
    this.productContainers?.forEach((container) => {
      // Remove previously bound handler if present
      if (container._gwpClickHandler) {
        container.removeEventListener('click', container._gwpClickHandler);
      }

      const handler = (event) => {
        // Ignore clicks on real form controls inside the card
        if (event.target.closest('button') || event.target.type === 'radio') return;

        const radio = container.querySelector('.gwp__product-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          // Trigger change event to reuse existing update logic
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // Cache the handler on the element so it can be removed later
      container._gwpClickHandler = handler;
      container.addEventListener('click', handler);
    });
  }

  #bindAddButton() {
    if (!this.addButton) return;
    this.addButton.removeEventListener('click', this.#handleAddGift);
    this.addButton.addEventListener('click', this.#handleAddGift);
  }

  #bindCloseButton() {
    if (!this.closeButton) return;
    this.closeButton.removeEventListener('click', this.#handleClose);
    this.closeButton.addEventListener('click', this.#handleClose);
  }

  /* ---------------------------------------------------------------------------
   * UI helpers
   * ------------------------------------------------------------------------- */

  #updateButtonStates() {
    if (!this.gwpEnabled) return;

    const selected = this.querySelector('.gwp__product-radio:checked');
    const selectedId = selected ? parseInt(selected.value, 10) : null;

    if (this.addButton) {
      // If the selected variant differs from the one currently in cart, allow editing
      const isDifferent = selectedId && selectedId !== this.currentGiftVariantId;

      this.addButton.disabled = !isDifferent;
      this.addButton.textContent = isDifferent && this.currentGiftVariantId
        ? this.addButton.dataset.changeText || 'Change gift'
        : this.addButton.dataset.originalText || 'Add gift';
    }

    // Toggle selection visuals on product containers
    this.productContainers?.forEach((p) => {
      p.classList.toggle(
        'gwp__product--selected',
        parseInt(p.dataset.variantId, 10) === selectedId
      );
    });
  }

  #updateComponentVisibility() {
    this.classList.toggle('gwp-component--editing', this.isEditing);

    // If both features are disabled, hide everything
    if (!this.gwpEnabled && !this.vipEnabled) {
      this.style.display = 'none';
      return;
    } else {
      this.style.display = '';
    }

    if (this.gwpEnabled && this.cartThreshold) {
      const meetsThreshold = this.cartTotal >= this.cartThreshold;
      this.#updateProductsVisibility(meetsThreshold);
    }
  }

  #updateProgressBar() {
    if (!this.progressContainer) return;
    if (!this.gwpEnabled) return;

    const meetsThreshold = this.cartTotal >= this.cartThreshold;
    const progress = Math.min((this.cartTotal / Math.max(this.cartThreshold, 1)) * 100, 100);
    const remaining = Math.max(this.cartThreshold - this.cartTotal, 0);

    if (this.progressFill) {
      this.progressFill.style.setProperty('--progress', `${progress}%`);
    }

    if (this.progressPercentage) {
      this.progressPercentage.textContent = `${Math.round(progress)}%`;
    }

    if (this.progressText) {
      this.progressText.classList.toggle('gwp__progress-text--hidden', meetsThreshold);
      if (!meetsThreshold) {
        const remainingFormatted = this.#formatMoney(remaining);
        const remainingText = this.progressContainer.dataset.remainingText || '{{ amount }} remaining';
        this.progressText.textContent = remainingText.replace('{{ amount }}', remainingFormatted);
      }
    }

    this.progressContainer.classList.toggle('gwp__progress--complete', meetsThreshold);

    // Sync products/actions visibility with threshold state
    this.#updateProductsVisibility(meetsThreshold);
  }

  #updateProductsVisibility(meetsThreshold) {
    if (!this.gwpEnabled) return;

    const shouldHide = !meetsThreshold || (this.hasGiftInCart && !this.isEditing);

    if (this.productsSection) {
      this.productsSection.classList.toggle('gwp__products--hidden', shouldHide);
    }
    if (this.actionsSection) {
      this.actionsSection.classList.toggle('gwp__actions--hidden', shouldHide);
    }
  }

  #formatMoney(cents) {
    const amount = (cents / 100).toFixed(2);
    return `$${amount}`;
  }

  /* ---------------------------------------------------------------------------
   * Event handlers (bound as instance properties to preserve `this`)
   * ------------------------------------------------------------------------- */

  #handleSelectionChange = () => {
    // When the user picks a different gift, update the add button.
    this.#updateButtonStates();
  };

  #handleEditGiftClick = (event) => {
    const btn = event.target.closest('[data-gwp-edit-button]');
    if (!btn) return;

    event.preventDefault();
    this.isEditing = true;
    this.#updateComponentVisibility();

    this.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  #handleClose = () => {
    this.isEditing = false;
    this.#updateComponentVisibility();
  };

  #handleCartUpdate = async (event) => {
    if (event.target === this) return;
    await this.#syncWithCart();
    await this.#handleVipGiftLogic();
  };

  #handleAddGift = async () => {
    const selected = this.querySelector('.gwp__product-radio:checked');
    if (!selected) return;

    const variantId = parseInt(selected.value, 10);

    // Remove any existing GWP items, then add the selected gift
    await this.#removeAllGwpItems();
    await this.#addGiftToCart(variantId.toString());
  };

  /* ---------------------------------------------------------------------------
   * Cart syncing & utilities
   * ------------------------------------------------------------------------- */

  /**
   * #syncWithCart
   * Fetch the live cart JSON, update internal state flags and UI accordingly.
   */

  async #syncWithCart() {
    try {
      const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');

      this.cartTotal = cart.total_price;

      const meetsThreshold = this.gwpEnabled ? cart.total_price >= this.cartThreshold : false;

      const gwpItems = cart.items.filter((i) => this.#isGwpItem(i));
      this.hasGiftInCart = gwpItems.length > 0;
      this.currentGiftVariantId = gwpItems[0]?.variant_id || null;

      const vipGiftItems = cart.items.filter((i) => this.#isVipGiftItem(i));
      this.hasVipGiftInCart = vipGiftItems.length > 0;

      this.#updateComponentVisibility();

      if (this.gwpEnabled) {
        this.#updateProgressBar();
      }

      // If threshold no longer met, remove existing GWP items
      if (this.gwpEnabled && !meetsThreshold && gwpItems.length > 0) {
        await this.#removeAllGwpItems();
        this.currentGiftVariantId = null;
        this.hasGiftInCart = false;
        this.#updateComponentVisibility();
      }
    } catch (err) {
      console.error('Error syncing with cart:', err);
    }
  }

  #isGwpItem(item) {
    if (!item.properties) return false;

    if (Array.isArray(item.properties)) {
      return item.properties.some((p) => p.name === '_gwp' && p.value === 'true');
    }

    return item.properties._gwp === 'true';
  }

  #isVipGiftItem(item) {
    if (!item.properties) return false;

    if (Array.isArray(item.properties)) {
      return item.properties.some((p) => p.name === '_vip_gift' && p.value === 'true');
    }

    return item.properties._vip_gift === 'true';
  }

  #hasRegularProducts(cart) {
    return cart.items.some(
      (item) => !this.#isGwpItem(item) && !this.#isVipGiftItem(item)
    );
  }

  /**
   * #getCartSectionIds
   * Get section IDs from cart so only relevant sections of the UI are updated.
   */
  #getCartSectionIds() {
    const ids = new Set([this.sectionId]);

    document.querySelectorAll('cart-items-component, cart-summary').forEach((el) => {
      if (el.dataset && el.dataset.sectionId) ids.add(el.dataset.sectionId);
    });

    return [...ids];
  }

  async #removeAllGwpItems() {
    const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');
    const gwpItems = cart.items.filter((i) => this.#isGwpItem(i));

    if (gwpItems.length === 0) return;

    const sectionIds = this.#getCartSectionIds();
    const sorted = [...gwpItems].sort((a, b) => cart.items.indexOf(b) - cart.items.indexOf(a));

    for (const item of sorted) {
      const line = cart.items.indexOf(item) + 1;
      await this.#postJson(Theme.routes.cart_change_url, {
        line,
        quantity: 0,
        sections: sectionIds.join(','),
        sections_url: window.location.pathname,
      });
      await this.#delay(100);
    }

    await this.#delay(300);
    await this.#refreshAllCartSections();
  }

  async #removeVipGift() {
    const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');
    const vipGiftItems = cart.items.filter((i) => this.#isVipGiftItem(i));

    if (vipGiftItems.length === 0) return;

    const sectionIds = this.#getCartSectionIds();
    const sorted = [...vipGiftItems].sort((a, b) => cart.items.indexOf(b) - cart.items.indexOf(a));

    for (const item of sorted) {
      const line = cart.items.indexOf(item) + 1;
      await this.#postJson(Theme.routes.cart_change_url, {
        line,
        quantity: 0,
        sections: sectionIds.join(','),
        sections_url: window.location.pathname,
      });
      await this.#delay(100);
    }

    this.hasVipGiftInCart = false;
    await this.#delay(300);
    await this.#refreshAllCartSections();
  }

  /**
   * #addGiftToCart
   * Add the selected GWP variant to cart. Handles UI state for the Add button,
   */
  async #addGiftToCart(variantId) {
    if (this.addButton) {
      this.addButton.dataset.originalText ??= this.addButton.textContent;
      this.addButton.disabled = true;
      this.addButton.textContent = 'Adding...';
    }

    try {
      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');
      formData.append('properties[_gwp]', 'true');
      formData.append('sections', this.#getCartSectionIds().join(','));

      const cfg = fetchConfig('javascript', { body: formData });
      const response = await fetch(Theme.routes.cart_add_url, {
        ...cfg,
        headers: { ...cfg.headers, Accept: 'application/json' },
      });

      const data = await response.json();
      if (data.status) throw new Error(data.message);

      Object.entries(data.sections || {}).forEach(([id, html]) => morphSection(id, html));

      const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');

      this.dispatchEvent(
        new CartAddEvent({}, this.sectionId, {
          source: 'gift-with-purchase-component',
          itemCount: cart.item_count,
          variantId,
          sections: data.sections,
        })
      );

      this.currentGiftVariantId = parseInt(variantId, 10);
      this.hasGiftInCart = true;
      this.isEditing = false;

      this.#updateComponentVisibility();
      this.#updateButtonStates();
    } catch (err) {
      console.error('Error adding gift:', err);
    } finally {
      if (this.addButton) {
        this.addButton.disabled = false;
        this.addButton.textContent = this.addButton.dataset.originalText || 'Add gift';
      }
    }
  }

  async #addVipGiftToCart() {
    if (!this.vipProductVariantId) {
      console.warn('VIP gift: No VIP product variant ID set');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('id', this.vipProductVariantId.toString());
      formData.append('quantity', '1');
      formData.append('properties[_vip_gift]', 'true');
      formData.append('properties[VIP Gift]', 'VIP Gift');
      formData.append('sections', this.#getCartSectionIds().join(','));

      const cfg = fetchConfig('javascript', { body: formData });
      const response = await fetch(Theme.routes.cart_add_url, {
        ...cfg,
        headers: { ...cfg.headers, Accept: 'application/json' },
      });

      const data = await response.json();

      if (data.status) {
        throw new Error(data.message || 'Failed to add VIP gift');
      }

      Object.entries(data.sections || {}).forEach(([id, html]) => morphSection(id, html));

      const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');

      this.dispatchEvent(
        new CartAddEvent({}, this.sectionId, {
          source: 'gift-with-purchase-component',
          itemCount: cart.item_count,
          variantId: this.vipProductVariantId.toString(),
          sections: data.sections,
        })
      );

      this.hasVipGiftInCart = true;
      await this.#syncWithCart();
    } catch (err) {
      console.error('Error adding VIP gift:', err);
    }
  }

  async #handleVipGiftLogic() {
    if (!this.vipEnabled) {
      return;
    }

    if (!this.isVipCustomer) {
      return;
    }

    if (!this.vipProductVariantId) {
      console.warn('VIP gift: VIP enabled and customer is VIP, but no VIP product variant ID set');
      return;
    }

    try {
      const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');
      const hasRegularProducts = this.#hasRegularProducts(cart);
      const hasVipGift = cart.items.some((item) => this.#isVipGiftItem(item));

      if (hasRegularProducts) {
        if (!hasVipGift) {
          await this.#addVipGiftToCart();
        }
      } else {
        if (hasVipGift) {
          await this.#removeVipGift();
        }
      }
    } catch (err) {
      console.error('Error handling VIP gift logic:', err);
    }
  }

  /* ---------------------------------------------------------------------------
   * Utilities: server communication & helpers
   * ------------------------------------------------------------------------- */

  async #refreshAllCartSections() {
    const ids = this.#getCartSectionIds();
    await Promise.all(
      ids
        .filter((id) => id)
        .map((id) => sectionRenderer.renderSection(id, { cache: false }).catch(() => {}))
    );
  }

  async #fetchJson(url) {
    const res = await fetch(url);
    return res.json();
  }

  async #postJson(url, body) {
    const res = await fetch(url, fetchConfig('json', { body: JSON.stringify(body) }));
    return res.json();
  }

  // Wait N milliseconds. Used to space out cart-change requests and allow the theme/server to reach a consistent state.
  #delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

if (!customElements.get('gift-with-purchase-component')) {
  customElements.define('gift-with-purchase-component', GiftWithPurchaseComponent);
}
