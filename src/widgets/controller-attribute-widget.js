'use strict';

goog.provide('lighter.ControllerAttributeWidget');


/**
 * Controller attribute widget
 * - A new scope is created and bound to the given element.
 * - The new scope inherits from the given scope.
 * - The controller constructor is invoked in the context of the scope.
 * - No actual instance of the controller constructor is created.
 * - The controller prototype is copied to the scope. As a result, any
 *   modifications of to the prototype after the widget initialization are
 *   ignored.
 * @constructor
 * @param {!Element} root The root element of the new scope.
 * @param {!Function} Controller The controller constructor.
 * @param {!lighter.Scope} scope The scope from which the new scope inherits.
 */
lighter.ControllerAttributeWidget = function (root, Controller, scope) {
  scope.constructor = Controller;

  var proto = Controller.prototype;
  Object.keys(proto).forEach(function (key) {
    scope[key] = proto[key];
  });

  var controller_scope = lighter.scope(root, scope);
  lighter.create(Controller, controller_scope);

  var template = lighter.compile(root);
  template(controller_scope);

  this.scope = controller_scope;
};

/**
 * Updates the controlled scope
 */
lighter.ControllerAttributeWidget.prototype.update = function () {
  this.scope.$update();
};
