import { OpenAPIObject } from './interfaces';
import { DenormalizedDoc } from './interfaces/denormalized-doc.interface';
export declare class SwaggerTransformer {
    normalizePaths(denormalizedDoc: DenormalizedDoc[]): Pick<OpenAPIObject, 'paths' | 'webhooks'> & {
        webhookPaths?: OpenAPIObject['paths'];
    };
}
