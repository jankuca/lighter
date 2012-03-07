'use strict';

goog.provide('lighter.ViewAttributeWidget');


/**
 * View Attribute Widget
 * @constructor
 * @param {!Element} container The root element of the widget.
 * @param {!lighter.Scope} scope The scope from which the new scope inherits.
 * @param {string} key The key to use to get templates.
 */
lighter.ViewAttributeWidget = function (container, scope, key) {
  this.container = container;
  this.scope = scope;
  this.key = key;

  this.init_();
};

/**
 * Initializes the widget
 * @private
 */
lighter.ViewAttributeWidget.prototype.init_ = function () {
  var builder = /** @type {?function(Object=): string} */ this.scope[this.key];
  this.builder = builder;

  this.render(builder);
};

/**
 * Updates the widget
 */
lighter.ViewAttributeWidget.prototype.update = function () {
  var builder = /** @type {?function(Object=): string} */ this.scope[this.key];

  if (builder !== this.builder) {
    this.builder = builder;
    this.render(builder);
  }
};

/**
 * Rerenders the widget container based on the current scope state
 * @param {?function(Object=): string} builder A template builder function.
 */
lighter.ViewAttributeWidget.prototype.render = function (builder) {
  var container = this.container;

  container.innerHTML = '';

  if (builder) {
    // Create a temporary div in which will we place the view HTML
    var temp = document.createElement('div');
    // Attach the element to the DOM tree in order for XPath to work correctly
    temp.style.display = 'none';
    document.body.appendChild(temp);
    // Place the HTML returned by the builder in the temporary div
    temp.innerHTML = builder(this.scope);
    // Create a template from the temporary div
    var template = lighter.compile(temp);
    // Initialize the template
    template(this.scope);
    // Remove the temporary div from the DOM tree
    document.body.removeChild(temp);
    // Create a document fragment in which we're going to copy temp's children
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(temp.childNodes).forEach(function (node) {
      frag.appendChild(node);
    });
    // Move the DOM to the root widget element
    container.appendChild(frag);
  }
};
