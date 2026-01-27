# Quick Setup Guide for Dummy Data

## Step 1: Configure Database Connection
Update your `.env` file with your PostgreSQL connection string:
```
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/pe_portal?schema=public"
```

## Step 2: Create Database Schema
```bash
npm run db:push
```

## Step 3: Seed Database with Dummy Data
```bash
npm run db:seed
```

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

## Evaluation Period:
- **Q3 2025** (Oct 1 - Dec 31, 2025) - Active period

## What's Included:
- 10 users (1 HR, 9 employees)
- Evaluation questions for all relationship types
- Comprehensive evaluator mappings (C-Level, Team Lead, Direct Reports, Peers, HR)
- Ready for testing all features!
