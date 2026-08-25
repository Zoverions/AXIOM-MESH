'use strict';

const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const applicationRoot = __dirname;
process.env.AXIOM_APPLICATION_ROOT = applicationRoot;
const entry = join(applicationRoot, 'runtime', 'mesh', 'src', 'hosted-plesk.mjs');

import(pathToFileURL(entry).href)
  .then(({ startHostedProduction }) => startHostedProduction())
  .catch(error => {
    process.stderr.write(`AXIOM hosted application failed closed: ${error.message}\n`);
    process.exitCode = 1;
  });
