'use strict';

goog.provide('lighter.RouterService');

goog.require('lighter.events.EventEmitter');


/**
 * Manages the user's location within the app
 * @constructor
 * @extends {lighter.events.EventEmitter}
 * @param {Location} location The location object to use
 * @param {History} history The history object to use
 */
lighter.RouterService = function (location, history) {
  lighter.events.EventEmitter.call(this);

  this.location_ = location;
  this.history_ = history;
  this.root_ = '';
  this.current_params_ = {};

  this.snap_();

  var self = this;
  window.onpopstate = function (e) {
    var state = e.state;
    if (state) {
      self.snap_();
      self.emit('location', state['pathname']);
    }
  };
};

/**
 * Set the root directory
 * Any absolute target pathname is resolved relatively to this directory
 * @param {string} root The new root.
 */
lighter.RouterService.prototype.setRoot = function (root) {
  if (root[root.length - 1] === '/') {
    root = root.substr(0, root.length - 1);
  }
  this.root_ = root;
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
 */
lighter.RouterService.prototype.go = function (pathname, params) {
  var state = this.getState_(pathname, params);

  var path = state['path'];
  if (path[0] === '/') {
    // Absolute pathnames are relative to the set root
    path = this.root_ + pathname;
  }

  if (path !== this.location_.pathname + this.location_.search) {
    // Do not push the same state to the stack twice in a row
    this.history_.pushState(state, '', path);
  }
  this.emit('location', pathname);
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
    'query': params
  };
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
  this.current_params_ = params;
};
