#!/bin/bash

# Admin Seed Verification Script
# This script helps verify that the admin seed has been properly set up and executed

set -e

echo "========================================================================"
echo "Admin Seed Verification Script"
echo "========================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "Checking environment setup..."
echo ""

# Check if .env files exist
if [ -f ".env.local" ]; then
    success ".env.local file exists"
else
    warning ".env.local file not found (optional, checking other env files)"
fi

if [ -f ".env.development" ]; then
    success ".env.development file exists"
elif [ -f ".env" ]; then
    success ".env file exists"
else
    warning "No .env files found - using environment variables or defaults"
fi

echo ""
echo "Checking required environment variables..."
echo ""

# Check NODE_ENV
if [ -n "$NODE_ENV" ]; then
    success "NODE_ENV=$NODE_ENV"
else
    warning "NODE_ENV not set (will default to development)"
fi

# Check DATABASE variables
if [ -n "$DATABASE_HOST" ]; then
    success "DATABASE_HOST=$DATABASE_HOST"
else
    warning "DATABASE_HOST not set (will use default: localhost)"
fi

if [ -n "$DATABASE_NAME" ]; then
    success "DATABASE_NAME=$DATABASE_NAME"
else
    warning "DATABASE_NAME not set (will use default: skillsync)"
fi

# Check seed variables
if [ -n "$DISABLE_SEED" ]; then
    if [ "$DISABLE_SEED" = "true" ]; then
        warning "DISABLE_SEED=true (seeding is disabled)"
    else
        success "DISABLE_SEED=$DISABLE_SEED (seeding is enabled)"
    fi
else
    success "DISABLE_SEED not set (seeding is enabled by default)"
fi

if [ -n "$DEFAULT_ADMIN_WALLET" ]; then
    success "DEFAULT_ADMIN_WALLET is set"
    echo "  Wallet: $DEFAULT_ADMIN_WALLET"
else
    error "DEFAULT_ADMIN_WALLET not set (admin user will not be created)"
fi

echo ""
echo "Checking file structure..."
echo ""

# Check for seed files
if [ -f "src/database/seeds/admin-seed.service.ts" ]; then
    success "AdminSeedService found"
else
    error "AdminSeedService not found"
fi

if [ -f "src/database/seeds/seed.module.ts" ]; then
    success "SeedModule found"
else
    error "SeedModule not found"
fi

if [ -f "src/database/seeds/admin-seed.service.spec.ts" ]; then
    success "AdminSeedService tests found"
else
    error "AdminSeedService tests not found"
fi

if [ -f "src/database/migrations/1713830400002-CreateUserAndRoleTablesForSeed.ts" ]; then
    success "Seed migration found"
else
    error "Seed migration not found"
fi

echo ""
echo "Checking configuration files..."
echo ""

# Check app.module.ts imports SeedModule
if grep -q "SeedModule" "src/app.module.ts"; then
    success "SeedModule imported in AppModule"
else
    error "SeedModule not imported in AppModule"
fi

# Check main.ts imports AdminSeedService
if grep -q "AdminSeedService" "src/main.ts"; then
    success "AdminSeedService imported in main.ts"
else
    error "AdminSeedService not imported in main.ts"
fi

# Check AppConfigService has DISABLE_SEED config
if grep -q "DISABLE_SEED" "src/config/app-config.service.ts"; then
    success "DISABLE_SEED configuration added"
else
    warning "DISABLE_SEED configuration not found"
fi

# Check AppConfigService has DEFAULT_ADMIN_WALLET config
if grep -q "DEFAULT_ADMIN_WALLET" "src/config/app-config.service.ts"; then
    success "DEFAULT_ADMIN_WALLET configuration added"
else
    warning "DEFAULT_ADMIN_WALLET configuration not found"
fi

echo ""
echo "Checking documentation..."
echo ""

if [ -f "SEED_DOCUMENTATION.md" ]; then
    success "Comprehensive documentation found"
else
    warning "SEED_DOCUMENTATION.md not found"
fi

if [ -f "SEED_QUICK_START.md" ]; then
    success "Quick start guide found"
else
    warning "SEED_QUICK_START.md not found"
fi

if [ -f ".env.example" ]; then
    success "Environment configuration template found"
else
    warning ".env.example not found"
fi

echo ""
echo "========================================================================"
echo "Verification Summary"
echo "========================================================================"
echo ""
echo "To complete the setup:"
echo ""
echo "1. Configure your environment variables:"
echo "   - Copy .env.example to .env.local (or .env)"
echo "   - Set DEFAULT_ADMIN_WALLET to your admin wallet address"
echo "   - Configure database connection details"
echo ""
echo "2. Run database migrations:"
echo "   npm run migration:run"
echo ""
echo "3. Start the application:"
echo "   npm run start:dev"
echo ""
echo "4. Verify admin user was created:"
echo "   - Check logs for: '[Seed] Admin role created; Admin user created'"
echo "   - Query database for admin user and role"
echo ""
echo "5. Run tests to verify seeding works:"
echo "   npm run test -- admin-seed.service.spec"
echo ""
echo "========================================================================"
