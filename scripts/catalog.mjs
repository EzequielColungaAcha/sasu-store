/**
 * Builds the catalog from a workbook, refreshes wholesale costs, then downloads images.
 *
 *   npm run catalog
 *   npm run catalog -- --file list.xlsx
 *   npm run catalog -- Forzex.xlsx
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { ROOT, resolveWorkbook } from "./price-list.mjs";

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, "scripts", script), ...args], {
      stdio: "inherit",
      cwd: ROOT,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

try {
  const workbook = resolveWorkbook(process.argv);
  const steps = [
    ["build-catalog.mjs", ["--file", workbook.path]],
    ["update-prices.mjs", ["--file", workbook.path]],
    ["download-images.mjs", []],
  ];
  for (const [script, args] of steps) {
    await run(script, args);
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
