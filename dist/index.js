var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  load: () => load,
  unload: () => unload
});
module.exports = __toCommonJS(index_exports);
var import_child_process = require("child_process");
var import_util = __toESM(require("util"));
var execAsync = import_util.default.promisify(import_child_process.exec);
var fileSelectionUnsubscribe;
function load() {
  console.log("Plugin Orca Git Blame carregado!");
  fileSelectionUnsubscribe = orca.editor.onDidLineChange(async (event) => {
    const { filePath, lineNumber, currentWorktreePath } = event;
    if (!filePath || !currentWorktreePath) return;
    try {
      const command = `git blame -L ${lineNumber},${lineNumber} --porcelain ${filePath}`;
      const { stdout } = await execAsync(command, { cwd: currentWorktreePath });
      if (stdout) {
        const blameInfo = parseGitBlamePorcelain(stdout);
        orca.editor.setLineDecoration(lineNumber, {
          text: ` \u2022 ${blameInfo.author} (${blameInfo.summary})`,
          className: "orca-git-blame-inline-text",
          style: { color: "rgba(128, 128, 128, 0.6)", fontStyle: "italic" }
        });
      }
    } catch (error) {
      orca.editor.clearLineDecoration(lineNumber);
    }
  });
}
function unload() {
  if (fileSelectionUnsubscribe) fileSelectionUnsubscribe();
  orca.editor.clearAllDecorations();
  console.log("Plugin Orca Git Blame descarregado.");
}
function parseGitBlamePorcelain(stdout) {
  const lines = stdout.split("\n");
  let author = "Unknown";
  let summary = "";
  for (const line of lines) {
    if (line.startsWith("author ")) author = line.replace("author ", "");
    if (line.startsWith("summary ")) summary = line.replace("summary ", "");
  }
  return { author, summary };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  unload
});
