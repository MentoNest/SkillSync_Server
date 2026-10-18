import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransformInterceptor } from './transform.interceptor';

/** Registers the response-envelope interceptor application-wide (#1462). */
@Global()
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: TransformInterceptor }],
  exports: [TransformInterceptor],
})
export class ResponseEnvelopeModule {}