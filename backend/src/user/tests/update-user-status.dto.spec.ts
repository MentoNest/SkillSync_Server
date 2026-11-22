import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserStatus } from '../user-status.enum';

describe('UpdateUserStatusDto', () => {
  it.each(Object.values(UserStatus))('accepts the %s status', async (status) => {
    const dto = plainToInstance(UpdateUserStatusDto, { status });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects unknown and missing statuses', async () => {
    const unknown = plainToInstance(UpdateUserStatusDto, { status: 'banned' });
    const missing = plainToInstance(UpdateUserStatusDto, {});

    expect((await validate(unknown))[0].constraints).toHaveProperty('isEnum');
    expect((await validate(missing))[0].constraints).toHaveProperty('isEnum');
  });
});
