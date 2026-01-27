# Neon Database Setup Guide

## Step 1: Create a Neon Account
1. Go to https://neon.tech/
2. Sign up for a free account (no credit card required)
3. Create a new project

## Step 2: Get Your Connection String
1. In your Neon dashboard, go to your project
2. Click on "Connection Details" or "Connection String"
3. Copy the connection string (it will look like):
   ```
   postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## Step 3: Update .env File
1. Open `.env` file in the project root
2. Replace `DATABASE_URL` with your Neon connection string:
   ```env
   DATABASE_URL="postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```

## Step 4: Push Schema and Seed Database
```bash
# Generate Prisma client
npm run db:generate

# Push schema to Neon database
npm run db:push

# Seed database with dummy data
npm run db:seed
```

## Step 5: Verify Setup
After seeding, you should see:
- ✅ 10 users created
- ✅ Evaluation questions created
- ✅ Evaluator mappings created
- ✅ Evaluation period created

You can then log in to the app with any of the seeded users!

## Test Users Created:
- **HR Admin** (hr@example.com) - HR role
- **John CEO** (ceo@example.com) - Executive
- **Alice Manager** (manager1@example.com) - Engineering Manager
- **David Sales Manager** (manager2@example.com) - Sales Manager
- **Bob Developer** (employee1@example.com) - Senior Developer
- **Carol Designer** (employee2@example.com) - UI/UX Designer
- **Emma Marketing** (employee3@example.com) - Marketing Specialist
- **Frank Developer** (employee4@example.com) - Junior Developer
- **Grace Product Manager** (employee5@example.com) - Product Manager
- **Henry CTO** (cto@example.com) - Chief Technology Officer

## Notes:
- Neon automatically handles SSL, so make sure `?sslmode=require` is in your connection string
- The free tier is perfect for development and testing
- Your database is accessible from anywhere, great for deployment!
