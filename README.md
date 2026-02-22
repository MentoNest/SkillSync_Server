## SkillSync_Server 🖥️

## 📝 Overview

**SkillSync_Server** provides off-chain services that support the SkillSync ecosystem.  
It handles indexing, user metadata, analytics, notifications, and integrations that are not suitable for on-chain execution.

The backend works alongside the Stellar network without custody of user funds.

## ✨ Features

- User metadata management
- Mentorship session records
- Event indexing from Stellar
- Notifications & emails
- Email verification and password reset
- API layer for frontend

## 🛠️ Technologies Used

- Node.js
- NestJS
- TypeScript
- PostgreSQL
- Stellar Horizon API

## Setup & Installation

### Prerequisites

- Node.js ≥ 18
- Database (PostgreSQL)
- Environment variables configured

### Setup Instructions

1. Clone the repository:

```bash
git clone https://github.com/MentoNest/SkillSync_Server.git
cd SkillSync_Server
```

2. Install dependencies:

```bash
npm install
# or using yarn
yarn install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration details
```

### Seeding initial Admin

This project includes an idempotent seed script that creates a default `admin` role user (wallet or email-based).

- Run the seed:

```bash
npm run seed:admin
# or with custom values
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SuperSecret123 ADMIN_WALLET=GABC... npm run seed:admin
```

- Environment variables used by the seed:
   - `ADMIN_EMAIL` (default: `admin@skillsync.local`)
   - `ADMIN_PASSWORD` (default: `ChangeMe123!`)
   - `ADMIN_WALLET` (optional wallet address to seed as primary)


**Environment Variables:**

- `RATE_LIMIT_WINDOW_MS`: The time window in milliseconds for rate limiting (default: 60000ms / 1 minute).
- `RATE_LIMIT_MAX`: The maximum number of requests allowed per IP within the `RATE_LIMIT_WINDOW_MS` (default: 100).
- `CORS_ORIGINS`: A comma-separated list of allowed origins for CORS. Use `*` for all origins (default: `*`).

4. Set up the database:

```bash
npm run migration:run
# or using yarn
yarn migration:run
```

5. Start the development server:

```bash
npm run start:dev
# or using yarn
yarn start:dev
```

## 🚀 Usage

### For Mentees

1. Create an account and complete your profile
2. Browse available mentors based on your interests
3. Request mentorship sessions with preferred mentors
4. Attend sessions, provide feedback, and track your progress

### For Mentors

1. Create an account and build your mentor profile
2. Set your availability, hourly rates, and expertise areas
3. Accept mentorship requests
4. Conduct sessions and provide guidance
5. Receive payments and feedback

### Admin Dashboard

Access the admin dashboard at `/admin` with appropriate credentials to:

- Manage users
- Monitor platform activity
- Generate reports
- Configure system settings

## 📂 Project Structure

```
  src/
  ├── modules/
  ├── controllers/
  ├── services/
  ├── entities/
  ├── guards/
  └── main.ts
```

## 👥 Contributing

We welcome contributions from the community! Please follow these steps:

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m 'Add some feature'
   ```
4. Push to the branch:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a pull request

## Global API Behavior

This project enforces consistent API behavior via:

- Global validation pipe (DTO validation)
- Global exception filter (standard error schema)
- Logging interceptor (structured request logs)
- **Security Middleware:** Helmet for secure HTTP headers, dynamic CORS configuration, and rate limiting to protect against excessive traffic.

These utilities are applied at application bootstrap.

Please read our [Contributing Guide](CONTRIBUTING.md) for more details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ by the Mentorship Marketplace Team
