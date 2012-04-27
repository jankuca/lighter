'use strict';

goog.provide('lighter.WebSocketRequest');


/**
 * WebSocket HTTP request compatible with the Darkside.js framework
 * @param {lighter.events.EventEmitter} socket The socket.io socket to use.
 * @constructor
 */
lighter.WebSocketRequest = function (socket) {
  this.socket_ = socket;

  this.method_ = 'GET';
  this.host_ = goog.global.location.host;
  this.path_ = null;
  this.request_headers_ = {};
  this.response_headers_ = {};

  this.onresponse = null;
};

/**
 * Sets up the request.
 * @param {string} method The HTTP method to use.
 * @param {string} path The pathname to query.
 */
lighter.WebSocketRequest.prototype.open = function (method, path) {
  this.method_ = method;
  this.path_ = path;
};

/**
 * Sets a single request header.
 * @param {string} key The header key/name.
 * @param {string} value The header value.
 */
lighter.WebSocketRequest.prototype.setRequestHeader = function (key, value) {
  this.request_headers_[key.toLowerCase()] = String(value);
};

/**
 * Returns all response headers
 * @return {!Object.<string, string>} All response headers.
 */
lighter.WebSocketRequest.prototype.getAllResponseHeaders = function () {
  return this.response_headers_;
};

/**
 * Returns a single response header value
 * @param {string} key The key of the header whose value to return.
 * @return {?string} The header value. Null if the header was not set.
 */
lighter.WebSocketRequest.prototype.getResponseHeader = function (key) {
  var headers = this.getAllResponseHeaders();
  return headers[key.toLowerCase()] || null;
};

/**
 * Sends the request to the server
 * @param {Object=} body The request body.
 */
lighter.WebSocketRequest.prototype.send = function (body) {
  body = body || null;

  var self = this;
  var req = {
    'method': this.method_,
    'host': this.host_,
    'path': this.path_,
    'headers': this.request_headers_,
    'body': body
  };

  this.socket_.emit('request', req, function (res) {
    var headers = self.response_headers_;
    var h = res['headers'];
    Object.keys(h).forEach(function (key) {
      key = key.toLowerCase();
      if (typeof headers[key] === 'undefined') {
        headers[key] = h[key];
      } else if (headers[key] instanceof Array) {
        headers[key].push(h[key]);
      } else {
        headers[key] = [ headers[key], h[key] ];
      }
    });

    self.status = res['status'];
    self.body = res['body'];

    if (typeof self.onresponse === 'function') {
      self.onresponse();
    }
  });
};
