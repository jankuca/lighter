'use strict';

goog.provide('lighter.DatabaseService');

goog.require('lighter.events.EventEmitter');


/**
 * Manages offline database storage
 * The database engine is IndexedDB.
 * @constructor
 * @extends {lighter.events.EventEmitter}
 */
lighter.DatabaseService = function (users) {
  lighter.events.EventEmitter.call(this);

  var global = goog.global;
  var indexedDB = global.indexedDB || global.webkitIndexedDB ||
    global.mozIndexedDB || global['msIndexedDB'];

  this.engine_ = indexedDB;
  this.database_ = null;

  if (!indexedDB) {
    // IndexedDB is not supported on the client.
    return null;
  }
};


(function () {
  var global = goog.global;
  lighter.DatabaseService.IDBTransaction = global.IDBTransaction ||
    global.webkitIDBTransaction || global['mozIDBTransaction'] ||
    global['msIDBTransaction'];
}());


/**
 * Opens a database of the given name.
 * @param {string} name The name of the database to open.
 */
lighter.DatabaseService.prototype.open = function (name, version) {
  if (this.engine_) {
    var self = this;
    var database;
    var setDatabase = function () {
      self.database_ = database;
      self.emit('open', database);
    };

    var req = this.engine_.open(name);
    req.onsuccess = function (e) {
      database = /** @type {IDBDatabase} */ req.result;
      if (database.version !== version) {
        self.migrate_(database, version);
        self.once('versionchange', setDatabase);
      } else {
        setDatabase();
      }
    };
    req.onfailure = function (err) {
      self.emit('error', err);
    };
  }
};

/**
 * Defines the migration steps.
 * @param {Object.<string, {
 *   stores: Object.<string, Object>,
 *   indexes: Object.<string, Object>
 * }>} migrations A map of migrations steps (by target version).
 */
lighter.DatabaseService.prototype.migrations = function (migrations) {
  this.migrations_ = migrations;
};


/**
 * Migrates the given database up to the given version
 * @param {IDBDatabase} database The database to migrate.
 * @param {string} version The version up to which to migrate.
 */
lighter.DatabaseService.prototype.migrate_ = function (database, version) {
  var self = this;
  var migrations = this.migrations_;

  var versions = Object.keys(migrations).sort(function (a, b) {
    var levels_a = a.split('.');
    var levels_b = b.split('.');
    if (levels_a.length !== levels_b.length) {
      return (levels_a.length > levels_b.length) ? 1 : -1;
    }
    for (var i = 0, ii = levels_a.length; i < ii; ++i) {
      if (levels_a[i] !== levels_b[i]) {
        return Number(levels_a[i]) > Number(levels_b[i]) ? 1 : -1;
      }
    }
    return 0;
  });

  var start = versions.indexOf(database.version);
  var steps = versions.indexOf(version) - start;
  versions = versions.slice(start + 1, steps + 1);

  var req = database.setVersion(version);
  req.onsuccess = function () {
    var tx = req.transaction;

    versions.forEach(function (v) {
      var step = migrations[v]();

      var current_stores =
        /** @type {!DOMStringList} */ database.objectStoreNames;

      var stores = step.stores || {};
      Object.keys(stores).forEach(function (name) {
        var params = stores[name];
        if (current_stores.contains(name)) {
          database.deleteObjectStore(name);
        }
        database.createObjectStore(name, params);
      });

      var indexes = step.indexes || {};
      Object.keys(indexes).forEach(function (name) {
        var params = indexes[name];
        var key_path = params.keyPath;
        delete params.keyPath;

        var parts = name.split('.');
        var store_name = parts[0];
        name = parts[1];

        var store = tx.objectStore(store_name);
        if (store.indexNames.contains(name)) {
          store.deleteIndex(name);
        }
        store.createIndex(name, key_path, params);
        if (!store.indexNames.contains(name)) {
          throw new Error('Failed to create the index ' + name + ' on the store ' + store_name);
        }
      });
    });

    setTimeout(function () {
      self.emit('versionchange', version);
    }, 0);
  };
};

/**
 * Returns the currently signed-in user
 * @param {string} name The name of the object store to get.
 * @param {boolean} rw Whether to create a READ_WRITE transaction.
 * @param {function(Error, IDBObjectStore)} callback The function to which
 *   to pass the object store.
 * @param {?Object=} ctx The object in whose context to execute the callback.
 */
lighter.DatabaseService.prototype.getStore =
  function (name, rw, callback, ctx) {

  if (this.database_) {
    var IDBTransaction = lighter.DatabaseService.IDBTransaction;

    var tx_type = rw ? IDBTransaction.READ_WRITE : IDBTransaction.READ_ONLY;
    var tx;
    try {
      tx = this.database_.transaction([ name ], tx_type);
    } catch (err) {
      var message = 'Failed to get the store \'' + name + '\': ' + err.message;
      callback.call(ctx, new Error(message), null);
      return;
    }

    var store = tx.objectStore(name);
    callback.call(ctx, null, store);
  } else {
    this.once('open', function () {
      this.getStore(name, rw, callback, ctx);
    });
  }
};

lighter.DatabaseService.prototype.createKeyRange =
  function (lower, upper, lower_open, upper_open) {

  var global = goog.global;
  var IDBKeyRange = global.IDBKeyRange ||
    global.webkitIDBKeyRange || global['mozIDBKeyRange'] ||
    global['msIDBKeyRange'];

  var range;
  if (typeof upper === 'undefined' || upper === null) {
    range = IDBKeyRange.lowerBound(lower, lower_open);
  } else if (typeof lower === 'undefined' || lower === null) {
    range = IDBKeyRange.upperBound(upper, lower_open);
  } else {
    range = IDBKeyRange.bound(lower, upper, lower_open, upper_open);
  }

  return range;
};
