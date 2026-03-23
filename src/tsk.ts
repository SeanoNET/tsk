#!/usr/bin/env bun
import { runMain, showUsage } from "citty";
import { mainCommand } from "./cli/index.js";

const argv = process.argv.slice(2);
const wantsTopLevelHelp =
  argv.length === 0 || (argv.length === 1 && ["-h", "--help"].includes(argv[0]!));

if (wantsTopLevelHelp) {
  showUsage(mainCommand);
} else {
  runMain(mainCommand);
}
