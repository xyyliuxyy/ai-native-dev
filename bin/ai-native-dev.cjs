#!/usr/bin/env node
'use strict';
const path = require('node:path');
const app = require('../runtime/aicp.cjs');
app.main(process.argv.slice(2), {packageRoot:path.resolve(__dirname,'..')}).then(code => {process.exitCode=code;}).catch(e => {console.error('[ai-dev] ERROR:',e.message);process.exitCode=2;});
