import { ApiResponseMetadata, ApiResponseSchemaHost } from '../decorators';
export declare class ResponseObjectMapper {
    private readonly mimetypeContentWrapper;
    toArrayRefObject(response: Record<string, any>, name: string, produces: string[]): {
        content: import("..").ContentObject;
    };
    toRefObject(response: Record<string, any>, name: string, produces: string[]): {
        content: import("..").ContentObject;
    };
    wrapSchemaWithContent(response: ApiResponseSchemaHost & ApiResponseMetadata, produces: string[]): (ApiResponseSchemaHost & import("..").ApiResponseCommonMetadata & {
        example?: any;
    }) | (ApiResponseSchemaHost & import("..").ApiResponseCommonMetadata & {
        examples?: {
            [key: string]: import("..").ApiResponseExamples;
        };
    }) | {
        content: import("..").ContentObject;
        schema?: import("..").SchemaObject & Partial<import("..").ReferenceObject>;
        status?: number | "default" | "1XX" | "2XX" | "3XX" | "4XX" | "5XX";
        description?: string;
        summary?: string;
        headers?: import("..").HeadersObject;
        links?: import("..").LinksObject;
        type?: import("@nestjs/common").Type<unknown> | Function | [Function] | string;
        isArray?: boolean;
        nullable?: boolean;
        example?: any;
    } | {
        content: import("..").ContentObject;
        schema?: import("..").SchemaObject & Partial<import("..").ReferenceObject>;
        status?: number | "default" | "1XX" | "2XX" | "3XX" | "4XX" | "5XX";
        description?: string;
        summary?: string;
        headers?: import("..").HeadersObject;
        links?: import("..").LinksObject;
        type?: import("@nestjs/common").Type<unknown> | Function | [Function] | string;
        isArray?: boolean;
        nullable?: boolean;
        examples?: {
            [key: string]: import("..").ApiResponseExamples;
        };
    };
}
