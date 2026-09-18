# Live synthetic pilot test — 18 September 2026

Environment: isolated Neon `ai-evaluations-preview`, feature branch `codex/ai-evaluations`, Fireworks `accounts/fireworks/models/gpt-oss-120b`. No real employee feedback was sent to inference and no real evaluation cycle was activated.

## Scope and results

The synthetic cycle `SYNTHETIC E2E — accelerated 12 weeks — 18 Sep 2026` used two fictional employees in different departments and an existing-format PEER mapping. The runner invoked the real service and worker functions against the test database, advancing its process-local clock for weekly windows and quarter completion. This tests the backend workflow; it is not a substitute for deployed browser/API authentication and HR review testing.

- Activation derived and froze the mapped assignment.
- Twelve weekly check-ins were generated; repeated scheduling created no duplicates.
- Draft saving, revisions, clarification, explicit submission, and eight no-interaction responses completed.
- An unauthorized employee could not save another evaluator's answer.
- Quarterly assessment was rejected before week 12.
- All 22 inference jobs finished successfully after correcting an initial test-clock lease-expiry issue and retrying the preserved job.
- Nine observations were extracted, representing three concrete incidents across weeks 2, 3, and 4. Vague praise in week 1 contributed zero concrete observations.
- Profile synthesis and a source-validated quarterly proposal completed. The resulting proposal was **2/4**, left **DRAFT** for HR review.

## Findings

1. The initial question incorrectly addressed the evaluator as the subject. The question prompt now explicitly asks about “this colleague”.
2. Questions repeated verbatim because generation did not receive previous questions. The prompt now receives up to three prior check-ins from the same evaluator, evaluatee, relationship, and cycle; only submitted observations are included. It receives no other evaluator's feedback. Job input references record this history.
3. Job prompt versions now record the actual executing version (`2`). A second synthetic cycle verified two distinct colleague-focused questions and versioned provenance with live Fireworks.
4. Scoring calibration remains open: the proposal's rationale treats one late delivery as excluding a rating of 3 despite two successful deliveries. HR should assess that interpretation against the rubric before accepting the score. The original proposal has been preserved.

Deployed UI submission, HR approval/return, theme release, and employee visibility remain to be verified in an authenticated browser session. No assessment was approved and no theme was released during this run.
