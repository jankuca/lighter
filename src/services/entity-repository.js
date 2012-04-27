'use strict';

goog.provide('lighter.EntityRepository');


/**
 * @constructor
 * @param {!lighter.DatabaseService} $database A database manager.
 */
lighter.EntityRepository = function ($database) {
  /**
   * @protected
   */
  this.database = $database;

  /**
   * The name of the object store to use
   * @type {?string}
   */
  this.store = null;
};

lighter.EntityRepository.prototype.$deps = [ '$database' ];


/**
 * Gets a single entity from the object store
 * @param {*} key A record key. Used as the lower bound in case of an index.
 * @param {?string=} index_name The name of the index to use.
 * @return {!Object} An uninitialized entity. The caller is supposed to wait
 *   for its "ready" event.
 */
lighter.EntityRepository.prototype.get = function (key, index_name) {
  if (!this.store) {
    throw new Error('Store name not specified');
  }

  var entity = this.createEntity();

  var setEntityDocument = function (doc) {
    entity.setDocument(doc);
    entity.emit('ready');
  };

  if (!index_name) {
    this.database.getStore(this.store, false, function (err, store) {
      if (err) {
        // Can be caught by a try-catch statement in the caller of #one
        throw err;
      }

      var req = store.get(key);
      req.onsuccess = function () {
        var result = req.result;
        if (result) {
          setEntityDocument(result.value);
        }
      };
      req.onfailure = function (err) {
        entity.emit('error', err);
      };
    }, this);

  } else {
    // Use an index
    var results = this.all(index_name, key, null, 1);
    results.once('ready', function () {
      var result = results[0];
      setEntityDocument(result ? result.getDocument() : {});
    });
    results.pipe('error', entity);
  }

  return entity;
};

/**
 * @param {string} index_name The name of the index to use.
 * @param {*} lower The lower bound.
 * @param {*=} upper The upper bound. If not specified, the lower one is used.
 * @param {number=} limit The maximum number of results to include.
 * @return {!Array} A result set.
 */
lighter.EntityRepository.prototype.all =
  function (index_name, lower, upper, limit) {

  limit = limit || Infinity;

  var results = [];
  lighter.events.EventEmitter.call(results);

  this.database.getStore(this.store, false, function (err, store) {
    if (err) {
      results.emit('error', err);
      return;
    }

    var self = this;
    var range;
    var req;
    var i = 0;

    if (!index_name) {
      range = this.database.createKeyRange(0);
      req = store.openCursor(range);
    } else {
      var index;
      try {
        index = store.index(index_name);
      } catch (err) {
        results.emit('error', err);
        return;
      }
      range = this.database.createKeyRange(lower, upper);
      req = index.openCursor(range);
    }

    req.onsuccess = function (e) {
      var result = e.target.result;
      if (result) {
        var entity = self.createEntity(result.value);
        results.push(entity);

        i += 1;
        if (i === limit) {
          results.emit('ready');
        }
      } else {
        results.emit('ready');
      }
    };
    req.onfailure = function (err) {
      results.emit('error', err);
    };
  }, this);

  return results;
};


lighter.EntityRepository.prototype.save = function (entity, callback, ctx) {
  var doc = entity.getDocument();

  this.database.getStore(this.store, true, function (err, store) {
    if (err) {
      throw err;
    }

    var req = store.put(doc);
    req.onsuccess = function (e) {
      entity.id = e.target.result;
      callback.call(ctx, null);
    };
    req.onfailure = function (err) {
      callback.call(ctx, err);
    };
  }, this);
};

lighter.EntityRepository.prototype.remove = function (entity, callback, ctx) {
  var doc = entity.getDocument();

  this.database.getStore(this.store, true, function (err, store) {
    if (err) {
      throw err;
    }

    var key = lighter.ExpressionCompiler.get(store.keyPath, doc);
    var req = store['delete'](key);
    req.onsuccess = function (e) {
      entity.stored = false;
      callback.call(ctx, null);
    };
    req.onfailure = function (err) {
      callback.call(ctx, err);
    };
  }, this);
};
