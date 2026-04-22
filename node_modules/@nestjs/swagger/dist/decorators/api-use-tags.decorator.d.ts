import { ApiTagOptions } from '../interfaces/open-api-spec.interface';
export declare function ApiTags(...tags: (string | ApiTagOptions)[]): MethodDecorator & ClassDecorator;
