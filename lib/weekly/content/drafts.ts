// HR spec section 6: the draft prompts (6.3) and four-level profiles (6.4–6.6), version 1.
// HR reconciles them with its own 1–4 descriptions and approves them (D2).
import type { Perspective } from '../perspectives'
import type { LevelKey, ProfileLevel, ProfileLevels } from '../profile'

export interface CompetencyContent {
  name: string
  definition: string
  prompts: { A: string; B: string }
  levels: ProfileLevels
  incomplete: boolean
}

export interface CompetencyDraft extends CompetencyContent {
  key: string
  perspective: Perspective
  /** Live question titles this draft replaces. */
  titles: string[]
}

/** Spec 6.2: the evidence standard every profile shares. */
export const STANDARD_LEVELS: Record<LevelKey, ProfileLevel> = {
  '4': {
    behaviours: 'Changed an outcome, a process or a standard beyond their own remit.',
    consistency: 'Repeatable, not a one-off.',
    outcome: 'Impact is visible to people outside the immediate work.',
    evidence: [],
  },
  '3': {
    behaviours: 'Consistently above what the role requires; goes beyond the brief with concrete results.',
    consistency: 'Consistently, across several examples.',
    outcome: 'Others rely on them for it.',
    evidence: [],
  },
  '2': {
    behaviours: 'Fully does what the role requires, with normal guidance.',
    consistency: 'Reliably.',
    outcome: 'Solid, expected performance.',
    evidence: [],
  },
  '1': {
    behaviours: 'Falls short of role requirements.',
    consistency: 'Often enough to affect others or outcomes.',
    outcome: 'Needs repeated correction.',
    evidence: [],
  },
}

export const INSUFFICIENT_DEFINITION =
  'The answer does not describe what the person did, or describes only opinion. This triggers a follow-up question, never a low score.'

const level = (behaviours: string, consistency: string, outcome: string, ...evidence: string[]): ProfileLevel => ({
  behaviours, consistency, outcome, evidence,
})

export const DRAFTS: readonly CompetencyDraft[] = [
  {
    key: 'LEAD.QUALITY_OF_WORK', perspective: 'LEAD', titles: ['Quality of Work'], name: 'Quality of Work',
    definition: 'Accuracy, completeness and standard of delivered work.',
    prompts: {
      A: 'Pick one piece of work they delivered in the last two weeks. What was asked, what did they hand over, and how much rework did it need?',
      B: 'Describe a time their work was below the standard you expected. What was missing and how did they respond?',
    },
    levels: {
      '4': level('Work sets the standard others are measured against; anticipates edge cases, checks own work, documents so others can reuse it; raises the bar for the team.', 'Every example this quarter is at this standard, including under deadline pressure.', 'Work is used beyond its original purpose, prevents errors elsewhere, or changes how the team works.', 'Her client report template is now what the whole team uses.', 'Caught a data error in finance’s source file before it reached the client.'),
      '3': level('Delivers complete, accurate work that needs little or no review; adds improvements not asked for.', 'Most examples, with rare minor fixes.', 'Stakeholders accept work first time; the lead spends noticeably less time reviewing.', 'Handed over the deck with no changes needed and added a comparison slide the client later cited.'),
      '2': level('Meets the brief accurately; normal level of review and small corrections.', 'Reliable across the quarter.', 'Work is usable as delivered after routine review.', 'Did what was asked, two small fixes after review, on time.'),
      '1': level('Work is incomplete, inaccurate or below standard; rework is routine or errors reach others.', 'Recurring, or one serious lapse with real consequence.', 'Delays, rework by others, or errors reaching clients or leadership.', 'Third report this month with wrong figures; I had to rebuild the summary.'),
    },
    incomplete: false,
  },
  {
    key: 'LEAD.INITIATIVE', perspective: 'LEAD', titles: ['Initiative & Proactivity'], name: 'Initiative & Proactivity',
    definition: 'Acting without being asked; spotting and solving problems early.',
    prompts: {
      A: 'Describe something they started or fixed without being asked. What triggered it and what changed?',
      B: 'Was there a problem they saw coming? What did they do before it became urgent?',
    },
    levels: {
      '4': level('Identifies problems or opportunities nobody asked about, builds the case, and delivers a fix that lasts; brings others along.', 'A pattern, not a single event.', 'Measurable change to a process, cost, client result or team capacity.', 'Noticed onboarding took two weeks, built a checklist, cut it to four days for three new hires.'),
      '3': level('Regularly acts before being asked; flags risks early with a proposed solution.', 'Several examples across the quarter.', 'Problems are avoided or shortened; the lead is freed from chasing.', 'Flagged the vendor delay a week early and lined up a backup.'),
      '2': level('Takes ownership of assigned work; raises issues when they arise; asks for more when idle.', 'Steady.', 'Work moves without the lead pushing.', 'Came to me when blocked and suggested two options.'),
      '1': level('Waits for instruction; problems surface late or through others; needs frequent follow-up.', 'Recurring.', 'Deadlines slip or the lead absorbs the work.', 'I had to chase every task; the blocker only came up on the due date.'),
    },
    incomplete: false,
  },
  {
    key: 'LEAD.TEAM_COLLABORATION', perspective: 'LEAD', titles: ['Team Collaboration'], name: 'Team Collaboration',
    definition: 'How they work with and strengthen the team.',
    prompts: {
      A: 'Describe a recent piece of work that depended on others. How did they coordinate, and how did the others experience it?',
      B: 'Describe a disagreement or handoff issue they were part of. What did they do?',
    },
    levels: {
      '4': level('Makes the whole team more effective: shares knowledge, resolves friction, mentors, connects people across teams.', 'Visible throughout the quarter; others seek them out.', 'Team output or morale measurably improves; cross-team work runs smoother.', 'Set up the weekly handoff with Ops that ended the missed-ticket problem.'),
      '3': level('Proactively helps colleagues, handles handoffs well, handles disagreement constructively.', 'Frequent.', 'Shared work finishes faster and with fewer issues.', 'Stayed late to walk a new teammate through the model before her deadline.'),
      '2': level('Cooperates, shares information when asked, respectful in disagreement.', 'Reliable.', 'No friction attributable to them.', 'Works fine with the team; handoffs are clean.'),
      '1': level('Withholds information, creates friction, or works in isolation to the detriment of others.', 'Recurring or one serious incident.', 'Team work is delayed or conflict escalates.', 'Two teammates asked not to be paired with him after missed handoffs.'),
    },
    incomplete: false,
  },
  {
    key: 'UPWARD.CLARITY', perspective: 'UPWARD', titles: ['Clarity in Communication'], name: 'Clarity in Communication',
    definition: 'Clear direction, priorities and expectations.',
    prompts: {
      A: 'Think of a recent task your lead assigned. How clear were the goal, deadline and standard? What happened as a result?',
      B: 'Describe a time priorities changed. How and when did your lead tell you?',
    },
    levels: {
      '4': level('Sets direction so clearly the team can make its own decisions; explains the why, the priority and the standard; communicates change before it bites.', 'Every example.', 'The team rarely needs to ask; work is aimed right first time; other leads adopt their practices.', 'Weekly priorities note means I never guess what matters; when the client moved the deadline we knew the same day with a new plan.'),
      '3': level('Tasks come with a clear goal, deadline and standard; changes are explained promptly.', 'Nearly always.', 'Little rework caused by misunderstanding.', 'Brief had the deadline, format and an example; no back-and-forth needed.'),
      '2': level('Instructions are adequate; clarification is available when asked.', 'Generally.', 'Occasional rework from ambiguity, resolved quickly.', 'Sometimes I have to ask what done looks like, but she answers fast.'),
      '1': level('Direction is vague, contradictory or late; priorities change without notice.', 'Recurring.', 'Wasted effort, missed deadlines, confusion.', 'Found out the priority changed when the client complained.'),
    },
    incomplete: false,
  },
  {
    key: 'UPWARD.GROWTH_SUPPORT', perspective: 'UPWARD', titles: ['Support for Professional Growth'], name: 'Support for Professional Growth',
    definition: 'Coaching, feedback and stretch opportunities.',
    prompts: {
      A: 'Describe a specific piece of feedback or coaching your lead gave you this month. What did you do with it?',
      B: 'Has your lead given you a new responsibility or learning opportunity? What was it and how were you supported?',
    },
    levels: {
      '4': level('Builds deliberate growth plans; creates stretch roles; sponsors people for opportunities outside the team.', 'Across the whole team.', 'Reports visibly advance: new responsibilities, promotions, skills used independently.', 'Pushed me to lead the client call and prepped me; I now run those calls.'),
      '3': level('Gives specific, timely feedback; offers learning opportunities; follows up.', 'Regular.', 'The report can name skills they improved this quarter.', 'Gave me line-by-line notes on my first model and checked in a week later.'),
      '2': level('Gives feedback when asked or in reviews; supports requests for learning.', 'Occasional but reliable.', 'Some development, mostly self-driven.', 'Approved the course I asked for.'),
      '1': level('Little or no feedback; blocks or ignores development requests.', 'Persistent.', 'The report stagnates or disengages.', 'No feedback this quarter beyond “fine”.'),
    },
    incomplete: false,
  },
  {
    key: 'UPWARD.RECOGNITION', perspective: 'UPWARD', titles: ['Recognition & Appreciation'], name: 'Recognition & Appreciation',
    definition: 'Fair, specific acknowledgement of contributions.',
    prompts: {
      A: 'Describe a time your lead acknowledged someone’s work. What was said, to whom, and was it specific?',
      B: 'Was there a contribution that went unrecognised? What happened?',
    },
    levels: {
      '4': level('Recognises specific contributions publicly and to senior people; credits the team for wins; builds a culture where peers recognise each other.', 'Consistent and fair across the team.', 'Team members feel their work is seen by leadership; recognition reaches decisions (projects, promotions).', 'Named me and what I did in the partner update, not just “the team”.'),
      '3': level('Acknowledges good work specifically and promptly.', 'Regular and fair.', 'The report feels valued and knows what to repeat.', 'Called out the data fix in standup and explained why it mattered.'),
      '2': level('Generic acknowledgement; says thank you.', 'Occasional.', 'Neutral.', 'Says good job at the end of projects.'),
      '1': level('Contributions go unacknowledged, credit is taken, or recognition is uneven.', 'Recurring.', 'Demotivation; team members feel invisible.', 'Presented my analysis to the client as their own.'),
    },
    incomplete: false,
  },
  {
    key: 'UPWARD.LEADERSHIP', perspective: 'UPWARD', titles: ['Leadership & Problem Solving'], name: 'Leadership & Problem Solving',
    definition: 'Decisions, unblocking and handling pressure.',
    prompts: {
      A: 'Describe a problem the team hit recently. What did your lead do, and what was the outcome?',
      B: 'Describe a decision your lead made that you disagreed with or that surprised you. How was it made and explained?',
    },
    levels: {
      '4': level('Resolves hard, ambiguous problems; makes sound decisions quickly and explains them; shields the team from chaos; fixes root causes.', 'Under pressure as well as normally.', 'The team delivers through crises; recurring problems disappear.', 'When the vendor failed two days before launch, she re-scoped, reassigned and we shipped on time.'),
      '3': level('Unblocks the team quickly; decisions are reasoned and communicated; takes responsibility.', 'Reliable.', 'Blockers are short-lived.', 'Escalated our access issue and had it fixed the same afternoon.'),
      '2': level('Handles routine problems; escalates the rest; decisions are reasonable.', 'Generally.', 'The team is not stalled for long.', 'Sorted the scheduling clash once we raised it.'),
      '1': level('Avoids decisions, reacts late, blames, or leaves the team stuck.', 'Recurring.', 'Prolonged blockers, repeated crises, low trust.', 'We were blocked for a week waiting for a decision.'),
    },
    incomplete: false,
  },
  {
    key: 'PEER.COLLABORATION', perspective: 'PEER', titles: ['Collaboration & Teamwork'], name: 'Collaboration & Teamwork',
    definition: 'Shared work, helping and handoffs.',
    prompts: {
      A: 'Describe a piece of work you did with them recently. What did they contribute and how did working together go?',
      B: 'Describe a time you needed their help. How did they respond?',
    },
    levels: {
      '4': level('Makes shared work better than either could alone; volunteers help unprompted; connects people and knowledge across teams.', 'A pattern others would also describe.', 'Joint deliverables improve; other teams benefit.', 'Rebuilt our shared tracker so both teams stopped double-booking analysts.'),
      '3': level('Actively helps, shares context, takes on their part of joint work fully.', 'Frequent.', 'Joint work finishes faster or better.', 'Jumped in on my section when I was on leave and briefed me after.'),
      '2': level('Does their share, responds to requests for help, cooperative.', 'Reliable.', 'Joint work runs normally.', 'Did her part of the proposal; easy to work with.'),
      '1': level('Avoids shared work, unhelpful, or creates friction.', 'Recurring.', 'Joint work stalls or others carry their share.', 'Didn’t contribute to the joint deck until the night before.'),
    },
    incomplete: false,
  },
  {
    key: 'PEER.COMMUNICATION', perspective: 'PEER', titles: ['Communication'], name: 'Communication',
    definition: 'Timely, clear and respectful communication.',
    prompts: {
      A: 'Describe a recent exchange (message, meeting, handoff) with them. Was the information clear and timely, and what happened next?',
      B: 'Describe a misunderstanding involving them. How was it resolved?',
    },
    levels: {
      '4': level('Communicates so clearly and early that problems are avoided for several people; resolves misunderstandings for others.', 'Consistent across channels and people.', 'Fewer errors and delays across the group.', 'His handoff notes are so complete the night shift stopped calling him.'),
      '3': level('Clear, timely, complete; confirms understanding; responsive.', 'Nearly always.', 'Handoffs work first time.', 'Always replies the same day with exactly what I need.'),
      '2': level('Clear enough; responds within normal time.', 'Generally.', 'Occasional clarification needed.', 'Sometimes I need to follow up, but it gets sorted.'),
      '1': level('Unclear, late or unresponsive; tone causes friction.', 'Recurring.', 'Errors, delays or conflict.', 'Took four days to answer a one-line question and the client waited.'),
    },
    incomplete: false,
  },
  {
    key: 'PEER.RELIABILITY', perspective: 'PEER', titles: ['Reliability'], name: 'Reliability',
    definition: 'Doing what they say, on time.',
    prompts: {
      A: 'Describe something they committed to delivering to you. Did it arrive as agreed? What was the effect?',
      B: 'Has anything they owned slipped? How did they handle it?',
    },
    levels: {
      '4': level('Commitments are always met; when things change they reorganise to still deliver and warn early; others plan around them with full confidence.', 'Without exception across the quarter.', 'Others take on more because this person anchors it.', 'We schedule the whole release around her QA sign-off because it has never slipped.'),
      '3': level('Meets commitments on time; flags slippage early with a new date.', 'Almost always.', 'Others rarely need to chase.', 'Warned me two days ahead and delivered on the new date.'),
      '2': level('Meets most commitments; small slips are communicated.', 'Generally.', 'Minor inconvenience only.', 'Usually on time; one late item this month, he told me.'),
      '1': level('Misses commitments, often without warning.', 'Recurring.', 'Others’ work is blocked or redone.', 'Missed the data drop twice and I found out from the client.'),
    },
    incomplete: false,
  },
]

export function normalizeTitle(text: string): string {
  return text.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function findDraft(perspective: Perspective, questionText: string): CompetencyDraft | null {
  const title = normalizeTitle(questionText)
  return DRAFTS.find((draft) => draft.perspective === perspective && draft.titles.some((t) => normalizeTitle(t) === title)) ?? null
}
