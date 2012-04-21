'use strict';

goog.provide('lighter.RouterService');

goog.require('lighter.events.EventEmitter');


/**
 * Manages the user's location within the app
 * @constructor
 * @extends {lighter.events.EventEmitter}
 * @param {!Location} location The location object to use
 * @param {!History} history The history object to use
 */
lighter.RouterService = function (location, history) {
  lighter.events.EventEmitter.call(this);

  this.location_ = location;
  this.history_ = history;
  this.root_ = '';
  this.routes_ = [];
  this.current_params_ = {};

  var self = this;
  window.onpopstate = function (e) {
    var state = e.state;
    if (state) {
      self.snap_();
      self.emitLocation(state['pathname']);
    }
  };
};

/**
 * Gets or set the root directory
 * Any absolute target pathname is resolved relatively to this directory
 * @param {string} root A new root.
 * @return {?string} The root.
 */
lighter.RouterService.prototype.root = function (root) {
  if (arguments.length === 0) {
    return this.root_;
  }

  if (root[root.length - 1] === '/') {
    root = root.substr(0, root.length - 1);
  }
  this.root_ = root;
  return null;
};

/**
 * Sets the route handlers
 * The given pattern-to-handler map is expanded to include prepared patterns
 * used in the route matching process and stored as an {Array}.
 * @param {!Object.<string, function(): string>} handlers New routes handlers.
 */
lighter.RouterService.prototype.routes = function (handlers) {
  var routes = [];

  Object.keys(handlers).forEach(function (blank) {
    var source = blank;
    // Replace conditional parameters like :id<\d+> with the condition
    source = source.replace(/:[\w\-]+<([^>]+)>/g, function (match) {
      return '(' + match.split('<')[1].split('>')[0] + ')';
    });
    // Replace general parameters like :id
    source = source.replace(/:[\w\-]+/g, '([^\\/]+)');

    var pattern = new RegExp('^' + source + '$');

    var keys = blank.match(/:[\w\-]+/g) || [];
    keys = keys.map(function (match) {
      return match.substr(1);
    });

    routes.push({
      blank: blank,
      pattern: pattern,
      keys: keys,
      handler: handlers[blank]
    })
  });

  this.routes_ = routes;

  this.snap_();
};

/**
 * Returns the value for the given param key
 * @param {string} key The param key for which to get the value.
 * @return {?string} The param value.
 */
lighter.RouterService.prototype.param = function (key) {
  var value = this.current_params_[key];
  if (typeof value === 'undefined') {
    return null;
  }
  return value;
};

/**
 * Pushes a new history entry to the stack and broadcasts the fact
 * @param {string} pathname The target pathname.
 * @param {Object=} params Parameters.
 * @param {boolean=} replace Whether to force a state replace.
 */
lighter.RouterService.prototype.go = function (pathname, params, replace) {
  var state = this.getState_(pathname, params);

  var path = state['path'];
  if (path[0] === '/') {
    // Absolute pathnames are relative to the set root
    path = this.root_ + path;
  }
  var current_path = path !== this.location_.pathname + this.location_.search;

  if (!replace && current_path) {
    // Do not push the same state to the stack twice in a row
    this.history_.pushState(state, '', path);
  } else {
    this.history_.replaceState(state, '', path);
  }
  this.emitLocation(pathname);
};

/**
 * Replaces the current history entry and broadcasts the fact
 * @param {string} pathname The target pathname.
 * @param {Object=} params Parameters.
 */
lighter.RouterService.prototype.replace = function (pathname, params) {
  this.go(pathname, params, true);
};

/**
 * Emits a "location" event
 * @param {string} pathname The pathname to emit.
 */
lighter.RouterService.prototype.emitLocation = function (pathname) {
  var route = this.getRouteByPathname_(pathname);

  this.emit('location', {
    pathname: pathname,
    params: route.params,
    handler: route ? route.handler : null
  });
};

/**
 * Goes one step back in the history.
 */
lighter.RouterService.prototype.back = function () {
  var history = this.history_;
  history.back();
};

/**
 * Goes one step forward in the history.
 */
lighter.RouterService.prototype.forward = function () {
  var history = this.history_;
  history.forward();
};

/**
 * Returns the current pathname relative to the root
 * @return {string} The current pathname.
 */
lighter.RouterService.prototype.getCurrentPathname = function () {
  return this.current_pathname_.substr(this.root_.length) || '/';
};


/**
 * Returns a state object for the given pathname and params
 * @param {string} pathname The target pathname.
 * @param {Object=} params Parameters.
 */
lighter.RouterService.prototype.getState_ = function (pathname, params) {
  var search = '';
  if (params) {
    search = Object.keys(params).forEach(function (key) {
      return key + '=' + goog.global.encodeURIComponent(params[key]);
    }).join('&');
    search = search ? '?' + search : '';
  }

  if (pathname[0] !== '/') {
    pathname = this.current_pathname_ + '/' + pathname;
    pathname = pathname.substr(this.root_.length);
  }

  return {
    'path': pathname + search,
    'pathname': pathname,
    'query': params || {}
  };
};

/**
 * Gets a route by a pathname
 */
lighter.RouterService.prototype.getRouteByPathname_ = function (pathname) {
  var routes = this.routes_;

  for (var i = 0, ii = routes.length; i < ii; ++i) {
    var route = routes[i];
    var match = pathname.match(route.pattern);
    if (match) {
      var param_keys = route.keys;
      var params = {};
      param_keys.forEach(function (key, i) {
        params[key] = match[i + 1];
        pathname = pathname.replace(':' + key, match[i + 1]);
      });

      return {
        pathname: pathname,
        handler: route.handler,
        params: params
      };
    }
  }
};

/**
 * Snaps the current location state
 * @private
 */
lighter.RouterService.prototype.snap_ = function () {
  var location = this.location_;
  this.current_pathname_ = location.pathname.replace(/\/$/, '');

  var params = {};
  var search = location.search ? location.search.substr(1) : '';
  if (search) {
    var parts = search.split('&');
    parts.forEach(function (part) {
      var param = part.split('=');
      params[param[0]] = param.slice(1).join('=');
    });
  }

  var route = this.getRouteByPathname_(this.getCurrentPathname());
  if (route) {
    Object.keys(route.params).forEach(function (key) {
      params[key] = route.params[key];
    });
  }

  this.current_params_ = params;
};
