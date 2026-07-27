import * as fs from "fs";
import path from "path";
import * as yaml from "js-yaml";

console.log("Reforging Symlinks");
const filepath = "_environment.yml";

if (!fs.existsSync(filepath)) process.exit(0);

let fileRoot = "";
try {
  const environment = yaml.load(await fs.promises.readFile(filepath, "utf-8"));
  const { FOUNDRY_INSTALL_PATH } = environment;
  if (!FOUNDRY_INSTALL_PATH) process.exit(1);

  // As of 13.338, the Node install is *not* nested but electron installs *are*
  const nested = fs.existsSync(path.join(FOUNDRY_INSTALL_PATH, "resources", "app"));

  if (nested) fileRoot = path.join(FOUNDRY_INSTALL_PATH, "resources", "app");
  else fileRoot = FOUNDRY_INSTALL_PATH;
} catch (err) {
  console.error(`Error reading '${filepath}': ${err}`);
}

try {
  await fs.promises.mkdir("foundry");
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}

// Javascript files
for (const p of ["client", "common", "tsconfig.json"]) {
  try {
    await fs.promises.symlink(path.join(fileRoot, p), path.join("foundry", p));
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}

// Language files
try {
  await fs.promises.symlink(path.join(fileRoot, "public", "lang"), path.join("foundry", "lang"));
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
