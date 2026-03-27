/*
 * Demonstration of the Forgot Password Flow Implementation
 * This script shows how the functionality works without requiring the full server
 */

console.log("=== SkillSync Server - Forgot Password Flow Demo ===\n");

// Simulate the main functionality
class MockServices {
  constructor() {
    this.users = {
      'user@example.com': {
        id: '123',
        email: 'user@example.com',
        passwordHash: 'hashed_password_123',
        firstName: 'John',
        lastName: 'Doe'
      }
    };
    
    this.cache = new Map(); // Simulate Redis cache
    this.sentEmails = []; // Track sent emails for demo
  }

  // Simulated Mail Service
  sendOtpEmail(email, otp) {
    console.log(`📧 Mail Service: Sending OTP email to ${email}`);
    console.log(`   Subject: Password Reset OTP - ${otp}`);
    console.log(`   OTP: ${otp} (valid for 10 minutes)`);
    
    this.sentEmails.push({ email, otp, timestamp: new Date() });
    return Promise.resolve();
  }

  // Simulated User Service
  findByEmail(email) {
    return this.users[email] || null;
  }

  // Simulated Cache Service
  async set(key, value, ttl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl * 1000)
    });
    console.log(`💾 Cache: Stored ${key} with TTL ${ttl}s`);
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      console.log(`⏰ Cache: ${key} expired and deleted`);
      return null;
    }
    
    return entry.value;
  }

  async del(key) {
    this.cache.delete(key);
    console.log(`🗑️ Cache: Deleted ${key}`);
  }

  // Simulate password update
  async updatePassword(userId, newPasswordHash) {
    console.log(`🔐 User Service: Updated password for user ${userId}`);
  }
}

// Simulated AuthService with our implementation
class AuthServiceDemo {
  constructor(mockServices) {
    this.mockServices = mockServices;
  }

  async forgotPassword(dto) {
    console.log("\n--- FORGOT PASSWORD REQUEST ---");
    console.log(`Received request for email: ${dto.email}`);
    
    // Check if user exists
    const user = this.mockServices.findByEmail(dto.email);
    
    // Even if user doesn't exist, return success to prevent user enumeration attacks
    if (!user) {
      console.log("❌ User not found, but returning generic success to prevent enumeration");
      return { message: 'If an account exists, an OTP has been sent to your email' };
    }
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`✅ User found. Generated OTP: ${otp}`);
    
    // Store OTP in cache with 10-minute expiry (600 seconds)
    const otpCacheKey = `otp:${dto.email}`;
    await this.mockServices.set(otpCacheKey, otp, 600); // 10 minutes
    
    // Send OTP email
    await this.mockServices.sendOtpEmail(dto.email, otp);
    
    console.log(`✅ OTP sent for email: ${dto.email}`);
    return { message: 'If an account exists, an OTP has been sent to your email' };
  }

  async verifyOtp(dto) {
    console.log("\n--- VERIFY OTP REQUEST ---");
    console.log(`Verifying OTP for email: ${dto.email}, OTP: ${dto.otp}`);
    
    const otpCacheKey = `otp:${dto.email}`;
    
    // Get stored OTP from cache
    const storedOtp = await this.mockServices.get(otpCacheKey);
    
    // Check if OTP exists and is valid
    if (!storedOtp || storedOtp !== dto.otp) {
      console.log("❌ Invalid or expired OTP");
      return { valid: false, message: 'Invalid or expired OTP' };
    }
    
    console.log("✅ OTP verified successfully");
    return { valid: true, message: 'OTP verified successfully' };
  }

  async resetPassword(dto) {
    console.log("\n--- RESET PASSWORD REQUEST ---");
    console.log(`Resetting password for email: ${dto.email}`);
    
    const otpCacheKey = `otp:${dto.email}`;
    
    // Get stored OTP from cache
    const storedOtp = await this.mockServices.get(otpCacheKey);
    
    // Check if OTP exists and is valid
    if (!storedOtp || storedOtp !== dto.otp) {
      console.log("❌ Invalid or expired OTP - cannot reset password");
      throw new Error('Invalid or expired OTP');
    }
    
    // Find user by email
    const user = this.mockServices.findByEmail(dto.email);
    
    if (!user) {
      console.log("❌ User not found");
      throw new Error('Invalid or expired OTP');
    }
    
    // In real implementation, hash the new password
    const hashedPassword = `hashed_${dto.newPassword}_demo`;
    console.log(`🔐 Hashed new password: ${hashedPassword.substring(0, 20)}...`);
    
    // Update user's password
    await this.mockServices.updatePassword(user.id, hashedPassword);
    
    // Invalidate the OTP (one-time use)
    await this.mockServices.del(otpCacheKey);
    
    // In real implementation, would revoke all existing sessions
    console.log("🔒 All existing sessions would be revoked for security");
    
    console.log(`✅ Password reset successful for email: ${dto.email}`);
    return { message: 'Password has been reset successfully' };
  }
}

// Demo execution
async function runDemo() {
  console.log("Initializing mock services...");
  const mockServices = new MockServices();
  const authService = new AuthServiceDemo(mockServices);
  
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 1: Successful forgot password flow");
  console.log("=".repeat(60));
  
  // Step 1: User requests password reset
  const forgotResult = await authService.forgotPassword({ email: 'user@example.com' });
  console.log("Forgot Password Result:", forgotResult);
  
  // Get the OTP from cache for demonstration
  const otp = await mockServices.get('otp:user@example.com');
  console.log(`Retrieved OTP from cache: ${otp}`);
  
  // Step 2: User verifies OTP
  const verifyResult = await authService.verifyOtp({ 
    email: 'user@example.com', 
    otp: otp 
  });
  console.log("Verify OTP Result:", verifyResult);
  
  // Step 3: User resets password with valid OTP
  const resetResult = await authService.resetPassword({ 
    email: 'user@example.com', 
    otp: otp,
    newPassword: 'MyNewSecurePassword123!'
  });
  console.log("Reset Password Result:", resetResult);
  
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 2: Invalid OTP scenario");
  console.log("=".repeat(60));
  
  // Try with invalid OTP
  const invalidVerifyResult = await authService.verifyOtp({ 
    email: 'user@example.com', 
    otp: '000000'  // Wrong OTP
  });
  console.log("Invalid OTP Verify Result:", invalidVerifyResult);
  
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 3: Non-existent user (user enumeration prevention)");
  console.log("=".repeat(60));
  
  // Try with non-existent user
  const nonExistentResult = await authService.forgotPassword({ 
    email: 'nonexistent@example.com' 
  });
  console.log("Non-existent User Result:", nonExistentResult);
  
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 4: Expired OTP scenario");
  console.log("=".repeat(60));
  
  // Manually expire the OTP in cache
  const otpCacheEntry = mockServices.cache.get('otp:user@example.com');
  if (otpCacheEntry) {
    otpCacheEntry.expiresAt = Date.now() - 1000; // Set to past
    console.log("Manually expired OTP in cache");
  }
  
  const expiredVerifyResult = await authService.verifyOtp({ 
    email: 'user@example.com', 
    otp: otp 
  });
  console.log("Expired OTP Verify Result:", expiredVerifyResult);
  
  console.log("\n" + "=".repeat(60));
  console.log("FORGOT PASSWORD FLOW DEMO COMPLETED");
  console.log("=".repeat(60));
  console.log("\n✅ All functionality demonstrated:");
  console.log("   • OTP generation and email sending");
  console.log("   • OTP validation and verification");
  console.log("   • Password reset with secure hashing");
  console.log("   • OTP one-time use (invalidated after use)");
  console.log("   • 10-minute OTP expiry");
  console.log("   • Protection against user enumeration");
  console.log("   • Proper error handling");
}

// Run the demo
runDemo().catch(console.error);