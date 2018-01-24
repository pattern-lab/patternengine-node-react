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
const MemoryFS = require('memory-fs');
const process = require('process');
const path = require('path');
const { promisify } = require('util');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Hogan = require('hogan.js');
const beautify = require('js-beautify');
const webpack = require('webpack');
const tmp = require('tmp-promise');

// engine info
const engineFileExtension = ['.jsx', '.js'];

const errorStyling = `
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
const engineModulesPath = path.resolve(__dirname, '..', 'node_modules');

const webpackModuleConfig = {
  rules: [
    {
      test: /\.jsx?$/,
      exclude: /(node_modules|bower_components)/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: [
            [
              path.join(engineModulesPath, 'babel-preset-env'),
              {
                targets: {
                  node: 'current',
                  browsers: ['last 2 versions'],
                },
              },
            ],
            path.join(engineModulesPath, 'babel-preset-react'),
          ],
        },
      },
    },
  ],
};

const outputTemplate = Hogan.compile(
  fs.readFileSync(path.join(__dirname, './outputTemplate.mustache'), 'utf8')
);

const registeredComponents = {
  byPatternPartial: {},
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
    patternLabConfig.paths.public.patterns,
    pattern.patternLink
  );
}
function getAbsolutePatternOutputDir(pattern) {
  return path.dirname(getAbsolutePatternOutputPath(pattern));
}

function getModuleCodeString(pattern) {
  return pattern.template || pattern.extendedTemplate;
}

function moduleResolver(pattern, source, filename) {
  console.log('filename = ', filename);
  console.log('source = ', source);
  // console.log("pattern = ", pattern);

  if (source !== 'react') {
    return getAbsolutePatternPath(pattern);
  }

  return source;
}

function handleWebpackErrors(stats, err, message) {
  if (err) {
    console.error(err.stack || err);
    if (err.details) {
      console.error(err.details);
    }
    throw [message, err];
  }

  const info = stats.toJson();

  if (stats.hasErrors()) {
    info.errors.forEach(e => {
      console.error(e);
    });
  }

  if (stats.hasWarnings()) {
    console.warn(info.warnings);
  }
}

async function generateServerScript(pattern) {
  const entry = `./${pattern.fileName}${pattern.fileExtension}`;
  const context = path.dirname(getAbsolutePatternPath(pattern));
  const memFs = new MemoryFS();

  console.log('webpack entry is', entry);
  console.log('webpack context is', context);

  const compiler = webpack({
    context,
    entry,
    resolve: {
      extensions: engineFileExtension,
      modules: ['node_modules', engineModulesPath],
    },
    resolveLoader: {
      modules: [engineModulesPath, 'node_modules'],
    },
    output: {
      filename: 'blob.js',
      library: 'patternModule',
      libraryTarget: 'commonjs2',
      path: '/',
    },
    module: webpackModuleConfig,
  });

  // Use the in-memory file system for output
  compiler.outputFileSystem = memFs;

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      // Handle errors here
      try {
        handleWebpackErrors(
          stats,
          err,
          'something went wrong in generateServerScript():'
        );
      } catch (e) {
        reject(e);
      }
      // Read the file back into a string and return!
      const output = memFs.readFileSync('/blob.js', 'utf8');
      resolve(output);
    });
  });
}

async function createClientSideEntry(data) {
  const entryFileContents = `
import React from 'react';
import ReactDOM from 'react-dom';
import Comp from './blob';
const data = ${JSON.stringify(data)};

ReactDOM.render(React.createElement(Comp, data), document.body);
`;
  const entryFile = await tmp.file();
  fs.writeSync(entryFile.fd, entryFileContents, { encoding: 'utf8' });
  return entryFile;
}

async function generateClientScript(pattern, data) {
  // const entry = path.join(
  //   getAbsolutePatternOutputDir(pattern),
  //   'clientSideEntry.js'
  // );
  // write entry .js file
  const entryFile = await createClientSideEntry(data);
  const context = path.dirname(getAbsolutePatternPath(pattern));
  const memFs = new MemoryFS();

  console.log('webpack entry is', entryFile);
  console.log('webpack context is', context);

  const compiler = webpack({
    context,
    entry: entryFile.path,
    resolve: {
      extensions: engineFileExtension,
      modules: ['node_modules', engineModulesPath],
    },
    resolveLoader: {
      modules: [engineModulesPath, 'node_modules'],
    },
    output: {
      filename: 'blob.js',
      library: 'blob',
      libraryTarget: 'commonjs2',
      path: '/',
    },
    module: webpackModuleConfig,
  });

  // Use the in-memory file system for output
  compiler.outputFileSystem = memFs;

  compiler.run((err, stats) => {
    handleWebpackErrors(
      stats,
      err,
      'something went wrong in generateClientScript()'
    );

    entryFile.cleanup();

    // Read the file back into a string and return!
    const output = memFs.readFileSync('/blob.js', 'utf8');
    return output;
  });
}

const engine_react = {
  engine: React,
  engineName: 'react',
  engineFileExtension,

  // hell no
  expandPartials: false,

  // regexes, stored here so they're only compiled once
  findPartialsRE: /import .* from '[^']+'/g,
  findPartialsWithStyleModifiersRE: null,
  findPartialsWithPatternParametersRE: null,
  findListItemsRE: null,
  findPartialRE: /from '([^']+)'/,

  // render it
  async renderPattern(pattern, data, partials) {
    /* eslint-disable no-eval */
    try {
      // generate the server-side rendering script
      const serverSideScript = await generateServerScript(pattern, data);
      const clientSideScript = await generateClientScript(pattern, data);

      // const blobPath = path.join(
      //   getAbsolutePatternOutputDir(pattern),
      //   'blob.js'
      // );
      // const patternModule = require(blobPath).default;
      let patternModule;
      try {
        patternModule = eval(serverSideScript);
      } catch (e) {
        throw new Error("Oh no, couldn't eval() the serverSideScript!");
      }
      const staticMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createFactory(patternModule.default)(data)
      );

      return outputTemplate.render({
        htmlOutput: staticMarkup,
        scriptOutput: clientSideScript,
      });
    } catch (e) {
      const errorMessage = `Error rendering React pattern "${
        pattern.patternName
      }" (${pattern.relPath}): [${e.stack}]`;

      // log to console
      console.log(errorMessage);

      // return a nice error blob
      const stackHtml = e.stack.replace(
        /[\n\r]+/g,
        '<br />&nbsp;&nbsp;&nbsp;&nbsp;'
      );
      return `${errorStyling} <div class="plError">
          <h1>Error rendering React pattern "${pattern.patternName}"</h1>
          <dl>
            <dt>Template path</dt><dd>${pattern.relPath}</dd>
            <dt>Stack</dt><dd>${stackHtml}</dd>
          </dl>
          </div>
        `;
    }
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
    let matches;
    if (typeof pattern === 'string') {
      matches = pattern.match(regex);
    } else if (
      typeof pattern === 'object' &&
      typeof pattern.template === 'string'
    ) {
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
    const partial = partialString.match(this.findPartialRE)[1];
    return partial;
  },

  rawTemplateCodeFormatter(unformattedString) {
    return beautify(unformattedString, { e4x: true, indent_size: 2 });
  },

  renderedCodeFormatter(unformattedString) {
    return unformattedString;
  },

  markupOnlyCodeFormatter(unformattedString /*, pattern*/) {
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
  usePatternLabConfig: function(config) {
    patternLabConfig = config;

    try {
      enableRuntimeCode = patternLabConfig.engines.react.enableRuntimeCode;
    } catch (error) {
      console.log(
        'You’re missing the engines.react.enableRuntimeCode setting in your config file.'
      );
    }
  },
};

module.exports = engine_react;
