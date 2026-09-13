/* HUQA shop — cart, age gate, navigation and the variant picker.
   Plain browser JavaScript: no build step, nothing to compile. */
(function () {
  'use strict';

  var CART_KEY = 'huqa.cart.v1';
  var AGE_KEY = 'huqa.age.v1';
  var config = window.HUQA || {base: '', deliveryFee: 0, freeDeliveryOver: 0};
  var catalogue = {products: {}, bundles: {}};

  try {
    var raw = document.getElementById('catalogue');
    if (raw) catalogue = JSON.parse(raw.textContent) || catalogue;
  } catch (e) { /* an empty catalogue still renders the page */ }

  function money(value) { return '$' + (Math.round(value * 100) / 100).toFixed(2); }

  // ---------------------------------------------------------------- storage
  function readCart() {
    try {
      var stored = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(stored)) return [];
      return stored.filter(function (line) {
        if (!line || typeof line.quantity !== 'number' || line.quantity < 1 || line.quantity > 99) return false;
        return line.kind === 'bundle' ? typeof line.bundleId === 'string'
          : line.kind === 'product' && typeof line.productId === 'string' && typeof line.variantId === 'string';
      });
    } catch (e) { return []; }
  }

  function writeCart(lines) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch (e) { /* private mode */ }
    render();
  }

  function keyOf(line) {
    return line.kind === 'bundle' ? 'b:' + line.bundleId : 'p:' + line.productId + ':' + line.variantId;
  }

  /* Lines whose product or offer has left the catalogue simply stop resolving,
     so they never reach the totals or the order that gets submitted. */
  function resolve() {
    return readCart().map(function (line) {
      if (line.kind === 'bundle') {
        var bundle = catalogue.bundles[line.bundleId];
        if (!bundle) return null;
        return {
          line: line, key: keyOf(line), name: bundle.name, detail: bundle.detail,
          image: bundle.image, href: bundle.href, contents: bundle.contents || [],
          available: bundle.available, unit: bundle.price,
          total: Math.round(bundle.price * line.quantity * 100) / 100
        };
      }
      var product = catalogue.products[line.productId];
      var variant = product && product.variants[line.variantId];
      if (!product || !variant) return null;
      return {
        line: line, key: keyOf(line), name: product.name, detail: variant.label,
        image: product.image, href: product.href, contents: [],
        available: variant.available, unit: product.price,
        total: Math.round(product.price * line.quantity * 100) / 100
      };
    }).filter(Boolean);
  }

  function add(line) {
    var lines = readCart();
    var key = keyOf(line);
    var found = false;
    lines = lines.map(function (existing) {
      if (keyOf(existing) !== key) return existing;
      found = true;
      existing.quantity = Math.min(99, existing.quantity + line.quantity);
      return existing;
    });
    if (!found) lines.push(line);
    writeCart(lines);
    openCart();
  }

  function setQuantity(key, quantity) {
    var lines = readCart().map(function (line) {
      if (keyOf(line) !== key) return line;
      line.quantity = Math.min(99, quantity);
      return line;
    }).filter(function (line) { return line.quantity > 0; });
    writeCart(lines);
  }

  function removeLine(key) {
    writeCart(readCart().filter(function (line) { return keyOf(line) !== key; }));
  }

  // ---------------------------------------------------------------- rendering
  function totals(lines) {
    var subtotal = Math.round(lines.reduce(function (sum, l) { return sum + l.total; }, 0) * 100) / 100;
    var free = config.freeDeliveryOver > 0 && subtotal >= config.freeDeliveryOver;
    var delivery = lines.length === 0 ? 0 : (free ? 0 : config.deliveryFee);
    return {subtotal: subtotal, delivery: delivery, total: Math.round((subtotal + delivery) * 100) / 100};
  }

  function lineNode(entry) {
    var row = document.createElement('div');
    row.className = 'cart-line' + (entry.available ? '' : ' cart-line-out');

    if (entry.image) {
      var img = document.createElement('img');
      img.src = entry.image; img.alt = ''; img.loading = 'lazy';
      row.appendChild(img);
    } else {
      var blank = document.createElement('span');
      blank.className = 'cart-line-blank';
      row.appendChild(blank);
    }

    var body = document.createElement('div');
    body.className = 'cart-line-body';

    var link = document.createElement('a');
    link.href = entry.href;
    link.appendChild(Object.assign(document.createElement('strong'), {textContent: entry.name}));
    body.appendChild(link);

    if (entry.detail) body.appendChild(Object.assign(document.createElement('small'), {textContent: entry.detail}));
    entry.contents.forEach(function (text) {
      var small = document.createElement('small');
      small.className = 'cart-line-content';
      small.textContent = text;
      body.appendChild(small);
    });
    if (!entry.available) {
      var warn = document.createElement('small');
      warn.className = 'cart-line-warning';
      warn.textContent = 'Out of stock — remove to continue';
      body.appendChild(warn);
    }

    var foot = document.createElement('div');
    foot.className = 'cart-line-foot';

    var qty = document.createElement('div');
    qty.className = 'qty';
    var minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.setAttribute('aria-label', 'Decrease quantity');
    minus.addEventListener('click', function () { setQuantity(entry.key, entry.line.quantity - 1); });
    var count = document.createElement('span');
    count.textContent = String(entry.line.quantity);
    var plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+';
    plus.setAttribute('aria-label', 'Increase quantity');
    plus.addEventListener('click', function () { setQuantity(entry.key, entry.line.quantity + 1); });
    qty.appendChild(minus); qty.appendChild(count); qty.appendChild(plus);

    var price = document.createElement('strong');
    price.textContent = money(entry.total);

    var remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'cart-remove'; remove.textContent = '🗑';
    remove.setAttribute('aria-label', 'Remove ' + entry.name);
    remove.addEventListener('click', function () { removeLine(entry.key); });

    foot.appendChild(qty); foot.appendChild(price); foot.appendChild(remove);
    body.appendChild(foot);
    row.appendChild(body);
    return row;
  }

  function render() {
    var entries = resolve();
    var sums = totals(entries);
    var count = entries.reduce(function (n, e) { return n + e.line.quantity; }, 0);

    var badge = document.getElementById('cart-count');
    if (badge) { badge.textContent = String(count); badge.hidden = count === 0; }

    var list = document.getElementById('cart-lines');
    if (list) {
      list.textContent = '';
      if (!entries.length) {
        var empty = document.createElement('p');
        empty.className = 'cart-empty';
        empty.textContent = 'Your cart is empty.';
        list.appendChild(empty);
      } else {
        entries.forEach(function (entry) { list.appendChild(lineNode(entry)); });
      }
    }

    var foot = document.getElementById('cart-foot');
    if (foot) foot.hidden = entries.length === 0;
    setText('cart-subtotal', money(sums.subtotal));
    setText('cart-delivery', sums.delivery > 0 ? money(sums.delivery) : 'Free');
    setText('cart-grand', money(sums.total));

    var hint = document.getElementById('cart-hint');
    if (hint) {
      var short = config.freeDeliveryOver - sums.subtotal;
      var show = config.freeDeliveryOver > 0 && entries.length > 0 && short > 0;
      hint.hidden = !show;
      if (show) hint.textContent = 'Add ' + money(short) + ' more for free delivery.';
    }

    var checkout = document.getElementById('cart-checkout');
    if (checkout) {
      var blocked = entries.some(function (e) { return !e.available; });
      checkout.classList.toggle('is-disabled', blocked);
    }

    renderCheckout(entries, sums);
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function renderCheckout(entries, sums) {
    var grid = document.getElementById('checkout-grid');
    if (!grid) return;
    var empty = document.getElementById('checkout-empty');
    grid.hidden = entries.length === 0;
    if (empty) empty.hidden = entries.length > 0;

    var field = document.getElementById('cart-field');
    if (field) field.value = JSON.stringify(entries.map(function (e) { return e.line; }));

    var lines = document.getElementById('summary-lines');
    if (lines) {
      lines.textContent = '';
      entries.forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'summary-line';
        row.appendChild(Object.assign(document.createElement('span'),
          {className: 'summary-qty', textContent: entry.line.quantity + '×'}));
        var name = document.createElement('span');
        name.className = 'summary-name';
        name.appendChild(Object.assign(document.createElement('strong'), {textContent: entry.name}));
        if (entry.detail) name.appendChild(Object.assign(document.createElement('small'), {textContent: entry.detail}));
        entry.contents.forEach(function (text) {
          name.appendChild(Object.assign(document.createElement('small'), {textContent: text}));
        });
        row.appendChild(name);
        row.appendChild(Object.assign(document.createElement('span'),
          {className: 'summary-price', textContent: money(entry.total)}));
        lines.appendChild(row);
      });
    }

    setText('summary-subtotal', money(sums.subtotal));
    setText('summary-delivery', sums.delivery > 0 ? money(sums.delivery) : 'Free');
    setText('summary-total', money(sums.total));

    var blocked = entries.some(function (e) { return !e.available; });
    var warning = document.getElementById('stock-warning');
    if (warning) warning.hidden = !blocked;
    var button = document.getElementById('place-order');
    if (button) {
      button.disabled = blocked || entries.length === 0;
      if (!blocked && entries.length) button.textContent = 'Place order · ' + money(sums.total);
    }
  }

  // ---------------------------------------------------------------- drawers
  function openCart() { toggle('cart-drawer', true); }
  function toggle(id, open) {
    var node = document.getElementById(id);
    if (!node) return;
    node.hidden = !open;
    document.body.classList.toggle('no-scroll', open);
  }

  function on(id, event, handler) {
    var node = document.getElementById(id);
    if (node) node.addEventListener(event, handler);
  }

  // ---------------------------------------------------------------- start
  document.addEventListener('DOMContentLoaded', function () {
    // Age gate. Rendered hidden so it never flashes for someone who confirmed.
    var confirmed = true;
    try { confirmed = localStorage.getItem(AGE_KEY) === 'yes'; } catch (e) { confirmed = true; }
    var gate = document.getElementById('age-gate');
    if (gate && !confirmed) { gate.hidden = false; document.body.classList.add('no-scroll'); }
    on('age-yes', 'click', function () {
      try { localStorage.setItem(AGE_KEY, 'yes'); } catch (e) { /* private mode */ }
      if (gate) gate.hidden = true;
      document.body.classList.remove('no-scroll');
    });

    on('menu-open', 'click', function () { toggle('mobile-drawer', true); });
    on('menu-close', 'click', function () { toggle('mobile-drawer', false); });
    on('cart-open', 'click', openCart);
    on('cart-close', 'click', function () { toggle('cart-drawer', false); });
    on('summary-edit', 'click', openCart);

    ['cart-drawer', 'mobile-drawer'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.addEventListener('click', function (event) {
        if (event.target === node) toggle(id, false);
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { toggle('cart-drawer', false); toggle('mobile-drawer', false); closeMenu(); }
    });

    /* Dropdowns. With a mouse the menu opens on hover, so a click on the button
       has to go to the section page — toggling would just close what the hover
       already opened. On touch there is no hover, so the click opens the menu. */
    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var openItem = null;

    function closeMenu() {
      if (!openItem) return;
      openItem.classList.remove('is-open');
      var button = openItem.querySelector('button');
      if (button) button.setAttribute('aria-expanded', 'false');
      openItem = null;
    }

    function openMenu(item) {
      if (openItem === item) return;
      closeMenu();
      item.classList.add('is-open');
      var button = item.querySelector('button');
      if (button) button.setAttribute('aria-expanded', 'true');
      openItem = item;
    }

    document.querySelectorAll('.shop-nav-item').forEach(function (item) {
      var button = item.querySelector('button');
      if (!button) return;

      button.addEventListener('click', function (event) {
        event.stopPropagation();
        if (canHover && button.dataset.href) { window.location.href = button.dataset.href; return; }
        if (item.classList.contains('is-open')) closeMenu(); else openMenu(item);
      });
      // Keyboard users get the menu without needing a pointer at all.
      button.addEventListener('focus', function () { if (canHover) openMenu(item); });

      if (canHover) {
        item.addEventListener('mouseenter', function () { openMenu(item); });
        item.addEventListener('mouseleave', function () { if (openItem === item) closeMenu(); });
      }
    });
    document.addEventListener('click', closeMenu);

    // Quick add from a product card.
    document.querySelectorAll('[data-add-product]').forEach(function (button) {
      button.addEventListener('click', function () {
        add({kind: 'product', productId: button.dataset.addProduct, variantId: button.dataset.variant, quantity: 1});
      });
    });
    document.querySelectorAll('[data-add-bundle]').forEach(function (button) {
      button.addEventListener('click', function () {
        add({kind: 'bundle', bundleId: button.dataset.addBundle, quantity: 1});
      });
    });

    setupBuyBox();

    // The confirmation page is the one place the cart is emptied.
    if (document.querySelector('[data-clear-cart]')) writeCart([]);

    render();
  });

  /* The product page. One row of chips for most things; pouches and
     multi-strength lines pick flavour and strength separately. */
  function setupBuyBox() {
    var box = document.getElementById('buy-box');
    if (!box) return;
    var variants = [];
    try { variants = JSON.parse(box.dataset.variants || '[]'); } catch (e) { return; }

    var productId = box.dataset.product;
    var quantity = 1;
    var chosenLabel = '';
    var chosenStrength = '';
    var chosen = variants.length === 1 ? variants[0] : null;
    var button = document.getElementById('add-to-cart');

    function paint() {
      var twoAxis = box.querySelector('[data-axis="label"]') !== null;
      if (twoAxis) {
        chosen = variants.filter(function (v) {
          return v.label === chosenLabel && v.strength === chosenStrength;
        })[0] || null;

        box.querySelectorAll('[data-axis="strength"] .chip').forEach(function (chip) {
          var match = variants.filter(function (v) {
            return v.label === chosenLabel && v.strength === chip.dataset.value;
          })[0];
          var usable = Boolean(chosenLabel) && Boolean(match) && match.available;
          chip.disabled = !usable;
          chip.classList.toggle('chip-out', Boolean(chosenLabel) && !usable);
          chip.setAttribute('aria-pressed', String(chosen !== null && chip.dataset.value === chosenStrength));
        });
        box.querySelectorAll('[data-axis="label"] .chip').forEach(function (chip) {
          chip.setAttribute('aria-pressed', String(chip.dataset.value === chosenLabel));
          chip.classList.toggle('chip-on', chip.dataset.value === chosenLabel);
        });
        box.querySelectorAll('[data-axis="strength"] .chip').forEach(function (chip) {
          var on = chosen !== null && chip.dataset.value === chosenStrength;
          chip.classList.toggle('chip-on', on);
        });
      }
      if (button) {
        var ready = chosen !== null && chosen.available;
        button.disabled = !ready;
        button.textContent = ready ? 'Add to cart'
          : (variants.some(function (v) { return v.available; }) ? 'Choose an option' : 'Out of stock');
      }
    }

    box.querySelectorAll('[data-axis="variant"] .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        box.querySelectorAll('[data-axis="variant"] .chip').forEach(function (other) {
          other.classList.remove('chip-on');
          other.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('chip-on');
        chip.setAttribute('aria-pressed', 'true');
        chosen = variants.filter(function (v) { return v.id === chip.dataset.variant; })[0] || null;
        paint();
      });
    });

    box.querySelectorAll('[data-axis="label"] .chip').forEach(function (chip) {
      chip.addEventListener('click', function () { chosenLabel = chip.dataset.value; paint(); });
    });
    box.querySelectorAll('[data-axis="strength"] .chip').forEach(function (chip) {
      chip.addEventListener('click', function () { chosenStrength = chip.dataset.value; paint(); });
    });

    box.querySelectorAll('[data-qty]').forEach(function (control) {
      control.addEventListener('click', function () {
        quantity = Math.max(1, Math.min(99, quantity + Number(control.dataset.qty)));
        setText('buy-qty', String(quantity));
      });
    });

    if (button) button.addEventListener('click', function () {
      if (!chosen) return;
      add({kind: 'product', productId: productId, variantId: chosen.id, quantity: quantity});
      button.textContent = 'Added';
    });

    // A single-variant product is chosen already; a multi-variant one is not.
    if (variants.length === 1) {
      var only = box.querySelector('[data-axis="variant"] .chip');
      if (only) { only.classList.add('chip-on'); only.setAttribute('aria-pressed', 'true'); }
    } else {
      chosen = null;
    }
    paint();
  }
})();
