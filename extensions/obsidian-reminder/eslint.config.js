// Raycast's shared config, flat-config style as of @raycast/eslint-config 2.
// https://developers.raycast.com/information/tools/eslint
const raycast = require("@raycast/eslint-config");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [{ ignores: [".dist/"] }, ...raycast];
