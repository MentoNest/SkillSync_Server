import { HttpException } from '@nestjs/common';
export declare function transformException(error: (Error & {
    field?: string;
    code?: string;
}) | undefined): HttpException | (Error & {
    field?: string;
    code?: string;
}) | undefined;
