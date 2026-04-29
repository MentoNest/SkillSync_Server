import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const mockHealthService = {
    checkDetailed: jest.fn(),
  };
  const mockResponse = {
    status: jest.fn().mockReturnThis(),
  } as any;

  beforeEach(() => {
    controller = new HealthController(mockHealthService as any);
    jest.clearAllMocks();
  });

  it('returns 200 when the health status is healthy', async () => {
    mockHealthService.checkDetailed.mockResolvedValueOnce({ status: 'healthy' });

    const result = await controller.getHealth(mockResponse);

    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'healthy' });
  });

  it('returns 503 when the health status is unhealthy', async () => {
    mockHealthService.checkDetailed.mockResolvedValueOnce({ status: 'unhealthy' });

    const result = await controller.getHealth(mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(503);
    expect(result).toEqual({ status: 'unhealthy' });
  });
});
