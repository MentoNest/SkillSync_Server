import { DataSource } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/user.entity';

export const runSeeds = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established for seeding');

    const userRepository = AppDataSource.getRepository(User);

    // Check if admin user already exists
    const existingAdmin = await userRepository.findOne({
      where: { email: 'admin@example.com' },
    });

    if (!existingAdmin) {
      const adminUser = userRepository.create({
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        isActive: true,
      });

      await userRepository.save(adminUser);
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists, skipping');
    }

    // Check if test user already exists
    const existingTestUser = await userRepository.findOne({
      where: { email: 'test@example.com' },
    });

    if (!existingTestUser) {
      const testUser = userRepository.create({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
      });

      await userRepository.save(testUser);
      console.log('Test user created successfully');
    } else {
      console.log('Test user already exists, skipping');
    }

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

// Run seeds if this file is executed directly
if (require.main === module) {
  runSeeds()
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
