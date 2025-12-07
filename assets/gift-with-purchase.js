import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartUpdateEvent, CartAddEvent } from '@theme/events';
import { sectionRenderer, morphSection } from '@theme/section-renderer';

/**
 * A custom element that handles gift with purchase functionality.
 *
 * @extends {Component}
 */
class GiftWithPurchaseComponent extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.cartThreshold = parseInt(this.dataset.cartThreshold || '0', 10);
    this.vipEnabled = this.dataset.vipEnabled === 'true';
    this.vipTag = this.dataset.vipTag || 'VIP';
    this.isVip = this.dataset.isVip === 'true';
    this.currentGiftVariantId = this.dataset.currentGiftVariantId
      ? parseInt(this.dataset.currentGiftVariantId, 10)
      : null;
    this.hasGiftInCart = this.dataset.hasGiftInCart === 'true';
    this.sectionId = this.dataset.sectionId || 'gift-with-purchase';

    this.radioInputs = this.querySelectorAll('.gwp__product-radio');
    this.addButton = this.querySelector('.gwp__add-button');
    this.productContainers = this.querySelectorAll('.gwp__product');

    // Add change listeners to radio buttons
    this.radioInputs.forEach((radio) => {
      radio.addEventListener('change', this.#handleSelectionChange);
    });

    // Add click listeners to product containers
    this.productContainers.forEach((container) => {
      const handleContainerClick = (event) => {
        // Don't handle if clicking a button
        if (event.target.closest('button')) {
          return;
        }

        // Don't handle if clicking the radio directly (let native behavior work)
        if (event.target.type === 'radio') {
          return;
        }

        const radio = container.querySelector('.gwp__product-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      container._gwpClickHandler = handleContainerClick;
      container.addEventListener('click', handleContainerClick);
    });

    if (this.addButton) {
      this.addButton.addEventListener('click', this.#handleAddGift);
    }

    // Listen for "Edit gift" button clicks
    document.addEventListener('click', this.#handleEditGiftClick);

    // Listen for cart updates to check eligibility
    document.addEventListener('cart:update', this.#handleCartUpdate);

    this.#updateComponentVisibility();
    this.#updateButtonStates();
  }

  /**
   * Called when the element is re-rendered by the Section Rendering API.
   * Re-initializes event listeners after DOM morphing.
   */
  updatedCallback() {
    super.updatedCallback();

    // Re-query elements as they may have been replaced during morphing
    this.radioInputs = this.querySelectorAll('.gwp__product-radio');
    this.addButton = this.querySelector('.gwp__add-button');
    this.productContainers = this.querySelectorAll('.gwp__product');

    // Re-attach event listeners to radio buttons
    this.radioInputs.forEach((radio) => {
      radio.removeEventListener('change', this.#handleSelectionChange);
      radio.addEventListener('change', this.#handleSelectionChange);
    });

    // Re-attach event listeners to product containers
    this.productContainers.forEach((container) => {
      // Remove old handler if it exists
      if (container._gwpClickHandler) {
        container.removeEventListener('click', container._gwpClickHandler);
      }

      const handleContainerClick = (event) => {
        if (event.target.closest('button')) {
          return;
        }
        if (event.target.type === 'radio') {
          return;
        }

        const radio = container.querySelector('.gwp__product-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      container._gwpClickHandler = handleContainerClick;
      container.addEventListener('click', handleContainerClick);
    });

    if (this.addButton) {
      this.addButton.removeEventListener('click', this.#handleAddGift);
      this.addButton.addEventListener('click', this.#handleAddGift);
    }

    // Update states
    this.#updateButtonStates();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.radioInputs.forEach((radio) => {
      radio.removeEventListener('change', this.#handleSelectionChange);
    });

    // Clean up product container click handlers
    if (this.productContainers) {
      this.productContainers.forEach((container) => {
        if (container._gwpClickHandler) {
          container.removeEventListener('click', container._gwpClickHandler);
          delete container._gwpClickHandler;
        }
      });
    }

    if (this.addButton) {
      this.addButton.removeEventListener('click', this.#handleAddGift);
    }

    document.removeEventListener('click', this.#handleEditGiftClick);
    document.removeEventListener('cart:update', this.#handleCartUpdate);
  }

  /**
   * Handles "Edit gift" button clicks from cart items.
   * @param {MouseEvent} event - The click event.
   */
  #handleEditGiftClick = (event) => {
    const editButton = event.target.closest('[data-gwp-edit-button]');
    if (!editButton) return;

    event.preventDefault();

    // Show the GWP component
    this.classList.remove('gwp-component--hidden');
    this.hasGiftInCart = false;

    // Scroll to the component if needed
    this.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  /**
   * Handles radio button selection change.
   */
  #handleSelectionChange = () => {
    this.#updateButtonStates();
  };

  /**
   * Updates component visibility based on whether a gift is in cart.
   */
  #updateComponentVisibility() {
    const hasGift = this.hasGiftInCart && this.currentGiftVariantId !== null;
    if (hasGift) {
      this.classList.add('gwp-component--hidden');
    } else {
      this.classList.remove('gwp-component--hidden');
    }
  }

  /**
   * Updates button states based on selection.
   */
  #updateButtonStates() {
    const selectedRadio = this.querySelector('.gwp__product-radio:checked');
    const selectedVariantId = selectedRadio
      ? parseInt(selectedRadio.value, 10)
      : null;

    if (this.addButton) {
      if (selectedVariantId && selectedVariantId !== this.currentGiftVariantId) {
        this.addButton.disabled = false;
        // Update button text based on whether we're adding or changing
        if (this.currentGiftVariantId) {
          this.addButton.textContent = this.addButton.dataset.changeText || 'Change gift';
        } else {
          this.addButton.textContent = this.addButton.dataset.originalText || 'Add gift';
        }
      } else {
        this.addButton.disabled = true;
        this.addButton.textContent = this.addButton.dataset.originalText || 'Add gift';
      }
    }

    // Update visual selection state
    this.querySelectorAll('.gwp__product').forEach((product) => {
      const variantId = parseInt(product.dataset.variantId, 10);
      if (variantId === selectedVariantId) {
        product.classList.add('gwp__product--selected');
      } else {
        product.classList.remove('gwp__product--selected');
      }
    });
  }

  /**
   * Handles adding a gift to the cart.
   */
  #handleAddGift = async () => {
    const selectedRadio = this.querySelector('.gwp__product-radio:checked');
    if (!selectedRadio) return;

    const variantId = selectedRadio.value;
    const newVariantId = parseInt(variantId, 10);

    // Always check for and remove any existing GWP items before adding a new one
    const cartResponse = await fetch(`${Theme.routes.cart_url}.js`);
    const cart = await cartResponse.json();

    const sectionIds = this.#getCartSectionIds();

    // Find all GWP items in the cart
    const gwpItems = cart.items.filter((item) => this.#isGwpItem(item));

    // Remove all existing GWP items if any exist
    if (gwpItems.length > 0) {
      // Remove all GWP items sequentially
      // Note: We need to remove from highest index to lowest to avoid index shifting
      const sortedGwpItems = [...gwpItems].sort((a, b) => {
        const indexA = cart.items.indexOf(a);
        const indexB = cart.items.indexOf(b);
        return indexB - indexA; // Sort descending
      });

      for (const gwpItem of sortedGwpItems) {
        // Find the line number (1-based index in cart.items array)
        const lineNumber = cart.items.indexOf(gwpItem) + 1;

        const body = JSON.stringify({
          line: lineNumber,
          quantity: 0,
          sections: sectionIds.join(','),
          sections_url: window.location.pathname,
        });

        const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body }));
        const responseText = await response.text();
        const parsedResponse = JSON.parse(responseText);

        if (parsedResponse.errors) {
          console.error('Error removing GWP item:', parsedResponse.errors);
        } else {
          // Update cart items array after removal
          const updatedCartResponse = await fetch(`${Theme.routes.cart_url}.js`);
          const updatedCart = await updatedCartResponse.json();
          cart.items = updatedCart.items;
        }

        // Small delay between removals
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Wait for cart to fully update
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify removal by checking cart again
      const verifyCartResponse = await fetch(`${Theme.routes.cart_url}.js`);
      const verifyCart = await verifyCartResponse.json();
      const remainingGifts = verifyCart.items.filter((item) => this.#isGwpItem(item));

      // If any gifts remain, try removing them again
      if (remainingGifts.length > 0) {
        // Get fresh cart to get correct line numbers
        const freshCartResponse = await fetch(`${Theme.routes.cart_url}.js`);
        const freshCart = await freshCartResponse.json();
        
        // Sort descending to avoid index shifting
        const sortedRemaining = [...remainingGifts].sort((a, b) => {
          const indexA = freshCart.items.indexOf(a);
          const indexB = freshCart.items.indexOf(b);
          return indexB - indexA;
        });

        for (const remainingGift of sortedRemaining) {
          const lineNumber = freshCart.items.indexOf(remainingGift) + 1;
          const body = JSON.stringify({
            line: lineNumber,
            quantity: 0,
            sections: sectionIds.join(','),
            sections_url: window.location.pathname,
          });
          
          const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body }));
          const responseText = await response.text();
          const parsedResponse = JSON.parse(responseText);
          
          if (parsedResponse.errors) {
            console.error('Error removing remaining GWP item:', parsedResponse.errors);
          }
          
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Refresh sections after removal
      await this.#refreshAllCartSections();

      // Clear the current gift ID
      this.currentGiftVariantId = null;
      this.hasGiftInCart = false;
    }

    // Add new gift
    await this.#addGiftToCart(variantId);
  };

  /**
   * Checks if a cart item is a GWP item by examining its properties.
   * @param {Object} item - The cart item to check.
   * @returns {boolean} True if the item is a GWP item.
   */
  #isGwpItem(item) {
    if (!item.properties) return false;

    // Handle properties as object
    if (typeof item.properties === 'object' && !Array.isArray(item.properties)) {
      return item.properties._gwp === 'true';
    }

    // Handle properties as array (Shopify sometimes returns this format)
    if (Array.isArray(item.properties)) {
      const gwpProperty = item.properties.find((prop) => prop.name === '_gwp');
      return gwpProperty && gwpProperty.value === 'true';
    }

    return false;
  }

  /**
   * Gets all cart section IDs that need to be updated.
   * @returns {string[]}
   */
  #getCartSectionIds() {
    const sectionIds = new Set([this.sectionId]);

    // Find all cart-items-component sections
    document.querySelectorAll('cart-items-component').forEach((component) => {
      if (component instanceof HTMLElement && component.dataset.sectionId) {
        sectionIds.add(component.dataset.sectionId);
      }
    });

    // Find all cart-summary sections
    document.querySelectorAll('cart-summary').forEach((component) => {
      if (component instanceof HTMLElement && component.dataset.sectionId) {
        sectionIds.add(component.dataset.sectionId);
      }
    });

    return Array.from(sectionIds);
  }

  /**
   * Adds a gift product to the cart.
   * @param {string} variantId - The variant ID to add.
   */
  async #addGiftToCart(variantId) {
    if (this.addButton) {
      // Store original text if not already stored
      if (!this.addButton.dataset.originalText) {
        this.addButton.dataset.originalText = this.addButton.textContent;
      }
      this.addButton.disabled = true;
      this.addButton.textContent = 'Adding...';
    }

    try {
      const sectionIds = this.#getCartSectionIds();

      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');
      formData.append('properties[_gwp]', 'true');
      formData.append('sections', sectionIds.join(','));

      const fetchCfg = fetchConfig('javascript', { body: formData });

      const response = await fetch(Theme.routes.cart_add_url, {
        ...fetchCfg,
        headers: {
          ...fetchCfg.headers,
          Accept: 'application/json',
        },
      });

      const data = await response.json();

      if (data.status) {
        console.error('Error adding gift:', data.message);
        if (this.addButton) {
          this.addButton.disabled = false;
          this.addButton.textContent = this.addButton.dataset.originalText || 'Add gift';
        }
        return;
      }

      // Get updated cart to get item count
      const cartResponse = await fetch(`${Theme.routes.cart_url}.js`);
      const cart = await cartResponse.json();

      // Update all cart sections
      if (data.sections) {
        Object.entries(data.sections).forEach(([sectionId, html]) => {
          morphSection(sectionId, html);
        });
      }

      // Dispatch cart update event
      this.dispatchEvent(
        new CartAddEvent({}, this.sectionId, {
          source: 'gift-with-purchase-component',
          itemCount: cart.item_count,
          variantId: variantId,
          sections: data.sections,
        })
      );

      // Update state
      const newVariantId = parseInt(variantId, 10);
      this.currentGiftVariantId = newVariantId;
      this.hasGiftInCart = true;
      this.#updateComponentVisibility();
      this.#updateButtonStates();

      // Restore button text
      if (this.addButton) {
        const originalText = this.addButton.dataset.originalText || 'Add gift';
        this.addButton.textContent = originalText;
      }
    } catch (error) {
      console.error('Error adding gift to cart:', error);
      if (this.addButton) {
        this.addButton.disabled = false;
        this.addButton.textContent = this.addButton.dataset.originalText || 'Add gift';
      }
    }
  }

  /**
   * Refreshes all cart sections.
   */
  async #refreshAllCartSections() {
    try {
      const sectionIds = this.#getCartSectionIds();
      const sectionsToRender = sectionIds.map(async (id) => {
        try {
          await sectionRenderer.renderSection(id, { cache: false });
        } catch (error) {
          // Log but don't fail if a section doesn't exist
          console.warn(`Section ${id} not found or could not be rendered:`, error);
        }
      });
      await Promise.all(sectionsToRender);
    } catch (error) {
      console.error('Error refreshing cart sections:', error);
    }
  }

  /**
   * Handles cart update events to check eligibility and update component state.
   * @param {CartUpdateEvent} event - The cart update event.
   */
  #handleCartUpdate = async (event) => {
    // Don't handle our own events
    if (event.target === this) return;

    try {
      const cartResponse = await fetch(`${Theme.routes.cart_url}.js`);
      const cart = await cartResponse.json();

      const cartTotal = cart.total_price;
      const meetsThreshold = cartTotal >= this.cartThreshold;

      // Check VIP status (would need to be passed from server or checked differently)
      const isEligible = this.isVip || meetsThreshold;

      // Find all GWP items in the cart
      const gwpItems = cart.items.filter((item) => this.#isGwpItem(item));
      const hasGift = gwpItems.length > 0;
      this.hasGiftInCart = hasGift;

      if (hasGift) {
        const giftItem = gwpItems[0];
        if (giftItem) {
          this.currentGiftVariantId = giftItem.variant_id;
        }
      } else {
        this.currentGiftVariantId = null;
      }

      // Update component visibility
      this.#updateComponentVisibility();

      // If no longer eligible and there are GWP items in cart, remove them all
      if (!isEligible && gwpItems.length > 0) {
        
        // Get section IDs for removal
        const sectionIds = this.#getCartSectionIds();

        // Sort items in descending order to avoid index shifting
        const sortedGwpItems = [...gwpItems].sort((a, b) => {
          const indexA = cart.items.indexOf(a);
          const indexB = cart.items.indexOf(b);
          return indexB - indexA; // Sort descending
        });

        // Remove all GWP items
        for (const gwpItem of sortedGwpItems) {
          // Find the line number (1-based index in cart.items array)
          const lineNumber = cart.items.indexOf(gwpItem) + 1;

          const body = JSON.stringify({
            line: lineNumber,
            quantity: 0,
            sections: sectionIds.join(','),
            sections_url: window.location.pathname,
          });

          const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body }));
          const responseText = await response.text();
          const parsedResponse = JSON.parse(responseText);
          
          if (parsedResponse.errors) {
            console.error('Error removing GWP item:', parsedResponse.errors);
          } else {
            // Update sections from API response
            if (parsedResponse.sections) {
              Object.entries(parsedResponse.sections).forEach(([sectionId, html]) => {
                morphSection(sectionId, html);
              });
            }
            // Update cart items array after removal
            const updatedCartResponse = await fetch(`${Theme.routes.cart_url}.js`);
            const updatedCart = await updatedCartResponse.json();
            cart.items = updatedCart.items;
          }

          // Small delay between removals
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Wait for cart to fully update
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify removal
        const verifyCartResponse = await fetch(`${Theme.routes.cart_url}.js`);
        const verifyCart = await verifyCartResponse.json();
        const remainingGifts = verifyCart.items.filter((item) => this.#isGwpItem(item));

        if (remainingGifts.length > 0) {
          // Retry removal for any remaining items
          const sortedRemaining = [...remainingGifts].sort((a, b) => {
            const indexA = verifyCart.items.indexOf(a);
            const indexB = verifyCart.items.indexOf(b);
            return indexB - indexA;
          });

          for (const remainingGift of sortedRemaining) {
            const lineNumber = verifyCart.items.indexOf(remainingGift) + 1;
            const body = JSON.stringify({
              line: lineNumber,
              quantity: 0,
              sections: sectionIds.join(','),
              sections_url: window.location.pathname,
            });
            
            const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body }));
            const responseText = await response.text();
            const parsedResponse = JSON.parse(responseText);
            
            // Update sections from API response
            if (parsedResponse.sections) {
              Object.entries(parsedResponse.sections).forEach(([sectionId, html]) => {
                try {
                  morphSection(sectionId, html);
                } catch (error) {
                  console.warn(`Could not morph section ${sectionId}:`, error);
                }
              });
            }
            
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        // Update state
        this.currentGiftVariantId = null;
        this.hasGiftInCart = false;
        this.#updateComponentVisibility();
      }
    } catch (error) {
      console.error('Error handling cart update:', error);
    }
  };
}

if (!customElements.get('gift-with-purchase-component')) {
  customElements.define('gift-with-purchase-component', GiftWithPurchaseComponent);
}

