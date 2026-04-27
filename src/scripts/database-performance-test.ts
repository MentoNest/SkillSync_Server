import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../modules/user/entities/user.entity';
import { MentorProfile } from '../modules/profile/entities/mentor-profile.entity';
import { MentorAvailability } from '../modules/availability/entities/mentor-availability.entity';
import { ServiceListing } from '../modules/service-listing/entities/service-listing.entity';
import { Booking } from '../modules/bookings/entities/booking.entity';
import { Wallet } from '../modules/user/entities/wallet.entity';

export class DatabasePerformanceTest {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  async runPerformanceTests(): Promise<void> {
    console.log('🚀 Starting Database Performance Tests...\n');

    // Test 1: User authentication queries
    await this.testUserAuthQueries();

    // Test 2: Mentor discovery queries
    await this.testMentorDiscoveryQueries();

    // Test 3: Availability checking queries
    await this.testAvailabilityQueries();

    // Test 4: Service listing search queries
    await this.testServiceListingQueries();

    // Test 5: Booking management queries
    await this.testBookingQueries();

    console.log('\n✅ Performance tests completed!');
  }

  private async testUserAuthQueries(): Promise<void> {
    console.log('📊 Testing User Authentication Queries...');

    // Test wallet address lookup
    const walletQuery = `
      EXPLAIN ANALYZE 
      SELECT u.*, w.address 
      FROM users u 
      JOIN wallets w ON u.id = w.userId 
      WHERE w.address = $1 AND u.isActive = true
    `;
    
    console.log('\n--- Wallet Address Lookup ---');
    const walletResult = await this.dataSource.query(walletQuery, ['test_wallet_address']);
    this.analyzeQueryPlan(walletResult);

    // Test user role filtering
    const roleQuery = `
      EXPLAIN ANALYZE 
      SELECT * FROM users 
      WHERE role = $1 AND isActive = true 
      ORDER BY createdAt DESC 
      LIMIT 10
    `;
    
    console.log('\n--- User Role Filtering ---');
    const roleResult = await this.dataSource.query(roleQuery, ['mentor']);
    this.analyzeQueryPlan(roleResult);
  }

  private async testMentorDiscoveryQueries(): Promise<void> {
    console.log('\n📊 Testing Mentor Discovery Queries...');

    // Test verified mentors with ratings
    const mentorQuery = `
      EXPLAIN ANALYZE 
      SELECT mp.*, u.email, u.firstName, u.lastName 
      FROM mentor_profiles mp 
      JOIN users u ON mp.userId = u.id 
      WHERE mp.isVerified = true AND mp.isAvailable = true 
      ORDER BY mp.averageRating DESC 
      LIMIT 20
    `;
    
    console.log('\n--- Verified Mentors by Rating ---');
    const mentorResult = await this.dataSource.query(mentorQuery);
    this.analyzeQueryPlan(mentorResult);

    // Test mentor availability
    const availabilityQuery = `
      EXPLAIN ANALYZE 
      SELECT ma.*, mp.bio, mp.title 
      FROM mentor_availability ma 
      JOIN mentor_profiles mp ON ma.mentorId = mp.userId 
      WHERE ma.dayOfWeek = $1 AND ma.isActive = true 
      AND mp.isAvailable = true
    `;
    
    console.log('\n--- Mentor Availability by Day ---');
    const availabilityResult = await this.dataSource.query(availabilityQuery, ['monday']);
    this.analyzeQueryPlan(availabilityResult);
  }

  private async testServiceListingQueries(): Promise<void> {
    console.log('\n📊 Testing Service Listing Queries...');

    // Test active service listings by category
    const categoryQuery = `
      EXPLAIN ANALYZE 
      SELECT sl.*, mp.averageRating, u.firstName, u.lastName 
      FROM service_listings sl 
      JOIN mentor_profiles mp ON sl.mentorId = mp.userId 
      JOIN users u ON mp.userId = u.id 
      WHERE sl.category = $1 AND sl.isActive = true 
      AND sl.approvalStatus = 'approved' AND sl.isDeleted = false 
      ORDER BY sl.averageRating DESC, sl.reviewCount DESC 
      LIMIT 10
    `;
    
    console.log('\n--- Service Listings by Category ---');
    const categoryResult = await this.dataSource.query(categoryQuery, ['technical']);
    this.analyzeQueryPlan(categoryResult);

    // Test featured listings
    const featuredQuery = `
      EXPLAIN ANALYZE 
      SELECT sl.*, mp.averageRating 
      FROM service_listings sl 
      JOIN mentor_profiles mp ON sl.mentorId = mp.userId 
      WHERE sl.isFeatured = true AND sl.isActive = true 
      AND sl.approvalStatus = 'approved' 
      ORDER BY sl.viewCount DESC 
      LIMIT 5
    `;
    
    console.log('\n--- Featured Service Listings ---');
    const featuredResult = await this.dataSource.query(featuredQuery);
    this.analyzeQueryPlan(featuredResult);
  }

  private async testBookingQueries(): Promise<void> {
    console.log('\n📊 Testing Booking Management Queries...');

    // Test mentor's upcoming bookings
    const mentorBookingsQuery = `
      EXPLAIN ANALYZE 
      SELECT b.*, sl.title, u.firstName as menteeFirstName, u.lastName as menteeLastName 
      FROM bookings b 
      JOIN service_listings sl ON b.serviceListingId = sl.id 
      JOIN users u ON b.menteeId = u.id 
      WHERE b.mentorId = $1 AND b.status IN ('confirmed', 'pending') 
      AND b.scheduledAt > NOW() 
      ORDER BY b.scheduledAt ASC
    `;
    
    console.log('\n--- Mentor Upcoming Bookings ---');
    const mentorBookingsResult = await this.dataSource.query(mentorBookingsQuery, ['test_mentor_id']);
    this.analyzeQueryPlan(mentorBookingsResult);

    // Test mentee's booking history
    const menteeHistoryQuery = `
      EXPLAIN ANALYZE 
      SELECT b.*, sl.title, u.firstName as mentorFirstName, u.lastName as mentorLastName 
      FROM bookings b 
      JOIN service_listings sl ON b.serviceListingId = sl.id 
      JOIN users u ON b.mentorId = u.id 
      WHERE b.menteeId = $1 AND b.status = 'completed' 
      ORDER BY b.scheduledAt DESC 
      LIMIT 20
    `;
    
    console.log('\n--- Mentee Booking History ---');
    const menteeHistoryResult = await this.dataSource.query(menteeHistoryQuery, ['test_mentee_id']);
    this.analyzeQueryPlan(menteeHistoryResult);
  }

  private async testAvailabilityQueries(): Promise<void> {
    console.log('\n📊 Testing Availability Queries...');

    // Test mentor availability for specific day
    const mentorAvailabilityQuery = `
      EXPLAIN ANALYZE 
      SELECT * FROM mentor_availability 
      WHERE mentorId = $1 AND dayOfWeek = $2 AND isActive = true 
      ORDER BY startTime ASC
    `;
    
    console.log('\n--- Mentor Specific Day Availability ---');
    const availabilityResult = await this.dataSource.query(mentorAvailabilityQuery, ['test_mentor_id', 'monday']);
    this.analyzeQueryPlan(availabilityResult);
  }

  private analyzeQueryPlan(queryPlan: any[]): void {
    if (!queryPlan || queryPlan.length === 0) {
      console.log('❌ No query plan returned');
      return;
    }

    const plan = queryPlan[0];
    const planString = typeof plan === 'string' ? plan : plan['QUERY PLAN'] || JSON.stringify(plan);
    
    // Extract execution time
    const timeMatch = planString.match(/Execution Time: ([\d.]+) ms/);
    const executionTime = timeMatch ? parseFloat(timeMatch[1]) : 0;

    // Check for index usage
    const indexUsage = planString.includes('Index Scan') || planString.includes('Index Only Scan');
    const seqScan = planString.includes('Seq Scan');

    console.log(`⏱️  Execution Time: ${executionTime.toFixed(2)}ms`);
    console.log(`📈 Index Usage: ${indexUsage ? '✅ Yes' : '❌ No'}`);
    console.log(`📋 Sequential Scan: ${seqScan ? '⚠️  Yes' : '✅ No'}`);
    
    if (executionTime > 100) {
      console.log(`🚨 SLOW QUERY: ${executionTime.toFixed(2)}ms (> 100ms threshold)`);
    } else if (executionTime > 50) {
      console.log(`⚠️  MODERATE: ${executionTime.toFixed(2)}ms (> 50ms)`);
    } else {
      console.log(`✅ FAST: ${executionTime.toFixed(2)}ms`);
    }

    if (!indexUsage && seqScan) {
      console.log('💡 Recommendation: Consider adding indexes for better performance');
    }
    
    console.log('');
  }

  async generateSlowQueryReport(): Promise<void> {
    console.log('📈 Generating Slow Query Report...\n');

    const slowQueries = [
      {
        name: 'User Authentication by Wallet',
        query: `
          SELECT u.*, w.address 
          FROM users u 
          JOIN wallets w ON u.id = w.userId 
          WHERE w.address = $1 AND u.isActive = true
        `,
        params: ['test_wallet_address']
      },
      {
        name: 'Mentor Discovery by Rating',
        query: `
          SELECT mp.*, u.email, u.firstName, u.lastName 
          FROM mentor_profiles mp 
          JOIN users u ON mp.userId = u.id 
          WHERE mp.isVerified = true AND mp.isAvailable = true 
          ORDER BY mp.averageRating DESC 
          LIMIT 20
        `,
        params: []
      },
      {
        name: 'Service Listings Search',
        query: `
          SELECT sl.*, mp.averageRating, u.firstName, u.lastName 
          FROM service_listings sl 
          JOIN mentor_profiles mp ON sl.mentorId = mp.userId 
          JOIN users u ON mp.userId = u.id 
          WHERE sl.category = $1 AND sl.isActive = true 
          AND sl.approvalStatus = 'approved' AND sl.isDeleted = false 
          ORDER BY sl.averageRating DESC, sl.reviewCount DESC 
          LIMIT 10
        `,
        params: ['technical']
      }
    ];

    for (const slowQuery of slowQueries) {
      console.log(`--- ${slowQuery.name} ---`);
      
      const startTime = Date.now();
      await this.dataSource.query(slowQuery.query, slowQuery.params);
      const endTime = Date.now();
      
      const executionTime = endTime - startTime;
      console.log(`⏱️  Execution Time: ${executionTime}ms`);
      
      if (executionTime > 100) {
        console.log('🚨 SLOW QUERY - Requires optimization');
      } else {
        console.log('✅ Acceptable performance');
      }
      console.log('');
    }
  }
}
