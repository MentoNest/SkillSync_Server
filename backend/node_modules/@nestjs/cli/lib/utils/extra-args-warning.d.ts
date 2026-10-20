import { Command } from 'commander';
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
export declare function exitIfExtraArgs(command: Command, expectedArgCount: number): void;
