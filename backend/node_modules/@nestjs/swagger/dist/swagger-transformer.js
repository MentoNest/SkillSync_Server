"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwaggerTransformer = void 0;
const lodash_1 = require("lodash");
const sort_object_lexicographically_1 = require("./utils/sort-object-lexicographically");
class SwaggerTransformer {
    normalizePaths(denormalizedDoc) {
        const roots = denormalizedDoc.filter((doc) => Boolean(doc.root));
        const webhookRoots = roots.filter(({ root }) => Boolean(root.isWebhook));
        const pathRoots = roots.filter(({ root }) => !root.isWebhook);
        const groupedByPath = (0, lodash_1.groupBy)(pathRoots, ({ root }) => root.path);
        const paths = (0, lodash_1.mapValues)(groupedByPath, (routes) => {
            const keyByMethod = (0, lodash_1.keyBy)(routes, ({ root }) => root.method);
            return (0, lodash_1.mapValues)(keyByMethod, (route) => {
                const mergedDefinition = Object.assign(Object.assign({}, (0, lodash_1.omit)(route, 'root')), (0, lodash_1.omit)(route.root, ['method', 'path', 'isWebhook', 'webhookName']));
                return (0, sort_object_lexicographically_1.sortObjectLexicographically)(mergedDefinition);
            });
        });
        const groupedByWebhookName = (0, lodash_1.groupBy)(webhookRoots, ({ root }) => root.webhookName || root.path);
        const webhooks = (0, lodash_1.mapValues)(groupedByWebhookName, (routes) => {
            const keyByMethod = (0, lodash_1.keyBy)(routes, ({ root }) => root.method);
            return (0, lodash_1.mapValues)(keyByMethod, (route) => {
                const mergedDefinition = Object.assign(Object.assign({}, (0, lodash_1.omit)(route, 'root')), (0, lodash_1.omit)(route.root, ['method', 'path', 'isWebhook', 'webhookName']));
                return (0, sort_object_lexicographically_1.sortObjectLexicographically)(mergedDefinition);
            });
        });
        const groupedByWebhookPath = (0, lodash_1.groupBy)(webhookRoots, ({ root }) => root.path);
        const webhookPaths = (0, lodash_1.mapValues)(groupedByWebhookPath, (routes) => {
            const keyByMethod = (0, lodash_1.keyBy)(routes, ({ root }) => root.method);
            return (0, lodash_1.mapValues)(keyByMethod, (route) => {
                const mergedDefinition = Object.assign(Object.assign({}, (0, lodash_1.omit)(route, 'root')), (0, lodash_1.omit)(route.root, ['method', 'path', 'isWebhook', 'webhookName']));
                return (0, sort_object_lexicographically_1.sortObjectLexicographically)(mergedDefinition);
            });
        });
        return Object.assign(Object.assign({ paths }, (Object.keys(webhooks).length > 0 ? { webhooks } : {})), (Object.keys(webhookPaths).length > 0 ? { webhookPaths } : {}));
    }
}
exports.SwaggerTransformer = SwaggerTransformer;
