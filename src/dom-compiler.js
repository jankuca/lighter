'use strict';

goog.provide('lighter.DOMCompiler');

goog.require('lighter.ExpressionCompiler');


/**
 * The valid filter name syntax
 * @type {RegExp}
 */
lighter.DOMCompiler.FILTER_NAME = /[a-zA-Z$][a-zA-Z\-$]*/;

/**
 * The expression markup {RegExp}
 * - 1: the expression
 * - ...: filters
 * @type {RegExp}
 */
lighter.DOMCompiler.EXPRESSION_MARKUP = new RegExp('\\{\\{' +
  '(' + lighter.ExpressionCompiler.GETTER_EXPRESSION.source + ')' +
  '(?:\\s*\\|\\s*(' + lighter.DOMCompiler.FILTER_NAME.source + '))*' +
'\\}\\}');


/**
 * Prepares the given DOM subtree for further modifications such as binding
 * @param {Element} dom The root DOM element of the subtree to compile.
 */
lighter.DOMCompiler.compileDOM = function (dom) {
  var texts = document.evaluate('//text()', dom, null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  for (var i = 0, ii = texts.snapshotLength; i < ii; ++i) {
    var text = texts.snapshotItem(i);
    lighter.DOMCompiler.compileTextNode(text);
  }

  var compileLevel = function (node) {
    if (node.nodeType === 1) {
      lighter.DOMCompiler.compileAttributes(node);

      var children = node.childNodes;
      for (var i = 0, ii = children.length; i < ii; ++i) {
        compileLevel(children[i]);
      }
    }
  };

  compileLevel(dom);
};

/**
 * Replaces expression markup with SPAN elements with a lt:bind attribute
 * - The original text node is preserved unless its final value is empty.
 * Example: "A {{B}} C {{D}} E"
 *   -> "A "<SPAN lt:bind="B"></SPAN>" C "<SPAN lt:bind="D"></SPAN>" E"
 * @param {Text} text The text node to compile.
 */
lighter.DOMCompiler.compileTextNode = function (text) {
  var target = text.parentNode;
  var data = text.nodeValue;
  var match = data.match(lighter.DOMCompiler.EXPRESSION_MARKUP);
  if (!match) {
    return;
  }

  var exp = match[1];
  var filters = match.slice(2);
  var index = match.index;

  // Insert a SPAN element with a lt:bind attribute after the original node
  var element = document.createElement('span');
  element.setAttribute('lt:bind', exp);
  if (filters.length) {
    element.setAttribute('lt:filters', filters.join(','));
  }
  target.insertBefore(element, text.nextSibling);

  // Get remaining text
  var suffix_data = data.substr(index + match[0].length);
  // Clip the original text node
  data = data.substr(0, Math.min(data.length, index));
  if (data.length) {
    text.nodeValue = data;
  } else {
    // Remove the original text node if empty
    target.removeChild(text);
  }

  if (suffix_data.length) {
    // Insert a new text node after the SPAN element
    var suffix = document.createTextNode(suffix_data);
    target.insertBefore(suffix, element.nextSibling);
    // Recursively compile the new text node
    lighter.DOMCompiler.compileTextNode(suffix);
  }
};

/**
 * Transforms attributes with expression markup into a single lt:attrs attr.
 * @param {!Element} element The element whose attributes to transform.
 */
lighter.DOMCompiler.compileAttributes = function (element) {
  var old = element.getAttribute('lt:attr-patterns');
  var result = /** @type {!Object} */ goog.global.JSON.parse(old || '{}');

  var attrs = element.attributes;
  for (var i = 0, ii = attrs.length; i < ii; ++i) {
    var attr = attrs[i];
    var value = attr.value;
    if (attr.name !== 'lt:attr-patterns' && value.indexOf('{{') !== -1) {
      result[attr.name] = attr.value;
    }
  }

  if (Object.keys(result).length) {
    var value = goog.global.JSON.stringify(result);
    element.setAttribute('lt:attr-patterns', value);
  }
};
