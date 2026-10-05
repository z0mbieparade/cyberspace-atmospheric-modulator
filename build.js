#!/usr/bin/env node

// Usage: node build.js [version] [--no-minify]
const { runBuild } = require('./build/build-userscript');

runBuild(require('./userscript.config.js'), require('./package.json').version);
