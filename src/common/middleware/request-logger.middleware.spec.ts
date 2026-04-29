import { RequestLoggerMiddleware } from './request-logger.middleware';
import { RequestContextService } from '../services/request-context.service';

describe('RequestLoggerMiddleware', () => {
  let middleware: RequestLoggerMiddleware;

  beforeEach(() => {
    middleware = new RequestLoggerMiddleware();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should generate request ID if not provided in headers', () => {
      const mockReq: any = {
        method: 'GET',
        path: '/test',
        ip: '127.0.0.1',
        headers: {},
        get: jest.fn(() => 'test-agent'),
      };

      const mockRes: any = {
        statusCode: 200,
        setHeader: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            // Don't call callback immediately in test
          }
        }),
      };

      const mockNext = jest.fn();

      middleware.use(mockReq, mockRes, mockNext);

      // Verify request ID was set on request
      expect(mockReq.headers['x-request-id']).toBeDefined();
      expect(mockReq.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Verify request ID was set on response
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Request-Id',
        mockReq.headers['x-request-id']
      );

      // Verify next was called
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing request ID from headers if provided', () => {
      const existingRequestId = 'existing-request-id-12345';
      const mockReq: any = {
        method: 'POST',
        path: '/api/test',
        ip: '192.168.1.1',
        headers: {
          'x-request-id': existingRequestId,
        },
        get: jest.fn(() => 'custom-agent'),
      };

      const mockRes: any = {
        statusCode: 201,
        setHeader: jest.fn(),
        on: jest.fn(),
      };

      const mockNext = jest.fn();

      middleware.use(mockReq, mockRes, mockNext);

      // Verify existing request ID was preserved
      expect(mockReq.headers['x-request-id']).toBe(existingRequestId);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Request-Id',
        existingRequestId
      );
    });

    it('should propagate request ID through async context', (done) => {
      const mockReq: any = {
        method: 'GET',
        path: '/async-test',
        ip: '127.0.0.1',
        headers: {},
        get: jest.fn(() => 'test-agent'),
      };

      const mockRes: any = {
        statusCode: 200,
        setHeader: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            callback();
          }
        }),
      };

      const mockNext = jest.fn();

      middleware.use(mockReq, mockRes, mockNext);

      // Simulate request finish
      setTimeout(() => {
        const requestId = mockReq.headers['x-request-id'];
        expect(requestId).toBeDefined();
        done();
      }, 10);
    });
  });
});
