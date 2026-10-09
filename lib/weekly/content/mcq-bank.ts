// The standard multiple-choice bank, from the UX spec (sections 9 and 10, 8 October 2026). HR loads it once and edits
// it in the Questions tab. Statements are in score order here; evaluators see them shuffled. [name] is the person asked about.
import type { McqBankTopic } from '../mcq'

export const STANDARD_MCQ_BANK: readonly McqBankTopic[] = [
  {
    key: "LEAD.QUALITY_OF_WORK",
    perspective: "LEAD",
    name: "Quality of Work",
    departments: null,
    questions: [
      {
        text: "Think of a piece of work [name] handed over in the last two weeks. Which best describes it?",
        options: [
          {
            score: 1,
            text: "It was incomplete or wrong in ways that reached others, and I had to redo much of it."
          },
          {
            score: 1.5,
            text: "It needed several rounds of correction before I could use it."
          },
          {
            score: 2,
            text: "It did what was asked, with a normal review and a few small fixes."
          },
          {
            score: 2.5,
            text: "It needed only one quick check and minor tweaks."
          },
          {
            score: 2.5,
            text: "It was accurate and on time; I made one or two small edits before passing it on."
          },
          {
            score: 3,
            text: "I could use it as delivered, with no rework."
          },
          {
            score: 3.5,
            text: "It was ready to use and included improvements I had not asked for."
          },
          {
            score: 4,
            text: "It has become a reference others reuse, or it caught a problem before it reached anyone else."
          }
        ]
      },
      {
        text: "When [name]'s work fell below the standard you expected this quarter, what happened?",
        options: [
          {
            score: 1,
            text: "It happens often, and the same issues come back after feedback."
          },
          {
            score: 1.5,
            text: "It happens regularly; they fix it when told, but it recurs."
          },
          {
            score: 2,
            text: "It happened occasionally; they fixed it properly once it was pointed out."
          },
          {
            score: 2.5,
            text: "It happened rarely; they fixed it quickly and it did not recur."
          },
          {
            score: 3,
            text: "It rarely happens, and when it does they usually spot it before I do."
          },
          {
            score: 3,
            text: "I cannot recall a time; their work consistently meets the standard."
          },
          {
            score: 3.5,
            text: "They catch their own shortfalls early and add checks so it does not happen again."
          },
          {
            score: 4,
            text: "They have raised the standard: the checks they introduced now protect other people's work too."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.INITIATIVE_AND_PROACTIVITY",
    perspective: "LEAD",
    name: "Initiative & Proactivity",
    departments: null,
    questions: [
      {
        text: "When something needs doing that nobody has asked for, what does [name] usually do?",
        options: [
          {
            score: 1,
            text: "Nothing until told; problems surface late or through someone else."
          },
          {
            score: 1.5,
            text: "Acts only when prompted, and I usually need to follow up."
          },
          {
            score: 2,
            text: "Raises it with me when they notice it."
          },
          {
            score: 2,
            text: "Mentions it when it affects their own tasks."
          },
          {
            score: 2.5,
            text: "Raises it and suggests what could be done."
          },
          {
            score: 3,
            text: "Raises it with a proposed fix and starts on it once agreed."
          },
          {
            score: 3.5,
            text: "Fixes it within their own area without being asked, and tells me what they did."
          },
          {
            score: 4,
            text: "Spots and fixes problems beyond their own work, and the fix lasts."
          }
        ]
      },
      {
        text: "When a problem was coming that [name] could have seen, what did they do?",
        options: [
          {
            score: 1,
            text: "Did not notice or did not say; it became urgent before anyone knew."
          },
          {
            score: 1.5,
            text: "Mentioned it only when it was already causing delays."
          },
          {
            score: 2,
            text: "Flagged it in time for it to be handled, once it was clearly coming."
          },
          {
            score: 2.5,
            text: "Flagged it early enough that we had options."
          },
          {
            score: 3,
            text: "Flagged it early and came with a plan to deal with it."
          },
          {
            score: 3.5,
            text: "Dealt with it before it became a problem, and kept me informed."
          },
          {
            score: 3.5,
            text: "Handled it before it affected anyone, then told me what they had done."
          },
          {
            score: 4,
            text: "Prevented it, and changed how we work so the same problem does not come back."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.TEAM_COLLABORATION",
    perspective: "LEAD",
    name: "Team Collaboration",
    departments: null,
    questions: [
      {
        text: "On recent work that depended on others, how did [name] coordinate?",
        options: [
          {
            score: 1,
            text: "Others had to chase them, and the work stalled or was redone."
          },
          {
            score: 1.5,
            text: "Coordination was patchy; handoffs often needed chasing."
          },
          {
            score: 2,
            text: "They did their part and handed over when asked."
          },
          {
            score: 2.5,
            text: "They kept others updated without being chased."
          },
          {
            score: 2.5,
            text: "They shared progress at the agreed check-ins and flagged dependencies."
          },
          {
            score: 3,
            text: "They kept everyone aligned and made handoffs easy."
          },
          {
            score: 3.5,
            text: "They helped others with their parts so the whole piece finished faster."
          },
          {
            score: 4,
            text: "They set up a way of coordinating that the team has kept using."
          }
        ]
      },
      {
        text: "When [name] was part of a disagreement or a difficult handoff, what did they do?",
        options: [
          {
            score: 1,
            text: "Made it worse, or left others to deal with the fallout."
          },
          {
            score: 1.5,
            text: "Stayed defensive; it was resolved only when someone else stepped in."
          },
          {
            score: 2,
            text: "Stayed respectful and went along with the outcome."
          },
          {
            score: 2,
            text: "Raised it with me rather than trying to resolve it themselves."
          },
          {
            score: 2.5,
            text: "Explained their view calmly and helped reach an outcome."
          },
          {
            score: 3,
            text: "Helped find a solution both sides accepted."
          },
          {
            score: 3.5,
            text: "Resolved it and followed up to make sure it held."
          },
          {
            score: 4,
            text: "Resolved it and fixed the underlying cause, so it has not happened again."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D1",
    perspective: "LEAD",
    name: "Impact on decisions and outcomes",
    departments: [
      "Technology"
    ],
    questions: [
      {
        text: "Did [name]'s systems and models meaningfully improve decisions or financial outcomes this quarter?",
        options: [
          {
            score: 1,
            text: "Their work had little or no effect on business decisions or outcomes, with limited adoption."
          },
          {
            score: 1.5,
            text: "Some outputs were used, but most did not change any decision."
          },
          {
            score: 2,
            text: "Their outputs are useful, adopted and aligned with team goals, and improved decisions or operations."
          },
          {
            score: 2,
            text: "Their outputs are used regularly by the people they were built for."
          },
          {
            score: 2.5,
            text: "Their outputs are adopted, and at least one clearly changed a decision."
          },
          {
            score: 3,
            text: "Their work consistently improves how the business operates; it is trusted and influences key decisions."
          },
          {
            score: 3.5,
            text: "Their work influences key decisions beyond the team it was built for."
          },
          {
            score: 4,
            text: "Their work changes how the business thinks or operates; it enables new capabilities or has become foundational to how decisions are made."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D2",
    perspective: "LEAD",
    name: "Trust and scale",
    departments: [
      "Technology"
    ],
    questions: [
      {
        text: "Can the business trust and scale what [name] has built?",
        options: [
          {
            score: 1,
            text: "Delivery is inconsistent; systems are unreliable or hard to maintain, and frequent issues hold up progress."
          },
          {
            score: 1.5,
            text: "Systems mostly work but need regular fixes, and delivery dates often slip."
          },
          {
            score: 2,
            text: "Systems are stable and support business needs; delivery is generally predictable with acceptable quality."
          },
          {
            score: 2.5,
            text: "Systems are stable, and others can maintain them without their help."
          },
          {
            score: 3,
            text: "Systems are high quality and reliable; strong execution discipline improves team velocity and handles complexity well."
          },
          {
            score: 3,
            text: "Changes ship without breaking things, and other teams build on their work with confidence."
          },
          {
            score: 3.5,
            text: "Their systems are reused by other teams with little adaptation."
          },
          {
            score: 4,
            text: "They have built a scalable foundation that significantly speeds up development, experimentation and decision-making across the organisation."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D3",
    perspective: "LEAD",
    name: "Candidate communication",
    departments: [
      "Human Resources"
    ],
    questions: [
      {
        text: "How does [name] handle communication with candidates through the hiring process?",
        options: [
          {
            score: 1,
            text: "They often miss touchpoints; feedback is generic, late or absent, screening calls are rescheduled or unprepared, and hiring managers have to step in."
          },
          {
            score: 1.5,
            text: "Candidates sometimes have to chase for their status, and feedback is shared only when pushed."
          },
          {
            score: 1.5,
            text: "Screening calls happen, but are often rescheduled or start without preparation."
          },
          {
            score: 2,
            text: "Communication is consistent and professional; calls and status updates are timely, mostly from templates, with occasional delays in busy periods."
          },
          {
            score: 2.5,
            text: "Communication is consistent and timely, with feedback adjusted to the candidate where it matters."
          },
          {
            score: 3,
            text: "Every stage is well handled; feedback is tailored and useful even in rejections, and candidates know where they stand before they ask."
          },
          {
            score: 3.5,
            text: "Candidates, including those not hired, speak well of the process or refer others."
          },
          {
            score: 4,
            text: "They have built processes, such as playbooks, templates or scheduling workflows, that lift every candidate's experience, are adopted by others and measurably improve results."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D4",
    perspective: "LEAD",
    name: "Team sentiment and wellbeing",
    departments: [
      "Human Resources"
    ],
    questions: [
      {
        text: "How does [name] read team sentiment and support colleagues' wellbeing?",
        options: [
          {
            score: 1,
            text: "They are disengaged from the team, miss clear signs of stress, sometimes add to tension, and rarely acknowledge others."
          },
          {
            score: 1.5,
            text: "They take part, but rarely notice when colleagues are struggling."
          },
          {
            score: 2,
            text: "They are a steady, supportive presence who acknowledges work and helps when asked, but responds rather than anticipates."
          },
          {
            score: 2.5,
            text: "They notice when someone is struggling and check in, mostly when it is obvious."
          },
          {
            score: 2.5,
            text: "They regularly acknowledge colleagues' wins and offer small help before being asked."
          },
          {
            score: 3,
            text: "They are attuned to the team: they check in genuinely, act on it with workload help or advocacy, and are often the person teammates confide in."
          },
          {
            score: 3.5,
            text: "Their support visibly holds the team together during difficult stretches."
          },
          {
            score: 4,
            text: "They have built lasting practices, such as wellness initiatives, mentorship or recognition systems, and are seen across the company as a culture carrier."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D5",
    perspective: "LEAD",
    name: "Trading operations",
    departments: [
      "Operations"
    ],
    questions: [
      {
        text: "How well has [name] learned and carried out trading operations end to end?",
        options: [
          {
            score: 1,
            text: "They cannot yet decode or enter trades on the platforms."
          },
          {
            score: 1.5,
            text: "They can enter trades with step-by-step help and frequent checks."
          },
          {
            score: 2,
            text: "They perform basic trading tasks, such as buys and sells, as instructed with specific amounts."
          },
          {
            score: 2.5,
            text: "They perform basic trades independently and keep some trackers updated."
          },
          {
            score: 3,
            text: "They perform end-to-end trading tasks for SMAs and funds, updating all trackers."
          },
          {
            score: 3,
            text: "They complete SMA and fund trades end to end, and the trackers are up to date whenever checked."
          },
          {
            score: 3.5,
            text: "They handle end-to-end trading and catch errors before execution."
          },
          {
            score: 4,
            text: "They handle all trading operations end to end, executing every trade to the best possible result."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D6",
    perspective: "LEAD",
    name: "Fund operations knowledge",
    departments: [
      "Operations"
    ],
    questions: [
      {
        text: "How well does [name] understand the intricacies of the funds and their operations?",
        options: [
          {
            score: 1,
            text: "They do not yet understand how the funds and companies work."
          },
          {
            score: 1.5,
            text: "They understand some funds but need explanations for routine tasks."
          },
          {
            score: 2,
            text: "They understand the basic nature of tasks and complete them with guidance and checks."
          },
          {
            score: 2.5,
            text: "They complete routine tasks with only occasional checks."
          },
          {
            score: 2.5,
            text: "They understand most funds well enough to answer others' routine questions."
          },
          {
            score: 3,
            text: "They lead all tasks independently, including the small intricacies of operations."
          },
          {
            score: 3.5,
            text: "They lead tasks independently and spot where a process could be improved."
          },
          {
            score: 4,
            text: "They lead every task end to end with no oversight and no errors, and suggest efficient changes."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D7",
    perspective: "LEAD",
    name: "Prioritisation trade-offs",
    departments: [
      "Product"
    ],
    questions: [
      {
        text: "How well does [name] make and communicate prioritisation trade-offs when resources, time or scope are limited?",
        options: [
          {
            score: 1,
            text: "They struggle to make calls independently; decisions feel arbitrary or need frequent manager intervention."
          },
          {
            score: 1.5,
            text: "They decide simple cases but often escalate trade-offs they could make themselves."
          },
          {
            score: 2,
            text: "They prioritise when the path is clear, but avoid or delay hard trade-off conversations, especially pushing back on requests."
          },
          {
            score: 2.5,
            text: "They have hard trade-off conversations when needed, though not always early."
          },
          {
            score: 3,
            text: "They weigh priorities on consistent criteria (user impact, effort, strategic fit) and explain the reasoning clearly to engineering, design and stakeholders."
          },
          {
            score: 3.5,
            text: "They use consistent criteria and flag scope or resource conflicts early."
          },
          {
            score: 3.5,
            text: "They push back on requests with clear reasoning, and stakeholders accept it."
          },
          {
            score: 4,
            text: "They make confident calls under ambiguity, raise conflicts early, and bring the team along through open, trust-building communication."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D8",
    perspective: "LEAD",
    name: "Driving initiatives to outcome",
    departments: [
      "Product"
    ],
    questions: [
      {
        text: "How effectively does [name] drive initiatives from kickoff to a measurable outcome across engineering, design and other stakeholders?",
        options: [
          {
            score: 1,
            text: "They miss milestones, confuse partner teams, or ship work disconnected from the goals."
          },
          {
            score: 1.5,
            text: "They hit some milestones, but partner teams are often unclear on status."
          },
          {
            score: 2,
            text: "They deliver on schedule but measure success by launch rather than outcome; collaboration is mostly reactive."
          },
          {
            score: 2,
            text: "They ship what was planned on time, with little follow-up after launch."
          },
          {
            score: 2.5,
            text: "They deliver on schedule and check results after launch for some initiatives."
          },
          {
            score: 3,
            text: "They manage delivery end to end, keep stakeholders aligned and follow up after launch to assess impact."
          },
          {
            score: 3.5,
            text: "They set success measures before starting and report against them after launch."
          },
          {
            score: 4,
            text: "They run every initiative as a full loop: success metrics up front, cross-team friction handled constructively, and lessons fed into future planning."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D9",
    perspective: "LEAD",
    name: "Use of team tools",
    departments: [
      "Growth and Strategy"
    ],
    questions: [
      {
        text: "How well does [name] use team tools such as Notion, the CRM and Discord as part of the process?",
        options: [
          {
            score: 1,
            text: "They rarely or inconsistently update tools; tasks go untracked, others chase them for status, and they keep asking what to do next after weekly goals are set."
          },
          {
            score: 1.5,
            text: "They update tools when reminded, and their status is often out of date."
          },
          {
            score: 2,
            text: "They use the required tools correctly and keep updates reasonably current, with occasional follow-ups needed."
          },
          {
            score: 2.5,
            text: "They keep tools current without reminders most weeks."
          },
          {
            score: 3,
            text: "They use every tool proactively without reminders; everything is up to date and nothing falls through the cracks."
          },
          {
            score: 3,
            text: "Anyone can see the status of their work in Notion or the CRM without asking them."
          },
          {
            score: 3.5,
            text: "Their work is organised in the tools so well that check-ins about it are rarely needed."
          },
          {
            score: 4,
            text: "They are fully self-managed, set up systems that give the team complete visibility, cut the need for check-ins and set the example for others."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D10",
    perspective: "LEAD",
    name: "Contribution to fundraising",
    departments: [
      "Growth and Strategy"
    ],
    questions: [
      {
        text: "How much does [name] contribute to the fundraising process, directly or indirectly, within their role?",
        options: [
          {
            score: 1,
            text: "They miss timelines or delay work that affects fundraising, need frequent follow-ups and create bottlenecks."
          },
          {
            score: 1.5,
            text: "They deliver their part, but often late or after several follow-ups."
          },
          {
            score: 2,
            text: "They complete assigned tasks on time and support fundraising within their role, mostly reactively."
          },
          {
            score: 2.5,
            text: "They complete tasks on time and pass them on without being reminded."
          },
          {
            score: 2.5,
            text: "They coordinate with others on their part without needing to be chased."
          },
          {
            score: 3,
            text: "They deliver on time without follow-ups, move work smoothly to the next stage and coordinate well across teams."
          },
          {
            score: 3.5,
            text: "They anticipate the next step in the process and prepare for it before it is asked for."
          },
          {
            score: 4,
            text: "They own their contribution fully, ensure seamless handoffs and actively find new ways to contribute to fundraising."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D11",
    perspective: "LEAD",
    name: "Creative range",
    departments: [
      "Design"
    ],
    questions: [
      {
        text: "How versatile is [name]'s creative output across different briefs, audiences and contexts?",
        options: [
          {
            score: 1,
            text: "They default to one style regardless of the brief or audience."
          },
          {
            score: 1.5,
            text: "They adapt only after several rounds of feedback."
          },
          {
            score: 2,
            text: "They adapt their approach when given clear direction on what is needed."
          },
          {
            score: 2.5,
            text: "They adapt with light direction and sometimes read the brief correctly on their own."
          },
          {
            score: 3,
            text: "They read the brief independently and adjust style, tone and format without being asked."
          },
          {
            score: 3.5,
            text: "They adapt across very different briefs and offer more than one direction when useful."
          },
          {
            score: 3.5,
            text: "They move between brand, product and campaign work without a drop in quality."
          },
          {
            score: 4,
            text: "They create frameworks or references that help the wider team adapt across briefs and contexts."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D12",
    perspective: "LEAD",
    name: "Presenting and defending work",
    departments: [
      "Design"
    ],
    questions: [
      {
        text: "How clearly does [name] explain design decisions to stakeholders, and how do they handle pushback?",
        options: [
          {
            score: 1,
            text: "They struggle to explain decisions and give in to pushback without questioning it."
          },
          {
            score: 1.5,
            text: "They explain decisions only partly and often change course without discussing why."
          },
          {
            score: 1.5,
            text: "They become defensive under pushback rather than discussing it."
          },
          {
            score: 2,
            text: "They explain their reasoning clearly when asked and handle feedback calmly."
          },
          {
            score: 2.5,
            text: "They explain their reasoning clearly and question feedback that conflicts with the brief."
          },
          {
            score: 3,
            text: "They frame decisions before being questioned and steer subjective feedback back to user or business goals."
          },
          {
            score: 3.5,
            text: "Stakeholders increasingly accept their recommendations with fewer rounds of revision."
          },
          {
            score: 4,
            text: "They have built stakeholder trust in the design process, leading to fewer revision cycles and more design influence on decisions."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D14",
    perspective: "LEAD",
    name: "High-impact work",
    departments: [
      "Value Creation",
      "Executive"
    ],
    questions: [
      {
        text: "Looking at what [name] delivered recently, which best describes it?",
        options: [
          {
            score: 1,
            text: "Mostly low-value tasks or activity over outcomes; limited impact and often misses what matters."
          },
          {
            score: 1.5,
            text: "Busy, but only some of the output moves anything forward."
          },
          {
            score: 1.5,
            text: "Noticeable time goes to work that could wait while priorities slip."
          },
          {
            score: 2,
            text: "Solid work aligned with expectations; impact is consistent but tied to assigned tasks."
          },
          {
            score: 2.5,
            text: "Solid work, and when two tasks compete they choose the more important one."
          },
          {
            score: 3,
            text: "They prioritise high-impact work and consistently deliver results that move projects or goals forward."
          },
          {
            score: 3.5,
            text: "They drop or hand off low-value work so their time goes to what moves goals."
          },
          {
            score: 4,
            text: "They focus almost entirely on the highest-leverage work and deliver outcomes that materially improve performance, efficiency or strategic direction."
          }
        ]
      }
    ]
  },
  {
    key: "LEAD.DEPT.D15",
    perspective: "LEAD",
    name: "Problem solving without an obvious answer",
    departments: [
      "Value Creation",
      "Executive"
    ],
    questions: [
      {
        text: "When the obvious solution isn't available, how does [name] respond?",
        options: [
          {
            score: 1,
            text: "They stop or escalate when the standard approach fails, and their solutions closely copy what already exists."
          },
          {
            score: 1.5,
            text: "They try one alternative, then escalate."
          },
          {
            score: 2,
            text: "They try a few alternatives before escalating and find workable solutions within familiar approaches."
          },
          {
            score: 2.5,
            text: "They find workable solutions and sometimes question whether the problem is framed correctly."
          },
          {
            score: 2.5,
            text: "They look at how similar problems were solved elsewhere before settling on an answer."
          },
          {
            score: 3,
            text: "They step back to reframe the problem and connect ideas from different contexts; their solutions are smarter or simpler, and peers adopt them."
          },
          {
            score: 3.5,
            text: "They reframe problems regularly, and their approaches are used beyond their own work."
          },
          {
            score: 4,
            text: "They have introduced approaches new to the organisation, and their solution is now how the team does it."
          }
        ]
      }
    ]
  },
  {
    key: "UPWARD.CLARITY_IN_COMMUNICATION",
    perspective: "UPWARD",
    name: "Clarity in Communication",
    departments: null,
    questions: [
      {
        text: "Think of a recent task [name] gave you. How clear were the goal, deadline and standard?",
        options: [
          {
            score: 1,
            text: "I did not know what was wanted, and found out it was wrong only after doing it."
          },
          {
            score: 1.5,
            text: "I had to ask several questions before I could start."
          },
          {
            score: 1.5,
            text: "The brief was there, but key details came later in pieces."
          },
          {
            score: 2,
            text: "The goal and deadline were clear; I needed to check the standard."
          },
          {
            score: 2.5,
            text: "Goal, deadline and standard were clear, with one small question."
          },
          {
            score: 3,
            text: "Everything was clear, including why it mattered."
          },
          {
            score: 3.5,
            text: "It was clear, and they checked I had what I needed before I started."
          },
          {
            score: 4,
            text: "Their direction is so clear that I can make decisions on my own without checking."
          }
        ]
      },
      {
        text: "When priorities changed recently, how and when did [name] tell you?",
        options: [
          {
            score: 1,
            text: "I found out from someone else, or after the work was wasted."
          },
          {
            score: 1.5,
            text: "They told me late, and some work had to be redone."
          },
          {
            score: 2,
            text: "They told me when it came up, without much explanation."
          },
          {
            score: 2.5,
            text: "They told me promptly and explained what changed."
          },
          {
            score: 3,
            text: "They told me promptly, explained why, and reset deadlines."
          },
          {
            score: 3,
            text: "They updated the whole team at once with the new order of priorities."
          },
          {
            score: 3.5,
            text: "They warned me before it was final so I could adjust."
          },
          {
            score: 4,
            text: "They anticipate changes so well that the team rarely loses work to them."
          }
        ]
      }
    ]
  },
  {
    key: "UPWARD.SUPPORT_FOR_PROFESSIONAL_GROWTH",
    perspective: "UPWARD",
    name: "Support for Professional Growth",
    departments: null,
    questions: [
      {
        text: "What specific feedback or coaching has [name] given you this month?",
        options: [
          {
            score: 1,
            text: "None that I can recall."
          },
          {
            score: 1.5,
            text: "Only general comments, such as \"good job\" or \"do better\"."
          },
          {
            score: 2,
            text: "Some feedback, but only when I asked for it."
          },
          {
            score: 2,
            text: "Feedback came only in a formal review, not day to day."
          },
          {
            score: 2.5,
            text: "Specific feedback on one piece of my work."
          },
          {
            score: 3,
            text: "Specific, regular feedback I could act on."
          },
          {
            score: 3.5,
            text: "Specific feedback, and they checked later whether it helped."
          },
          {
            score: 4,
            text: "Coaching that has visibly changed how I work, as part of a plan for my growth."
          }
        ]
      },
      {
        text: "Has [name] given you a new responsibility or a chance to learn something this quarter?",
        options: [
          {
            score: 1,
            text: "No, and my requests for development have been ignored or refused."
          },
          {
            score: 1.5,
            text: "No, though they would agree if I pushed for it."
          },
          {
            score: 2,
            text: "Yes, when I asked for it."
          },
          {
            score: 2.5,
            text: "Yes, they offered a small opportunity without me asking."
          },
          {
            score: 3,
            text: "Yes, a real stretch task, with support along the way."
          },
          {
            score: 3,
            text: "Yes, they put me forward for something outside our team."
          },
          {
            score: 3.5,
            text: "Yes, a stretch task, and they helped me reflect on how it went."
          },
          {
            score: 4,
            text: "Yes, and it has led to a lasting step up in my role."
          }
        ]
      }
    ]
  },
  {
    key: "UPWARD.RECOGNITION_AND_APPRECIATION",
    perspective: "UPWARD",
    name: "Recognition & Appreciation",
    departments: null,
    questions: [
      {
        text: "Think of the last time [name] acknowledged someone's work. Which fits best?",
        options: [
          {
            score: 1,
            text: "I cannot recall them acknowledging anyone's work."
          },
          {
            score: 1.5,
            text: "Rarely, and usually for the same people."
          },
          {
            score: 2,
            text: "A general \"thanks, team\" at the end of a piece of work."
          },
          {
            score: 2.5,
            text: "A thank-you to the person, naming what they did."
          },
          {
            score: 2.5,
            text: "A quick message to the person soon after the work was done."
          },
          {
            score: 3,
            text: "Specific and prompt, saying what the person did and why it mattered."
          },
          {
            score: 3.5,
            text: "Specific, and shared with others in the team or the wider company."
          },
          {
            score: 4,
            text: "Specific, raised with senior people, and reflected in decisions such as projects or promotions."
          }
        ]
      },
      {
        text: "Has any contribution gone unrecognised by [name] this quarter?",
        options: [
          {
            score: 1,
            text: "Yes, often, or they presented someone else's work as their own."
          },
          {
            score: 1.5,
            text: "Yes, several, and they did not notice when it was pointed out."
          },
          {
            score: 1.5,
            text: "Yes; recognition tends to go to the same few people."
          },
          {
            score: 2,
            text: "Once or twice, though they acknowledged it when told."
          },
          {
            score: 2.5,
            text: "Rarely; they usually notice contributions themselves."
          },
          {
            score: 3,
            text: "Not that I know of; they notice contributions across the team."
          },
          {
            score: 3.5,
            text: "No; they also make sure quieter team members get credit."
          },
          {
            score: 4,
            text: "No; they have built a team where people recognise each other too."
          }
        ]
      }
    ]
  },
  {
    key: "UPWARD.LEADERSHIP_AND_PROBLEM_SOLVING",
    perspective: "UPWARD",
    name: "Leadership & Problem Solving",
    departments: null,
    questions: [
      {
        text: "When the team hit a problem recently, what did [name] do?",
        options: [
          {
            score: 1,
            text: "Nothing useful; we stayed stuck or were blamed."
          },
          {
            score: 1.5,
            text: "Got involved late, after the problem had grown."
          },
          {
            score: 2,
            text: "Helped once we escalated it."
          },
          {
            score: 2,
            text: "Passed it to someone else who could help."
          },
          {
            score: 2.5,
            text: "Got involved quickly and helped find a way forward."
          },
          {
            score: 3,
            text: "Unblocked us quickly and explained the decision."
          },
          {
            score: 3.5,
            text: "Unblocked us and dealt with the cause, not just the symptom."
          },
          {
            score: 4,
            text: "Handled a hard, unclear situation calmly, and the problem has not come back."
          }
        ]
      },
      {
        text: "Think of a decision [name] made that surprised you or that you disagreed with. How was it handled?",
        options: [
          {
            score: 1,
            text: "It was imposed with no explanation, and questions were not welcome."
          },
          {
            score: 1.5,
            text: "It came with little explanation, and I had to piece together why."
          },
          {
            score: 2,
            text: "It was explained when I asked."
          },
          {
            score: 2.5,
            text: "It was explained up front."
          },
          {
            score: 2.5,
            text: "It was explained clearly, though our input was not asked for."
          },
          {
            score: 3,
            text: "It was explained up front, and my concerns were heard."
          },
          {
            score: 3.5,
            text: "My input was asked for before the decision was made."
          },
          {
            score: 4,
            text: "The way it was made and explained increased the team's trust, even among those who disagreed."
          }
        ]
      }
    ]
  },
  {
    key: "PEER.COLLABORATION_AND_TEAMWORK",
    perspective: "PEER",
    name: "Collaboration & Teamwork",
    departments: null,
    questions: [
      {
        text: "Think of work you did with [name] recently. How did working together go?",
        options: [
          {
            score: 1,
            text: "They avoided their share, and I or others covered it."
          },
          {
            score: 1.5,
            text: "Their part came late or needed chasing."
          },
          {
            score: 2,
            text: "They did their part as agreed."
          },
          {
            score: 2,
            text: "They did what was asked of them, no more and no less."
          },
          {
            score: 2.5,
            text: "They did their part and shared what I needed without being asked."
          },
          {
            score: 3,
            text: "They contributed fully and made the joint work easier."
          },
          {
            score: 3.5,
            text: "They improved the joint work beyond their own part."
          },
          {
            score: 4,
            text: "The result was better than either of us would manage alone, and other teams benefited."
          }
        ]
      },
      {
        text: "When you needed [name]'s help, how did they respond?",
        options: [
          {
            score: 1,
            text: "They did not help, or made it harder."
          },
          {
            score: 1.5,
            text: "They helped only after repeated asks."
          },
          {
            score: 2,
            text: "They helped when they had time."
          },
          {
            score: 2.5,
            text: "They helped promptly."
          },
          {
            score: 3,
            text: "They helped promptly and made sure the problem was solved."
          },
          {
            score: 3,
            text: "They made time for it even though they were busy."
          },
          {
            score: 3.5,
            text: "They helped and showed me how to handle it next time."
          },
          {
            score: 4,
            text: "They offered help before I asked, and now help others the same way."
          }
        ]
      }
    ]
  },
  {
    key: "PEER.COMMUNICATION",
    perspective: "PEER",
    name: "Communication",
    departments: null,
    questions: [
      {
        text: "Think of a recent exchange with [name]: a message, meeting or handoff. Which fits best?",
        options: [
          {
            score: 1,
            text: "Important information was missing or wrong, and it caused a problem."
          },
          {
            score: 1.5,
            text: "It was unclear, and I had to follow up more than once."
          },
          {
            score: 2,
            text: "It was clear enough after one follow-up."
          },
          {
            score: 2,
            text: "It answered my question, but slowly."
          },
          {
            score: 2.5,
            text: "It was clear and arrived in reasonable time."
          },
          {
            score: 3,
            text: "It was clear, complete and on time; no follow-up was needed."
          },
          {
            score: 3.5,
            text: "It was clear, and they answered questions before I asked them."
          },
          {
            score: 4,
            text: "Their communication prevents problems for several people, not just me."
          }
        ]
      },
      {
        text: "When there was a misunderstanding involving [name], how was it resolved?",
        options: [
          {
            score: 1,
            text: "It was not, or it was left for others to sort out."
          },
          {
            score: 1.5,
            text: "Only after it had caused rework or delay."
          },
          {
            score: 1.5,
            text: "It dragged on over several exchanges before it was clear."
          },
          {
            score: 2,
            text: "It was sorted once someone raised it."
          },
          {
            score: 2.5,
            text: "They raised it themselves and sorted it."
          },
          {
            score: 3,
            text: "They sorted it quickly and confirmed everyone understood."
          },
          {
            score: 3.5,
            text: "They sorted it and changed how they communicate to avoid a repeat."
          },
          {
            score: 4,
            text: "They resolved it and helped others avoid the same kind of misunderstanding."
          }
        ]
      }
    ]
  },
  {
    key: "PEER.RELIABILITY",
    perspective: "PEER",
    name: "Reliability",
    departments: null,
    questions: [
      {
        text: "When [name] commits to deliver something to you, what usually happens?",
        options: [
          {
            score: 1,
            text: "It often does not arrive, and I find out late."
          },
          {
            score: 1.5,
            text: "It arrives late more often than not."
          },
          {
            score: 2,
            text: "It usually arrives on time; slips are occasional."
          },
          {
            score: 2.5,
            text: "It arrives on time, and slips are flagged in advance."
          },
          {
            score: 3,
            text: "It arrives as agreed; if something changes they warn me early with a new date."
          },
          {
            score: 3,
            text: "I do not need to check on it; it simply arrives."
          },
          {
            score: 3.5,
            text: "It arrives as agreed, even when plans change around them."
          },
          {
            score: 4,
            text: "It always arrives as agreed; others plan their own work around their dates."
          }
        ]
      },
      {
        text: "Has anything [name] owned slipped this quarter? How did they handle it?",
        options: [
          {
            score: 1,
            text: "Several things slipped without warning, and I found out from others."
          },
          {
            score: 1.5,
            text: "Things slipped, and they told me only when asked."
          },
          {
            score: 2,
            text: "Something slipped; they told me at the deadline and recovered it."
          },
          {
            score: 2.5,
            text: "Something slipped; they warned me before the deadline."
          },
          {
            score: 2.5,
            text: "One small thing slipped, and they apologised and fixed it the same day."
          },
          {
            score: 3,
            text: "Something slipped; they warned me early and delivered on the new date."
          },
          {
            score: 3.5,
            text: "Nothing that affected me; they renegotiated early when needed."
          },
          {
            score: 4,
            text: "Nothing slipped, even under pressure, and they absorbed other people's slips."
          }
        ]
      }
    ]
  }
]
