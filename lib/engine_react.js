/*
 * react pattern engine for patternlab-node - v0.1.0 - 2016
 *
 * Geoffrey Pursell, Brian Muenzenmeyer, and the web community.
 * Licensed under the MIT license.
 *
 * Many thanks to Brad Frost and Dave Olsen for inspiration, encouragement, and advice.
 *
 */
'use strict';

const fs = require('fs');
const process = require('process');
const path = require('path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Babel = require('babel-core');
const Hogan = require('hogan.js');
const beautify = require('js-beautify');
const cheerio = require('cheerio');
const webpack = require("webpack");
const _require = require;

var errorStyling = `
<style>
  .plError {
    background: linear-gradient(to bottom, #f1f1f1 0%,#ffffff 60%);
    color: #444;
    padding: 30px;
  }
  .plError h1 {
    font-size: 16pt;
    color: #733;
    background: #fcfcfc;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    padding: 17px 30px;
    margin: -30px -30px 0 -30px;
  }
  .plError dt { font-weight: bold; }
</style>
`;

// This holds the config from from core. The core has to call
// usePatternLabConfig() at load time for this to be populated.
let patternLabConfig = {};

let enableRuntimeCode = true;

const outputTemplate = Hogan.compile(
  fs.readFileSync(
    path.join(__dirname, './outputTemplate.mustache'),
    'utf8'
  )
);

let registeredComponents = {
  byPatternPartial: {}
};

function getAbsolutePatternDir(pattern) {
  return path.join(
    process.cwd(),
    patternLabConfig.paths.source.patterns,
    pattern.subdir
  );
}
function getAbsolutePatternPath(pattern) {
  return path.join(
    process.cwd(),
    patternLabConfig.paths.source.patterns,
    pattern.relPath
  );
}
function getAbsolutePatternOutputPath(pattern) {
  return path.join(
    process.cwd(),
    patternLabConfig.paths.public.root,
    pattern.patternLink
  );
}

function getModuleCodeString(pattern) {
  return pattern.template || pattern.extendedTemplate;
}

function moduleResolver(pattern, source, filename) {
  console.log("filename = ", filename);
  console.log("source = ", source);
  // console.log("pattern = ", pattern);

  if (source !== 'react') {
    return getAbsolutePatternPath(pattern);
  }

  return source;
}



function generateScript(pattern) {
  const engineModulesPath = path.resolve(__dirname, '..', 'node_modules');

  return new Promise((resolve, reject) => {
    webpack({
      entry: getAbsolutePatternPath(pattern),
      // context: path.resolve(__dirname, '..', 'node_modules'),
      resolveLoader: {
        modules: [engineModulesPath, 'node_modules']
      },
      output: {
        filename: 'blob.js',
        path: path.dirname(getAbsolutePatternOutputPath(pattern))
      },
      module: {
        rules: [
          {
            test: /\.jsx?$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'babel-loader',
              options: {
                // resolveModuleSource: (source, filename) => moduleResolver(pattern, source, filename),
                presets: [
                  path.join(engineModulesPath, 'babel-preset-env'),
                  path.join(engineModulesPath, 'babel-preset-react'),
                ],
                plugins: [
                  path.join(engineModulesPath, 'babel-plugin-transform-es2015-modules-commonjs')
                ]
              }
            }
          }
        ]
      }
    }, (err, stats) => {
      // Handle errors here
      if (err) {
        console.error(err.stack || err);
        if (err.details) {
          console.error(err.details);
        }
        reject('something went wrong in generateScript():', err);
      }

      const info = stats.toJson();

      if (stats.hasErrors()) {
        info.errors.forEach((e) => {
          console.error(e);
        })
      }

      if (stats.hasWarnings()) {
        console.warn(info.warnings);
      }


      // Done processing
      resolve()
    });
  });
}

function babelTransform(pattern) {
  // console.log(pattern);
  const sourceRoot = path.join(
    process.cwd(),
    patternLabConfig.paths.source.patterns,
    pattern.subdir
  );
  const transpiledModuleCode = Babel.transform(getModuleCodeString(pattern), {
    sourceRoot: sourceRoot,
    resolveModuleSource: (source, filename) => moduleResolver(pattern, source, filename),
    presets: [ require('babel-preset-react') ],
    plugins: [ require('babel-plugin-transform-es2015-modules-commonjs') ]
  });
  return transpiledModuleCode;
}

var engine_react = {
  engine: React,
  engineName: 'react',
  engineFileExtension: ['.jsx', '.js'],

  // hell no
  expandPartials: false,

  // regexes, stored here so they're only compiled once
  findPartialsRE: /import .* from '[^']+'/g,
  findPartialsWithStyleModifiersRE: null,
  findPartialsWithPatternParametersRE: null,
  findListItemsRE: null,
  findPartialRE: /from '([^']+)'/,

  // render it
  renderPattern(pattern, data, partials) {
    /* eslint-disable no-eval */

    return Promise.resolve()
      .then(() => {
        return generateScript(pattern)
      })
      .then(() => {
        const transpiledModuleCode = babelTransform(pattern);
        const patternModule = eval(transpiledModuleCode.code);

        const staticMarkup = ReactDOMServer.renderToStaticMarkup(
          React.createFactory(patternModule)(data)
        );

        return outputTemplate.render({
          htmlOutput: staticMarkup
        });
      })
      .catch((e) => {
        var errorMessage = `Error rendering React pattern "${pattern.patternName}" (${pattern.relPath}): [${e.toString()}]`;
        console.log(errorMessage);
        return `${errorStyling} <div class="plError">
          <h1>Error rendering React pattern "${pattern.patternName}"</h1>
          <dl>
            <dt>Message</dt><dd>${e.toString()}</dd>
            <dt>Partial name</dt><dd>${pattern.patternName}</dd>
            <dt>Template path</dt><dd>${pattern.relPath}</dd>
          </dl>
          </div>
        `;
      });
  },

  registerPartial(pattern) {
    // add to registry
    registeredComponents.byPatternPartial[pattern.patternPartial] = pattern;
  },


  /**
   * Find regex matches within both pattern strings and pattern objects.
   *
   * @param {string|object} pattern Either a string or a pattern object.
   * @param {object} regex A JavaScript RegExp object.
   * @returns {array|null} An array if a match is found, null if not.
   */
  patternMatcher(pattern, regex) {
    var matches;
    if (typeof pattern === 'string') {
      matches = pattern.match(regex);
    } else if (typeof pattern === 'object' && typeof pattern.template === 'string') {
      matches = pattern.template.match(regex);
    }
    return matches;
  },

  // find and return any `import X from 'template-name'` within pattern
  findPartials(pattern) {
    const self = this;
    const matches = pattern.template.match(this.findPartialsRE);
    if (!matches) {
      return [];
    }

    // Remove unregistered imports from the matches
    matches.map(m => {
      const key = self.findPartial(m);
      if (!registeredComponents.byPatternPartial[key]) {
        const i = matches.indexOf(m);
        if (i > -1) {
          matches.splice(i, 1);
        }
      }
    });

    return matches;
  },

  findPartialsWithStyleModifiers(/*pattern*/) {
    return [];
  },

  // returns any patterns that match {{> value(foo:'bar') }} or {{>
  // value:mod(foo:'bar') }} within the pattern
  findPartialsWithPatternParameters(/*pattern*/) {
    return [];
  },
  findListItems(/*pattern*/) {
    return [];
  },

  // given a pattern, and a partial string, tease out the "pattern key" and
  // return it.
  findPartial(partialString) {
    let partial = partialString.match(this.findPartialRE)[1];
    return partial;
  },

  rawTemplateCodeFormatter(unformattedString) {
    return beautify(unformattedString, {e4x: true, indent_size: 2});
  },

  renderedCodeFormatter(unformattedString) {
    return unformattedString;
  },

  markupOnlyCodeFormatter(unformattedString/*, pattern*/) {
    // const $ = cheerio.load(unformattedString);
    // return beautify.html($('.reactPatternContainer').html(), {indent_size: 2});
    return unformattedString;
  },

  /**
   * Add custom output files to the pattern output
   * @param {object} patternlab - the global state object
   * @returns {(object|object[])} - an object or array of objects,
   * each with two properties: path, and content
   */
  addOutputFiles(/*paths, patternlab*/) {
    return [];
  },


  /**
   * Accept a Pattern Lab config object from the core and put it in
   * this module's closure scope so we can configure engine behavior.
   *
   * @param {object} config - the global config object from core
   */
  usePatternLabConfig: function (config) {
    patternLabConfig = config;

    try {
      enableRuntimeCode = patternLabConfig.engines.react.enableRuntimeCode;
    } catch (error) {
      console.log('You’re missing the engines.react.enableRuntimeCode setting in your config file.');
    }
  }

};

module.exports = engine_react;
