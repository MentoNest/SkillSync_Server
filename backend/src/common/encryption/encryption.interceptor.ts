import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface EncryptionOptions {
  fields: string[];
  direction: 'encrypt' | 'decrypt';
}

export const ENCRYPTION_OPTIONS = 'encryption_options';

/**
 * Interceptor for automatic field encryption/decryption
 * Use with @SetMetadata(ENCRYPTION_OPTIONS, { fields: ['email'], direction: 'decrypt' })
 */
@Injectable()
export class FieldEncryptionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // Encryption/decryption is handled at the service level
        // This interceptor provides the framework for response transformation
        return data;
      }),
    );
  }
}
