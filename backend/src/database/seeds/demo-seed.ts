import 'reflect-metadata';
import { AppDataSource } from '../../database/data-source';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/entities/role.entity';

async function seedDemo() {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log('SEED_DEMO_DATA is not true; skipping demo seed.');
    return;
  }

  await AppDataSource.initialize();
  const roleRepo = AppDataSource.getRepository(Role);
  const userRepo = AppDataSource.getRepository(User);

  const mentorRole =
    (await roleRepo.findOne({ where: { name: 'mentor' } })) ??
    (await roleRepo.save(roleRepo.create({ name: 'mentor', description: 'Demo mentor role' })));
  const menteeRole =
    (await roleRepo.findOne({ where: { name: 'mentee' } })) ??
    (await roleRepo.save(roleRepo.create({ name: 'mentee', description: 'Demo mentee role' })));

  for (let i = 1; i <= 5; i++) {
    const mentorWallet = `demo_mentor_${i}@example.com`;
    const menteeWallet = `demo_mentee_${i}@example.com`;

    const mentorExists = await userRepo.findOne({ where: { walletAddress: mentorWallet } });
    if (!mentorExists) {
      await userRepo.save(
        userRepo.create({
          walletAddress: mentorWallet,
          displayName: `Demo Mentor ${i}`,
          username: `demo_mentor_${i}`,
          roles: [mentorRole],
        }),
      );
    }

    const menteeExists = await userRepo.findOne({ where: { walletAddress: menteeWallet } });
    if (!menteeExists) {
      await userRepo.save(
        userRepo.create({
          walletAddress: menteeWallet,
          displayName: `Demo Mentee ${i}`,
          username: `demo_mentee_${i}`,
          roles: [menteeRole],
        }),
      );
    }
  }

  console.log('Demo mentor/mentee accounts seeded.');
  await AppDataSource.destroy();
}

seedDemo().catch(async (e) => {
  console.error(e);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
