import { omit, omitBy, transform } from 'es-toolkit/compat';
export function convertStandardSchemaToOpenAPI(schema, schemaType = 'input', schemaConverter) {
    if (!isStandardSchema(schema)) {
        return undefined;
    }
    const customSchema = schemaConverter?.(schema, { schemaType });
    if (customSchema) {
        return normalizeCustomConvertedSchema(customSchema);
    }
    if (!hasStandardJsonSchema(schema)) {
        return undefined;
    }
    const convert = schema['~standard'].jsonSchema?.[schemaType];
    if (!convert) {
        return undefined;
    }
    const convertedSchema = convert({ target: 'openapi-3.0' });
    if (!convertedSchema || typeof convertedSchema !== 'object') {
        return undefined;
    }
    return normalizeConvertedSchema(convertedSchema);
}
function isStandardSchema(schema) {
    return !!(schema && typeof schema === 'object' && '~standard' in schema);
}
function hasStandardJsonSchema(schema) {
    const standard = schema['~standard'];
    return !!standard && 'jsonSchema' in standard;
}
function normalizeCustomConvertedSchema(convertedSchema) {
    return {
        schema: rewriteDefinitionRefs(convertedSchema.schema),
        components: rewriteComponents(convertedSchema.components || {})
    };
}
function normalizeConvertedSchema(schema, components = {}) {
    const normalizedComponents = getDefinitionEntries(schema).reduce((acc, [name, definition]) => ({
        ...acc,
        [name]: rewriteDefinitionRefs(definition)
    }), {});
    return {
        schema: rewriteDefinitionRefs(omit(schema, ['$defs', 'definitions', '$schema'])),
        components: {
            ...rewriteComponents(components),
            ...normalizedComponents
        }
    };
}
function rewriteComponents(components) {
    return Object.entries(components).reduce((acc, [name, definition]) => ({
        ...acc,
        [name]: rewriteDefinitionRefs(definition)
    }), {});
}
function getDefinitionEntries(schema) {
    const definitions = schema.$defs || schema.definitions;
    if (!definitions || typeof definitions !== 'object') {
        return [];
    }
    return Object.entries(definitions);
}
function rewriteDefinitionRefs(value) {
    if (Array.isArray(value)) {
        return value.map((item) => rewriteValue(item));
    }
    const rewrittenValue = omitBy(transform(value, (result, currentValue, key) => {
        result[key] = rewriteValue(currentValue);
    }, {}), (currentValue) => currentValue === undefined);
    return normalizeSchemaExamples(rewrittenValue);
}
function rewriteValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => rewriteValue(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const currentValue = value;
    if (typeof currentValue.$ref === 'string') {
        return {
            ...rewriteDefinitionRefs(omit(currentValue, ['$ref'])),
            $ref: currentValue.$ref
                .replace('#/$defs/', '#/components/schemas/')
                .replace('#/definitions/', '#/components/schemas/')
        };
    }
    return rewriteDefinitionRefs(currentValue);
}
function normalizeSchemaExamples(value) {
    const normalizedConstValue = normalizeSchemaConst(value);
    if (!Array.isArray(normalizedConstValue.examples) ||
        normalizedConstValue.example !== undefined) {
        return normalizedConstValue;
    }
    const [firstExample] = normalizedConstValue.examples;
    return {
        ...omit(normalizedConstValue, ['examples']),
        example: firstExample
    };
}
function normalizeSchemaConst(value) {
    if (!('const' in value)) {
        return value;
    }
    const constValue = value.const;
    if (!Array.isArray(value.examples) || value.example !== undefined) {
        return {
            ...omit(value, ['const']),
            enum: value.enum ?? [constValue]
        };
    }
    return {
        ...omit(value, ['const']),
        enum: value.enum ?? [constValue]
    };
}
