import { DatabaseHealthService } from './database-health.service';

describe('DatabaseHealthService', () => {
  const dataSource = { isInitialized: true, query: jest.fn() };
  const service = () => new DatabaseHealthService(dataSource as never);

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.isInitialized = true;
  });

  it('passes when the database answers SELECT 1', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service().verify()).resolves.toBeUndefined();
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('fails with a descriptive error when the query fails', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));

    await expect(service().verify()).rejects.toThrow(
      'Database connection check failed: connection refused',
    );
  });

  it('fails when the data source never initialized', async () => {
    dataSource.isInitialized = false;

    await expect(service().verify()).rejects.toThrow('not initialized');
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
