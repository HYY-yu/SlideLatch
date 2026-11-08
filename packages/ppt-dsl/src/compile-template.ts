import path from "node:path";
import { Command } from "commander";
import { compileTemplate } from "./compile.js";
const program = new Command().requiredOption("--template <path>").requiredOption("--out <dir>");
program.parse();
const options = program.opts();
await compileTemplate(path.resolve(options.template), path.resolve(options.out));
