/* HUQA admin — the few places a form needs to grow or shrink. */
(function () {
  'use strict';

  function money(value) { return '$' + (Math.round(value * 100) / 100).toFixed(2); }

  // -------------------------------------------------- product editor
  function productEditor() {
    var rows = document.getElementById('variant-rows');
    var category = document.getElementById('category');
    var bottle = document.getElementById('bottle-field');

    if (category && bottle) {
      var syncBottle = function () {
        bottle.hidden = category.value.indexOf('Liquids / ') !== 0;
        var select = bottle.querySelector('select');
        if (select) select.required = !bottle.hidden;
      };
      category.addEventListener('change', syncBottle);
      syncBottle();
    }

    if (!rows) return;

    var removeRow = function (row) {
      row.remove();
      // Never leave the editor with nothing to type into.
      if (!rows.querySelector('.variant-row')) addRow();
      renumber();
    };

    var renumber = function () {
      Array.prototype.forEach.call(rows.querySelectorAll('.variant-row'), function (row, index) {
        Array.prototype.forEach.call(row.querySelectorAll('[name]'), function (input) {
          input.name = input.name.replace(/variants\[\d*\]/, 'variants[' + index + ']');
        });
      });
    };

    var addRow = function () {
      var template = rows.querySelector('.variant-row');
      var row;
      if (template) {
        row = template.cloneNode(true);
        Array.prototype.forEach.call(row.querySelectorAll('input'), function (input) {
          if (input.type === 'checkbox') input.checked = true;
          else input.value = '';
        });
      } else {
        return;
      }
      rows.appendChild(row);
      wire(row);
      renumber();
      var first = row.querySelector('input[name*="[label]"]');
      if (first) first.focus();
    };

    var wire = function (row) {
      var button = row.querySelector('.remove-variant');
      if (button) button.addEventListener('click', function () { removeRow(row); });
    };

    Array.prototype.forEach.call(rows.querySelectorAll('.variant-row'), wire);
    var add = document.getElementById('add-variant');
    if (add) add.addEventListener('click', addRow);
  }

  // -------------------------------------------------- offer editor
  function bundleEditor() {
    var host = document.getElementById('item-rows');
    var field = document.getElementById('items-field');
    if (!host || !field) return;

    var options = [];
    try { options = JSON.parse(host.dataset.options || '[]'); } catch (e) { options = []; }

    var items = [];
    try { items = JSON.parse(field.value || '[]') || []; } catch (e) { items = []; }
    if (!items.length) items = [{productId: '', variantId: '', quantity: 1, free: false}];

    function priceOf(item) {
      var match = options.filter(function (o) {
        return o.productId === item.productId && o.variantId === item.variantId;
      })[0];
      return match ? match.price : 0;
    }

    function sync() {
      field.value = JSON.stringify(items.filter(function (i) { return i.productId && i.variantId; }));

      var mode = document.querySelector('input[name="mode"]:checked');
      mode = mode ? mode.value : 'items';
      var full = 0, paid = 0;
      items.forEach(function (item) {
        var line = priceOf(item) * item.quantity;
        full += line;
        if (!item.free) paid += line;
      });
      var valueInput = document.querySelector('input[name="value"]');
      var value = valueInput ? Number(valueInput.value || 0) : 0;
      var price = mode === 'fixed' ? value : (mode === 'percent' ? full * (1 - value / 100) : paid);
      price = Math.max(0, price);

      var preview = document.getElementById('price-preview');
      if (preview) {
        preview.textContent = 'Full price ' + money(full) + '  ·  Customer pays ' + money(price)
          + '  ·  Saving ' + money(Math.max(0, full - price));
      }

      var valueField = document.getElementById('value-field');
      var hint = document.getElementById('value-hint');
      if (valueField) valueField.hidden = mode === 'items';
      if (hint) hint.textContent = mode === 'percent' ? 'Percent off the full price.' : 'The flat price for the whole bundle.';

      document.querySelectorAll('.mode-option').forEach(function (label) {
        var radio = label.querySelector('input');
        label.classList.toggle('mode-on', Boolean(radio && radio.checked));
      });
    }

    function draw() {
      host.textContent = '';
      items.forEach(function (item, index) {
        var row = document.createElement('div');
        row.className = 'bundle-item-row';

        var pick = document.createElement('label');
        pick.className = 'field';
        pick.appendChild(document.createTextNode('Product & flavour'));
        var select = document.createElement('select');
        var blank = document.createElement('option');
        blank.value = ''; blank.textContent = 'Choose a product…';
        select.appendChild(blank);
        options.forEach(function (option) {
          var node = document.createElement('option');
          node.value = option.productId + '|' + option.variantId;
          node.textContent = option.label + ' — ' + money(option.price);
          if (option.productId === item.productId && option.variantId === item.variantId) node.selected = true;
          select.appendChild(node);
        });
        select.addEventListener('change', function () {
          var parts = select.value.split('|');
          item.productId = parts[0] || '';
          item.variantId = parts[1] || '';
          sync();
        });
        pick.appendChild(select);

        var qtyLabel = document.createElement('label');
        qtyLabel.className = 'field';
        qtyLabel.appendChild(document.createTextNode('Qty'));
        var qty = document.createElement('input');
        qty.type = 'number'; qty.min = '1'; qty.max = '99'; qty.value = String(item.quantity);
        qty.addEventListener('input', function () {
          item.quantity = Math.max(1, Math.min(99, Number(qty.value) || 1));
          sync();
        });
        qtyLabel.appendChild(qty);

        var freeLabel = document.createElement('label');
        freeLabel.className = 'switch-row switch-inline';
        var free = document.createElement('input');
        free.type = 'checkbox'; free.checked = Boolean(item.free);
        free.addEventListener('change', function () { item.free = free.checked; sync(); });
        freeLabel.appendChild(free);
        freeLabel.appendChild(Object.assign(document.createElement('span'), {textContent: 'Free'}));

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-small btn-ghost';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          items.splice(index, 1);
          if (!items.length) items.push({productId: '', variantId: '', quantity: 1, free: false});
          draw();
        });

        row.appendChild(pick); row.appendChild(qtyLabel); row.appendChild(freeLabel); row.appendChild(remove);
        host.appendChild(row);
      });
      sync();
    }

    var add = document.getElementById('add-item');
    if (add) add.addEventListener('click', function () {
      items.push({productId: '', variantId: '', quantity: 1, free: false});
      draw();
    });
    document.querySelectorAll('input[name="mode"]').forEach(function (radio) {
      radio.addEventListener('change', sync);
    });
    var valueInput = document.querySelector('input[name="value"]');
    if (valueInput) valueInput.addEventListener('input', sync);

    draw();
  }

  document.addEventListener('DOMContentLoaded', function () {
    productEditor();
    bundleEditor();
  });
})();
