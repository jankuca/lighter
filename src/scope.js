'use strict';

goog.provide('lighter.Scope');


/**
 * Scope
 * @constructor
 * @param {!Element|Document} root The DOM element to which to bind the scope.
 */
lighter.Scope = function (root) {

  /**
   * The root element to which is the scope bound
   * @type {!Element|Document}
   */
  this.$$root = root;

  /**
   * An {Array} of widgets bound directly to the scope
   * @type {Array.<!Object>}
   */
  this.$$widgets = [];
};

/**
 * Binds the given widget to the scope in the sense that its update method
 * is invoked on each scope update
 * @param {!Object} widget The widget to bind to the scope.
 */
lighter.Scope.prototype.$addWidget = function (widget) {
  this.$$widgets.push(widget);
};

/**
 * Updates all widgets bound to the scope
 * This method is supposed to be called after any scope modification
 */
lighter.Scope.prototype.$update = function () {
  this.$$widgets.forEach(function (widget) {
    if (typeof widget.update === 'function') {
      widget.update();
    }
  });
};

/**
 * Subscribes the scope object to events of the given object and updates
 * the scope object on each received event.
 * @param {!Object} source The object to whose events to subscribe.
 * @param {string} type The event type to which to subscribe.
 * @param {?(function(): ?boolean | function(*): ?boolean)=} fn
 *   A listener function to call.
 * @param {boolean=} once Whether to unsubscribe after one event.
 */
lighter.Scope.prototype.$watch = function (source, type, fn, once) {
  if (arguments.length === 3 && typeof arguments[2] === 'boolean') {
    once = arguments[2];
    fn = null;
  }

  var listener = function (data) {
    var result;
    if (fn) {
      result = fn.call(this, data);
    }

    this.$update();

    return result;
  };

  source.on(type, listener, this, once);
};
