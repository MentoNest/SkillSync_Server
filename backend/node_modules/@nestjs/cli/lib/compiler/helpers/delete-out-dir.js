"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOutDirIfEnabled = deleteOutDirIfEnabled;
const promises_1 = require("fs/promises");
const get_value_or_default_1 = require("./get-value-or-default");
async function deleteOutDirIfEnabled(configuration, appName, dirPath, tsOptions) {
    const isDeleteEnabled = (0, get_value_or_default_1.getValueOrDefault)(configuration, 'compilerOptions.deleteOutDir', appName);
    if (!isDeleteEnabled) {
        return;
    }
    await (0, promises_1.rm)(dirPath, { recursive: true, force: true });
    if (tsOptions?.tsBuildInfoFile) {
        await (0, promises_1.rm)(tsOptions.tsBuildInfoFile, { force: true });
    }
}
