# Demo Accounts Documentation

This document provides information about the demo accounts available for development and testing purposes.

## Overview

The SkillSync platform includes demo seed data that can be loaded into the database for development and staging environments. This includes:

- **5 Mentor Accounts** with complete profiles, expertise, and availability
- **5 Mentee Accounts** with learning goals and interests
- **Availability Slots** for all mentors
- **Realistic Data** generated using the Faker library

## Quick Start

### Running the Demo Seed

To populate your database with demo data, run:

```bash
npm run seed:demo
```

### Environment Configuration

The demo seed is controlled by the `SEED_DEMO_DATA` environment variable:

```env
# Enable demo data seeding
SEED_DEMO_DATA=true

# Disable demo data seeding (default)
SEED_DEMO_DATA=false
```

When `SEED_DEMO_DATA=true`, the demo seed will run automatically during application startup (if configured). You can also manually trigger it using the command above.

## Demo Mentor Accounts

All demo mentors are marked as **featured** and have complete profiles with availability slots.

### 1. Dr. Sarah Chen
- **Email:** `demo_mentor_1@example.com`
- **Expertise:** Machine Learning, Python, Data Science, AI Ethics
- **Experience:** 12 years
- **Availability:** 10 hours/week
- **Bio:** AI researcher with 10+ years of experience in machine learning and deep learning. Passionate about making AI accessible and ethical.
- **Mentoring Style:** One-on-One, Code Review, Career Guidance

### 2. Marcus Johnson
- **Email:** `demo_mentor_2@example.com`
- **Expertise:** React, TypeScript, System Design, Frontend Architecture
- **Experience:** 8 years
- **Availability:** 8 hours/week
- **Bio:** Senior frontend engineer specializing in scalable React applications. Open source contributor and technical writer.
- **Mentoring Style:** Pair Programming, Project Review, Technical Deep Dives

### 3. Priya Patel
- **Email:** `demo_mentor_3@example.com`
- **Expertise:** DevOps, AWS, Kubernetes, CI/CD, Infrastructure as Code
- **Experience:** 9 years
- **Availability:** 12 hours/week
- **Bio:** Cloud infrastructure expert with extensive experience in building and scaling production systems. Certified AWS Solutions Architect.
- **Mentoring Style:** Hands-on Labs, Architecture Review, Best Practices

### 4. Alex Rivera
- **Email:** `demo_mentor_4@example.com`
- **Expertise:** Mobile Development, React Native, Flutter, iOS, Android
- **Experience:** 7 years
- **Availability:** 15 hours/week
- **Bio:** Mobile app developer with 50+ published apps. Expert in cross-platform development and app store optimization.
- **Mentoring Style:** App Review, UI/UX Feedback, Performance Optimization

### 5. Emily Watson
- **Email:** `demo_mentor_5@example.com`
- **Expertise:** Backend Development, Node.js, PostgreSQL, API Design, Microservices
- **Experience:** 10 years
- **Availability:** 10 hours/week
- **Bio:** Backend engineer specializing in scalable API design and microservices architecture. Experience with high-traffic systems.
- **Mentoring Style:** Code Review, System Design, Debugging Sessions

## Demo Mentee Accounts

### 1. Jordan Smith
- **Email:** `demo_mentee_1@example.com`
- **Skill Level:** Intermediate
- **Learning Goals:** Learn Machine Learning, Build AI Projects, Understand Neural Networks
- **Areas of Interest:** Artificial Intelligence, Data Science, Python
- **Time Commitment:** 10 hours/week
- **Background:** Software developer transitioning to AI/ML

### 2. Maya Rodriguez
- **Email:** `demo_mentee_2@example.com`
- **Skill Level:** Beginner
- **Learning Goals:** Master React, Learn TypeScript, Build Full-Stack Apps
- **Areas of Interest:** Web Development, Frontend, React
- **Time Commitment:** 15 hours/week
- **Background:** Computer science student looking to break into web development

### 3. Ryan Kim
- **Email:** `demo_mentee_3@example.com`
- **Skill Level:** Intermediate
- **Learning Goals:** Master Cloud Architecture, Learn Kubernetes, Get AWS Certified
- **Areas of Interest:** Cloud Computing, DevOps, Infrastructure
- **Time Commitment:** 12 hours/week
- **Background:** Sysadmin transitioning to cloud engineering

### 4. Aisha Mohammed
- **Email:** `demo_mentee_4@example.com`
- **Skill Level:** Beginner
- **Learning Goals:** Build Mobile Apps, Learn React Native, Publish to App Stores
- **Areas of Interest:** Mobile Development, React Native, UI/UX
- **Time Commitment:** 8 hours/week
- **Background:** Designer learning to code mobile applications

### 5. Chris Taylor
- **Email:** `demo_mentee_5@example.com`
- **Skill Level:** Advanced
- **Learning Goals:** Master Backend Development, Learn Microservices, Build Scalable APIs
- **Areas of Interest:** Backend Development, Node.js, Database Design
- **Time Commitment:** 10 hours/week
- **Background:** Experienced developer aiming for senior backend roles

## Authentication

Demo accounts use **wallet-based authentication**. Each demo account has a randomly generated wallet address stored in the database.

### Finding Wallet Addresses

To find the wallet address for a demo account:

```sql
SELECT email, "walletAddress" 
FROM users 
WHERE email LIKE 'demo_%@example.com';
```

### Using Demo Accounts

1. **Via API:** Use the wallet address to authenticate using the wallet authentication endpoint
2. **Via Frontend:** Connect a wallet and sign the authentication message
3. **For Testing:** You can temporarily modify the wallet address in the database to use a test wallet you control

## Idempotency

The demo seed is **completely idempotent** and **non-destructive**:

- ✅ **Safe to run multiple times** - Won't create duplicate accounts
- ✅ **Non-destructive** - Won't delete or modify existing real data
- ✅ **Check before create** - Verifies if accounts exist before creating them
- ✅ **Transaction-safe** - All operations wrapped in database transactions

## Availability Slots

Each demo mentor has availability slots configured for weekdays (Monday-Friday) with various time blocks:

- **Morning:** 09:00 - 12:00 UTC
- **Afternoon:** 13:00 - 17:00 UTC
- **Evening:** 18:00 - 20:00 UTC

Slots are randomly assigned (1-2 per day) to simulate realistic availability patterns.

## Customization

### Modifying Demo Data

You can customize the demo data by editing the arrays in `src/database/seeds/demo-seed.service.ts`:

- **Mentor Data:** Lines 158-206
- **Mentee Data:** Lines 248-298

### Regenerating with Different Random Data

The Faker library uses a fixed seed (`12345`) for consistent demo data. To generate different random data:

```typescript
// In demo-seed.service.ts constructor
this.faker.seed(Math.random() * 100000); // Different seed each time
```

## Troubleshooting

### Demo seed not running

1. Check that `SEED_DEMO_DATA=true` is set in your `.env` file
2. Verify database connection is working
3. Check logs for any errors during seeding

### Duplicate data warnings

This is normal! The seed script checks for existing data and skips creation. Warnings indicate data already exists from a previous run.

### Wallet authentication issues

Demo accounts have randomly generated wallet addresses. For testing:
1. Query the database to get the wallet address
2. Use that address for authentication
3. Or update the wallet address to one you control

## Best Practices

1. **Development Only:** Only enable demo seeding in development/staging environments
2. **Disable in Production:** Set `SEED_DEMO_DATA=false` or remove it in production
3. **Run After Migrations:** Always run migrations before seeding demo data
4. **Check Database:** Verify seeded data matches your expectations
5. **Document Changes:** If you modify demo data, update this documentation

## Support

If you encounter issues with demo accounts or seeding:
1. Check the application logs for detailed error messages
2. Verify database connectivity
3. Ensure all migrations have been run
4. Review the seed script source code for implementation details
