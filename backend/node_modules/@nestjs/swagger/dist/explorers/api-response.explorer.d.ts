import { Type } from '@nestjs/common';
import { SchemaObject } from '../interfaces/open-api-spec.interface';
import { FactoriesNeededByResponseFactory } from '../services/response-object-factory';
export declare const exploreGlobalApiResponseMetadata: (schemas: Record<string, SchemaObject>, metatype: Type<unknown>, factories: FactoriesNeededByResponseFactory) => {
    responses: {
        [x: string]: boolean;
    };
};
export declare const exploreApiResponseMetadata: (schemas: Record<string, SchemaObject>, factories: FactoriesNeededByResponseFactory, instance: object, prototype: Type<unknown>, method: Function, metatype?: Type<unknown>) => import("lodash").Dictionary<boolean> | {
    [status]: {
        description: string;
    };
};
