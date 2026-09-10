# AI evaluation pilot interface

This is an Operate surface extending Compass. The implementation follows `PRODUCT.md`: employees record observations, HR reviews evidence and assessments, and existing evaluations remain authoritative. It does not establish a replacement global design system.

## Organization

- **Employee — Weekly observations:** pending check-ins precede development themes. Each check-in shows the colleague, cycle, week, relationship and status, followed by a concrete prompt, response field and no-interaction option. Submit observation is primary; Save draft is secondary; Help me add detail requests one follow-up. Released themes provide an Add context for HR field and preserve previously submitted context.
- **HR — AI evaluation pilot:** the authority/privacy notice and inference-configuration state precede a cycle selector and Run due work action. Five workspace views separate Cycle setup, Evidence & profiles, Quarterly review, Development themes and Processing. Setup covers enrollment, relationships, expectations/weights, rubric and evidence thresholds; activated settings are shown as frozen. Review places rationale and anchored rating controls beside supporting and conflicting source quotations. Themes have explicit draft, release and withdrawal actions. Processing exposes operation status, failure and retry controls.

## Compass conventions reused

The existing sidebar, account header and mobile menu frame both surfaces. The pilot reuses semantic background, card, muted, foreground, border, input, primary and ring tokens from `app/globals.css`, plus the shared `components/ui/button.tsx` variants. Light screenshots show pale neutral backgrounds, white bordered cards, subdued metadata and violet primary actions. The interface inherits Compass typography rather than adding a font.

Page titles use the established large semibold hierarchy; section and card titles step down in size. Rounded controls, restrained borders, muted status badges and generous vertical grouping organize the work. Employee and HR content use centered maximum widths of 64rem and 72rem respectively, with 1rem padding increasing to 2rem at the medium breakpoint. Fields reuse a common focus-ring and disabled-state treatment. Semantic tokens also support the existing dark theme; these screenshots only establish the light appearance.

## State, authority and privacy

Employees supply observations, not scores. The interface states that authorized HR reviewers can see source feedback and colleagues receive reviewed development themes. Raw observations are tied to claims and ratings through source references; reviewed rating overrides and reviewed overall scores display separately from the original AI proposal. Insufficient evidence withholds the overall score. Review actions require an explanation, and the review history remains visible.

Draft, submitted, closed, clarifying and processing-failed states have explicit copy. Submitted or unavailable responses become noneditable; processing failure explains that the saved response is safe. Actions show Working… while pending and inline alerts on failure. Loading and operational messages use status semantics. Changing cycles clears the prior view while loading, and stale responses are discarded. Released themes have a labeled Withdraw theme and save draft action explaining their removal from employee view until rerelease. Employee context is displayed as context rather than silently rewriting the reviewed theme.

These are UI boundaries backed by server authorization; hiding or disabling a control alone is not an access-control guarantee. The pilot remains separate from authoritative evaluations, production activation and external reminders.

## Mobile behavior

At the captured 390px width, the existing shell collapses to its menu header. Content and check-in cards stack within the viewport; headings and prompts wrap, Refresh moves below the introduction, and action rows wrap. HR rating/rationale and evidence columns become one vertical reading sequence, retaining the original quotations, reviewed rating and review history. Setup grids similarly reduce their column counts at narrower breakpoints. The supplied employee and HR evidence captures show readable stacked content without visible horizontal clipping in those views.

## Verification and limits

This documentation pass inspected `components/ai-evaluations`, shared button/theme sources, `PRODUCT.md`, and `.pilot-screens/employee-desktop.png`, `employee-mobile.png`, `hr-desktop.png` and `hr-mobile-evidence.png`. Captures use synthetic accounts and evidence.

The implementation owner reports four browser scenarios passed across the final runs, covering source evidence, draft persistence, authorization, reviewed rating override display, cycle switching and employee theme context. The independent finish review's three findings—cycle switching, reviewed overrides and explicit theme withdrawal—were resolved. The mobile evidence capture shows a reviewed 4/4 alongside an original AI proposal of 3; the desktop capture represents a different review state.

This bounded pass did not rerun browser scenarios, verify live Fireworks inference, measure computed contrast, exercise full keyboard traversal or test every viewport/theme/state combination. Visible labels, native controls, focus styling and status/alert semantics are implementation evidence, not a complete accessibility certification.
