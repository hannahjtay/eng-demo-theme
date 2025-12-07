import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartUpdateEvent, CartAddEvent } from '@theme/events';
import { sectionRenderer, morphSection } from '@theme/section-renderer';

class GiftWithPurchaseComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.#initState();
    this.#cacheElements();
    this.#bindEvents();
    this.#updateComponentVisibility();
    this.#updateButtonStates();
    this.#updateProgressBar();
  }

  updatedCallback() {
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
   * Initialization
   * ------------------------------------------------------------------------- */

  #initState() {
    const d = this.dataset;

    this.cartThreshold = parseInt(d.cartThreshold || '0', 10);
    this.vipEnabled = d.vipEnabled === 'true';
    this.vipTag = d.vipTag || 'VIP';
    this.isVip = d.isVip === 'true';

    this.currentGiftVariantId = d.currentGiftVariantId
      ? parseInt(d.currentGiftVariantId, 10)
      : null;

    this.hasGiftInCart = d.hasGiftInCart === 'true';
    this.sectionId = d.sectionId || 'gift-with-purchase';
    this.isEditing = false;
    this.cartTotal = parseInt(d.cartTotal || '0', 10);
  }

  #cacheElements() {
    this.radioInputs = this.querySelectorAll('.gwp__product-radio');
    this.addButton = this.querySelector('.gwp__add-button');
    this.productContainers = this.querySelectorAll('.gwp__product');
    this.closeButton = this.querySelector('[data-gwp-close-button]');
    this.progressContainer = this.querySelector('[data-gwp-progress]');
    this.progressText = this.querySelector('[data-gwp-progress-text]');
    this.progressPercentage = this.querySelector('[data-gwp-progress-percentage]');
    this.progressFill = this.querySelector('[data-gwp-progress-fill]');
    this.progressMessage = this.querySelector('[data-gwp-progress-message]');
    this.productsSection = this.querySelector('[data-gwp-products]');
    this.actionsSection = this.querySelector('[data-gwp-actions]');
  }

  /* ---------------------------------------------------------------------------
   * Event binding
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
    this.radioInputs.forEach((radio) => {
      radio.removeEventListener('change', this.#handleSelectionChange);
      radio.addEventListener('change', this.#handleSelectionChange);
    });
  }

  #bindProductContainers() {
    this.productContainers.forEach((container) => {
      if (container._gwpClickHandler) {
        container.removeEventListener('click', container._gwpClickHandler);
      }

      const handler = (event) => {
        if (event.target.closest('button') || event.target.type === 'radio') return;

        const radio = container.querySelector('.gwp__product-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

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
    const selected = this.querySelector('.gwp__product-radio:checked');
    const selectedId = selected ? parseInt(selected.value, 10) : null;

    if (this.addButton) {
      const isDifferent = selectedId && selectedId !== this.currentGiftVariantId;

      this.addButton.disabled = !isDifferent;
      this.addButton.textContent =
        isDifferent && this.currentGiftVariantId
          ? this.addButton.dataset.changeText || 'Change gift'
          : this.addButton.dataset.originalText || 'Add gift';
    }

    this.productContainers.forEach((p) => {
      p.classList.toggle(
        'gwp__product--selected',
        parseInt(p.dataset.variantId, 10) === selectedId
      );
    });
  }

  #updateComponentVisibility() {
    this.classList.toggle('gwp-component--editing', this.isEditing);
    
    // Also update products/actions visibility when component visibility changes
    const meetsThreshold = this.cartTotal >= this.cartThreshold;
    this.#updateProductsVisibility(meetsThreshold);
  }

  #updateProgressBar() {
    if (this.isVip || !this.progressContainer) return;

    const meetsThreshold = this.cartTotal >= this.cartThreshold;
    const progress = Math.min((this.cartTotal / this.cartThreshold) * 100, 100);
    const remaining = Math.max(this.cartThreshold - this.cartTotal, 0);

    if (this.progressFill) {
      this.progressFill.style.setProperty('--progress', `${progress}%`);
    }

    if (this.progressPercentage) {
      this.progressPercentage.textContent = `${Math.round(progress)}%`;
    }

    if (this.progressText && this.progressContainer) {
      const remainingFormatted = this.#formatMoney(remaining);
      const remainingText = this.progressContainer.dataset.remainingText || '{{ amount }} remaining';
      this.progressText.textContent = remainingText.replace('{{ amount }}', remainingFormatted);
    }

    if (this.progressMessage && this.progressContainer) {
      if (meetsThreshold) {
        this.progressMessage.textContent =
          this.progressContainer.dataset.qualifiedText || 'You qualify for a free gift!';
      } else {
        const thresholdFormatted = this.#formatMoney(this.cartThreshold);
        const addMoreText = this.progressContainer.dataset.addMoreText || 'Add {{ threshold }} to qualify';
        this.progressMessage.textContent = addMoreText.replace('{{ threshold }}', thresholdFormatted);
      }
    }

    this.progressContainer.classList.toggle('gwp__progress--complete', meetsThreshold);

    // Show/hide products and actions based on threshold
    this.#updateProductsVisibility(meetsThreshold);
  }

  #updateProductsVisibility(meetsThreshold) {
    // VIP customers always see products/actions
    if (this.isVip) {
      if (this.productsSection) {
        this.productsSection.classList.remove('gwp__products--hidden');
      }
      if (this.actionsSection) {
        this.actionsSection.classList.remove('gwp__actions--hidden');
      }
      return;
    }

    // Non-VIP customers only see products/actions when threshold is met
    if (this.productsSection) {
      this.productsSection.classList.toggle('gwp__products--hidden', !meetsThreshold);
    }
    if (this.actionsSection) {
      this.actionsSection.classList.toggle('gwp__actions--hidden', !meetsThreshold);
    }
  }

  #formatMoney(cents) {
    // Simple money formatting - can be enhanced with Theme.moneyFormat if available
    const amount = (cents / 100).toFixed(2);
    return `$${amount}`;
  }

  /* ---------------------------------------------------------------------------
   * Event handlers
   * ------------------------------------------------------------------------- */

  #handleSelectionChange = () => this.#updateButtonStates();

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
  };

  #handleAddGift = async () => {
    const selected = this.querySelector('.gwp__product-radio:checked');
    if (!selected) return;

    const variantId = parseInt(selected.value, 10);

    await this.#removeAllGwpItems();
    await this.#addGiftToCart(variantId.toString());
  };

  /* ---------------------------------------------------------------------------
   * Cart logic
   * ------------------------------------------------------------------------- */

  async #syncWithCart() {
    try {
      const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');

      this.cartTotal = cart.total_price;
      const meetsThreshold = cart.total_price >= this.cartThreshold;
      const eligible = this.isVip || meetsThreshold;

      const gwpItems = cart.items.filter((i) => this.#isGwpItem(i));
      this.hasGiftInCart = gwpItems.length > 0;

      this.currentGiftVariantId = gwpItems[0]?.variant_id || null;

      this.#updateComponentVisibility();
      this.#updateProgressBar();

      if (!eligible && gwpItems.length > 0) {
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

  #getCartSectionIds() {
    const ids = new Set([this.sectionId]);

    document.querySelectorAll('cart-items-component, cart-summary').forEach((el) => {
      if (el.dataset.sectionId) ids.add(el.dataset.sectionId);
    });

    return [...ids];
  }

  async #removeAllGwpItems() {
    const cart = await this.#fetchJson(Theme.routes.cart_url + '.js');
    const gwpItems = cart.items.filter((i) => this.#isGwpItem(i));

    if (gwpItems.length === 0) return;

    const sectionIds = this.#getCartSectionIds();
    const sorted = [...gwpItems].sort(
      (a, b) => cart.items.indexOf(b) - cart.items.indexOf(a)
    );

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

      Object.entries(data.sections || {}).forEach(([id, html]) =>
        morphSection(id, html)
      );

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
        this.addButton.textContent =
          this.addButton.dataset.originalText || 'Add gift';
      }
    }
  }

  /* ---------------------------------------------------------------------------
   * Utilities
   * ------------------------------------------------------------------------- */

  async #refreshAllCartSections() {
    const ids = this.#getCartSectionIds();
    await Promise.all(
      ids.map((id) =>
        sectionRenderer.renderSection(id, { cache: false }).catch(() => {})
      )
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

  #delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

if (!customElements.get('gift-with-purchase-component')) {
  customElements.define('gift-with-purchase-component', GiftWithPurchaseComponent);
}
