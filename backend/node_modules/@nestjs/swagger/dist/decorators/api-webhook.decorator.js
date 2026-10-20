"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiWebhook = ApiWebhook;
const constants_1 = require("../constants");
const helpers_1 = require("./helpers");
function ApiWebhook(name) {
    return (0, helpers_1.createMethodDecorator)(constants_1.DECORATORS.API_WEBHOOK, name !== null && name !== void 0 ? name : true);
}
