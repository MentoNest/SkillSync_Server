import { FastifySchema } from 'fastify';
/**
 * @publicApi
 * Allows setting the schema for the route. Schema is an object that can contain the following properties:
 * - body: JsonSchema
 * - querystring or query: JsonSchema
 * - params: JsonSchema
 * - response: Record<HttpStatusCode, JsonSchema>
 * @param schema See {@link https://fastify.dev/docs/latest/Reference/Routes/#routes-options}
 */
export declare const RouteSchema: (schema: FastifySchema) => import("@nestjs/common").CustomDecorator<string>;
