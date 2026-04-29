import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { DemoSeedService } from './demo-seed.service';
import { SeedModule } from './seed.module';

async function bootstrap() {
  console.log('🌱 Starting demo data seeding...');

  try {
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(SeedModule);

    // Get the demo seed service
    const demoSeedService = app.get(DemoSeedService);

    // Run the seed
    const result = await demoSeedService.seed();

    console.log('\n✅ Demo seeding completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👨‍🏫 Mentors created: ${result.mentorsCreated}`);
    console.log(`👨‍🎓 Mentees created: ${result.menteesCreated}`);
    console.log(`📅 Availability slots created: ${result.availabilitySlotsCreated}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📧 Demo Account Credentials:');
    console.log('\nMENTORS:');
    console.log('  demo_mentor_1@example.com - Dr. Sarah Chen (Machine Learning)');
    console.log('  demo_mentor_2@example.com - Marcus Johnson (Frontend/React)');
    console.log('  demo_mentor_3@example.com - Priya Patel (DevOps/Cloud)');
    console.log('  demo_mentor_4@example.com - Alex Rivera (Mobile Development)');
    console.log('  demo_mentor_5@example.com - Emily Watson (Backend/Node.js)');
    console.log('\nMENTEES:');
    console.log('  demo_mentee_1@example.com - Jordan Smith (AI/ML Learner)');
    console.log('  demo_mentee_2@example.com - Maya Rodriguez (Web Dev Student)');
    console.log('  demo_mentee_3@example.com - Ryan Kim (Cloud Engineering)');
    console.log('  demo_mentee_4@example.com - Aisha Mohammed (Mobile Dev)');
    console.log('  demo_mentee_5@example.com - Chris Taylor (Backend Developer)');
    console.log('\n💡 Note: These are demo accounts with wallet-based authentication.');
    console.log('   Use the wallet addresses in the database to authenticate.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Close the application
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Demo seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

bootstrap();
