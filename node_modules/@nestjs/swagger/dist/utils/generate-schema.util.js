"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSchema = generateSchema;
const model_properties_accessor_1 = require("../services/model-properties-accessor");
const schema_object_factory_1 = require("../services/schema-object-factory");
const swagger_types_mapper_1 = require("../services/swagger-types-mapper");
function generateSchema(target, extraSchemas = {}) {
    const factory = new schema_object_factory_1.SchemaObjectFactory(new model_properties_accessor_1.ModelPropertiesAccessor(), new swagger_types_mapper_1.SwaggerTypesMapper());
    const schemas = Object.assign({}, extraSchemas);
    factory.exploreModelSchema(target, schemas);
    return { schema: schemas[target.name], schemas };
}
