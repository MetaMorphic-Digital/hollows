import fs from "fs";
import postcss from "rollup-plugin-postcss";
import postcssImport from "postcss-import";
import postcssValueParser from "postcss-value-parser";
import resolve from "@rollup/plugin-node-resolve";
import * as yaml from "js-yaml";

const filepath = "_variables.yml";
if (!fs.existsSync(filepath)) {
  console.log("Missing '_variables.yml' file. Cannot deduce package type and package id.");
  process.exit(1);
}
const { PACKAGE_TYPE, PACKAGE_ID } = yaml.load(await fs.promises.readFile(filepath, "utf-8"));

/**
 * The prefix of the URL that gets replaced.
 * @type {string}
 */
const PREFIX = `/${PACKAGE_TYPE}s/${PACKAGE_ID}/`;

/* -------------------------------------------------- */

/**
 * Adjust css urls; each url that starts with the prefix gets said prefix sliced off such that all urls are relative.
 * @returns {object}
 */
function adjustCSSUrls() {
  return {
    postcssPlugin: "rewrite-urls",
    Declaration(decl) {
      const parsed = postcssValueParser(decl.value);

      parsed.walk(node => {
        if ((node.type === "function") && (node.value === "url")) {
          const urlNode = node.nodes[0];
          const url = urlNode?.value;
          if (!url?.startsWith(PREFIX)) return;
          urlNode.value = url.slice(PREFIX.length);
        }
      });

      decl.value = parsed.toString();
    },
  };
}
adjustCSSUrls.postcss = true;

/* -------------------------------------------------- */

export default {
  input: "./_main.mjs",
  output: {
    file: "./public/main.mjs",
    format: "esm",
  },
  plugins: [
    resolve(),
    postcss({
      plugins: [
        postcssImport(),
        adjustCSSUrls(),
      ],
      extract: true,
    }),
  ],
};
