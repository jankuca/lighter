'use strict';

goog.provide('lighter.events');
goog.provide('lighter.events.Event');
goog.provide('lighter.events.EventEmitter');


/**
 * The number of event listeners (for each event type) subscribed to one
 * event emitter at which to warn about a possible memory leak.
 */
lighter.events.LISTENER_LIMIT = 10;


/**
 * @constructor
 */
lighter.events.EventEmitter = function () {
  /**
   * Event listener storage
   * @type {Object.<string, Array.<{
   *   listener: function(*): ?boolean,
   *   ctx: ?Object,
   *   once: boolean
   * }>>}
   * @private
   */
  this.$$event_listeners_ = {};

  // Mixin the EventEmitter prototype methods into the host object
  this.on = lighter.events.EventEmitter.prototype.on;
  this.once = lighter.events.EventEmitter.prototype.once;
  this.off = lighter.events.EventEmitter.prototype.off;
  this.emit = lighter.events.EventEmitter.prototype.emit;
};

/**
 * Adds a new event listener
 * @param {string} type The event type to which to subscribe.
 * @param {function(lighter.events.Event=): ?boolean} fn The listener.
 * @param {?Object=} ctx The object in whose context to execute the listener.
 * @param {boolean=} once Whether to unsubscribe after one event.
 */
lighter.events.EventEmitter.prototype.on = function (type, fn, ctx, once) {
  var listeners = this.$$event_listeners_[type] || [];

  if (listeners.length === lighter.events.LISTENER_LIMIT && window.console) {
    window.console.warn(
      'Possible memory-leak, event: ' + type + ', emitter: ' + this);
  }

  listeners.push({
    listener: fn,
    ctx: ctx || null,
    once: once
  });

  this.$$event_listeners_[type] = listeners;
};

/**
 * Adds a new event listener
 * @param {string} type The event type to which to subscribe.
 * @param {function(lighter.events.Event=): ?boolean} fn The listener.
 * @param {?Object=} ctx The object in whose context to execute the listener.
 */
lighter.events.EventEmitter.prototype.once = function (type, fn, ctx) {
  this.on(type, fn, ctx, true);
};

/**
 * Removes the given event listener (or all if not specified)
 * @param {string} type The event type from which to unsubscribe
 * @param {(function(*): ?boolean)=} fn The listener.
 */
lighter.events.EventEmitter.prototype.off = function (type, fn) {
  var listeners = this.$$event_listeners_[type] || [];

  listeners = listeners.filter(function (item) {
    return item.listener !== fn;
  });

  this.$$event_listeners_[type] = listeners;
};

/**
 * Emits an event of the given type
 * @param {string} type The event type
 * @param {*} data
 */
lighter.events.EventEmitter.prototype.emit = function (type, data) {
  var listeners = this.$$event_listeners_[type];

  if (listeners) {
    // Remove one-time listeners
    // This is done before calling any listeners because
    // - an eventual exception thrown in one of the listeners would require
    //   a try-finally statement
    // - the one-time listeners should be removed when they are called
    // - if new one-time listeners were added by one of the listeners,
    //   they would get removed as well if the filtering happened after that
    this.$$event_listeners_[type] = listeners.filter(function (item) {
      return !item.once;
    });

    // Call all listeners (including the just removed ones)
    for (var i = 0, ii = listeners.length; i < ii; ++i) {
      var item = listeners[i];
      var result = item.listener.call(item.ctx, data);
      if (result === false) {
        break;
      }
    }
  }
};
