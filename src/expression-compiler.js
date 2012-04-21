'use strict';

goog.provide('lighter.ExpressionCompiler');


/**
 * A valid variable name {RegExp}
 * @type {RegExp}
 */
lighter.ExpressionCompiler.GETTER_EXPRESSION =
  /[a-zA-Z\$_:](?:[\w\$_.:]*?[\w\$_])?/;

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
 * @param {!lighter.Scope} scope The scope in which to look for values.
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
 * @param {!lighter.Scope|Window} scope The scope in which to look for
 *   the value. This can also be a {Window} object for global look-ups.
 * @return {*} The value from the given scope.
 */
lighter.ExpressionCompiler.get = function (exp, scope) {
  var string_match = exp.match(lighter.ExpressionCompiler.STRING_EXPRESSION);
  if (string_match) {
    return string_match[2];
  }

  var value = scope;
  var levels = exp.split('.');
  levels.some(function (level) {
    if (typeof value[level] === 'undefined') {
      value = undefined;
      return true;
    }
    value = value[level];
  });

  return value;
};

/**
 * Parses the given getter expression and sets the target value
 * - If there is not the complete property chain present in the scope,
 *   it is automatically built from simple objects.
 * @param {string} exp The getter expression to parse.
 * @param {*} value The value to set.
 * @param {!lighter.Scope} scope The scope to which to write the value.
 */
lighter.ExpressionCompiler.set = function (exp, value, scope) {
  var levels = exp.split('.');
  var max_level = levels.length - 1;
  var target = scope;
  levels.forEach(function (level, i) {
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
    throw new Error('Invalid key-loop expression: ' + exp);
  }

  return {
    source: match[2],
    target: match[1]
  };
};
