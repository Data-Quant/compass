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

## Developer with three mapped relationships

Cycle: `SYNTHETIC Developer — 3 relationships — accelerated 12 weeks` (`cmu6xec3p0003ehrq9ro5bmp1`). A qualifying Technology Specialist's existing mapping topology supplied the relationship types only. Four fictional employees reproduced the team-lead, peer, and direct-report relationships within one synthetic department; no real employee was given synthetic feedback. The scenario and illustrative anchors are in `tests/fixtures/ai-evaluation-developer.json`.

The live service/worker run completed 36 check-ins, six submitted observations and 30 no-interaction responses. All 49 jobs succeeded. Each competency had two distinct incidents across two weeks; repeated scheduling created no duplicates. The activated benchmark (role, department, HR expectations, rubric, assignments, and weights) remained unchanged while evidence-linked profile versions accumulated.

| Evaluator perspective | Competency | AI proposal | Frozen illustrative weight |
| --- | --- | --- | --- |
| Team lead | Delivery and ownership | 2/4 | 40% |
| Peer | Technical collaboration | 3/4 | 30% |
| Direct report | Coaching and delegation | 4/4 | 30% |

Code calculated `2 × 0.4 + 3 × 0.3 + 4 × 0.3 = 2.90/4`. The assessment remains DRAFT. The lead's evidence describes two missed commitments and intervention; the peer describes useful reviews and shared debugging; the reporting member describes independent work and a reusable guide adopted by others.

Calibration limits: two examples meet the configured minimum, but do not establish statistically reliable or sustained quarter-long performance. HR should examine whether the direct-report rating of 4 is sufficiently supported, especially because the profile also identifies limited longitudinal evidence. The profile labels missed deadlines followed by reduced-scope completion as a contradiction; that can instead be ordinary mixed evidence. Source validation alone does not resolve either semantic judgment.

The cycle used prompt version 3. Later questions sometimes drifted from the assigned competency toward another part of the broad role expectations. Prompt version 4 now explicitly defines evaluator direction, prioritizes the assigned competency over novelty, and supplies its behavioral descriptions. A separate live Fireworks regression using the prior question history produced in-scope questions for all three relationships. This small check is not full model qualification, and the historical questions remain intact for audit.

Validation: 14 focused tests, local database integration (including role-context drift, frozen benchmarks, and cycle-scoped jobs), TypeScript, desktop/mobile mapped-assignment browser checks, direct Next compilation, and diff whitespace checks. The live cycle exercises backend functions against the isolated database; authenticated deployed HR publication and employee visibility still require browser verification. Legacy departmental and individual evaluation generation remains unchanged; this is a parallel pilot, not the final replacement rollout.
