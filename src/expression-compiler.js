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
    if (typeof level === 'undefined' || typeof value[level] === 'undefined') {
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
