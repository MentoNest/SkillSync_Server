import type { Type } from '@nestjs/common';
import type { MappedType } from './mapped-type.interface';
import type { RemoveFieldsWithType } from './types/remove-fields-with-type.type';
export declare function OmitType<T, K extends keyof T>(classRef: Type<T>, keys: readonly K[]): MappedType<RemoveFieldsWithType<Omit<T, (typeof keys)[number]>, Function>>;
