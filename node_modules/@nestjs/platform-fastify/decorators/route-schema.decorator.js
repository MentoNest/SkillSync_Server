"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteSchema = void 0;
const common_1 = require("@nestjs/common");
const constants_1 = require("../constants");
/**
 * @publicApi
 * Allows setting the schema for the route. Schema is an object that can contain the following properties:
 * - body: JsonSchema
 * - querystring or query: JsonSchema
 * - params: JsonSchema
 * - response: Record<HttpStatusCode, JsonSchema>
 * @param schema See {@link https://fastify.dev/docs/latest/Reference/Routes/#routes-options}
 */
const RouteSchema = (schema) => (0, common_1.SetMetadata)(constants_1.FASTIFY_ROUTE_SCHEMA_METADATA, schema);
exports.RouteSchema = RouteSchema;
