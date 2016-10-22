/*
 * react pattern engine for patternlab-node - v0.1.0 - 2016
 *
 * Geoffrey Pursell, Brian Muenzenmeyer, and the web community.
 * Licensed under the MIT license.
 *
 * Many thanks to Brad Frost and Dave Olsen for inspiration, encouragement, and advice.
 *
 */

/*
 * ENGINE SUPPORT LEVEL:
 *
 * Full + extensions. Partial calls and lineage hunting are supported. Style
 * modifiers and pattern parameters are used to extend the core feature set of
 * React templates.
 *
 */

"use strict";

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Babel = require('babel-core');

var engine_react = {
  engine: React,
  engineName: 'react',
  engineFileExtension: '.jsx',

  // partial expansion is only necessary for React templates that have
  // style modifiers or pattern parameters (I think)
  expandPartials: false,

  // regexes, stored here so they're only compiled once
  findPartialsRE: null,
  findPartialsWithStyleModifiersRE: null,
  findPartialsWithPatternParametersRE: null,
  findListItemsRE: null,
  findPartialRE: null,

  // render it
  renderPattern: function renderPattern(pattern, data, partials) {
    try {
      /* eslint-disable no-eval */
      const componentString = pattern.template || pattern.extendedTemplate;
      const nodeComponent = Babel.transform(componentString, {
        presets: [ require('babel-preset-react') ],
        plugins: [ require('babel-plugin-transform-es2015-modules-commonjs') ]
      });
      const runtimeComponent = Babel.transform(componentString, {
        presets: [ require('babel-preset-react') ],
        plugins: [ require('babel-plugin-transform-es2015-modules-umd') ]
      });
      const Component = React.createFactory(eval(nodeComponent.code));
      const output = ReactDOMServer.renderToStaticMarkup(Component(data));

      return `<div id="reactContainer">

<!-- pattern HTML -->
${output}

</div>




<!-- pattern JSON (React props) -->
<script id="patternJSON" type="application/json">
${JSON.stringify(data)}
</script>

<!-- dependencies -->
<script>
var react = React;
</script>

<!-- runtime React output -->
<script>
${runtimeComponent.code};

<!-- runtime rendering -->
var component = unknown.default;
var patternJSON = document.getElementById('patternJSON').textContent;
ReactDOM.render(React.createElement(component, JSON.parse(patternJSON)), document.getElementById('reactContainer'));
</script>`;
    }
    catch (e) {
	    console.log("Error rendering React pattern.", e);
	    return "";
    }
  },

  /**
   * Find regex matches within both pattern strings and pattern objects.
   *
   * @param {string|object} pattern Either a string or a pattern object.
   * @param {object} regex A JavaScript RegExp object.
   * @returns {array|null} An array if a match is found, null if not.
   */
  patternMatcher: function patternMatcher(pattern, regex) {
    var matches;
    if (typeof pattern === 'string') {
      matches = pattern.match(regex);
    } else if (typeof pattern === 'object' && typeof pattern.template === 'string') {
      matches = pattern.template.match(regex);
    }
    return matches;
  },

  // find and return any {{> template-name }} within pattern
  findPartials: function findPartials(pattern) {
    return [];
  },
  findPartialsWithStyleModifiers: function (pattern) {
    return [];
  },

  // returns any patterns that match {{> value(foo:"bar") }} or {{>
  // value:mod(foo:"bar") }} within the pattern
  findPartialsWithPatternParameters: function (pattern) {
    return [];
  },
  findListItems: function (pattern) {
    return [];
  },

  // given a pattern, and a partial string, tease out the "pattern key" and
  // return it.
  findPartial_new: function (partialString) {
    return [];
  },

  // GTP: the old implementation works better. We might not need
  // this.findPartialRE anymore if it works in all cases!
  findPartial: function (partialString) {

  }
};

module.exports = engine_react;
