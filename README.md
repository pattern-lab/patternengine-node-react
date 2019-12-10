[📢 Archived in favor of https://github.com/pattern-lab/patternlab-node](https://github.com/pattern-lab/patternlab-node)

# The React engine for Pattern Lab / Node
This is the **very preliminary barely worth mentioning** React engine for Patternlab/Node. It's more or less a proof of concept.

## Status
You can author standalone React components that include only the main React module, which I know isn't much yet. We're still working out how React components will resolve and load the modules they depend on, including other patterns. We believe this is tricky, but doable.

## Supported features
Kind of nothing works yet. **Very early in development.**

- [ ] [Includes](http://patternlab.io/docs/pattern-including.html)
- [ ] Lineage
- [ ] [Hidden Patterns](http://patternlab.io/docs/pattern-hiding.html)
- [ ] [Pseudo-Patterns](http://patternlab.io/docs/pattern-pseudo-patterns.html)
- [ ] [Pattern States](http://patternlab.io/docs/pattern-states.html)
- [ ] [Pattern Parameters](http://patternlab.io/docs/pattern-parameters.html)
- [ ] [Style Modifiers](http://patternlab.io/docs/pattern-stylemodifier.html)

## Usage
* `*.jsx` files are detected as patterns.
* Standard pattern JSON is passed into React components as props.

## Notes
* Components are rendered statically to markup at build time using ReactDOMServer.renderToStaticMarkup(), but also transpiled and inlined as scripts in the pattern code to execute at runtime.
* We currently assume the React include (and others, once we figure that out) are written using es2015 module syntax.
* The Babel transforms are currently hard-coded into the engine, but we hope to make this configurable in the future.
