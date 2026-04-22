"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildJSInitOptions = buildJSInitOptions;
const crypto_1 = require("crypto");
function buildJSInitOptions(initOptions) {
    const fns = [];
    const placeholders = [];
    let json = JSON.stringify(initOptions, (key, value) => {
        if (typeof value === 'function') {
            const placeholder = (0, crypto_1.randomUUID)();
            fns.push(value);
            placeholders.push(placeholder);
            return placeholder;
        }
        return value;
    }, 2);
    placeholders.forEach((placeholder, i) => {
        json = json.replace(`"${placeholder}"`, fns[i].toString());
    });
    return `let options = ${json};`;
}
