"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteConstraints = void 0;
const common_1 = require("@nestjs/common");
const constants_1 = require("../constants");
/**
 * @publicApi
 *
 * @param config See {@link https://fastify.dev/docs/latest/Reference/Routes/#constraints}
 */
const RouteConstraints = (config) => (0, common_1.SetMetadata)(constants_1.FASTIFY_ROUTE_CONSTRAINTS_METADATA, config);
exports.RouteConstraints = RouteConstraints;
