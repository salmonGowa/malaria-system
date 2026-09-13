# User Acceptance Testing Plan

Satisfies Objective 5: "validated through user acceptance testing with at
least five sample end-users achieving an 80% task-completion success rate."

This is the instrument to actually run that test — a facilitator script, a
task list with pass/fail criteria, and a scoring sheet — not the test
results themselves. No real end-users were available to this session; the
plan is built so you (or anyone) can run it with five real people and get a
result that means what Objective 5 says it should mean.

## Who to recruit

Five people who plausibly resemble the system's real users: county/facility
health staff, public-health students, or anyone comfortable with a basic
web dashboard but unfamiliar with *this* one. Avoid anyone who has already
seen the app being built — familiarity defeats the point of a usability
test.

## Setup (facilitator, before each session)

1. `scripts/dev-up.sh` — confirm all four services are actually running
   (`scripts/dev-status.sh`).
2. Seed a known-clean state: a handful of counties with boundaries, at
   least one forecast and one allocation already on record so Tasks 4-5
   below aren't the participant's very first data point.
3. Have the demo login ready (`demo` / see `backend`'s seed script or your
   own test account) — don't make credential-sharing part of what you're
   timing.
4. Sit the participant at the dashboard's home page (`/`), signed **out**
   — Task 1 is signing in.

Time each task from "go" to either completion or the participant giving up
(3 minutes, or when they explicitly say they're stuck). Don't help unless
they're fully stuck — a hint you had to give is a task failure, noted as such.

## Tasks

| # | Task | Instruction given to participant | Pass criterion |
|---|---|---|---|
| 1 | Sign in | "Sign in using the demo account." | Signed-in chip appears in the top bar within 3 attempts |
| 2 | Find the riskiest county | "Using the Analytics page, tell me which county currently has the highest outbreak risk." | Correctly names the top county from the Risk by County chart or map |
| 3 | Read the model's honesty | "Find the section that tells you how accurate the forecasting model actually is." | Locates the Model Performance card and states whether the AUC target was met |
| 4 | Generate a forecast | "Generate a new forecast for [county X]." | A new row for that county appears on the Forecasts page |
| 5 | Run an allocation | "Using the forecast you just generated, allocate 20,000 doses so that no single county gets more than half." | Sets max share to 50% and gets a result spread across >1 county |
| 6 | Submit a case report | "Submit a case report for [facility Y]: 15 confirmed, 3 suspected, 0 deaths." | New row appears on Case Reports with correct figures |
| 7 | Verify the chain | "Confirm the case report data hasn't been tampered with." | Finds Chain Integrity and reads "Chain intact" |
| 8 | Find a county's full history | "Look up [county Z] and tell me its total confirmed cases and current population-adjusted case rate." | Reaches the County Detail page and reads both figures |
| 9 | Export data | "Get the case report data into a spreadsheet-ready file." | Clicks Export CSV and a file downloads |
| 10 | Switch theme | "Switch the dashboard to dark mode." | Theme toggle used successfully |

10 tasks, not 5 — gives a finer-grained signal than a strict 5-task version
while still rolling up to one pass rate per participant.

## Scoring sheet (fill in per participant)

```
Participant: ____   Date: ____   Session length: ____

Task  Pass/Fail  Time (s)  Notes (what they said/did, exact wording of confusion)
1     [ ]        ___       
2     [ ]        ___       
3     [ ]        ___       
4     [ ]        ___       
5     [ ]        ___       
6     [ ]        ___       
7     [ ]        ___       
8     [ ]        ___       
9     [ ]        ___       
10    [ ]        ___       

Task completion rate: ___ / 10 = ___%
```

Objective 5's target is **80% task-completion success rate across >= 5
participants** — compute it as (total tasks passed) / (total tasks
attempted) across all participants, not per-participant-must-hit-80%; a
participant scoring 6/10 and another scoring 10/10 average to 80% overall,
which is the number that maps onto the objective's wording.

## Post-session questionnaire (2 minutes, after the tasks)

Five-point agreement scale (1 = strongly disagree, 5 = strongly agree):

1. I found the dashboard easy to navigate.
2. I understood what the risk scores and forecasts meant.
3. I would trust this system's allocation recommendations enough to act on them.
4. The chain-integrity/audit-trail feature made sense to me.
5. I'd be comfortable using this system in my actual work.

Plus one open question: "What was the single most confusing moment?" — this
is usually more useful than the Likert scores for actually fixing anything.

## After running it

Aggregate the scoring sheets into the completion-rate formula above, note
whether it clears 80%, and list every task that failed for more than one
participant — those are the concrete fixes worth making before calling the
UI validated, not the Likert averages.
