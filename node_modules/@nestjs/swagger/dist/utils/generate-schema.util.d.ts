import { Type } from '@nestjs/common';
import { SchemaObject } from '../interfaces/open-api-spec.interface';
export declare function generateSchema<T = any>(target: Type<T>, extraSchemas?: Record<string, SchemaObject>): {
    schema: SchemaObject;
    schemas: Record<string, SchemaObject>;
};
