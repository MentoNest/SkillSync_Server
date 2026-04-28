import { DataSource } from 'typeorm';

export class SlowQueryMonitor {
  private dataSource: DataSource;
  private slowQueryThreshold: number = 100; // 100ms threshold

  constructor(dataSource: DataSource, threshold: number = 100) {
    this.dataSource = dataSource;
    this.slowQueryThreshold = threshold;
  }

  async setupSlowQueryLogging(): Promise<void> {
    console.log('🔧 Setting up slow query logging...');

    // Enable slow query logging for PostgreSQL
    await this.dataSource.query(`
      ALTER SYSTEM SET log_min_duration_statement = ${this.slowQueryThreshold}
    `);

    await this.dataSource.query(`
      ALTER SYSTEM SET log_statement = 'all'
    `);

    await this.dataSource.query(`
      SELECT pg_reload_conf()
    `);

    console.log(`✅ Slow query logging enabled for queries > ${this.slowQueryThreshold}ms`);
  }

  async analyzeSlowQueries(): Promise<void> {
    console.log('📊 Analyzing slow queries from pg_stat_statements...');

    // Check if pg_stat_statements extension is enabled
    const extensionCheck = await this.dataSource.query(`
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    `);

    if (extensionCheck.length === 0) {
      console.log('📦 Enabling pg_stat_statements extension...');
      await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`);
    }

    // Get slow queries from pg_stat_statements
    const slowQueries = await this.dataSource.query(`
      SELECT 
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        stddev_exec_time,
        max_exec_time,
        min_exec_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
      FROM pg_stat_statements 
      WHERE mean_exec_time > ${this.slowQueryThreshold}
      ORDER BY mean_exec_time DESC
      LIMIT 20
    `);

    console.log('\n🐌 Slow Queries Analysis:');
    console.log('=' .repeat(80));

    for (const query of slowQueries) {
      console.log(`\n📈 Query: ${query.query.substring(0, 100)}...`);
      console.log(`⏱️  Mean Time: ${query.mean_exec_time.toFixed(2)}ms`);
      console.log(`🔢 Calls: ${query.calls}`);
      console.log(`⏰ Max Time: ${query.max_exec_time.toFixed(2)}ms`);
      console.log(`📊 Hit Rate: ${query.hit_percent?.toFixed(2) || 'N/A'}%`);
      
      if (query.mean_exec_time > 200) {
        console.log('🚨 CRITICAL: Very slow query detected!');
      } else if (query.mean_exec_time > 100) {
        console.log('⚠️  WARNING: Slow query detected');
      }
    }

    if (slowQueries.length === 0) {
      console.log('✅ No slow queries detected above threshold!');
    }
  }

  async generateIndexRecommendations(): Promise<void> {
    console.log('\n💡 Generating Index Recommendations...');

    // Find queries that would benefit from indexes
    const recommendations = await this.dataSource.query(`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats 
      WHERE schemaname = 'public'
      AND (n_distinct > 100 OR n_distinct = -1)
      ORDER BY tablename, attname
    `);

    console.log('\n📋 Potential Index Candidates:');
    console.log('=' .repeat(80));

    const tableColumns = new Map<string, string[]>();
    
    recommendations.forEach(rec => {
      if (!tableColumns.has(rec.tablename)) {
        tableColumns.set(rec.tablename, []);
      }
      tableColumns.get(rec.tablename)!.push(rec.attname);
    });

    for (const [table, columns] of tableColumns.entries()) {
      console.log(`\n📊 Table: ${table}`);
      console.log(`   Columns for potential indexing: ${columns.join(', ')}`);
      
      // Suggest composite indexes for frequently queried combinations
      if (columns.length >= 2) {
        console.log(`   💡 Consider composite index: (${columns.slice(0, 3).join(', ')})`);
      }
    }
  }

  async monitorIndexUsage(): Promise<void> {
    console.log('\n📈 Monitoring Index Usage...');

    // Get index usage statistics
    const indexUsage = await this.dataSource.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes 
      ORDER BY idx_scan DESC
    `);

    console.log('\n📊 Index Usage Report:');
    console.log('=' .repeat(80));

    for (const index of indexUsage) {
      const usageRate = index.idx_scan > 0 ? '✅ Active' : '❌ Unused';
      console.log(`\n📋 Table: ${index.tablename}`);
      console.log(`   Index: ${index.indexname}`);
      console.log(`   Usage: ${usageRate} (${index.idx_scan} scans)`);
      console.log(`   Size: ${index.index_size}`);
      
      if (index.idx_scan === 0) {
        console.log('   💡 Consider dropping unused index to save space');
      }
    }
  }

  async generatePerformanceReport(): Promise<void> {
    console.log('\n📊 Generating Comprehensive Performance Report...\n');

    await this.analyzeSlowQueries();
    await this.generateIndexRecommendations();
    await this.monitorIndexUsage();

    console.log('\n🎯 Performance Optimization Recommendations:');
    console.log('=' .repeat(80));
    console.log('1. 📈 Monitor queries with execution time > 100ms');
    console.log('2. 🗂️  Add composite indexes for frequently queried column combinations');
    console.log('3. 🗑️  Remove unused indexes to reduce storage overhead');
    console.log('4. 📊 Regularly analyze table statistics with ANALYZE command');
    console.log('5. 🔄 Consider index maintenance during low-traffic periods');
    console.log('6. 📝 Use EXPLAIN ANALYZE to verify index usage for critical queries');
  }

  async checkIndexEffectiveness(): Promise<void> {
    console.log('\n🔍 Checking Index Effectiveness...');

    // Test critical queries before and after indexes
    const criticalQueries = [
      {
        name: 'User Authentication',
        query: `
          EXPLAIN (ANALYZE, BUFFERS) 
          SELECT u.* FROM users u 
          JOIN wallets w ON u.id = w.userId 
          WHERE w.address = $1 AND u.isActive = true
        `,
        params: ['test_wallet_address']
      },
      {
        name: 'Mentor Discovery',
        query: `
          EXPLAIN (ANALYZE, BUFFERS) 
          SELECT mp.* FROM mentor_profiles mp 
          WHERE mp.isVerified = true AND mp.isAvailable = true 
          ORDER BY mp.averageRating DESC LIMIT 20
        `,
        params: []
      },
      {
        name: 'Service Search',
        query: `
          EXPLAIN (ANALYZE, BUFFERS) 
          SELECT sl.* FROM service_listings sl 
          WHERE sl.category = $1 AND sl.isActive = true 
          AND sl.approvalStatus = 'approved' 
          ORDER BY sl.averageRating DESC LIMIT 10
        `,
        params: ['technical']
      }
    ];

    for (const testQuery of criticalQueries) {
      console.log(`\n--- ${testQuery.name} ---`);
      
      try {
        const result = await this.dataSource.query(testQuery.query, testQuery.params);
        this.analyzeExplainPlan(result);
      } catch (error) {
        console.log(`❌ Error executing query: ${error.message}`);
      }
    }
  }

  private analyzeExplainPlan(explainResult: any[]): void {
    if (!explainResult || explainResult.length === 0) {
      console.log('❌ No execution plan available');
      return;
    }

    const plan = explainResult[0];
    const planString = typeof plan === 'string' ? plan : plan['QUERY PLAN'] || JSON.stringify(plan);
    
    // Extract key metrics
    const executionTime = this.extractExecutionTime(planString);
    const planningTime = this.extractPlanningTime(planString);
    const indexUsage = planString.includes('Index Scan') || planString.includes('Index Only Scan');
    const seqScan = planString.includes('Seq Scan');
    const bufferStats = this.extractBufferStats(planString);

    console.log(`⏱️  Execution Time: ${executionTime}ms`);
    console.log(`📋 Planning Time: ${planningTime}ms`);
    console.log(`📈 Index Usage: ${indexUsage ? '✅ Yes' : '❌ No'}`);
    console.log(`📋 Sequential Scan: ${seqScan ? '⚠️  Yes' : '✅ No'}`);
    
    if (bufferStats) {
      console.log(`💾 Buffer Hits: ${bufferStats.hits}, Reads: ${bufferStats.reads}`);
    }

    // Performance assessment
    if (executionTime > 100) {
      console.log('🚨 SLOW QUERY - Requires optimization');
    } else if (executionTime > 50) {
      console.log('⚠️  MODERATE - Could be optimized');
    } else {
      console.log('✅ GOOD - Acceptable performance');
    }

    if (!indexUsage && seqScan) {
      console.log('💡 Consider adding indexes to avoid sequential scans');
    }
  }

  private extractExecutionTime(planString: string): number {
    const match = planString.match(/Execution Time: ([\d.]+) ms/);
    return match ? parseFloat(match[1]) : 0;
  }

  private extractPlanningTime(planString: string): number {
    const match = planString.match(/Planning Time: ([\d.]+) ms/);
    return match ? parseFloat(match[1]) : 0;
  }

  private extractBufferStats(planString: string): { hits: number; reads: number } | null {
    const hitsMatch = planString.match(/shared hit blocks=(\d+)/);
    const readsMatch = planString.match(/shared read blocks=(\d+)/);
    
    if (hitsMatch || readsMatch) {
      return {
        hits: hitsMatch ? parseInt(hitsMatch[1]) : 0,
        reads: readsMatch ? parseInt(readsMatch[1]) : 0
      };
    }
    
    return null;
  }
}
