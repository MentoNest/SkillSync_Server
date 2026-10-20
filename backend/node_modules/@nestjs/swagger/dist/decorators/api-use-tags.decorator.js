"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiTags = ApiTags;
const common_1 = require("@nestjs/common");
const constants_1 = require("../constants");
const helpers_1 = require("./helpers");
const logger = new common_1.Logger('ApiTags');
function ApiTags(...tags) {
    const normalizedTags = tags.map((tag) => {
        if (typeof tag === 'string') {
            return tag;
        }
        if (tag.parent !== undefined || tag.kind !== undefined) {
            logger.warn(`Tag "${tag.name}" includes hierarchy fields (parent/kind) defined via @ApiTags, but those values are ignored there. Define them with DocumentBuilder.addTag("${tag.name}", description, { parent, kind }) to include them in the document's root-level tags.`);
        }
        return tag.name;
    });
    return (0, helpers_1.createMixedDecorator)(constants_1.DECORATORS.API_TAGS, normalizedTags);
}
