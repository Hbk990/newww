/* DR PHONE — customer catalog
 *
 * Quantities are typed, not tapped: every place that shows a quantity uses the
 * same control (a real number field between a - and a + button), so a buyer
 * ordering 60 pieces types "60" instead of pressing + sixty times.
 *
 * While someone is typing we never re-render a container with innerHTML - that
 * would destroy the field mid-keystroke. Typing takes the "surgical" path
 * (syncQuantityUI) which touches only the numbers that actually moved; whole
 * containers are rebuilt only on structural changes (navigation, search,
 * opening a panel).
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- state */

  var catalog = [], selected = null, sortMode = 'original', selections = {},
      cart = [], favorites = [], recent = [], recentCollapsed = false,
      lineNotes = {}, detailProduct = null, flavorQuery = '',
      customer = { name: '', phone: '', business: '', notes: '' }, orderReference = '', cartSavedAt = 0;

  /* Browsing 1157 products two cards to a screen is slow for a buyer who already
     knows what they want, so the same results also render as a compact order pad.
     The choice is remembered; the filters deliberately are not, because a stale
     hidden filter looks like missing stock. */
  var VIEW_KEY = 'dr-phone-view-mode';
  var viewMode = 'grid',
      filters = { brand: '', inStock: false, min: '', max: '' };

  var content = document.getElementById('content'),
      search = document.getElementById('search');

  var CART_KEY = 'dr-phone-hostinger-cart-v2';
  var FAVORITES_KEY = 'dr-phone-favorites',
      RECENT_KEY = 'dr-phone-recent-products',
      RECENT_COLLAPSED_KEY = 'dr-phone-recent-collapsed',
      CUSTOMER_KEY = 'dr-phone-order-customer',
      REFERENCE_KEY = 'dr-phone-order-reference',
      NOTES_KEY = 'dr-phone-line-notes';

  var MAX_QTY = 999;
  var staleDismissed = false, hashBeforeProduct = '';

  /* ------------------------------------------------------------- helpers */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  function money(v) {
    if (v == null || v === '') return 'Price on request';
    var currency = String((window.DR_PHONE.store || {}).currency || 'USD').toUpperCase();
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency,
        minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2
      }).format(Number(v));
    } catch (e) {
      return currency + ' ' + Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 2);
    }
  }

  function motion() { return document.documentElement.getAttribute('data-motion') || 'full'; }

  function allProducts() {
    return [].concat.apply([], catalog.map(function (c) {
      return c.products.map(function (p) { return { product: p, category: c }; });
    }));
  }
  function findProduct(id) {
    return allProducts().find(function (x) { return Number(x.product.id) === Number(id); });
  }

  /* ---- search matching ---------------------------------------------------
   * "xo fg05" has to find "XO – FG05 Skin & Neck Care Device". Matching the
   * whole query as one substring cannot do it: an en dash sits between the two
   * words. So each word of the query is matched on its own, in any order,
   * against a copy of the text with every space and punctuation mark removed —
   * which is also what makes "fg-05", "fg05" and "fg 05" the same search.
   *
   * Dropping the punctuation alone would be too generous: "xo" would then match
   * the middle of "Moxom". So the token boundaries are remembered and a word
   * must BEGIN at one. It may run past one, which is what lets "fg05" match
   * "FG 05" — tokens break at punctuation and where letters meet digits.
   *
   * The same rule runs in assets/admin.js, so the shop and the dashboard find
   * the same products for the same words. */
  function searchIndex(text) {
    var s = String(text == null ? '' : text).toLowerCase(), joined = '', starts = {}, prev = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i),
          kind = (ch >= '0' && ch <= '9') ? 1
               : (((ch >= 'a' && ch <= 'z') || ch.toLowerCase() !== ch.toUpperCase()) ? 2 : 0);
      if (!kind) { prev = 0; continue; }
      if (kind !== prev) starts[joined.length] = 1;
      joined += ch; prev = kind;
    }
    return { text: joined, starts: starts };
  }
  function matchesQuery(haystack, query) {
    var words = String(query == null ? '' : query).trim().split(/\s+/), index = null;
    for (var w = 0; w < words.length; w++) {
      var needle = searchIndex(words[w]).text;
      if (!needle) continue;
      if (!index) index = searchIndex(haystack);
      var found = false;
      for (var at = index.text.indexOf(needle); at >= 0; at = index.text.indexOf(needle, at + 1)) {
        if (index.starts[at]) { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }
  function searchText(product, category) {
    return [product.sku, product.name, product.brand, product.color, product.type,
            (product.colors || []).join(' '), (product.flavors || []).join(' '),
            category && category.name, category && category.group, category && category.slug].join(' ');
  }
  function options(p) {
    if (Array.isArray(p.options) && p.options.length) return p.options;
    return typeof p.price === 'number' ? [{ name: 'Standard', price: p.price }] : [];
  }
  function colors(p) {
    return Array.isArray(p.colors) && p.colors.length ? p.colors : ['Standard'];
  }
  function flavors(p) { return Array.isArray(p.flavors) ? p.flavors : []; }

  function unitPrice(p, line) {
    var o = options(p)[line.option],
        base = o ? Number(o.price) : (typeof p.price === 'number' ? p.price : 0),
        tiers = Array.isArray(p.tiers) ? p.tiers : [];
    tiers.forEach(function (t) { if (line.quantity >= Number(t.min)) base = Number(t.price); });
    return base;
  }

  /* ---- quantity price breaks ------------------------------------------- *
   * The catalog has always priced tiers (see unitPrice above) but never showed
   * them, so a buyer had no way to know that 50 pieces cost less each. The
   * server sorts tiers ascending by `min`; these guard against a hand-edited
   * catalog.json anyway. */

  function tierList(p) {
    return (Array.isArray(p.tiers) ? p.tiers : [])
      .map(function (t) { return { min: Number(t.min), price: Number(t.price) }; })
      .filter(function (t) { return t.min > 1 && isFinite(t.min) && isFinite(t.price) && t.price >= 0; })
      .sort(function (a, b) { return a.min - b.min; });
  }

  function basePrice(p, s) {
    var o = options(p)[s.option];
    return o ? Number(o.price) : 0;
  }

  /* Index of the break the given quantity has reached, or -1. */
  function activeTier(list, qty) {
    var active = -1;
    list.forEach(function (t, i) { if (qty >= t.min) active = i; });
    return active;
  }

  function tierLadder(p, s, qty) {
    var list = tierList(p);
    if (!list.length) return '';
    var active = activeTier(list, qty);
    return '<div class="tier-ladder" data-tier-ladder>' +
      '<span class="tier-head">Price breaks</span>' +
      '<span class="tier-steps">' + list.map(function (t, i) {
        return '<span class="tier-step' + (i === active ? ' is-active' : '') + '">' +
          '<b>' + t.min + '+</b><i>' + money(t.price) + '</i></span>';
      }).join('') + '</span></div>';
  }

  /* The nudge only fires when the break is actually within reach: not when the
   * buyer is nowhere near it, and never for a break the stock cannot cover. */
  function tierNudgeText(p, s, qty, ceiling) {
    var list = tierList(p);
    if (!list.length || qty <= 0) return '';
    for (var i = 0; i < list.length; i++) {
      if (qty >= list[i].min) continue;
      var need = list[i].min - qty;
      if (ceiling !== null && ceiling !== undefined && isFinite(ceiling) && list[i].min > ceiling) return '';
      // Stay quiet when the break is out of proportion to what they are buying
      // ("999 more" against a quantity of 1). The ladder still shows it.
      if (need > qty * 20) return '';
      return need + ' more → ' + money(list[i].price) + ' each';
    }
    return 'Best price · ' + money(list[list.length - 1].price) + ' each';
  }

  function variantKeys(p, s) {
    var o = options(p)[s.option];
    return [
      s.flavor ? 'flavor:' + s.flavor : '',
      s.color ? 'color:' + s.color : '',
      o && o.name ? 'option:' + o.name : ''
    ].filter(Boolean);
  }
  function lineMatchesVariant(p, line, key) {
    if (key.indexOf('flavor:') === 0) return line.flavor === key.slice(7);
    if (key.indexOf('color:') === 0) return line.color === key.slice(6);
    if (key.indexOf('option:') === 0) {
      var o = options(p)[line.option];
      return !!o && o.name === key.slice(7);
    }
    return false;
  }

  /* How many MORE pieces of this variant may be added, given what the cart
     already holds. null means "no declared limit". */
  function remainingQuantity(p, s) {
    var limits = [], map = p.variant_quantity || {},
        productLines = cart.filter(function (line) { return Number(line.productId) === Number(p.id); });
    if (Number(p.stock_quantity) > 0) {
      limits.push(Number(p.stock_quantity) - productLines.reduce(function (total, line) {
        return total + line.quantity;
      }, 0));
    }
    variantKeys(p, s).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        var used = productLines.filter(function (line) { return lineMatchesVariant(p, line, key); })
          .reduce(function (total, line) { return total + line.quantity; }, 0);
        limits.push(Number(map[key]) - used);
      }
    });
    return limits.length ? Math.max(0, Math.min.apply(null, limits)) : null;
  }

  function variantStatus(p, s) {
    var status = p.stock || 'in-stock', map = p.variant_stock || {};
    variantKeys(p, s).forEach(function (key) {
      if (map[key] === 'out-of-stock') status = 'out-of-stock';
      else if (map[key] === 'low-stock' && status !== 'out-of-stock') status = 'low-stock';
    });
    var remaining = remainingQuantity(p, s);
    if (remaining === 0) status = 'out-of-stock';
    else if (remaining !== null && remaining <= 5 && status !== 'out-of-stock') status = 'low-stock';
    return status;
  }

  function choice(p) {
    var key = String(p.id), o = options(p), c = colors(p), f = flavors(p), s = selections[key] || {};
    return {
      option: Math.min(Number(s.option || 0), Math.max(0, o.length - 1)),
      color: s.color && c.indexOf(s.color) >= 0 ? s.color : c[0],
      flavor: s.flavor && f.indexOf(s.flavor) >= 0 ? s.flavor : (f[0] || '')
    };
  }

  function lineKey(id, o, c, f) { return [id, o, c, f].join('|'); }
  function findLine(key) { return cart.find(function (i) { return i.key === key; }); }
  function lineFor(p) {
    var s = choice(p);
    return findLine(lineKey(p.id, s.option, s.color, s.flavor));
  }

  /* The highest absolute quantity this line may hold. remainingQuantity()
     already excludes what the cart holds, so the ceiling is current + headroom. */
  function ceilingFor(p, s, current) {
    var remaining = remainingQuantity(p, s);
    return remaining === null ? MAX_QTY : Math.min(MAX_QTY, current + remaining);
  }

  /* ------------------------------------------------------------ cart state */

  /* Only positive lines are persisted. A zero-quantity line may exist in memory
     while its field is being edited (typing "0" before "60" must not delete it).
     Stored in localStorage, not sessionStorage: a wholesale order takes a while to
     build and used to vanish the moment the tab was closed. */
  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({
        saved_at: Date.now(),
        lines: cart.filter(function (l) { return l.quantity > 0; })
      }));
    } catch (e) { /* private mode / quota */ }
    updateCartCount();
  }

  function loadCart() {
    // Current format: {saved_at, lines}. Also reads the old sessionStorage array
    // once, so an order in progress survives the upgrade.
    try {
      var stored = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      if (stored && Array.isArray(stored.lines)) { cartSavedAt = Number(stored.saved_at) || 0; return stored.lines; }
      if (Array.isArray(stored)) return stored;
    } catch (e) {}
    try {
      var legacy = JSON.parse(sessionStorage.getItem(CART_KEY) || 'null');
      if (Array.isArray(legacy) && legacy.length) {
        sessionStorage.removeItem(CART_KEY);
        return legacy;
      }
    } catch (e) {}
    return [];
  }

  function cartAgeDays() {
    if (!cartSavedAt) return 0;
    return Math.floor((Date.now() - cartSavedAt) / 86400000);
  }

  function updateCartCount() {
    var el = document.getElementById('cart-count');
    if (!el) return;
    var count = cart.reduce(function (t, i) { return t + i.quantity; }, 0),
        previous = Number(el.textContent) || 0;
    el.textContent = count;
    if (count !== previous && motion() !== 'off') {
      el.classList.remove('is-bumped');
      void el.offsetWidth;
      el.classList.add('is-bumped');
    }
  }

  /* Set an absolute quantity. Returns the value actually stored, so a caller
     can write a clamped number back into the field. */
  function setVariantQuantity(p, s, value, opts) {
    opts = opts || {};
    var key = lineKey(p.id, s.option, s.color, s.flavor),
        line = findLine(key),
        current = line ? line.quantity : 0,
        requested = Math.floor(Number(value));
    if (!isFinite(requested) || requested < 0) requested = 0;

    var ceiling = ceilingFor(p, s, current),
        next = Math.max(0, Math.min(requested, ceiling));
    if (next > current && variantStatus(p, s) === 'out-of-stock') next = current;

    if (!line && next > 0) {
      line = { key: key, productId: p.id, option: s.option, color: s.color, flavor: s.flavor, quantity: 0 };
      cart.push(line);
    }
    if (line) line.quantity = next;
    if (!opts.defer) purgeEmptyLines();
    saveCart();
    return { value: next, clamped: next !== requested, added: current === 0 && next > 0 };
  }

  function purgeEmptyLines() {
    var before = cart.length;
    cart = cart.filter(function (l) { return l.quantity > 0; });
    return cart.length !== before;
  }

  /* Kept for the public DR_CATALOG_APP surface and for external callers: full
     re-render semantics, exactly as before. */
  function changeVariant(p, s, delta) {
    var key = lineKey(p.id, s.option, s.color, s.flavor),
        line = findLine(key),
        current = line ? line.quantity : 0;
    setVariantQuantity(p, s, current + delta);
    render();
    renderCart();
    if (detailProduct) renderDetail();
  }
  function changeCart(p, delta) { changeVariant(p, choice(p), delta); }

  function normalizeCart() {
    var saved = cart.slice();
    cart = [];
    saved.forEach(function (line) {
      var found = findProduct(line.productId);
      if (!found) return;
      var p = found.product, o = options(p), c = colors(p), f = flavors(p),
          state = {
            option: Number(line.option) || 0,
            color: line.color || 'Standard',
            flavor: line.flavor || ''
          };
      if ((o.length && state.option >= o.length) || c.indexOf(state.color) < 0 ||
          (state.flavor && f.indexOf(state.flavor) < 0) || variantStatus(p, state) === 'out-of-stock') return;
      var remaining = remainingQuantity(p, state),
          quantity = Math.max(0, Math.min(MAX_QTY, Number(line.quantity) || 0, remaining === null ? MAX_QTY : remaining));
      if (quantity) {
        cart.push({
          key: lineKey(p.id, state.option, state.color, state.flavor),
          productId: p.id, option: state.option, color: state.color,
          flavor: state.flavor, quantity: quantity
        });
      }
    });
    saveCart();
  }

  function toggleFavorite(id) {
    favorites = favorites.indexOf(Number(id)) >= 0
      ? favorites.filter(function (x) { return x !== Number(id); })
      : [Number(id)].concat(favorites);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
    render();
    if (detailProduct) renderDetail();
  }

  /* ------------------------------------------------- the quantity control */

  /* One markup shape, used by product cards, flavor rows and cart lines, so
     all three behave identically. */
  function qtyControl(p, s, opts) {
    opts = opts || {};
    var key = lineKey(p.id, s.option, s.color, s.flavor),
        line = findLine(key),
        qty = line ? line.quantity : 0,
        status = variantStatus(p, s),
        ceiling = ceilingFor(p, s, qty),
        label = opts.label || (p.name + (s.flavor ? ' — ' + s.flavor : ''));

    return '<div class="qty-wrap">' +
      '<div class="qty' + (qty ? '' : ' is-empty') + '" data-qty' +
        ' data-pid="' + esc(p.id) + '"' +
        ' data-option="' + esc(s.option) + '"' +
        ' data-color="' + esc(s.color || '') + '"' +
        ' data-flavor="' + esc(s.flavor || '') + '">' +
        '<button type="button" class="qty-step" data-qty-step="-1" aria-label="Decrease quantity"' +
          (qty <= 0 ? ' disabled' : '') + '>&minus;</button>' +
        '<input class="qty-input" type="text" inputmode="numeric" autocomplete="off"' +
          ' data-qty-input data-max="' + ceiling + '" value="' + qty + '"' +
          ' aria-label="Quantity for ' + esc(label) + '">' +
        '<button type="button" class="qty-step" data-qty-step="1" aria-label="Increase quantity"' +
          (qty >= ceiling || status === 'out-of-stock' ? ' disabled' : '') + '>+</button>' +
      '</div>' +
      (opts.hint === false ? '' : '<small class="qty-hint">' + esc(qtyHintText(p, s, qty, ceiling, status)) + '</small>') +
      (function (t) { return t ? '<small class="tier-nudge" data-tier-nudge>' + esc(t) + '</small>' : '<small class="tier-nudge" data-tier-nudge hidden></small>'; })(tierNudgeText(p, s, qty, ceiling)) +
    '</div>';
  }

  function qtyHintText(p, s, qty, ceiling, status) {
    if (status === 'out-of-stock') return 'Out of stock';
    if (remainingQuantity(p, s) === null) return qty ? qty + (qty === 1 ? ' piece' : ' pieces') : 'Type a quantity';
    return qty >= ceiling ? 'Maximum ' + ceiling : ceiling - qty + ' more available';
  }

  /* Resolve a .qty element back to its product and variant. */
  function controlState(node) {
    var found = findProduct(node.dataset.pid);
    if (!found) return null;
    return {
      product: found.product,
      state: {
        option: Number(node.dataset.option) || 0,
        color: node.dataset.color || 'Standard',
        flavor: node.dataset.flavor || ''
      }
    };
  }

  /* Surgical refresh of one control plus the labels around it. */
  function refreshQtyControl(node, skipInput) {
    var resolved = controlState(node);
    if (!resolved) return;
    var p = resolved.product, s = resolved.state,
        line = findLine(lineKey(p.id, s.option, s.color, s.flavor)),
        qty = line ? line.quantity : 0,
        status = variantStatus(p, s),
        ceiling = ceilingFor(p, s, qty);

    var input = node.querySelector('[data-qty-input]');
    if (input) {
      input.dataset.max = String(ceiling);
      if (input !== skipInput) input.value = String(qty);
    }
    node.classList.toggle('is-empty', qty === 0);

    var minus = node.querySelector('[data-qty-step="-1"]'),
        plus = node.querySelector('[data-qty-step="1"]');
    if (minus) minus.disabled = qty <= 0;
    if (plus) plus.disabled = qty >= ceiling || status === 'out-of-stock';

    var wrap = node.parentNode, hint = wrap && wrap.querySelector('.qty-hint');
    if (hint) {
      hint.textContent = qtyHintText(p, s, qty, ceiling, status);
      hint.classList.toggle('is-max', qty > 0 && qty >= ceiling);
    }

    var nudge = wrap && wrap.querySelector('[data-tier-nudge]');
    if (nudge) {
      var text = tierNudgeText(p, s, qty, ceiling);
      nudge.textContent = text;
      nudge.hidden = !text;
    }

    var row = node.closest ? node.closest('.flavor-row') : null;
    if (row) {
      row.classList.toggle('out-of-stock', status === 'out-of-stock');
      var avail = row.querySelector('.flavor-avail');
      if (avail) avail.textContent = availabilityText(p, s, status);
    }

    // Order-pad rows tint once they carry a quantity, so a buyer scrolling a long
    // list can see what they have already filled in.
    var padRow = node.closest ? node.closest('.pad-row') : null;
    if (padRow) padRow.classList.toggle('has-qty', qty > 0);

    var card = node.closest ? node.closest('.product-card') : null;
    var chip = card && card.querySelector('.stock');
    if (chip) {
      chip.className = 'stock ' + status;
      chip.textContent = stockLabel(p, s, status);
    }

    // Light up the break this quantity has reached. The ladder sits outside the
    // qty wrap, so look it up from the card or the open detail panel.
    var scope = card || (node.closest ? node.closest('.detail-controls') : null),
        ladder = scope && scope.querySelector('[data-tier-ladder]');
    if (ladder) {
      var reached = activeTier(tierList(p), qty);
      ladder.querySelectorAll('.tier-step').forEach(function (step, i) {
        step.classList.toggle('is-active', i === reached);
      });
    }
  }

  function availabilityText(p, s, status) {
    var remaining = remainingQuantity(p, s);
    if (status === 'out-of-stock') return 'Out of stock';
    if (remaining !== null) return remaining + ' available';
    return status === 'low-stock' ? 'Low stock' : 'In stock';
  }

  function stockLabel(p, s, status) {
    var remaining = remainingQuantity(p, s);
    if (status === 'out-of-stock') return 'Out of stock';
    return (status === 'low-stock' ? 'Low stock' : 'In stock') +
      (remaining !== null ? ' · ' + remaining + ' left' : '');
  }

  /* Update every number that moved, without rebuilding any container. */
  function syncQuantityUI(productId, skipInput) {
    updateCartCount();
    var nodes = document.querySelectorAll('[data-qty]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (productId != null && Number(node.dataset.pid) !== Number(productId)) return;
      refreshQtyControl(node, skipInput);
    });
    refreshCartFigures();
  }

  function refreshCartFigures() {
    var box = document.getElementById('cart-content');
    if (!box) return;
    var total = 0;
    cart.forEach(function (line) {
      var f = findProduct(line.productId);
      if (f) total += unitPrice(f.product, line) * line.quantity;
    });

    Array.prototype.forEach.call(box.querySelectorAll('.cart-line[data-line-key]'), function (row) {
      var line = findLine(row.dataset.lineKey);
      var found = line && findProduct(line.productId);
      var totalEl = row.querySelector('[data-line-total]');
      if (totalEl) totalEl.textContent = found ? money(unitPrice(found.product, line) * line.quantity) : money(0);
    });

    Array.prototype.forEach.call(box.querySelectorAll('[data-group-count]'), function (el) {
      var pid = Number(el.dataset.groupCount);
      var n = cart.filter(function (l) { return Number(l.productId) === pid; })
        .reduce(function (t, l) { return t + l.quantity; }, 0);
      el.textContent = n + (n === 1 ? ' piece' : ' pieces');
    });

    var totalEl = box.querySelector('[data-cart-total]');
    if (totalEl) totalEl.textContent = money(total);

    var warning = box.querySelector('[data-min-warning]'),
        minimum = Number((window.DR_PHONE.store || {}).minimum_order || 0);
    if (warning) {
      if (minimum && total < minimum && cart.length) {
        warning.textContent = 'Add ' + money(minimum - total) + ' to reach the ' + money(minimum) + ' minimum order.';
        warning.hidden = false;
      } else {
        warning.hidden = true;
      }
    }
  }

  /* Called when a field is left: zeroed lines finally disappear. Deferred to
     this point so that typing "0" as the first digit of "60" is harmless. */
  function commitQuantities() {
    if (!purgeEmptyLines()) return;
    saveCart();
    var box = document.getElementById('cart-content');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.cart-line[data-line-key]'), function (row) {
      if (!findLine(row.dataset.lineKey)) row.remove();
    });
    Array.prototype.forEach.call(box.querySelectorAll('.cart-group'), function (group) {
      if (!group.querySelector('.cart-line')) group.remove();
    });
    if (!cart.length) renderCart();
    else refreshCartFigures();
  }

  /* Delegated handlers — one set for every quantity control on the page. */
  function bindQuantityEvents() {
    document.addEventListener('input', function (e) {
      var input = e.target.closest && e.target.closest('[data-qty-input]');
      if (!input) return;
      var node = input.closest('[data-qty]'), resolved = node && controlState(node);
      if (!resolved) return;

      // Digits only, preserving the caret.
      var raw = input.value, clean = raw.replace(/[^0-9]/g, '');
      if (clean !== raw) {
        var pos = input.selectionStart == null ? clean.length : input.selectionStart - (raw.length - clean.length);
        input.value = clean;
        try { input.setSelectionRange(Math.max(0, pos), Math.max(0, pos)); } catch (err) {}
      }
      if (clean === '') { return; }  // mid-edit; nothing committed yet

      var result = setVariantQuantity(resolved.product, resolved.state, clean, { defer: true });
      if (result.clamped) {
        input.value = String(result.value);
        flashClamped(node);
      }
      if (result.added) flyToCart(node);
      syncQuantityUI(resolved.product.id, input);
    });

    document.addEventListener('change', function (e) {
      if (e.target.closest && e.target.closest('[data-qty-input]')) commitField(e.target);
    });
    document.addEventListener('focusout', function (e) {
      if (e.target.closest && e.target.closest('[data-qty-input]')) commitField(e.target);
    });
    document.addEventListener('focusin', function (e) {
      var input = e.target.closest && e.target.closest('[data-qty-input]');
      if (!input) return;
      try { input.select(); } catch (err) {}
      // On a phone the on-screen keyboard covers roughly the lower half of the
      // screen. A quantity box on a lower card ends up behind it, so you cannot
      // see the number you are typing. Bring it to the middle.
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
        setTimeout(function () {
          var node = input.closest('.qty-wrap') || input;
          try { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
        }, 180);   // after the keyboard has animated in and resized the viewport
      }
    });
    document.addEventListener('keydown', function (e) {
      var input = e.target.closest && e.target.closest('[data-qty-input]');
      if (!input) return;
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        stepQuantity(input.closest('[data-qty]'), e.key === 'ArrowUp' ? 1 : -1);
      }
    });

    // Press-and-hold on - / +. Bound to pointerdown so the change lands before
    // any focused field's blur can reflow the list under the pointer.
    var hold = null;
    function stopHold() {
      if (!hold) return;
      clearTimeout(hold.delay);
      clearInterval(hold.timer);
      try { hold.button.releasePointerCapture(hold.pointerId); } catch (e) {}
      hold = null;
    }
    document.addEventListener('pointerdown', function (e) {
      var button = e.target.closest && e.target.closest('[data-qty-step]');
      if (!button || button.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      stopHold();
      var node = button.closest('[data-qty]'), delta = Number(button.dataset.qtyStep);
      stepQuantity(node, delta);
      // Capture the pointer so the matching pointerup always reaches us even if
      // the list reflows out from under the finger.
      try { button.setPointerCapture(e.pointerId); } catch (err) {}
      hold = { button: button, pointerId: e.pointerId, delay: null, timer: null };
      hold.delay = setTimeout(function () {
        var ticks = 0;
        hold.timer = setInterval(function () {
          if (button.disabled || !button.isConnected) { stopHold(); return; }
          stepQuantity(node, delta * (++ticks > 14 ? 5 : 1));   // accelerates after ~1.5s
        }, 110);
      }, 450);
    });
    // Deliberately not pointerleave: registered on document in the capture
    // phase it fires for every element the pointer crosses, which cancelled the
    // hold on the very first move.
    ['pointerup', 'pointercancel'].forEach(function (type) {
      window.addEventListener(type, stopHold);
    });
    window.addEventListener('blur', stopHold);
    // Keyboard activation of the buttons produces a click with detail 0.
    document.addEventListener('click', function (e) {
      var button = e.target.closest && e.target.closest('[data-qty-step]');
      if (!button || button.disabled || e.detail !== 0) return;
      stepQuantity(button.closest('[data-qty]'), Number(button.dataset.qtyStep));
    });
  }

  function stepQuantity(node, delta) {
    var resolved = node && controlState(node);
    if (!resolved) return;
    var p = resolved.product, s = resolved.state,
        line = findLine(lineKey(p.id, s.option, s.color, s.flavor)),
        current = line ? line.quantity : 0;
    var result = setVariantQuantity(p, s, current + delta);
    if (result.added) flyToCart(node);
    syncQuantityUI(p.id);
    if (result.value === 0) commitQuantities();
  }

  function commitField(input) {
    var node = input.closest('[data-qty]'), resolved = node && controlState(node);
    if (!resolved) return;
    var value = input.value.replace(/[^0-9]/g, '');
    var result = setVariantQuantity(resolved.product, resolved.state, value === '' ? 0 : value, { defer: true });
    input.value = String(result.value);
    if (result.clamped) flashClamped(node);
    syncQuantityUI(resolved.product.id);
    commitQuantities();
  }

  function flashClamped(node) {
    if (!node || motion() === 'off') return;
    node.classList.remove('is-clamped');
    void node.offsetWidth;
    node.classList.add('is-clamped');
    setTimeout(function () { node.classList.remove('is-clamped'); }, 700);
  }

  /* ------------------------------------------------------------- motion */

  var revealObserver = null;

  function observeReveals(root) {
    var nodes = (root || document).querySelectorAll('[data-reveal]:not(.is-revealed)');
    if (motion() === 'off' || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add('is-revealed'); });
      return;
    }
    if (!revealObserver) {
      /* Start the reveal a screen early, so a card has already faded in by the
         time it is scrolled to. The old margins waited until a card was ~100px
         onto the screen and 5% of its own height showing, which on a phone meant
         stopping mid-scroll left a visibly empty slot at the bottom: the card
         was there, just still at opacity 0. */
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          revealObserver.unobserve(entry.target);   // one shot; cheap at 98 cards
        });
      }, { rootMargin: '600px 0px 600px 0px', threshold: 0 });
    }
    Array.prototype.forEach.call(nodes, function (n) { revealObserver.observe(n); });
  }

  function runCounters(root) {
    var nodes = (root || document).querySelectorAll('[data-count-to]');
    Array.prototype.forEach.call(nodes, function (el) {
      var target = Number(el.dataset.countTo) || 0;
      if (motion() === 'off') { el.textContent = target; return; }
      var start = null, duration = 1100;
      function tick(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / duration);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function flyToCart(sourceNode) {
    if (motion() === 'off') return;
    var card = sourceNode.closest && sourceNode.closest('.product-card, .product-content, .flavor-row');
    var img = card && card.querySelector('img');
    var target = document.getElementById('cart-count');
    var layer = document.getElementById('fly-layer');
    if (!img || !target || !layer || !img.animate) return;

    var from = img.getBoundingClientRect(), to = target.getBoundingClientRect();
    if (!from.width || !to.width) return;

    var clone = img.cloneNode(false);
    clone.className = 'fly-clone';
    clone.style.left = from.left + 'px';
    clone.style.top = from.top + 'px';
    clone.style.width = from.width + 'px';
    clone.style.height = from.height + 'px';
    layer.appendChild(clone);

    var dx = (to.left + to.width / 2) - (from.left + from.width / 2),
        dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    var animation = clone.animate([
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      { transform: 'translate3d(' + dx * 0.5 + 'px,' + (dy * 0.3 - 80) + 'px,0) scale(.55)', opacity: .95, offset: .55 },
      { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(.12)', opacity: 0 }
    ], { duration: 700, easing: 'cubic-bezier(.5,0,.75,1)' });
    animation.onfinish = function () { clone.remove(); };
    animation.oncancel = function () { clone.remove(); };
  }

  /* ------------------------------------------------------------ selection */

  function activeCategory() {
    return catalog.find(function (c) { return c.slug === selected; });
  }
  function minPrice(p) {
    var o = options(p);
    return o.length ? Math.min.apply(null, o.map(function (x) { return Number(x.price); })) : Infinity;
  }

  /* A query searches the whole catalog, matching the "Search all products"
     placeholder; without one, the open category is the pool. */
  function searchScope() { return search.value.trim() ? null : activeCategory(); }

  /* The category or search hit list, before the brand/stock/price filters. The
     filter bar's own choices are built from this, so it never offers a brand
     that would return nothing. */
  function basePool() {
    var q = search.value.trim(), category = searchScope();
    if (q) {
      return allProducts().filter(function (x) {
        return matchesQuery(searchText(x.product, x.category), q);
      }).map(function (x) { return x.product; });
    }
    return category ? category.products : [];
  }

  function filtersActive() {
    return !!(filters.brand || filters.inStock || filters.min !== '' || filters.max !== '');
  }

  function brandsIn(pool) {
    var seen = {};
    pool.forEach(function (p) { if (p.brand) seen[p.brand] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  function applyFilters(pool) {
    var min = filters.min === '' ? null : Number(filters.min),
        max = filters.max === '' ? null : Number(filters.max);
    return pool.filter(function (p) {
      if (filters.brand && p.brand !== filters.brand) return false;
      // "In stock" means orderable: anything not marked out of stock, on any variant.
      if (filters.inStock && (p.stock || 'in-stock') === 'out-of-stock') return false;
      if (min !== null || max !== null) {
        var price = minPrice(p);
        if (!isFinite(price)) return false;
        if (min !== null && isFinite(min) && price < min) return false;
        if (max !== null && isFinite(max) && price > max) return false;
      }
      return true;
    });
  }

  function getProducts() {
    var result = applyFilters(basePool()).slice();
    if (sortMode === 'name') result.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (sortMode === 'brand') result.sort(function (a, b) { return (a.brand || '').localeCompare(b.brand || '') || a.name.localeCompare(b.name); });
    if (sortMode === 'price-low') result.sort(function (a, b) { return minPrice(a) - minPrice(b); });
    if (sortMode === 'price-high') result.sort(function (a, b) { return minPrice(b) - minPrice(a); });
    return result;
  }

  function categoryGroups() {
    var groups = [];
    catalog.forEach(function (c) {
      var name = c.group || 'Other',
          group = groups.find(function (g) { return g.name === name; });
      if (!group) { group = { name: name, categories: [] }; groups.push(group); }
      group.categories.push(c);
    });
    return groups;
  }

  /* --------------------------------------------------------- menu / strips */

  /* Filtering the category menu. 47 categories in eight groups is a lot to scroll
     on a phone, so the panel has its own search. It only ever filters category
     names — the header search is the one that looks inside products. */
  var menuQuery = '';

  function menuMatches(category, groupName) {
    var q = menuQuery.trim().toLowerCase();
    if (!q) return true;
    // Matching the group name too means typing "audio" reveals everything under
    // Audio & Wearables, not just categories with "audio" in their own name.
    return String(category.name || '').toLowerCase().indexOf(q) >= 0 ||
           String(groupName || '').toLowerCase().indexOf(q) >= 0;
  }

  function renderMenuList() {
    var box = document.getElementById('menu-category-list');
    if (!box) return;
    var q = menuQuery.trim(), shown = 0, total = 0;

    var html = categoryGroups().map(function (group) {
      var hits = group.categories.filter(function (c) { return menuMatches(c, group.name); });
      total += group.categories.length;
      shown += hits.length;
      if (!hits.length) return '';
      var active = hits.some(function (c) { return c.slug === selected; });
      // While searching, every group holding a hit is opened: a closed group
      // would hide the very thing that was searched for.
      return '<details class="menu-category-group"' + (q || active ? ' open' : '') + '>' +
        '<summary><span>' + esc(group.name) + '</span></summary>' +
        hits.map(function (c) {
          return '<button data-category="' + esc(c.slug) + '" class="' + (c.slug === selected ? 'active' : '') + '">' +
            '<span>' + esc(c.name) + '</span><small>' + c.products.length + '</small></button>';
        }).join('') + '</details>';
    }).join('');

    box.innerHTML = (q ? '<p class="menu-count">' + shown + ' of ' + total + ' categories</p>' : '') +
      (html || '<p class="menu-empty">No category matches &ldquo;' + esc(q) + '&rdquo;.</p>');

    var clear = document.getElementById('menu-search-clear');
    if (clear) clear.hidden = !q;
  }

  function renderMenu() {
    var nav = document.getElementById('menu-categories');
    if (!nav) return;
    nav.innerHTML =
      '<div class="menu-tools">' +
        '<button class="menu-all" data-category="">All categories</button>' +
        '<label class="menu-search">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>' +
          '<input id="menu-search-input" type="search" autocomplete="off" placeholder="Search categories"' +
            ' aria-label="Search categories" value="' + esc(menuQuery) + '">' +
          '<button type="button" id="menu-search-clear" class="menu-clear" aria-label="Clear category search"' + (menuQuery ? '' : ' hidden') + '>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        '</label>' +
      '</div>' +
      '<div id="menu-category-list"></div>';
    renderMenuList();

    /* Only the list is rebuilt as you type, never the field, so the caret and
       focus are untouched — no need to put them back afterwards. */
    nav.oninput = function (e) {
      if (e.target.id !== 'menu-search-input') return;
      menuQuery = e.target.value;
      renderMenuList();
    };

    nav.onclick = function (e) {
      if (e.target.closest('#menu-search-clear')) {
        menuQuery = '';
        var field = document.getElementById('menu-search-input');
        if (field) { field.value = ''; field.focus(); }
        renderMenuList();
        return;
      }
      var b = e.target.closest('[data-category]');
      if (!b) return;
      selected = b.dataset.category || null;
      // The menu is built once, not on every render, so clearing the state is
      // not enough — the field and the list have to be put back by hand.
      menuQuery = '';
      var field = document.getElementById('menu-search-input');
      if (field) field.value = '';
      renderMenuList();
      search.value = '';
      syncSearchClear();
      sortMode = 'original';
      history.replaceState(null, '', selected ? '#' + selected : location.pathname);
      closePanels();
      render();
      scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  function productStrip(title, ids) {
    var products = ids.map(function (id) { var f = findProduct(id); return f && f.product; }).filter(Boolean);
    if (!products.length) return '';
    return '<section class="saved-products" data-reveal><div class="saved-products-head"><h3>' + esc(title) + '</h3></div><div>' +
      products.map(function (p) {
        return '<button class="saved-card" data-open-product="' + p.id + '">' +
          '<img src="' + esc(p.image || '') + '" alt="" loading="lazy"><span>' + esc(p.name) + '</span></button>';
      }).join('') + '</div></section>';
  }

  function recentStrip() {
    var products = recent.map(function (id) { var f = findProduct(id); return f && f.product; }).filter(Boolean);
    if (!products.length) return '';
    return '<section class="saved-products recent-products ' + (recentCollapsed ? 'collapsed' : '') + '" data-reveal>' +
      '<div class="saved-products-head"><h3>Recently viewed</h3><div class="saved-products-actions">' +
        '<button data-recent-toggle aria-label="' + (recentCollapsed ? 'Expand' : 'Minimize') + ' recently viewed">' + chevron() + '</button>' +
        '<button data-recent-clear aria-label="Clear recently viewed">' + cross() + '</button>' +
      '</div></div>' +
      (recentCollapsed ? '' : '<div class="saved-product-strip">' + products.map(function (p) {
        return '<div class="saved-product-item"><button data-open-product="' + p.id + '">' +
          '<img src="' + esc(p.image || '') + '" alt="" loading="lazy"><span>' + esc(p.name) + '</span></button>' +
          '<button class="remove-recent" data-recent-remove="' + p.id + '" aria-label="Remove ' + esc(p.name) + '">' + cross() + '</button></div>';
      }).join('') + '</div>') + '</section>';
  }

  function chevron() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'; }
  function cross() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'; }
  function heart() { return '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 8 3C20 16.1 12 21 12 21Z"/></svg>'; }

  /* ------------------------------------------------------------- the hero */

  function heroMarkup() {
    var groups = categoryGroups(),
        productCount = catalog.reduce(function (t, c) { return t + c.products.length; }, 0),
        items = groups.map(function (g) { return '<span class="marquee-item">' + esc(g.name) + '</span>'; }).join('');
    return '<section class="hero">' +
      '<div class="hero-eyebrow"><p class="eyebrow">DR PHONE wholesale</p></div>' +
      '<h1 class="hero-headline">' +
        '<span class="reveal-line"><i style="--d:.05s">Phones,</i></span>' +
        '<span class="reveal-line"><i style="--d:.15s">tech &amp;</i></span>' +
        '<span class="reveal-line"><i style="--d:.25s">lots <em>more.</em></i></span>' +
      '</h1>' +
      '<div class="hero-rule"></div>' +
      '<div class="hero-meta">' +
        '<div class="hero-stat"><b data-count-to="' + productCount + '">0</b><span>Products</span></div>' +
        '<div class="hero-stat"><b data-count-to="' + catalog.length + '">0</b><span>Categories</span></div>' +
        '<div class="hero-stat"><b data-count-to="' + groups.length + '">0</b><span>Departments</span></div>' +
      '</div>' +
      // The track is printed twice so the -50% loop is seamless.
      '<div class="marquee"><div class="marquee-track">' + items + items + '</div></div>' +
    '</section>';
  }

  /* ------------------------------------------------------ category screen */

  function categoryRows() {
    var number = 0;
    return categoryGroups().map(function (group) {
      return '<section class="catalog-group" data-reveal><h3>' + esc(group.name) + '</h3><div class="category-rows">' +
        group.categories.map(function (c) {
          number++;
          return '<button class="category-row" data-slug="' + esc(c.slug) + '">' +
            '<span class="category-index">' + String(number).padStart(2, '0') + '</span>' +
            '<span class="category-name">' + esc(c.name) + '</span>' +
            '<span class="category-count">' + c.products.length + ' items</span>' +
            '<span class="category-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>' +
          '</button>';
        }).join('') + '</div></section>';
    }).join('');
  }

  function renderCategories() {
    content.innerHTML = heroMarkup() +
      productStrip('♥ Favorites', favorites) +
      recentStrip() +
      '<div class="section-heading" data-reveal><div><p class="eyebrow">Browse the collection</p><h2>Choose a category</h2></div>' +
        '<span class="result-count">' + catalog.length + ' categories</span></div>' +
      categoryRows();

    content.onchange = null;
    content.onclick = function (e) {
      if (e.target.closest('[data-recent-toggle]')) {
        recentCollapsed = !recentCollapsed;
        try { localStorage.setItem(RECENT_COLLAPSED_KEY, recentCollapsed ? '1' : '0'); } catch (err) {}
        renderCategories();
        return;
      }
      if (e.target.closest('[data-recent-clear]')) {
        recent = [];
        try { localStorage.setItem(RECENT_KEY, '[]'); } catch (err) {}
        renderCategories();
        return;
      }
      var remove = e.target.closest('[data-recent-remove]');
      if (remove) {
        recent = recent.filter(function (id) { return Number(id) !== Number(remove.dataset.recentRemove); });
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (err) {}
        renderCategories();
        return;
      }
      var open = e.target.closest('[data-open-product]');
      if (open) {
        var found = findProduct(open.dataset.openProduct);
        if (found) openProduct(found.product);
        return;
      }
      var b = e.target.closest('[data-slug]');
      if (!b) return;
      selected = b.dataset.slug;
      search.value = '';
      syncSearchClear();
      location.hash = selected;
      render();
      scrollTo({ top: 0, behavior: 'smooth' });
    };

    observeReveals(content);
    runCounters(content);
  }

  /* -------------------------------------------------------- product cards */

  function selectMarkup(label, kind, values, current, p) {
    if (!values.length) return '';
    return '<label class="product-select"><span>' + esc(label) + '</span>' +
      '<select data-choice="' + kind + '" data-id="' + p.id + '">' +
      values.map(function (v, i) {
        var value = kind === 'option' ? String(i) : v;
        var title = kind === 'option' ? v.name + ' — ' + money(v.price) : v;
        return '<option value="' + esc(value) + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + esc(title) + '</option>';
      }).join('') + '</select></label>';
  }

  function productCard(p, index) {
    var o = options(p), c = colors(p), f = flavors(p), s = choice(p),
        status = variantStatus(p, s),
        cardLine = findLine(lineKey(p.id, s.option, s.color, s.flavor)),
        cardQty = cardLine ? cardLine.quantity : 0,
        meta = [p.sku, p.type].filter(Boolean).join(' · ');

    var price = o.length > 1
      ? '<div class="option-table"><div><b>Option</b><b>Price</b></div>' + o.map(function (x) {
          return '<div><span>' + esc(x.name) + '</span><strong>' + money(x.price) + '</strong></div>';
        }).join('') + '</div>'
      : '<p class="price">' + (o[0] ? money(o[0].price) : 'Price on request') + '</p>';

    var colorPicker = c.length > 1
      ? '<div class="color-picker"><span>Choose color</span><div>' + c.map(function (color) {
          return '<button data-color="' + esc(color) + '" data-id="' + p.id + '" class="' + (color === s.color ? 'active' : '') + '">' + esc(color) + '</button>';
        }).join('') + '</div></div>'
      : '';

    var buy;
    if (f.length) {
      buy = '<button class="choose-flavors" data-open-product="' + p.id + '">Choose flavors <b>' + f.length + '</b></button>';
    } else if (status === 'out-of-stock') {
      buy = '<button class="add-cart" disabled>Out of stock</button>';
    } else {
      buy = qtyControl(p, s);
    }

    return '<article class="product-card" data-reveal style="--reveal-delay:' + (index < 8 ? index * 45 : 0) + 'ms">' +
      '<button class="favorite-button ' + (favorites.indexOf(Number(p.id)) >= 0 ? 'active' : '') + '"' +
        ' data-favorite="' + p.id + '" aria-label="Save ' + esc(p.name) + '">' + heart() + '</button>' +
      '<button class="image-frame" data-open-product="' + p.id + '" aria-label="Open ' + esc(p.name) + '">' +
        /* width/height give the frame its shape before the picture arrives, so
           the card does not jump as each one lands; decoding="async" keeps that
           work off the thread that is handling the scroll. */
        (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" width="600" height="600">' : '<div class="image-missing">Image unavailable</div>') +
      '</button>' +
      '<div class="product-info">' +
        '<div class="product-label-row"><p class="product-brand">' + esc(p.brand || 'DR PHONE') + '</p>' +
          '<span class="stock ' + esc(status) + '">' + esc(stockLabel(p, s, status)) + '</span></div>' +
        '<h3>' + esc(p.name) + '</h3>' +
        (meta ? '<p class="product-meta">' + esc(meta) + '</p>' : '') +
        price +
        tierLadder(p, s, cardQty) +
        (o.length > 1 ? selectMarkup('Choose option', 'option', o, s.option, p) : '') +
        colorPicker +
        '<div class="buy-row">' + buy + '</div>' +
      '</div></article>';
  }

  /* One order-pad line: the same product, roughly a sixth of the height of its
     card, so a buyer filling a big order sees a dozen at a time instead of two.
     Flavored products still route through the detail panel — a dozen flavors
     cannot sit in a single row. */
  function productRow(p) {
    var o = options(p), c = colors(p), f = flavors(p), s = choice(p),
        status = variantStatus(p, s),
        line = findLine(lineKey(p.id, s.option, s.color, s.flavor)),
        qty = line ? line.quantity : 0,
        unit = o[s.option] || o[0];

    var control;
    if (f.length) control = '<button class="pad-variants" data-open-product="' + p.id + '">Flavors <b>' + f.length + '</b></button>';
    else if (status === 'out-of-stock') control = '<span class="pad-out">Out of stock</span>';
    else control = qtyControl(p, s, { hint: false });

    return '<div class="pad-row' + (qty ? ' has-qty' : '') + '">' +
      '<button class="pad-thumb" data-open-product="' + p.id + '" aria-label="Open ' + esc(p.name) + '">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" width="44" height="44">' : '<span class="pad-noimg" aria-hidden="true"></span>') +
      '</button>' +
      '<div class="pad-main">' +
        '<b class="pad-name">' + esc(p.name) + '</b>' +
        '<span class="pad-meta">' + esc([p.sku, p.brand].filter(Boolean).join(' · ')) +
          '<i class="stock ' + esc(status) + '">' + esc(stockLabel(p, s, status)) + '</i></span>' +
        (o.length > 1 || c.length > 1
          ? '<span class="pad-choices">' +
              (o.length > 1 ? selectMarkup('Option', 'option', o, s.option, p) : '') +
              (c.length > 1 ? selectMarkup('Color', 'color', c, s.color, p) : '') +
            '</span>'
          : '') +
      '</div>' +
      '<div class="pad-buy">' +
        '<span class="pad-price">' + (unit ? money(unit.price) : 'On request') + '</span>' +
        control +
      '</div></div>';
  }

  function filterBar(pool) {
    var brands = brandsIn(pool);
    return '<div class="filter-bar">' +
      (brands.length > 1
        ? '<label class="filter-field"><span>Brand</span><select data-filter="brand">' +
            '<option value="">All brands</option>' +
            brands.map(function (b) {
              return '<option value="' + esc(b) + '"' + (b === filters.brand ? ' selected' : '') + '>' + esc(b) + '</option>';
            }).join('') + '</select></label>'
        : '') +
      '<button type="button" class="filter-toggle' + (filters.inStock ? ' active' : '') + '" data-filter="inStock"' +
        ' aria-pressed="' + (filters.inStock ? 'true' : 'false') + '">In stock only</button>' +
      '<label class="filter-field filter-price"><span>Price</span>' +
        '<input type="text" inputmode="decimal" data-filter="min" placeholder="Min" value="' + esc(filters.min) + '" aria-label="Minimum price">' +
        '<i aria-hidden="true">–</i>' +
        '<input type="text" inputmode="decimal" data-filter="max" placeholder="Max" value="' + esc(filters.max) + '" aria-label="Maximum price">' +
      '</label>' +
      (filtersActive() ? '<button type="button" class="filter-clear" data-filter="clear">Clear filters</button>' : '') +
    '</div>';
  }

  /* ---- the grid is built in batches -------------------------------------
   * A search for a common word matches hundreds of products: "xo" matches 231.
   * Building all of them in one go was 358 KB of HTML and ~1.1 seconds of
   * blocked main thread on a mid-range phone — the tap registered, then nothing
   * moved, then everything appeared at once. The first batch is built now and
   * the rest as the customer scrolls towards them.
   *
   * The count survives a re-render of the SAME result set — choosing a colour
   * re-renders — and resets only when the result set itself changes, so nobody
   * gets thrown back to the top of a long list. */
  var GRID_BATCH = 60, gridLimit = GRID_BATCH, gridSignature = '', gridObserver = null;

  function resultSignature(products) {
    return [selected || '', search.value.trim(), sortMode, viewMode, filters.brand,
            filters.inStock, filters.min, filters.max, products.length].join('|');
  }

  /* Adds the next batch to the end of the grid. Appending rather than
     re-rendering keeps every card the customer has already scrolled past, along
     with the quantities they have typed into them. */
  function extendGrid(products, build) {
    var box = content.querySelector('.product-grid, .order-pad');
    if (!box) return;
    var to = Math.min(products.length, gridLimit + GRID_BATCH), html = '';
    for (var i = gridLimit; i < to; i++) html += build(products[i], i);
    if (!html) return;
    box.insertAdjacentHTML('beforeend', html);
    gridLimit = to;
    observeReveals(box);
    if (gridLimit >= products.length) {
      var done = content.querySelector('.grid-sentinel');
      if (done) done.remove();
      if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }
    }
  }

  function watchGridSentinel(products, build) {
    if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }
    var sentinel = content.querySelector('.grid-sentinel');
    if (!sentinel) return;
    if (!('IntersectionObserver' in window)) {   // no observer: show everything
      while (gridLimit < products.length) extendGrid(products, build);
      return;
    }
    // A screen and a half of warning, so the next batch is ready on arrival.
    gridObserver = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) extendGrid(products, build);
    }, { rootMargin: '1200px 0px' });
    gridObserver.observe(sentinel);
  }

  function renderResults() {
    var category = searchScope(), pool = basePool(), products = getProducts(), q = search.value.trim();
    var signature = resultSignature(products);
    if (signature !== gridSignature) { gridSignature = signature; gridLimit = GRID_BATCH; }
    var build = viewMode === 'list' ? productRow : productCard,
        shown = products.slice(0, gridLimit);
    content.innerHTML =
      '<div class="section-heading product-heading">' +
        '<button class="back-button" id="back" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6M11 18l-6-6 6-6"/></svg></button>' +
        '<div class="result-title"><h2>' + esc(category ? category.name : 'Results for “' + q + '”') + '</h2></div>' +
        '<div class="result-tools"><span class="result-count">' + products.length + ' items' +
            (filtersActive() && pool.length !== products.length ? ' <i>of ' + pool.length + '</i>' : '') + '</span>' +
          '<div class="view-toggle" role="group" aria-label="View">' +
            '<button type="button" data-view="grid" class="' + (viewMode === 'grid' ? 'active' : '') + '"' +
              ' aria-pressed="' + (viewMode === 'grid' ? 'true' : 'false') + '">Cards</button>' +
            '<button type="button" data-view="list" class="' + (viewMode === 'list' ? 'active' : '') + '"' +
              ' aria-pressed="' + (viewMode === 'list' ? 'true' : 'false') + '">Order pad</button>' +
          '</div>' +
          '<label class="sort-control"><span>Sort</span><select id="sort">' +
            '<option value="original">Original order</option>' +
            '<option value="name">Name A–Z</option>' +
            '<option value="brand">Brand A–Z</option>' +
            '<option value="price-low">Price: low to high</option>' +
            '<option value="price-high">Price: high to low</option>' +
          '</select></label></div>' +
      '</div>' +
      filterBar(pool) +
      (products.length
        ? (viewMode === 'list'
            ? '<div class="order-pad">' + shown.map(productRow).join('') + '</div>'
            : '<div class="product-grid">' + shown.map(productCard).join('') + '</div>') +
          (products.length > gridLimit ? '<div class="grid-sentinel" aria-hidden="true"></div>' : '')
        : '<div class="empty-state"><h3>No products found</h3><p>' +
            (filtersActive() ? 'No product matches these filters. Try clearing them.' : 'Try a different search term or category.') +
          '</p></div>');

    var sortSelect = document.getElementById('sort');
    sortSelect.value = sortMode;
    sortSelect.onchange = function (e) { sortMode = e.target.value; renderResults(); };
    document.getElementById('back').onclick = function () {
      selected = null;
      search.value = '';
      syncSearchClear();
      sortMode = 'original';
      filters = { brand: '', inStock: false, min: '', max: '' };
      history.replaceState(null, '', location.pathname);
      render();
    };

    content.onchange = function (e) {
      var brand = e.target.closest('[data-filter="brand"]');
      if (brand) { filters.brand = brand.value; renderResults(); return; }

      var el = e.target.closest('[data-choice]');
      if (!el) return;
      var found = findProduct(el.dataset.id);
      if (!found) return;
      var p = found.product, key = String(p.id), s = choice(p);
      s[el.dataset.choice] = el.dataset.choice === 'option' ? Number(el.value) : el.value;
      selections[key] = s;
      renderResults();
    };

    /* Price fields re-filter as you type, but rebuilding the list would steal
       focus mid-keystroke, so the field is put back afterwards. */
    content.oninput = function (e) {
      var box = e.target.closest('[data-filter="min"], [data-filter="max"]');
      if (!box) return;
      var which = box.dataset.filter, caret = box.selectionStart;
      filters[which] = box.value.replace(/[^0-9.]/g, '');
      renderResults();
      var again = content.querySelector('[data-filter="' + which + '"]');
      if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch (err) {} }
    };
    content.onclick = function (e) {
      var view = e.target.closest('[data-view]');
      if (view) {
        viewMode = view.dataset.view;
        try { localStorage.setItem(VIEW_KEY, viewMode); } catch (err) {}
        renderResults();
        return;
      }
      var filter = e.target.closest('.filter-bar [data-filter]');
      if (filter) {
        if (filter.dataset.filter === 'inStock') { filters.inStock = !filters.inStock; renderResults(); return; }
        if (filter.dataset.filter === 'clear') {
          filters = { brand: '', inStock: false, min: '', max: '' };
          renderResults();
          return;
        }
      }
      var favorite = e.target.closest('[data-favorite]');
      if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
      var open = e.target.closest('[data-open-product]');
      if (open) {
        var opened = findProduct(open.dataset.openProduct);
        if (opened) openProduct(opened.product);
        return;
      }
      var color = e.target.closest('[data-color]');
      if (color) {
        var colored = findProduct(color.dataset.id);
        if (colored) {
          var key = String(colored.product.id), s = choice(colored.product);
          s.color = color.dataset.color;
          selections[key] = s;
          renderResults();
        }
      }
    };

    observeReveals(content);
    watchGridSentinel(products, build);
  }

  function render() {
    purgeEmptyLines();
    (activeCategory() || search.value.trim()) ? renderResults() : renderCategories();
  }

  /* ------------------------------------------------------- product detail */

  function findProductBySku(sku) {
    var needle = String(sku || '').toLowerCase();
    return allProducts().find(function (x) { return String(x.product.sku || '').toLowerCase() === needle; });
  }

  /* The hash normally holds the open category. While a product panel is open it
     holds #p/<sku> instead, so the link can be sent to a customer over WhatsApp
     and open on that exact product. SKU rather than id: it reads better and
     survives a CSV re-import. */
  function productHash(p) { return p && p.sku ? 'p/' + p.sku : ''; }

  function openProduct(p) {
    detailProduct = p;
    flavorQuery = '';
    var hash = productHash(p);
    if (hash) {
      // Don't record a product hash as the "return to" hash — on a cold deep-link
      // the current hash is already #p/<sku>, and closing would restore itself.
      var current = decodeURIComponent(location.hash.slice(1));
      hashBeforeProduct = current.indexOf('p/') === 0 ? (selected || '') : current;
      history.replaceState(null, '', '#' + hash);
    }
    recent = [Number(p.id)].concat(recent.filter(function (x) { return x !== Number(p.id); })).slice(0, 12);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) {}
    renderDetail();
    openPanel('product-panel');
  }

  function renderDetail() {
    var box = document.getElementById('product-content'), p = detailProduct;
    if (!box || !p) return;
    var o = options(p), c = colors(p), f = flavors(p), s = choice(p),
        filtered = f.filter(function (name) { return name.toLowerCase().indexOf(flavorQuery.toLowerCase()) >= 0; }),
        images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []),
        standardStatus = variantStatus(p, s);

    var flavorRows = filtered.map(function (flavor) {
      var state = { option: s.option, color: s.color, flavor: flavor },
          status = variantStatus(p, state);
      return '<div class="flavor-row ' + esc(status) + '">' +
        '<span><b>' + esc(flavor) + '</b><small class="flavor-avail">' + esc(availabilityText(p, state, status)) + '</small></span>' +
        qtyControl(p, state, { hint: false, label: p.name + ' — ' + flavor }) +
      '</div>';
    }).join('');

    box.innerHTML =
      '<div class="detail-gallery">' +
        '<div class="detail-image">' + (images[0] ? '<img src="' + esc(images[0]) + '" alt="' + esc(p.name) + '">' : 'Image unavailable') + '</div>' +
        (images.length > 1 ? '<div class="detail-thumbnails">' + images.map(function (src) {
          return '<img src="' + esc(src) + '" alt="" data-detail-thumb="' + esc(src) + '">';
        }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="detail-controls">' +
        '<div class="detail-title"><div><p class="eyebrow">' + esc(p.brand || 'DR PHONE') + '</p><h2>' + esc(p.name) + '</h2></div>' +
          '<button data-detail-favorite class="favorite-button ' + (favorites.indexOf(Number(p.id)) >= 0 ? 'active' : '') + '" aria-label="Save product">' + heart() + '</button></div>' +
        (p.type ? '<p class="product-meta">' + esc(p.type) + '</p>' : '') +
        (o.length > 1 ? selectMarkup('Choose option', 'option', o, s.option, p) : '<p class="price">' + (o[0] ? money(o[0].price) : 'Price on request') + '</p>') +
        tierLadder(p, s, (function (l) { return l ? l.quantity : 0; })(findLine(lineKey(p.id, s.option, s.color, s.flavor)))) +
        (c.length > 1 ? '<div class="color-picker"><span>Choose color</span><div>' + c.map(function (color) {
          return '<button data-detail-color="' + esc(color) + '" class="' + (color === s.color ? 'active' : '') + '">' + esc(color) + '</button>';
        }).join('') + '</div></div>' : '') +
        (f.length
          ? '<div class="flavor-panel"><label class="flavor-search">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>' +
              '<input id="flavor-search" type="search" placeholder="Search flavors" value="' + esc(flavorQuery) + '">' +
            '</label><div class="flavor-list">' + (flavorRows || '<div class="empty-state"><h3>No matches</h3></div>') + '</div></div>'
          : '<div class="detail-add">' + (standardStatus === 'out-of-stock'
              ? '<button class="add-cart" disabled>Out of stock</button>'
              : qtyControl(p, s)) + '</div>') +
      '</div>';

    box.oninput = function (e) {
      if (e.target.id !== 'flavor-search') return;
      flavorQuery = e.target.value;
      renderDetail();
      var input = document.getElementById('flavor-search');
      if (input) { input.focus(); try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {} }
    };
    box.onchange = function (e) {
      var el = e.target.closest('[data-choice]');
      if (!el) return;
      var state = choice(p);
      state.option = Number(el.value);
      selections[String(p.id)] = state;
      renderDetail();
    };
    box.onclick = function (e) {
      if (e.target.closest('[data-detail-favorite]')) { toggleFavorite(p.id); return; }
      var thumb = e.target.closest('[data-detail-thumb]');
      if (thumb) {
        var main = box.querySelector('.detail-image img');
        if (main) main.src = thumb.dataset.detailThumb;
        return;
      }
      var color = e.target.closest('[data-detail-color]');
      if (color) {
        var state = choice(p);
        state.color = color.dataset.detailColor;
        selections[String(p.id)] = state;
        renderDetail();
      }
    };
  }

  /* ------------------------------------------------------------ the cart */

  function cartGroups() {
    var groups = [];
    cart.forEach(function (line) {
      if (line.quantity <= 0) return;
      var group = groups.find(function (g) { return Number(g.productId) === Number(line.productId); });
      if (!group) { group = { productId: line.productId, lines: [] }; groups.push(group); }
      group.lines.push(line);
    });
    return groups;
  }

  function variantLabel(p, line) {
    var o = options(p)[line.option], parts = [];
    if (o && o.name && o.name !== 'Standard') parts.push(o.name);
    if (line.color && line.color !== 'Standard') parts.push('Color: ' + line.color);
    if (line.flavor) parts.push('Flavor: ' + line.flavor);
    return parts.join(' · ') || 'Standard';
  }
  function displayName(p) { return p.name + (p.sku ? ' [' + p.sku + ']' : ''); }

  function cartLine(p, line) {
    var unit = unitPrice(p, line),
        state = { option: line.option, color: line.color, flavor: line.flavor },
        remaining = remainingQuantity(p, state);
    return '<div class="cart-line cart-variant" data-line-key="' + esc(line.key) + '">' +
      '<div><p>' + esc(variantLabel(p, line)) + '</p>' +
        '<small>' + money(unit) + ' each' + ((p.tiers || []).length ? ' · tier price applied automatically' : '') +
          (remaining !== null ? ' · ' + remaining + ' more available' : '') + '</small>' +
        '<input class="line-note" data-line-note="' + esc(line.key) + '" placeholder="Note for this item" value="' + esc(lineNotes[line.key] || '') + '"></div>' +
      qtyControl(p, state, { hint: false, label: displayName(p) + ' — ' + variantLabel(p, line) }) +
      '<strong data-line-total>' + money(unit * line.quantity) + '</strong>' +
      '<button class="remove-line" data-line="remove" data-key="' + esc(line.key) + '" aria-label="Remove item">' + cross() + '</button>' +
    '</div>';
  }

  function cartGroup(group) {
    var found = findProduct(group.productId);
    if (!found) return '';
    var p = found.product,
        totalQty = group.lines.reduce(function (t, l) { return t + l.quantity; }, 0);
    return '<article class="cart-group"><header>' +
      '<img src="' + esc(p.image || '') + '" alt="" loading="lazy">' +
      '<div><h4>' + esc(displayName(p)) + '</h4>' +
        '<small data-group-count="' + esc(p.id) + '">' + totalQty + (totalQty === 1 ? ' piece' : ' pieces') + '</small></div>' +
    '</header><div class="cart-variants">' + group.lines.map(function (line) { return cartLine(p, line); }).join('') + '</div></article>';
  }

  function renderCart() {
    var box = document.getElementById('cart-content');
    if (!box) return;
    purgeEmptyLines();

    var total = 0;
    cart.forEach(function (line) {
      var f = findProduct(line.productId);
      if (f) total += unitPrice(f.product, line) * line.quantity;
    });
    var minimum = Number((window.DR_PHONE.store || {}).minimum_order || 0);

    var customerForm = '<section class="order-customer">' +
      '<div><span>Order reference</span><strong>' + esc(orderReference) + '</strong></div>' +
      '<div class="order-fields">' +
        '<input data-customer="name" placeholder="Customer name" value="' + esc(customer.name) + '">' +
        '<input data-customer="phone" placeholder="Phone number" value="' + esc(customer.phone) + '">' +
        '<input data-customer="business" placeholder="Business name (optional)" value="' + esc(customer.business) + '">' +
        '<textarea data-customer="notes" placeholder="Order notes (optional)">' + esc(customer.notes) + '</textarea>' +
      '</div></section>';

    // A cart can now be days old (it survives closing the tab), so say so rather
    // than letting someone send a stale order without noticing.
    var age = cartAgeDays(),
        staleNotice = (cart.length && age >= 3 && !staleDismissed)
          ? '<p class="cart-stale" data-cart-stale>You started this order ' + age + ' days ago. Check the quantities before sending.' +
            '<button type="button" data-dismiss-stale aria-label="Dismiss">&times;</button></p>'
          : '';

    box.innerHTML = staleNotice + customerForm + (cart.length
      ? cartGroups().map(cartGroup).join('') +
        '<p class="minimum-warning" data-min-warning' + (minimum && total < minimum ? '' : ' hidden') + '>' +
          (minimum && total < minimum ? 'Add ' + money(minimum - total) + ' to reach the ' + money(minimum) + ' minimum order.' : '') + '</p>' +
        '<div class="cart-total"><span>Total</span><strong data-cart-total>' + money(total) + '</strong></div>'
      : '<div class="empty-state"><h3>Your cart is empty</h3><p>Choose a product option, color or flavor and add it here.</p></div>');

    box.oninput = function (e) {
      var field = e.target.dataset.customer;
      if (field) {
        customer[field] = e.target.value;
        try { sessionStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer)); } catch (err) {}
      }
      if (e.target.dataset.lineNote) {
        lineNotes[e.target.dataset.lineNote] = e.target.value;
        try { localStorage.setItem(NOTES_KEY, JSON.stringify(lineNotes)); } catch (err) {}
      }
    };
    box.onclick = function (e) {
      if (e.target.closest('[data-dismiss-stale]')) { staleDismissed = true; renderCart(); return; }
      var b = e.target.closest('[data-line="remove"]');
      if (!b) return;
      cart = cart.filter(function (i) { return i.key !== b.dataset.key; });
      saveCart();
      renderCart();
      render();
    };
  }

  function shareWhatsApp() {
    if (!cart.length) return;
    orderReference = newOrderReference();
    try { sessionStorage.setItem(REFERENCE_KEY, orderReference); } catch (e) {}
    var lines = ['Hello DR PHONE, I would like to order:', 'Reference: ' + orderReference], total = 0;
    if (customer.name) lines.push('Customer: ' + customer.name);
    if (customer.business) lines.push('Business: ' + customer.business);
    if (customer.phone) lines.push('Phone: ' + customer.phone);
    if (customer.notes) lines.push('Notes: ' + customer.notes);
    lines.push('');
    cartGroups().forEach(function (group) {
      var f = findProduct(group.productId);
      if (!f) return;
      var p = f.product;
      lines.push(displayName(p) + ':');
      group.lines.forEach(function (line) {
        var unit = unitPrice(p, line);
        total += unit * line.quantity;
        lines.push('  • ' + variantLabel(p, line) + ' × ' + line.quantity + ' — ' + money(unit * line.quantity) +
          (lineNotes[line.key] ? ' · ' + lineNotes[line.key] : ''));
      });
      lines.push('');
    });
    lines.push('Total: ' + money(total));

    /* Record the order before handing off to WhatsApp. sendBeacon is
       fire-and-forget and survives the navigation; window.open must stay
       synchronous inside the click handler or the popup blocker eats it. */
    logOrder();
    rememberPendingOrder(total);

    window.open('https://wa.me/' + String(window.DR_PHONE.phone || '').replace(/\D/g, '').replace(/^00/, '') +
      '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
  }

  /* Sends what was ordered plus the customer's name, which is what the shop
     files the receipt under. The phone number, business name and notes are not
     sent: they stay in this browser and travel in the WhatsApp message only.
     The server re-prices every line from the catalog, so nothing here is
     authoritative. */
  function newOrderReference() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return 'DR-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' +
      Array.from(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function logOrder() {
    if (!cart.length) return;
    try {
      var body = JSON.stringify({
        csrf: window.DR_PHONE.csrf || '',
        reference: orderReference,
        customer_name: customer.name || '',
        lines: cart.filter(function (l) { return l.quantity > 0; }).map(function (l) {
          return { productId: l.productId, option: l.option, color: l.color, flavor: l.flavor, quantity: l.quantity };
        })
      });
      var sent = navigator.sendBeacon && navigator.sendBeacon('api/order.php', new Blob([body], { type: 'application/json' }));
      if (!sent) fetch('api/order.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) { /* logging must never block the order */ }
  }

  /* ---- did the order actually get sent? -------------------------------- *
   * The order is recorded when the WhatsApp button is tapped, which is before
   * the message is composed. WhatsApp reports nothing back, so the only way to
   * know is to ask: when the customer returns to this tab, offer Yes / No.
   * Ignoring the question is fine — the order stays unconfirmed and the shop
   * settles it from the dashboard. */

  var PENDING_KEY = 'dr-phone-pending-order',
      PENDING_MAX_AGE = 6 * 60 * 60 * 1000;   // an answer days later means nothing

  function rememberPendingOrder(total) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        reference: orderReference, total: total, at: Date.now()
      }));
    } catch (e) {}
  }
  function clearPendingOrder() { try { localStorage.removeItem(PENDING_KEY); } catch (e) {} }
  function readPendingOrder() {
    try {
      var raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (!raw || !raw.reference) return null;
      var age = Date.now() - Number(raw.at || 0);
      if (age > PENDING_MAX_AGE) { clearPendingOrder(); return null; }
      // Opening WhatsApp can fire a blur/focus pair straight away on some
      // setups; don't ask before they have had a chance to send anything.
      if (age < 1500) return null;
      return raw;
    } catch (e) { return null; }
  }

  function answerPendingOrder(reference, status) {
    clearPendingOrder();
    try {
      fetch('api/order-status.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrf: window.DR_PHONE.csrf || '', reference: reference, status: status })
      }).catch(function () {});
    } catch (e) {}
  }

  function showOrderConfirm() {
    var pending = readPendingOrder();
    if (!pending || document.getElementById('order-confirm')) return;

    var bar = document.createElement('div');
    bar.id = 'order-confirm';
    bar.className = 'order-confirm';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<div class="order-confirm-text">' +
        '<b>Did you send order ' + esc(pending.reference) + '?</b>' +
        '<span>Telling us keeps your order from being missed.</span>' +
      '</div>' +
      '<div class="order-confirm-actions">' +
        '<button type="button" data-order-answer="confirmed">Yes, sent</button>' +
        '<button type="button" class="ghost" data-order-answer="cancelled">No</button>' +
        '<button type="button" class="order-confirm-close" data-order-answer="" aria-label="Ask me later">&times;</button>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('open'); });

    bar.addEventListener('click', function (e) {
      var button = e.target.closest && e.target.closest('[data-order-answer]');
      if (!button) return;
      var answer = button.dataset.orderAnswer;
      // Dismissed rather than answered: forget the prompt, leave the order
      // unconfirmed so the shop can settle it.
      if (answer) answerPendingOrder(pending.reference, answer); else clearPendingOrder();
      bar.classList.remove('open');
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 260);
    });
  }

  /* ----------------------------------------------------------- the panels */

  var lastFocused = null;

  function openPanel(id) {
    var panel = document.getElementById(id);
    if (!panel) return;
    lastFocused = document.activeElement;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.getElementById('panel-overlay').classList.add('open');
    document.body.classList.add('panel-open');
    if (id === 'cart-panel') renderCart();
    var close = panel.querySelector('.panel-close');
    if (close) close.focus();
  }

  function closePanels() {
    var open = document.querySelectorAll('.side-panel.open');
    if (!open.length) return;
    if (document.getElementById('product-panel').classList.contains('open')) {
      history.replaceState(null, '', hashBeforeProduct ? '#' + hashBeforeProduct : location.pathname);
      hashBeforeProduct = '';
    }
    Array.prototype.forEach.call(open, function (p) {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('panel-overlay').classList.remove('open');
    document.body.classList.remove('panel-open');
    if (lastFocused && lastFocused.focus) { try { lastFocused.focus(); } catch (e) {} }
    lastFocused = null;
  }

  function syncSearchClear() {
    var clear = document.getElementById('search-clear');
    if (clear) clear.hidden = !search.value;
  }

  /* --------------------------------------------------------------- boot */

  cart = loadCart();
  try { favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); if (!Array.isArray(favorites)) favorites = []; } catch (e) { favorites = []; }
  try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); if (!Array.isArray(recent)) recent = []; } catch (e) { recent = []; }
  try { lineNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch (e) { lineNotes = {}; }
  try { recentCollapsed = localStorage.getItem(RECENT_COLLAPSED_KEY) === '1'; } catch (e) { recentCollapsed = false; }
  try { viewMode = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) { viewMode = 'grid'; }
  try {
    customer = JSON.parse(sessionStorage.getItem(CUSTOMER_KEY) || '{"name":"","phone":"","business":"","notes":""}');
  } catch (e) { customer = { name: '', phone: '', business: '', notes: '' }; }
  try {
    orderReference = sessionStorage.getItem(REFERENCE_KEY) ||
      ('DR-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000));
    sessionStorage.setItem(REFERENCE_KEY, orderReference);
  } catch (e) {
    orderReference = 'DR-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  search.addEventListener('input', function () { syncSearchClear(); render(); });
  var searchClear = document.getElementById('search-clear');
  if (searchClear) {
    searchClear.onclick = function () { search.value = ''; syncSearchClear(); search.focus(); render(); };
  }

  document.getElementById('menu-open').onclick = function () { openPanel('category-menu'); };
  document.getElementById('cart-open').onclick = function () { openPanel('cart-panel'); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-close-panel]'), function (b) { b.onclick = closePanels; });
  document.getElementById('panel-overlay').onclick = closePanels;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanels(); });

  /* Coming back from WhatsApp: a tab switch on a phone, a window focus on a
     desktop, or a fresh load if they closed the tab and returned later. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') showOrderConfirm();
  });
  window.addEventListener('focus', showOrderConfirm);
  setTimeout(showOrderConfirm, 1200);

  document.getElementById('cart-clear').onclick = function () {
    cart = [];
    saveCart();
    renderCart();
    render();
  };
  document.getElementById('cart-whatsapp').onclick = shareWhatsApp;
  document.getElementById('cart-print').onclick = function () {
    document.body.classList.add('printing');
    window.print();
    setTimeout(function () { document.body.classList.remove('printing'); }, 1000);
  };

  var topButton = document.getElementById('scroll-top');
  window.addEventListener('scroll', function () {
    topButton.classList.toggle('visible', scrollY > 450);
  }, { passive: true });
  topButton.onclick = function () { scrollTo({ top: 0, behavior: 'smooth' }); };

  // Header condenses once the page has scrolled past the sentinel.
  var sentinel = document.getElementById('header-sentinel'), header = document.getElementById('site-header');
  if (sentinel && header && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  }

  bindQuantityEvents();
  updateCartCount();
  syncSearchClear();

  fetch('api/catalog.php', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { location.reload(); throw Error('Locked'); }
      return r.json();
    })
    .then(function (data) {
      catalog = data.catalog || [];
      window.DR_PHONE.store = data.store || {};
      window.DR_PHONE.csrf = data.csrf || '';
      normalizeCart();
      var hash = decodeURIComponent(location.hash.slice(1));
      var deepLink = hash.indexOf('p/') === 0 ? findProductBySku(hash.slice(2)) : null;
      if (!deepLink && catalog.some(function (c) { return c.slug === hash; })) selected = hash;
      renderMenu();
      render();
      // A shared link opens straight on the product; an unknown SKU just falls
      // back to the category screen rather than erroring.
      if (deepLink) { hashBeforeProduct = ''; openProduct(deepLink.product); }
      renderCart();

      window.DR_CATALOG_APP = {
        catalog: function () { return catalog; },
        cart: function () { return cart; },
        setCart: function (next) {
          cart = Array.isArray(next) ? next : [];
          normalizeCart();
          renderCart();
          render();
        },
        favorites: function () { return favorites; },
        openProduct: openProduct,
        openPanel: openPanel,
        renderCart: renderCart,
        findProduct: findProduct,
        options: options,
        colors: colors,
        flavors: flavors,
        changeVariant: changeVariant,
        setVariantQuantity: setVariantQuantity,
        unitPrice: unitPrice,
        customer: function () { return customer; },
        reference: function () { return orderReference; },
        notes: function () { return lineNotes; }
      };
      window.dispatchEvent(new Event('dr-catalog-ready'));
    })
    .catch(function (e) {
      if (e.message !== 'Locked') {
        content.innerHTML = '<div class="empty-state"><h3>Catalog unavailable</h3><p>Please refresh or contact DR PHONE.</p></div>';
      }
    });
})();
