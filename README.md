# Performance Evaluation Portal

A comprehensive 360-degree performance evaluation system built with Next.js, PostgreSQL, and Prisma.

## Features

- **Simple Name-Based Authentication** - Users select their name to log in
- **Evaluator Dashboard** - View all assigned evaluations grouped by relationship type
- **Dynamic Evaluation Forms** - Role-appropriate questions with rating scales and text feedback
- **Weighted Scoring System** - Customizable weightages per evaluator category
- **Automated Report Generation** - Individual performance reports with detailed breakdowns
- **HR Admin Panel** - Comprehensive dashboard for managing evaluations and reports
- **Email Distribution** - Queue and send performance reports via Resend
- **Excel Export** - Download comprehensive evaluation data as spreadsheets

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Email**: Resend
- **Excel**: ExcelJS

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Resend API key (for email functionality)

## Setup Instructions

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

   Update the following in `.env`:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `RESEND_API_KEY` - Your Resend API key
   - `NEXTAUTH_SECRET` - A random secret for session management
   - `NEXTAUTH_URL` - Your application URL (e.g., http://localhost:3000)

3. **Set up the database**:
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Push schema to database
   npm run db:push

   # Seed the database with sample data
   npm run db:seed
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Default Users

After seeding, you can log in with:
- **HR Admin** - Email: hr@example.com (HR role)
- **John CEO** - Email: ceo@example.com
- **Alice Manager** - Email: manager1@example.com
- **Bob Developer** - Email: employee1@example.com
- **Carol Designer** - Email: employee2@example.com

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication routes
│   ├── (evaluator)/       # Evaluator routes
│   ├── (hr)/              # HR admin routes
│   └── api/               # API routes
├── lib/                   # Utility functions
│   ├── db.ts             # Prisma client
│   ├── auth.ts           # Session management
│   ├── scoring.ts        # Weighted scoring calculations
│   ├── reports.ts        # Report generation
│   └── email.ts          # Email integration
├── components/            # React components
├── prisma/               # Prisma schema and migrations
│   └── seed.ts          # Database seed script
└── types/               # TypeScript type definitions
```

## Key Features Implementation

### Weighted Scoring

Default weightages:
- C-Level Executive: 40%
- Team Lead/Manager: 30%
- Direct Reports: 15%
- Peer: 10%
- HR: 5%

These can be customized per employee through the HR admin panel.

### Evaluation Questions

Questions are categorized by relationship type:
- **C-Level**: Strategic leadership questions
- **Team Lead**: Management and leadership questions
- **Direct Report**: Performance and contribution questions
- **Peer**: Collaboration and teamwork questions
- **HR**: Policy adherence and values questions

### Report Generation

Reports include:
- Overall weighted performance score (%)
- Breakdown by evaluator category
- Individual scores (anonymized by category)
- Qualitative feedback (not anonymized)
- Evaluation period information

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with name
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get current session

### Evaluations
- `GET /api/evaluations/dashboard` - Get evaluator dashboard data
- `GET /api/evaluations/[evaluateeId]` - Get evaluation form data
- `POST /api/evaluations` - Submit evaluation
- `PUT /api/evaluations` - Save draft evaluation

### Reports
- `GET /api/reports` - Get report for employee
- `POST /api/reports` - Generate report
- `GET /api/reports/export` - Download Excel spreadsheet

### Admin
- `GET /api/admin/dashboard` - Get HR admin dashboard data

### Email
- `GET /api/email` - Get email queue
- `POST /api/email` - Queue/send emails

## Database Schema

The application uses the following main models:
- `User` - Employees and HR administrators
- `EvaluatorMapping` - Who evaluates whom
- `EvaluationQuestion` - Questions by relationship type
- `Evaluation` - Evaluation responses
- `EvaluationPeriod` - Review periods
- `Weightage` - Custom weightages per employee
- `Report` - Generated performance reports
- `EmailQueue` - Queued emails for distribution

## Development

### Running migrations
```bash
npm run db:migrate
```

### Opening Prisma Studio
```bash
npm run db:studio
```

### Building for production
```bash
npm run build
npm start
```

## License

ISC
