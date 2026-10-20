import type { StandardSchemaConverter } from '../interfaces/swagger-document-options.interface.js';
import { ReferenceObject, SchemaObject } from '../interfaces/open-api-spec.interface.js';
export interface ConvertedStandardSchema {
    schema: SchemaObject | ReferenceObject;
    components: Record<string, SchemaObject>;
}
export declare function convertStandardSchemaToOpenAPI(schema: unknown, schemaType?: 'input' | 'output', schemaConverter?: StandardSchemaConverter): ConvertedStandardSchema | undefined;
