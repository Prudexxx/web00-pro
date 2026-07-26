import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function loadClassicScript(path, browser) {
  const source = await readFile(path, "utf8");
  const context = vm.createContext(browser.window);
  vm.runInContext(source, context, { filename: path });
  return browser;
}
