"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiQuery = ApiQuery;
const lodash_1 = require("lodash");
const enum_utils_1 = require("../utils/enum.utils");
const helpers_1 = require("./helpers");
const defaultQueryOptions = {
    name: '',
    required: true
};
function ApiQuery(options) {
    const apiQueryMetadata = options;
    const [type, isArray] = (0, helpers_1.getTypeIsArrayTuple)(apiQueryMetadata.type, apiQueryMetadata.isArray);
    const param = Object.assign(Object.assign({ name: 'name' in options ? options.name : defaultQueryOptions.name, in: 'query' }, (0, lodash_1.omit)(options, ['enum', 'extensions'])), { type });
    if ((0, enum_utils_1.isEnumArray)(options)) {
        (0, enum_utils_1.addEnumArraySchema)(param, options);
    }
    else if ((0, enum_utils_1.isEnumDefined)(options)) {
        (0, enum_utils_1.addEnumSchema)(param, options);
    }
    if (isArray) {
        param.isArray = isArray;
    }
    const extensions = options.extensions;
    if (extensions && typeof extensions === 'object') {
        const cloned = (0, lodash_1.clone)(extensions);
        for (const [key, value] of Object.entries(cloned)) {
            const extKey = key.startsWith('x-') ? key : `x-${key}`;
            param[extKey] = value;
        }
    }
    return (0, helpers_1.createParamDecorator)(param, defaultQueryOptions);
}
