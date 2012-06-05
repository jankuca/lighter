'use strict';

goog.provide('lighter.ExpressionCompiler');


/**
 * A first expression level syntax
 */
lighter.ExpressionCompiler.FIRST_LEVEL = /[a-zA-Z\$_:]+/;

/**
 * Deeper expression levels
 */
lighter.ExpressionCompiler.DEEPER_LEVEL = new RegExp(
  '\\[[a-zA-Z\\$_.:]+\\]|' +
  '\\.[a-zA-Z\\$_:]+'
);
lighter.ExpressionCompiler.DEEPER_LEVELS = new RegExp('(' +
  lighter.ExpressionCompiler.DEEPER_LEVEL.source +
')', 'g');

/**
 * A valid variable name {RegExp}
 * @type {RegExp}
 */
lighter.ExpressionCompiler.GETTER_EXPRESSION = new RegExp(
  lighter.ExpressionCompiler.FIRST_LEVEL.source +
  '(?:' + lighter.ExpressionCompiler.DEEPER_LEVEL.source + ')*'
);

/**
 * A valid binding in a pattern
 * @type {RegExp}
 */
lighter.ExpressionCompiler.BINDINGS = new RegExp('\{\{' +
  lighter.ExpressionCompiler.GETTER_EXPRESSION.source +
'\}\}', 'g');

/**
 * The key-loop expression syntax
 * @type {RegExp}
 */
lighter.ExpressionCompiler.KEY_LOOP_EXPRESSION = new RegExp('^' +
  '\\s*(' + lighter.ExpressionCompiler.GETTER_EXPRESSION.source + ')' +
  '\\s+in\\s+(' + lighter.ExpressionCompiler.GETTER_EXPRESSION.source + ')' +
  '\\s*$'
);

/**
 * The simple key-loop expression syntax
 * This is the first {RegExp} against which is an expression matched.
 * The KEY_LOOP_EXPRESSION is used as a backup.
 * @type {RegExp}
 */
lighter.ExpressionCompiler.SIMPLE_KEY_LOOP_EXPRESSION = new RegExp('^' +
  '\\s*(' + lighter.ExpressionCompiler.FIRST_LEVEL.source + ')' +
  '\\s+in\\s+(' + lighter.ExpressionCompiler.FIRST_LEVEL.source + ')' +
  '\\s*$'
);

/**
 * A valid string {RegExp}
 * - 1: quote type (either ' or ")
 * - 2: the string
 * @type {RegExp}
 */
lighter.ExpressionCompiler.STRING_EXPRESSION = /^(['"])(.*)\1$/;

lighter.ExpressionCompiler.STRING = /['"].*?['"]/;

/**
 * The expression syntax {RegExp}
 * - 1: a setter expression or null
 * - 2: a getter expression
 * - 3: an execution expression
 * @type {RegExp}
 */
lighter.ExpressionCompiler.EXPRESSION = new RegExp('^' +
  '(?:([^=]+?)\\s*=)?\\s*' +
  '([^(|=\\s](?:[^(|=]*[^(|=\\s])?)' +
  '(\\([^\)]*\\))?$'
);

/**
 * A number, a string or a getter expression
 */
lighter.ExpressionCompiler.VALUE_EXPRESSION = new RegExp(
  '\\d+|' +
  lighter.ExpressionCompiler.STRING.source + '|' +
  lighter.ExpressionCompiler.GETTER_EXPRESSION.source
);

lighter.ExpressionCompiler.ASSIGN_EXPRESSION = new RegExp(
  '[a-zA-Z][a-zA-Z0-9\\-:]*=' +
  '(?:' + lighter.ExpressionCompiler.VALUE_EXPRESSION.source + ')'
);

/**
 * The attribute condition syntax
 */
lighter.ExpressionCompiler.ATTR_CONDITIONS = new RegExp('^(?:' +
  '(!?' + lighter.ExpressionCompiler.GETTER_EXPRESSION.source + '):\\s*' +
  '(' + lighter.ExpressionCompiler.ASSIGN_EXPRESSION.source + ')' +
  '(?:,\\s*(' + lighter.ExpressionCompiler.ASSIGN_EXPRESSION.source + '))*' +
'(?:;|$))+');


/**
 * Parses the given expression and returns a function that evaluates it
 * @param {string} exp The expression to parse.
 * @param {!(lighter.Scope|Window)} scope The scope in which to get values.
 * @return {function(): *} A function that evaluates the given expression.
 */
lighter.ExpressionCompiler.compile = function (exp, scope) {
  var parts = exp.match(lighter.ExpressionCompiler.EXPRESSION);
  if (!parts) {
    throw new Error('Invalid expression: ' + exp);
  }

  // Setter
  if (parts[1]) {
    if (!parts[1].match(lighter.ExpressionCompiler.GETTER_EXPRESSION)) {
      throw new Error('Invalid left hand-side expression: ' + parts[1]);
    }
  }

  // Execution
  var exec_exp = parts[3];
  if (exec_exp) {
    var arg_exps = exec_exp.substr(1, exec_exp.length - 2).trim();
    var args = arg_exps ? arg_exps.split(/\s*,\s*/) : [];
  }

  /**
   * A function that evaluates the given expression
   * 1. A value is obtained from the scope
   * 2. If an execution expression part is present, arguments from it are
   *   applied to the value (function) and the returned value is considered
   *   the actual expression value.
   * 3. If a setter expression part is present, the value is assigned
   *   to the target specified in such expression part.
   * 4. The value is returned.
   * @return {*} The value of the expression.
   */
  return function () {
    // Getter
    var value = lighter.ExpressionCompiler.get(parts[2], scope);

    // Execution
    if (exec_exp) {
      var arg_values = args.map(function (exp) {
        // Each argument is a getter expression
        return lighter.ExpressionCompiler.get(exp, scope);
      });
      value = value.apply(scope, arg_values);
    }

    // Setter
    if (parts[1]) {
      lighter.ExpressionCompiler.set(exp, value, scope);
    }

    return value;
  };
};

/**
 * Parses the given getter expression and returns the appropriate value
 * from the given scope.
 * - If the expression is a string expression, the {string} is returned.
 * - If there is not the complete property chain present in the scope,
 *   {undefined} is returned.
 * @param {string} exp The getter expression to parse.
 * @param {!(lighter.Scope|Window)} scope The scope in which to look for
 *   the value. This can also be a {Window} object for global look-ups.
 * @return {*} The value from the given scope.
 */
lighter.ExpressionCompiler.get = function (exp, scope) {
  var string_match = exp.match(lighter.ExpressionCompiler.STRING_EXPRESSION);
  if (string_match) {
    return string_match[2];
  }

  if (/^\d+$/.test(exp)) {
    return Number(exp);
  }

  var value = scope;
  var levels = lighter.ExpressionCompiler.parseLevels(exp, scope);
  levels.some(function (level) {
    if (value === null || level === null ||
      typeof level === 'undefined' ||
      typeof value[level] === 'undefined'
    ) {
      value = undefined;
      return true;
    }
    value = value[level];
  });

  return value;
};

/**
 * Splits the expression and returns level expressions one by one
 * @param {string} exp The getter expression to split.
 * @param {!(lighter.Scope|Window)} scope The scope from getread
 *   dynamic keys.
 * @return {!Array.<string>} Level expressions.
 */
lighter.ExpressionCompiler.parseLevels = function (exp, scope) {
  var levels = [];

  var match = exp.match(lighter.ExpressionCompiler.FIRST_LEVEL) || [];
  levels.push(match[0] || '');
  exp = exp.substr(levels[0].length);

  if (exp) {
    var matches = exp.match(lighter.ExpressionCompiler.DEEPER_LEVELS) || [];
    matches.forEach(function (match) {
      if (match[0] === '.') {
        levels.push(match.substr(1));
      } else {
        var key_exp = match.substr(1, match.length - 2);
        var key = lighter.ExpressionCompiler.get(key_exp, scope);
        levels.push(key);
      }
    });
  }

  return levels;
};

/**
 * Parses the given getter expression and sets the target value
 * - If there is not the complete property chain present in the scope,
 *   it is automatically built from simple objects.
 * @param {string} exp The getter expression to parse.
 * @param {*} value The value to set.
 * @param {!(lighter.Scope|Window)} scope The scope to which to get value.
 */
lighter.ExpressionCompiler.set = function (exp, value, scope) {
  var levels = lighter.ExpressionCompiler.parseLevels(exp, scope);
  var max_level = levels.length - 1;
  var target = scope;
  levels.some(function (level, i) {
    if (typeof level === 'undefined') {
      return true;
    }
    if (i === max_level) {
      target[level] = value;
    } else {
      var obj = target[level] || {};
      target[level] = obj;
      target = obj;
    }
  });
};

/**
 * Parses the given key-loop expression and returns the getter expressions
 * @param {string} exp The key-loop expression to parse.
 * @return {{ source: string, target: string }} Getter expressions.
 */
lighter.ExpressionCompiler.parseKeyLoopExpression = function (exp) {
  var match = exp.match(lighter.ExpressionCompiler.KEY_LOOP_EXPRESSION);
  if (!match) {
    match = exp.match(lighter.ExpressionCompiler.SIMPLE_KEY_LOOP_EXPRESSION);
  }
  if (!match) {
    throw new Error('Invalid key-loop expression: ' + exp);
  }

  return {
    source: match[2],
    target: match[1]
  };
};

/**
 * Fills the expressions in the given string with values from the scope.
 * @param {string} pat The pattern into which to replace the values.
 * @param {!(lighter.Scope|Window)} scope The scope from which to get values.
 * @return {string} The result.
 */
lighter.ExpressionCompiler.fillPattern = function (pat, scope) {
  return pat.replace(lighter.ExpressionCompiler.BINDINGS, function (exp) {
    exp = exp.substr(2, exp.length - 4);
    var value = lighter.ExpressionCompiler.get(exp, scope);
    return (typeof value === 'undefined') ? '' : value;
  });
};

/**
 * Parses an attribute condition expression.
 * @param {string} exp The attribute condition expression to parse.
 * @param {!(lighter.Scope|Window)} scope The scope from which to get values.
 * @return {!Array.<{ check: (function():boolean), attributes: !Object }>}
 *   Conditions.
 */
lighter.ExpressionCompiler.parseAttrConditions = function (exp, scope) {
  var matches = exp.match(lighter.ExpressionCompiler.ATTR_CONDITIONS);
  if (!matches) {
    throw new Error('Invalid attribute condition expression:' + exp);
  }

  var conditions = [];
  var condition;
  matches.slice(1).forEach(function (match) {
    if (!match) return;
    if (match.indexOf('=') === -1) {
      // New condition
      var check = function () {
        var exp = (match[0] === '!') ? match.substr(1) : match;
        var value = Boolean(lighter.ExpressionCompiler.get(match, scope));
        value = (match[0] === '!') ? !value : value;

        if (value) {
          // Update attributes
          var map = this.attribute_map_;
          var attrs = this.attributes;
          Object.keys(map).forEach(function (attr_name) {
            var value = lighter.ExpressionCompiler.get(map[attr_name], scope);
            attrs[attr_name] = value;
          });
        }

        return value;
      };
      condition = {
        check: check,
        attribute_map_: {},
        attributes: {}
      };
      conditions.push(condition);

    } else {
      // New attribute
      var parts = match.split('=');
      var attr_name = parts[0];
      var getter = parts.slice(1).join('=');
      condition.attribute_map_[attr_name] = getter;
    }
  });

  return conditions;
};
