'use strict';

goog.provide('lighter.RepeaterAttributeWidget');

goog.require('lighter.ExpressionCompiler');


/**
 * Repeater attribute widget
 * @constructor
 * @param {!Element} container The container element.
 * @param {!lighter.Scope} scope The scope from which to get items
 *   and from which are repeater scopes to inherit.
 * @param {string} source_key The key to use to get items.
 * @param {string} target_key The key to use for each item in its
 *   repeater scope.
 */
lighter.RepeaterAttributeWidget = function (
  container, scope, source_key, target_key) {

  this.container = container;
  this.scope = scope;
  this.source_key = source_key;
  this.target_key = target_key;

  this.pattern = container.firstElementChild;

  this.init_();
};

/**
 * Initializes the widget
 * - Called once during the widget construction and then each time the source
 *   array is replaced (i.e. the reference is broken)
 * @private
 */
lighter.RepeaterAttributeWidget.prototype.init_ = function () {
  var container = this.container;
  var state = [];
  var items = /** @type {Object} */ lighter.ExpressionCompiler.get(
    this.source_key, this.scope);

  container.innerHTML = '';

  if (items) {
    Array.prototype.forEach.call(items, function (item, i) {
      var repeater_scope = this.createItem_(item, i);
      container.appendChild(repeater_scope.$$root);
      state.push([ item, repeater_scope ]);
    }, this);
  }

  this.state = state;
  this.items_ = items;
};

/**
 * Creates a new repeater scope for the item with inheritance set up
 * - A clone of the pattern DOM is created and the scope is bound to it.
 * @private
 * @param {*} item The item data.
 * @return {!lighter.Scope} A repeater scope.
 */
lighter.RepeaterAttributeWidget.prototype.createItem_ = function (item, i) {
  var element = this.pattern.cloneNode(true);

  var repeater_scope = lighter.scope(element, this.scope);
  repeater_scope[this.target_key] = item;
  repeater_scope['$i'] = i;

  var template = lighter.compile(element, true);
  template(repeater_scope);

  return repeater_scope;
};

/**
 * Refreshes the widget from the current source array state
 * - If a broken source array reference is detected, the whole widget is
 *   reinitialized.
 * - The change-detecting algorithm compares the current source array
 *   items with the last known state.
 */
lighter.RepeaterAttributeWidget.prototype.update = function () {
  var self = this;
  var container = this.container;
  var state = this.state;
  var items = this.scope[this.source_key];

  if (items !== this.items_) {
    this.init_();
    this.fireChangeEvent_();
    return;
  }
  if (!items) {
    return;
  }

  var insertItem = function (i, item) {
    var repeater_scope = self.createItem_(item, i);
    var element = repeater_scope.$$root;
    container.insertBefore(element, container.childNodes[i + 1]);

    return repeater_scope;
  };
  var removeItem = function (i) {
    container.removeChild(container.childNodes[i]);
  };

  var changed = false;

  for (var i = 0, ii = items.length; i < ii; ++i) {
    var item = items[i];
    var ref = state[i];

    if (typeof ref === 'undefined') {
      if (typeof item !== 'undefined') {
        // New item at the end
        var repeater_scope = insertItem(i, item);
        state[i] = [ item, repeater_scope ];
        changed = true;
      }
    } else if (typeof item === 'undefined') {
      // Removed item
      if (ref !== null) {
        removeItem(i);
        state[i] = null;
        changed = true;
      }
    } else if (ref[0] !== item) {
      // Replaced item
      removeItem(i);
      var repeater_scope = insertItem(i, item);
      state[i] = [ item, repeater_scope ];
      changed = true;
    } else {
      ref[1].$update();
    }
  }

  if (changed) {
    this.fireChangeEvent_();
  }
};


lighter.RepeaterAttributeWidget.prototype.fireChangeEvent_ = function () {
  var container = this.container;
  var doc = container.ownerDocument;
  var e = doc.createEvent('HTMLEvents');
  e.initEvent('change', false, false);
  return container.dispatchEvent(e);
};
