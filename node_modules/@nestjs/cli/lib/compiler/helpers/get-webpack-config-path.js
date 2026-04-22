"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebpackConfigPath = getWebpackConfigPath;
const get_value_or_default_1 = require("./get-value-or-default");
/**
 * Returns the path to the webpack configuration file to use for the given application.
 * @param configuration Configuration object.
 * @param cmdOptions Command line options.
 * @param appName Application name.
 * @returns The path to the webpack configuration file to use.
 */
function getWebpackConfigPath(configuration, cmdOptions, appName) {
    let webpackPath = (0, get_value_or_default_1.getValueOrDefault)(configuration, 'compilerOptions.webpackConfigPath', appName, 'webpackPath', cmdOptions);
    if (webpackPath) {
        return webpackPath;
    }
    const builder = (0, get_value_or_default_1.getValueOrDefault)(configuration, 'compilerOptions.builder', appName);
    if (typeof builder === 'object' && builder?.type === 'webpack') {
        const webpackConfigPath = builder.options?.configPath;
        if (webpackConfigPath) {
            return webpackConfigPath;
        }
        // If builder.type is 'webpack' but no config path is specified, return undefined
        // to let webpack use its default behavior
        return undefined;
    }
    return undefined;
}
