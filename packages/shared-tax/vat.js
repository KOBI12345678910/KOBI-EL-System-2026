// Subpath shim so consumers using classic `node` moduleResolution
// can resolve `@techno-kol/shared-tax/vat` to the compiled output in
// `dist/vat.js`. Modern resolvers (`node16`, `nodenext`, `bundler`) read
// the `exports` map in package.json and bypass this file.
"use strict";
module.exports = require("./dist/vat.js");
