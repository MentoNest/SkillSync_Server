"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exitIfExtraArgs = exitIfExtraArgs;
const ui_1 = require("../ui");
/**
 * Checks if extra positional arguments were passed to a command
 * and exits with an error if so.
 *
 * Commander.js silently ignores extra positional arguments beyond what a command
 * defines. This function detects that case and provides a clear error message.
 *
 * @param command - the Command instance received in the action handler
 * @param expectedArgCount - number of positional arguments the command defines
 */
function exitIfExtraArgs(command, expectedArgCount) {
    const parentArgs = command.parent?.args ?? [];
    if (parentArgs.length > expectedArgCount) {
        const extraArgs = parentArgs.slice(expectedArgCount);
        console.error(`${ui_1.ERROR_PREFIX} Too many arguments. Unexpected extra argument(s): ${extraArgs.join(', ')}`);
        console.error(`Run "nest ${command.name()} --help" for usage information.\n`);
        process.exit(1);
    }
}
