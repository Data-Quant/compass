# Compass AI evaluation pilot

## Hosted test environment

The `codex/ai-evaluations` GitHub branch uses the existing Compass Vercel project's protected Preview environment. Its branch-specific `DATABASE_URL` targets PE Portal's Neon branch `ai-evaluations-preview`, a full copy of `production` created on September 11, 2026. The pilot migration is applied to that copy only. Existing login accounts are copied; no synthetic fixture seed is run against this database. Pilot cycles still require HR configuration and activation.

Fireworks uses `accounts/fireworks/models/gpt-oss-120b`. Database, session, worker, and inference secrets are configured only for this preview branch. Outbound email, calendar, blob write, office, and LiveKit credentials are blanked for this branch to avoid production integration effects. Keep Vercel Authentication enabled because the database copy contains employee records. No pilot scheduler is activated; use HR's Run due work action while testing.

Pushes to this branch automatically build the preview. Before connecting any other branch, configure its isolated database override first: the repository build command runs migrations. The unused schema-only Neon branch `ai-evaluations-test` and undeployed Vercel project `compass-ai-evaluations` were created during setup but are not used by this preview.

The pilot is separate from authoritative evaluations. Employees submit observations without ratings. Fireworks proposes rubric-based ratings; HR reviews assessments and releases development themes. Nothing publishes to legacy reports, payroll, email, or compensation workflows.

## Local setup

Use the `codex/ai-evaluations` worktree. Install locked dependencies with `npm ci`. Copy `.env.pilot.example` into ignored `.env.local` and supply independent development database/session settings. Set `FIREWORKS_API_KEY` and the exact Fireworks model/deployment ID in `FIREWORKS_MODEL`; no model is silently selected. Never use a `NEXT_PUBLIC_` secret.

The development database must be separate. A PostgreSQL cluster used for validation listens only on `127.0.0.1:55439`, stores its data under ignored `.pilot-db`, and is named `compass_ai_pilot`. Its optional downloaded binaries are under `.pilot-tools`; neither directory is source code. Restart that local cluster with its `postgres` executable and `-D .pilot-db -p 55439 -h 127.0.0.1`, or supply your own isolated PostgreSQL instance.

Generate Prisma with `npx prisma generate`. On an existing development schema, apply `prisma/migrations/20260910150000_ai_evaluation_pilot/migration.sql` through the normal migration workflow. For a fresh synthetic database, `npx prisma db push` creates the schema. Do not run the legacy seed against this database: use `scripts/seed-ai-evaluation-pilot.ts` instead. The migration adds only seven pilot tables, indexes and foreign keys; it does not rewrite legacy records.

Set `DATABASE_URL` in the shell for standalone scripts (they do not load `.env.local` automatically). Set a synthetic `PILOT_FIXTURE_PASSWORD` of at least 12 characters, then run:

```powershell
node --import tsx scripts/seed-ai-evaluation-pilot.ts --demo
npm run dev -- --hostname 127.0.0.1 --port 3219
```

The seed refuses a non-local database or a name other than `compass_ai_pilot`. Demo accounts are `pilot-hr@example.test`, `pilot-peer@example.test`, `pilot-subject@example.test`, and `pilot-outsider@example.test`. Demo observations and assessments are explicitly synthetic fixtures, not Fireworks output. Omit `--demo` for users plus an empty active synthetic cycle.

Open `/admin/ai-evaluations` as HR and `/ai-evaluations` as an employee. The sidebar link is enabled for HR, assigned evaluators and employees with released themes. Existing session and role checks apply. APIs return 404 when `AI_EVALUATIONS_ENABLED` is not `true`.

## Cycle and scoring rules

- HR saves cohort membership, expectations, explicit relationship weights, assignments, and rubric anchors. Existing rating descriptions can be imported and edited. Activation validates and freezes the saved revision. Settings cannot be changed for an active cycle.
- Each employee's weights total 100%; SELF is zero. Configure CROSS_DEPARTMENT explicitly in the pilot. Legacy peer normalization, department pooling, and top-rating quotas do not apply here.
- Weeks are fixed seven-day intervals beginning at midnight Asia/Karachi on the start date. The system schedules the current week only, without backfilling missed weeks. Submission closes at each week boundary to avoid treating late retrospective answers as observations from separate weeks.
- The default budget is two different evaluatees per evaluator per week. Least-asked pairs rotate; within a relationship, competencies with insufficient concrete evidence are prioritized, with least-asked criteria breaking ties. The weekly selection is created atomically and frozen on first generation.
- One clarification can be requested with “Help me add detail.” A null model response records that the opportunity was used. Original drafts and revisions are retained; submission is immutable. “No relevant interaction” creates no adverse evidence.
- New observations automatically enqueue profile synthesis. Individual factual claims cite source IDs. Feedback and free text are untrusted input. Model inputs omit unnecessary employee identifiers; free-text observations may still contain names supplied by their authors.
- Reports of the same event share an incident key; by default all extracted observations from one check-in count as one incident. HR can group duplicates across check-ins with an audited reason. Grouping invalidates existing profiles/assessments. This conservative grouping may require more weeks to reach adequate coverage.
- Ratings need at least two concrete distinct incidents across two weeks, configurable at activation. These are pilot thresholds, not a statistical guarantee. Generic praise/criticism does not satisfy coverage. Contradictory evidence is retained.
- Scoring opens after week 12 and waits for extraction jobs to finish. Competencies are averaged within each relationship; code applies frozen weights and rounds the overall to two decimal places out of four. Any unscored required competency withholds the overall; no redistribution.
- HR approves or returns drafts. Overrides need a reason and preserve the AI proposal. Returned assessments can be regenerated with review feedback. Approved assessments remain internal to the pilot. Themes are edited/released separately; only their reviewed text, cycle name and the employee's own corrections are returned to employees.

## Worker and operations

`GET /api/ai-evaluations/cron` accepts only `Authorization: Bearer <AI_EVALUATIONS_CRON_SECRET>`. It bypasses session middleware solely for this exact path and validates its own secret with constant-time comparison. Schedule it every minute in the deployment's scheduler when activating the pilot; scheduling is not enabled in the existing production deployment by this change. One invocation schedules due check-ins and processes one job, bounded to a 25-second inference request within a 60-second route budget. Increase scheduler frequency/capacity if queue age grows. HR's “Run due work” invokes the same work interactively.

Jobs persist prompt version, rubric revision, model, source references, usage, validated result, status, and safe error code. Claims use optimistic leases (90 seconds), with three attempts and delayed retries. Expired workers cannot commit duplicate effects. Provider bodies and credentials are never logged. Failed jobs stay visible in Processing; HR can explicitly retry after correcting configuration. No fallback scores are created.

Monitor failed jobs, oldest pending jobs, employee completion, evidence coverage and review overrides. The HR evidence workspace exposes source observations and submitted answers. Disabling the flag stops API access and new worker runs; an inference already running may finish. No external notifications are sent.

## Verification

```powershell
node --import tsx --test tests/ai-evaluations.test.ts
$env:PILOT_DB_TEST='true'
node --import tsx --test tests/ai-evaluations-integration.test.ts
$env:PILOT_BROWSER_TEST='true'
$env:PILOT_TEST_URL='http://127.0.0.1:3219'
npx playwright test tests/ai-evaluations.browser.spec.ts --workers=1
npx tsc --noEmit --pretty false
npx next build
git diff --check
```

Set the isolated `DATABASE_URL` and fixture password before database/browser tests. The integration test uses a mocked provider and removes its own test cycle; browser tests use the synthetic demo seed. Screenshots are ignored under `.pilot-screens`.

Run `scripts/evaluate-ai-pilot-model.ts` with the Fireworks key/model in the shell to evaluate actual inference. It sends only synthetic scenarios: vague praise, vague criticism, reliable delivery, paraphrased delivery, exceptional impact, conflicting reports, and prompt injection. It repeats each assessment three times and writes `.pilot-semantic-results.json` for independent human review. Review both evidence extraction and ratings: JSON conformance does not prove semantic quality. Live provider/model quality is not certified by mocked tests.

Use `npx next build`, not `npm run build`, for compilation-only verification: the existing build script deploys database migrations. Production deployment, real employee enrollment, approved rubric calibration, Fireworks model qualification and scheduler activation remain rollout steps.
