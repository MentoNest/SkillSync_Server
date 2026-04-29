# Demo Seed Setup Script
# This script enables demo data seeding and runs the seed command

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SkillSync Demo Data Seeder Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (-Not (Test-Path ".env")) {
    Write-Host "❌ Error: .env file not found!" -ForegroundColor Red
    Write-Host "Please create a .env file first." -ForegroundColor Yellow
    exit 1
}

Write-Host "📝 Enabling demo data seeding..." -ForegroundColor Green

# Read the .env file
$envContent = Get-Content ".env" -Raw

# Check if SEED_DEMO_DATA exists
if ($envContent -match "SEED_DEMO_DATA=") {
    # Update existing value
    $envContent = $envContent -replace "SEED_DEMO_DATA=.*", "SEED_DEMO_DATA=true"
    Write-Host "✅ Updated SEED_DEMO_DATA to true" -ForegroundColor Green
} else {
    # Add new line
    $envContent += "`nSEED_DEMO_DATA=true"
    Write-Host "✅ Added SEED_DEMO_DATA=true" -ForegroundColor Green
}

# Write back to .env file
$envContent | Set-Content ".env" -NoNewline

Write-Host ""
Write-Host "🌱 Running demo seed..." -ForegroundColor Green
Write-Host ""

# Run the seed command
npm run seed:demo

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Demo Seed Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📧 Check DEMO_ACCOUNTS.md for account details" -ForegroundColor Yellow
Write-Host ""
