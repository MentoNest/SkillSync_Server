import { Test, TestingModule } from '@nestjs/testing';
import { CsrfService } from '../services/csrf.service';
import { CsrfGuard } from './csrf.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('CsrfService', () => {
  let service: CsrfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsrfService],
    }).compile();

    service = module.get<CsrfService>(CsrfService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate a 32-character token', () => {
    const token = service.generateToken();
    expect(token).toHaveLength(32);
    expect(typeof token).toBe('string');
  });

  it('should generate unique tokens', () => {
    const token1 = service.generateToken();
    const token2 = service.generateToken();
    expect(token1).not.toBe(token2);
  });

  it('should validate matching tokens', () => {
    const token = service.generateToken();
    const isValid = service.validateTokens(token, token);
    expect(isValid).toBe(true);
  });

  it('should reject mismatched tokens', () => {
    const token1 = service.generateToken();
    const token2 = service.generateToken();
    const isValid = service.validateTokens(token1, token2);
    expect(isValid).toBe(false);
  });

  it('should reject missing tokens', () => {
    const isValid1 = service.validateTokens('', 'valid-token');
    const isValid2 = service.validateTokens('valid-token', '');
    const isValid3 = service.validateTokens('', '');
    
    expect(isValid1).toBe(false);
    expect(isValid2).toBe(false);
    expect(isValid3).toBe(false);
  });
});

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    guard = new CsrfGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow GET requests without CSRF validation', () => {
    const context = createMockContext('GET', {}, {});
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow valid CSRF tokens', () => {
    const token = 'valid-csrf-token';
    const context = createMockContext('POST', 
      { 'x-csrf-token': token }, 
      { 'csrf-token': token }
    );
    
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject missing CSRF header token', () => {
    const context = createMockContext('POST', 
      {}, 
      { 'csrf-token': 'valid-token' }
    );
    
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject missing CSRF cookie token', () => {
    const context = createMockContext('POST', 
      { 'x-csrf-token': 'valid-token' }, 
      {}
    );
    
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject mismatched CSRF tokens', () => {
    const context = createMockContext('POST', 
      { 'x-csrf-token': 'token1' }, 
      { 'csrf-token': 'token2' }
    );
    
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject empty tokens', () => {
    const context = createMockContext('POST', 
      { 'x-csrf-token': '' }, 
      { 'csrf-token': '' }
    );
    
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

// Helper function to create mock execution context
function createMockContext(
  method: string, 
  headers: Record<string, string>, 
  cookies: Record<string, string>
): ExecutionContext {
  const mockRequest = {
    method,
    headers,
    cookies,
    path: '/test'
  };

  const mockResponse = {};

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
    getClass: () => null,
    getHandler: () => null,
  } as unknown as ExecutionContext;
}