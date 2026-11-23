import { BackupController } from '../backup.controller';
import { BackupService } from '../backup.service';

describe('BackupController', () => {
  const service = { getStatus: jest.fn() };
  const controller = new BackupController(service as unknown as BackupService);

  beforeEach(() => jest.clearAllMocks());

  it('delegates to the backup service', async () => {
    const status = { health: 'healthy' } as never;
    service.getStatus.mockResolvedValue(status);

    await expect(controller.getStatus()).resolves.toBe(status);
    expect(service.getStatus).toHaveBeenCalledTimes(1);
  });
});
