import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  ValidationError,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Handle validation errors specifically
    if (exception?.getResponse?.()?.statusCode === HttpStatus.BAD_REQUEST) {
      const validationErrors = exception.getResponse();
      
      if (Array.isArray(validationErrors?.message)) {
        // Format validation errors
        const errors = this.formatValidationErrors(validationErrors.message);
        
        return response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          errors,
          timestamp: new Date().toISOString(),
          path: request.url,
        });
      }
    }

    // For other errors, let the default HttpExceptionFilter handle them
    throw exception;
  }

  private formatValidationErrors(errors: ValidationError[]): any[] {
    const formattedErrors: any[] = [];
    
    for (const error of errors) {
      if (error.constraints) {
        for (const [constraint, message] of Object.entries(error.constraints)) {
          formattedErrors.push({
            property: error.property,
            value: error.value,
            constraint,
            message,
          });
        }
      }
      
      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.formatValidationErrors(error.children);
        formattedErrors.push(...nestedErrors);
      }
    }
    
    return formattedErrors;
  }
}