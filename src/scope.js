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
