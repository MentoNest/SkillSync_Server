import { GlobalExceptionFilter } from './global-exception.filter';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes.enum';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      url: '/test',
      method: 'GET',
      headers: {},
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  describe('HttpException handling', () => {
    it('should handle BadRequestException correctly', () => {
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad request',
          error: 'Bad Request',
          errorCode: ErrorCodes.BAD_REQUEST,
          path: '/test',
        }),
      );
    });

    it('should handle NotFoundException correctly', () => {
      const exception = new NotFoundException('Not found');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Not found',
          error: 'Not Found',
          errorCode: ErrorCodes.NOT_FOUND,
        }),
      );
    });

    it('should handle UnauthorizedException correctly', () => {
      const exception = new UnauthorizedException('Unauthorized');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Unauthorized',
          error: 'Unauthorized',
          errorCode: ErrorCodes.UNAUTHORIZED,
        }),
      );
    });

    it('should handle ForbiddenException correctly', () => {
      const exception = new ForbiddenException('Forbidden');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
          error: 'Forbidden',
          errorCode: ErrorCodes.FORBIDDEN,
        }),
      );
    });
  });

  describe('BusinessException handling', () => {
    it('should handle BusinessException with custom error code', () => {
      const exception = new BusinessException(
        'Custom business error',
        ErrorCodes.CONFLICT,
        HttpStatus.CONFLICT,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'Custom business error',
          errorCode: ErrorCodes.CONFLICT,
        }),
      );
    });
  });

  describe('Unknown exception handling', () => {
    it('should handle unknown exceptions as 500', () => {
      const exception = new Error('Unknown error');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
          errorCode: ErrorCodes.INTERNAL_ERROR,
        }),
      );
    });

    it('should include stack trace in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const exception = new Error('Test error');
      exception.stack = 'Error: Test error\n  at test.ts:1:1';

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: exception.stack,
        }),
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const exception = new Error('Test error');
      exception.stack = 'Error: Test error\n  at test.ts:1:1';

      filter.catch(exception, mockHost);

      const response = mockResponse.json.mock.calls[0][0];
      expect(response.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Validation error formatting', () => {
    it('should format validation errors from BadRequestException', () => {
      const exception = new BadRequestException({
        message: [
          'email must be an email',
          'password should not be empty',
        ],
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.arrayContaining([
            expect.objectContaining({
              field: 'email',
              errors: ['must be an email'],
            }),
            expect.objectContaining({
              field: 'password',
              errors: ['should not be empty'],
            }),
          ]),
        }),
      );
    });
  });

  describe('Request ID handling', () => {
    it('should include request ID from headers', () => {
      mockRequest.headers['x-request-id'] = 'test-request-id';
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id',
        }),
      );
    });
  });

  describe('Response structure', () => {
    it('should return consistent error structure', () => {
      const exception = new BadRequestException('Test error');

      filter.catch(exception, mockHost);

      const response = mockResponse.json.mock.calls[0][0];

      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('errorCode');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('path');
      expect(response).toHaveProperty('requestId');

      expect(typeof response.statusCode).toBe('number');
      expect(typeof response.timestamp).toBe('string');
    });
  });
});
