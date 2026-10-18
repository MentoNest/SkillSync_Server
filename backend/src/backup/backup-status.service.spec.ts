import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BackupStatusService } from './backup-status.service';

const configFor = (path: string) => ({ get: () => path }) as any;

describe('BackupStatusService', () => {
  it('reports unknown when no status file exists', async () => {
    const service = new BackupStatusService(configFor(join(tmpdir(), 'missing-status.json')));
    expect(await service.getStatus()).toMatchObject({ status: 'unknown', stale: true });
  });

  it('reads a fresh successful backup', async () => {
    const file = join(tmpdir(), `backup-status-${process.pid}-ok.json`);
    const now = new Date('2025-03-07T03:00:00Z');
    await fs.writeFile(
      file,
      JSON.stringify({ status: 'ok', timestamp: '2025-03-07T02:15:00Z', file: 'x.dump.enc', message: 'done' }),
    );
    const status = await new BackupStatusService(configFor(file)).getStatus(now);
    expect(status).toMatchObject({ status: 'ok', file: 'x.dump.enc', stale: false });
    await fs.rm(file);
  });

  it('flags stale and failed backups', async () => {
    const file = join(tmpdir(), `backup-status-${process.pid}-old.json`);
    await fs.writeFile(file, JSON.stringify({ status: 'failed', timestamp: '2025-03-01T02:15:00Z', message: 'disk full' }));
    const status = await new BackupStatusService(configFor(file)).getStatus(new Date('2025-03-07T03:00:00Z'));
    expect(status).toMatchObject({ status: 'failed', stale: true, message: 'disk full' });
    await fs.rm(file);
  });
});
