'use strict';

goog.provide('lighter');

goog.require('lighter.ControllerAttributeWidget');
goog.require('lighter.DOMCompiler');
goog.require('lighter.DatabaseService');
goog.require('lighter.ExpressionCompiler');
goog.require('lighter.RepeaterAttributeWidget');
goog.require('lighter.RouterService');
goog.require('lighter.Scope');
goog.require('lighter.ViewAttributeWidget');



/**
 * @type {Array.<string>}
 */
Function.prototype.$deps = [];


/**
 * Whether the app is running
 * @type {boolean}
 * @private
 */
lighter.running_ = false;

/**
 * A map of registered services
 * @type {Object}
 * @private
 */
lighter.services_ = {};

/**
 * An {Array} of registered widget factories
 * - Sorted by priority (highest first)
 * @type {Array.<Object>}
 * @private
 */
lighter.widgets_ = [];

/**
 * Widget types
 * @enum {number}
 */
lighter.WidgetType = {
  ELEMENT: 0,
  ATTRIBUTE: 1
};


/**
 * Bootstraps a Lighter application
 * @param {!Element|Document} root_element The element to use as the root
 *   of the application.
 * @return {lighter.Scope} The newly created root scope.
 */
lighter.bootstrap = function (root_element) {
  if (lighter.running_) {
    throw new Error('The application is already running.');
  }

  var root_scope = lighter.scope(root_element);
  var template = lighter.compile(root_element, true);
  template(root_scope);

  lighter.running_ = true;

  return root_scope;
};

/**
 * Creates a new scope bound to the given element
 * - Optionally can inherit from another scope
 * @param {!Element|Document} element The element to use as the root of
 *   the scope.
 * @param {?lighter.Scope=} parent The scope from which should the new scope
 *   inherit.
 * @return {!lighter.Scope} The new scope.
 */
lighter.scope = function (element, parent) {
  var scope;

  if (!parent) {
    scope = new lighter.Scope(element);
  } else {
    scope = /** @type {!lighter.Scope} */ Object.create(parent);
    scope.$$parent = parent;
    lighter.Scope.call(scope, element);
  }

  return scope;
};

/**
 * Makes the given DOM subtree a template
 * @param {!Element|Document} dom The (root) DOM element to compile.
 * @param {boolean=} include_root Whether the root DOM element should be
 *   included in the widget matching process. Defaults to false.
 * @return {function(!lighter.Scope)} Template bound to the given DOM subtree.
 */
lighter.compile = function (dom, include_root) {
  if (dom instanceof Document) {
    if (!dom.documentElement) {
      throw new Error('Invalid root DOM');
    }
    dom = dom.documentElement;
  }

  lighter.DOMCompiler.compileDOM(dom);
  var template = lighter.template(dom, !!include_root);

  return template;
};

/**
 * Injects the given constructor with the dependencies stated in
 * the constructor's `$deps` property.
 * If an instance is passed in, no new object is instantiated while
 * the constructor is invoked in context of the instance.
 * @param {!Function} Constructor The constructor function in which to inject.
 * @param {Object=} instance The (optional) instance to use for the invocation.
 * @param {...Object} args The arguments to pass to the constructor after deps.
 * @return {Object} An instance (either the original one or a new one).
 */
lighter.create = function (Constructor, instance, args) {
  var deps = [];
  if (Constructor.prototype.$deps) {
    deps = lighter.getServices_.apply(null, Constructor.prototype.$deps);
  }

  if (arguments.length > 2) {
    deps = deps.concat(Array.prototype.slice.call(arguments, 2));
  }

  if (instance) {
    return Constructor.apply(instance, deps) || instance;
  }

  // We cannot directly apply the dependencies to the constructor.
  // Based on http://goo.gl/Q34dk
  var Fn = Function.prototype.bind.apply(Constructor, [ null ].concat(deps));

  // When is this new function invoked using the `new` keyword, the returned
  // object is actually an instance of the original constructor.
  // (new Fn()) instanceof Constructor === true
  return new Fn();
};

/**
 * Returns a service instance or registeres a service constructor
 * @param {string} name A service name.
 * @param {Function=} Constructor The service constructor.
 * @return {?Object} A service instance (when not registering a service).
 */
lighter.service = function (name, Constructor) {
  var services = lighter.services_;

  if (arguments.length === 1) {
    var definition = services[name];
    if (!definition) {
      throw new Error('No such service \'' + name + '\'');
    }

    var instance = definition.instance;
    if (!instance) {
      instance = lighter.create(definition.constructor);
      definition.instance = instance;
    }
    return instance;
  }

  services[name] = {
    constructor: Constructor,
    instance: null
  };
  return null;
};

/**
 * Returns or registeres a widget factory
 * @param {string} name A widget name
 *   - If prefixed by "@", it is considered an attribute widget.
 * @param {function(!Element)} factory A function called for each widget
 *   found during a compilation process.
 * @param {boolean=} is_container Whether the widget creates its own sub-scope.
 * @return {?function(!Element):?Object} The widget factory function.
 */
lighter.widget = function (name, factory, is_container) {
  var widgets = lighter.widgets_;

  var type = lighter.WidgetType.ELEMENT;
  if (name[0] === '@') {
    name = name.substr(1);
    type = lighter.WidgetType.ATTRIBUTE;
  }

  if (arguments.length === 1) {
    for (var i = 0, ii = widgets.length; i < ii; ++i) {
      var widget = widgets[i];
      if (widget.type === type && widget.name === name) {
        return widget.factory;
      }
    }
    return null;
  }

  var selector = null;
  switch (type) {
  case lighter.WidgetType.ELEMENT:
    selector = name.replace(':', '\\:');
    break;
  case lighter.WidgetType.ATTRIBUTE:
    selector = '[' + name.replace(':', '\\:') + ']';
    break;
  }

  widgets.push({
    name: name,
    type: type,
    selector: selector,
    factory: factory,
    is_container: !!is_container
  });
  return factory;
};

/**
 * Makes the given DOM subtree a template
 * @param {Element} dom The root DOM element of the subtree to compile.
 * @param {boolean=} include_root Whether the root DOM element should be
 *   included in the widget matching process.
 * @return {function(!lighter.Scope)} Template bound to the given DOM subtree.
 */
lighter.template = function (dom, include_root) {
  if (!dom) {
    throw new Error('Missing root DOM element');
  }

  return function (scope) {
    lighter.liveWidgetPlaceholdersInDOM_(dom, scope, include_root);
  };
};

lighter.liveWidgetPlaceholdersInDOM_ = function (dom, scope, include_root) {
  var definitions = lighter.widgets_;

  var processChildren = function (root, scope) {
    var children = root.childNodes;
    for (var i = 0, ii = children.length; i < ii; ++i) {
      var node = children[i];
      if (node.nodeType === 1) { // ELEMENT_NODE
        processElement(node, scope);
      }
    }

    if (root === scope.$$root) {
      scope.emit('ready');
    }
  };

  var processElement = function (element, scope) {
    var is_container = false;

    var matched = false;
    definitions.forEach(function (definition) {
      var matchesSelector = (dom.matchesSelector ||
        dom.webkitMatchesSelector || dom.mozMatchesSelector);

      if (matchesSelector.call(element, definition.selector)) {
        // Get data
        var data = null;
        if (definition.type === lighter.WidgetType.ATTRIBUTE) {
          data = element.getAttribute(definition.name);
        }
        // Create widget
        var widget = definition.factory.call(null, element, data, scope);

        // Register widget
        if (widget) {
          scope.$addWidget(widget);
        }

        is_container = definition.is_container;
        matched = true
      }
    });

    if (!matched || !is_container) {
      processChildren(element, scope);
    }
  };

  if (include_root) {
    processElement(dom, scope);
  } else {
    processChildren(dom, scope);
  }
};


/**
 * Returns dependencies according to the given service name list
 * @private
 * @param {...string} args Service names.
 * @return {Array.<Object>} A list of service instances in the argument order.
 */
lighter.getServices_ = function (args) {
  var names = Array.prototype.slice.call(arguments);

  var services = names.map(function (name) {
    return lighter.service(name);
  });

  return services;
};

/**
 * Returns the root element of the closest parent container widget
 * @param {!Node} node A DOM node.
 * @return {Element} The closest parent container widget root.
 */
lighter.getParentContainer_ = function (node) {
  var parent = /** @type {Element} */ node.parentNode;
  if (!parent) {
    return null;
  }

  var SELECTOR_RX = /^([\w\-:\\]*)(?:\[([\w\-:\\]+)(?:=(["'])?(.*)\3)?\])?$/;

  /**
   * @type {function(this: Element, string): boolean}
   */
  var matchesSelector = parent.matchesSelector || function (selector) {
    var match = selector.match(SELECTOR_RX);
    if (!match || this.nodeType !== 1) {
      return false;
    }
    if (match[1] && this.tagName !== match[1]) {
      return false;
    }
    if (match[4] !== undefined) {
      return this.getAttribute(match[2]) === match[4];
    }
    return !!this.getAttribute(match[2]);
  };

  var definitions = lighter.widgets_;
  var ii = definitions.length;
  while (parent) {
    for (var i = 0; i < ii; ++i) {
      var selector = definitions[i].selector;
      if (matchesSelector.call(parent, selector)) {
        return parent;
      }
    }
    parent = /** @type {Element} */ parent.parentNode;
  }
  return null;
};



// Register the native service factories
lighter.service('$router', function () {
  return lighter.create(lighter.RouterService, null,
    goog.global.location, goog.global.history);
});

lighter.service('$database', function () {
  return lighter.create(lighter.DatabaseService);
});


// Register the native widget factories
lighter.widget('@lt:controller', function (root, name, scope) {
  // Lookup the controller in the global object
  var controller = lighter.ExpressionCompiler.get(name, window);
  if (!controller) {
    throw new Error('Undefined controller: ' + name);
  }
  if (typeof controller !== 'function') {
    throw new Error('Invalid controller: ' + name);
  }

  return new lighter.ControllerAttributeWidget(root, controller, scope);
}, true);

lighter.widget('@lt:repeat', function (container, exp, scope) {
  var keys = lighter.ExpressionCompiler.parseKeyLoopExpression(exp);

  return new lighter.RepeaterAttributeWidget(
    container, scope, keys.source, keys.target);
}, true);

lighter.widget('@lt:view', function (container, key, scope) {
  return new lighter.ViewAttributeWidget(container, scope, key);
}, true);


lighter.widget('@lt:bind', function (element, exp, scope) {
  var state = element.textContent;
  var update = function () {
    var value = lighter.ExpressionCompiler.get(exp, scope);
    if (typeof value === 'undefined' || value === null) {
      value = '';
    }
    if (state !== value) {
      element.textContent = value;
      state = value;
    }
  };

  update();

  return {
    update: update
  };
});

lighter.widget('@name', function (element, exp, scope) {
  if ([ 'INPUT', 'TEXTAREA', 'SELECT' ].indexOf(element.tagName) !== -1) {
    var state;
    if (element.type === 'checkbox') {
      state = element.checked;
    } else {
      state = element.value;
    }

    var update = function () {
      var value = lighter.ExpressionCompiler.get(exp, scope);
      if (typeof value === 'undefined' || value === null) {
        value = (element.type === 'checkbox') ? false : '';
      }
      if (state !== value) {
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = value;
        }
        state = value;
      }
    };

    if (element.type === 'checkbox') {
      lighter.ExpressionCompiler.set(exp, element.checked, scope);
    } else {
      lighter.ExpressionCompiler.set(exp, element.value, scope);
    }
    update();

    var getValue = function () {
      var value;
      if (element.type === 'checkbox') {
        value = element.checked;
      } else {
        value = element.value;
      }
      if (value !== state) {
        lighter.ExpressionCompiler.set(exp, value, scope);
        state = value;
        scope.$update();
      }
    };

    if (element.getAttribute('lt:continuous') === 'true') {
      element.addEventListener('keypress', function (e) {
        // Run this asynchronously to have the correct value of element.value
        setTimeout(function () {
          getValue();
        }, 0);
      }, false);
    }

    element.addEventListener('change', function (e) {
      getValue();
    }, false);
    element.addEventListener('blur', function (e) {
      getValue();
    }, false);

    return {
      update: update
    };
  }
  return null;
});

lighter.widget('@lt:click', function (element, exp, scope) {
  element.onclick = function (e) {
    var fn = lighter.ExpressionCompiler.compile(exp, scope);
    scope['$event'] = e;
    fn();
    delete scope['$event'];
    scope.$update();
  };
});

lighter.widget('@lt:submit', function (element, exp, scope) {
  element.onsubmit = function (e) {
    var fn = lighter.ExpressionCompiler.compile(exp, scope);
    fn();
    scope.$update();

    e.preventDefault();
  };
});

lighter.widget('@lt:href', function (element, pathname, scope) {
  var router = lighter.service('$router');
  var root = router.root();

  // Make the element behave like a regular link
  // (allow opening in a new tab, showing correct URL in the status bar)
  element.setAttribute('href', root + pathname);
  element.addEventListener('click', function (e) {
    var router = lighter.service('$router');
    router.go(pathname);
    // Prevent the default browser navigation behavior; it's the router's job.
    e.preventDefault();
  }, false);
});

lighter.widget('@lt:return', function (element, exp, scope) {
  element.onkeypress = function (e) {
    if (e.keyCode === 13) {
      scope['$event'] = e;
      var fn = lighter.ExpressionCompiler.compile(exp, scope);
      var res = fn();
      delete scope['$event'];
      scope.$update();
      return res;
    }
  };
});

lighter.widget('@lt:change', function (element, exp, scope) {
  element.addEventListener('change', function (e) {
    var fn = lighter.ExpressionCompiler.compile(exp, scope);
    fn();
  }, false);
});

lighter.widget('@lt:attr-patterns', function (element, json, scope) {
  var attrs = /** @type {!Object} */ goog.global.JSON.parse(json);

  var stack = Object.keys(attrs).map(function (key) {
    var state = '';
    var pattern = attrs[key];
    return function () {
      var value = lighter.ExpressionCompiler.fillPattern(pattern, scope);
      if (value !== state) {
        element.setAttribute(key, value);
        state = value;
      }
    };
  });

  var update = function () {
    stack.forEach(function (fn) {
      fn();
    });
  };

  update();

  return {
    update: update
  };
});

lighter.widget('@lt:attrs', function (element, exp, scope) {
  var conditions = lighter.ExpressionCompiler.parseAttrConditions(exp, scope);

  var update = function () {
    conditions.forEach(function (condition) {
      var attrs = condition.attributes;
      if (condition.check()) {
        Object.keys(attrs).forEach(function (attr_name) {
          element.setAttribute(attr_name, attrs[attr_name]);
        });
      } else {
        Object.keys(attrs).forEach(function (attr_name) {
          element.removeAttribute(attr_name);
        });
      }
    });
  };

  return {
    update: update
  };
});

lighter.widget('@lt:drag', function (element, exp, scope) {
  var delta_scope = lighter.scope(element, scope);
  var handler = lighter.ExpressionCompiler.compile(exp, delta_scope);

  element.addEventListener('mousedown', function (e) {
    e.stopPropagation();

    var last_x = e.clientX;
    var last_y = e.clientY;
    var body = element.ownerDocument.body;

    var onmousemove = function (e) {
      e.stopPropagation();

      var x = e.clientX;
      var y = e.clientY;
      delta_scope['$x'] = x - last_x;
      delta_scope['$y'] = y - last_y;
      last_x = x;
      last_y = y;
      handler();
    };

    var onmouseup = function (e) {
      e.stopPropagation();

      body.removeEventListener('mousemove', onmousemove, false);
      body.removeEventListener('mouseup', onmouseup, false);
    };

    body.addEventListener('mousemove', onmousemove, false);
    body.addEventListener('mouseup', onmouseup, false);
  }, false);
});
