"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteConfig = void 0;
const common_1 = require("@nestjs/common");
const constants_1 = require("../constants");
/**
 * @publicApi
 *
 * @param config See {@link https://fastify.dev/docs/latest/Reference/Routes/#config}
 */
const RouteConfig = (config) => (0, common_1.SetMetadata)(constants_1.FASTIFY_ROUTE_CONFIG_METADATA, config);
exports.RouteConfig = RouteConfig;
