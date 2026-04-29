#!/bin/bash

# Demo Seed Setup Script
# This script enables demo data seeding and runs the seed command

echo "========================================"
echo "  SkillSync Demo Data Seeder Setup"
echo "========================================"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file first."
    exit 1
fi

echo "📝 Enabling demo data seeding..."

# Check if SEED_DEMO_DATA exists
if grep -q "SEED_DEMO_DATA=" .env; then
    # Update existing value
    sed -i 's/SEED_DEMO_DATA=.*/SEED_DEMO_DATA=true/' .env
    echo "✅ Updated SEED_DEMO_DATA to true"
else
    # Add new line
    echo "SEED_DEMO_DATA=true" >> .env
    echo "✅ Added SEED_DEMO_DATA=true"
fi

echo ""
echo "🌱 Running demo seed..."
echo ""

# Run the seed command
npm run seed:demo

echo ""
echo "========================================"
echo "  Demo Seed Complete!"
echo "========================================"
echo ""
echo "📧 Check DEMO_ACCOUNTS.md for account details"
echo ""
