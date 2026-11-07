# Signal: technical hiring and assessment platform (project specification)

You are building a production-grade technical hiring and assessment platform called Signal. This file is the spec. Read all of it at the start of every session, together with PROGRESS.md and CLAUDE.md. Work in small commits. Never invent requirements. If something is unclear, ask one short question. Write tests as you go.

## 0. Current state (update PROGRESS.md, not this section)

Some Phase 1 work exists (monorepo, eligibility rule, Fastify API with auth and role checks tested against mocks, Prisma schema). Do not trust earlier claims of "complete". Re-verify everything with commands and record evidence in PROGRESS.md.

## 1. What the product is

Signal lets companies hire college students with online coding tests, aptitude tests, mock tests, AI video interviews and live interviews. A company registers, connects to college placement portals, creates tests, and chooses exactly which students can see each test (college, graduation batch, branch, minimum CGPA). Only students who registered through their college placement portal and were verified can see those tests. Students take tests with camera and microphone on, with automatic AI monitoring. Hiring teams review scores, recordings, code similarity and flags, then decide who moves to the next round. People make every hiring decision. Nothing rejects a candidate automatically.

Users: company admin (hiring manager, recruiter), interviewer (reviews and runs live interviews), college placement officer (shares and verifies student lists), student (candidate).

## 2. Principles that must hold everywhere

1. Humans decide. AI and proctoring only produce signals, scores or drafts that a person reviews. No auto-reject, ever.
2. Honest claims. No feature may say it "detects AI-written code" or "proves cheating". Show similarity percentages, session signals and reasons instead.
3. Consent first. Camera, microphone and device data are collected only after the candidate reads what is recorded and agrees. Show a visible recording indicator the whole time.
4. Visibility is enforced on the server, never only in the UI. A student outside a test's audience must not be able to see it, fetch it, or learn it exists (return 404, not 403).
5. Hidden test cases and reference solutions never reach the candidate's browser or sandbox.
6. Everything important is logged in an append-only audit log.

## 3. Design direction (it must not look AI-generated)

Keep the Signal-style dashboard structure: left sidebar for admin, top tabs for candidate, dense tables, side panels. Use design/reference/ (if present) for layout only. Replace the generic "AI SaaS" look with a design that looks hand-made by a product designer.

Colour (warm, muted, one accent). CSS variables:

* Light: background #F4F1EA, panel #FFFDF8, sunken #EFEBDF, ink #1D1C19, muted #6B675C, hairline #D8D2C2, accent (deep brick) #9C3A17, success #2D6A3E, danger #A8261B, warning #8A5A00.
* Dark: background #171613, panel #1E1D19, sunken #24231E, ink #EBE7DA, muted #9D9889, hairline #35332B, accent #E08A62, success #7CC28F, danger #F08C80, warning #E0B25A.
* Support prefers-color-scheme plus a manual toggle.

Typography: a serif for page titles and big numbers (Newsreader or Source Serif 4), a humanist sans for the UI (Public Sans or Source Sans 3), a code font for code and IDs (Source Code Pro or JetBrains Mono). No more than these three families.

Layout and components:

* Content separated by thin rules and whitespace, not a card around everything. Panels only where grouping is needed.
* Square or lightly rounded corners (2 to 4 px). Status labels are small outlined uppercase tags, not pill badges.
* Dense tables with hairline row rules, small uppercase column headers, no zebra stripes or heavy shadows.
* Buttons: solid ink for primary, outlined for secondary. No gradients anywhere.
* Page header: serif title, one plain sentence, a rule below.
* Icons: one small consistent line-icon set, used sparingly. No emoji in the UI.

Do NOT use: purple or blue-violet gradients, glassmorphism, glowing shadows, large rounded cards on every block, emoji icons, floating blobs, sparkle AI icons, stock illustration, centered hero sections inside the app, or the default Tailwind indigo palette.

Copy: write like a person. Short, specific, plain sentences. "Time left", not "Remaining duration". No marketing words, no exclamation marks. Error messages say what happened and what to do.

Accessibility: WCAG AA contrast in both themes, visible focus rings, keyboard navigation for tables, forms and the code editor, labels on every input, reduced-motion support, responsive down to 360 px (tables scroll inside their own container).

\## 4. Tech stack (versions are pinned in package.json; do not change without asking)



\- Frontend: React + TypeScript + Vite, React Router, TanStack Query, Monaco editor, Yjs, plain CSS variables or CSS modules. No heavy UI kit that forces a generic look.

\- Backend: Node.js (TypeScript) with Fastify; WebSocket gateway for rooms and live results.

\- Database: PostgreSQL with Prisma (prisma and @prisma/client pinned to the same stable version). Cache and rate limits: Redis. Object storage: S3-compatible.

\- Queue: Kafka or SQS (partition by language). Workers: Go or Rust agents. Sandbox: Firecracker microVMs or gVisor, no network.

\- Auth: email and password (argon2), email verification, short-lived access tokens in httpOnly cookies, refresh tokens, role-based access control.

\- Infra: Docker, Kubernetes with autoscaling on queue lag, OpenTelemetry, Prometheus, Grafana.

\- Monorepo layout: apps/web, apps/api, apps/room, services/judge, services/worker, packages/shared, packages/db, packages/design.



\## 5. Architecture



Browser (React, Monaco, Yjs) talks over HTTPS and WSS to a gateway (auth, rate limits, tenant quotas). Behind it: API service (companies, tests, questions, students, attempts, reviews); submission service (accepts code, stores it, enqueues a job, returns 202 with an id); room service (live interviews, Yjs CRDT, presence, event log for replay); queue, scheduler, sandboxed worker pools, a trusted judge that compares output, results streamed back over WebSocket; proctoring service (events and recordings, review priority); AI service (asynchronous, never on the submission hot path); notification service (email invites, reminders). AI never blocks execution. Execution and judging are deterministic.



\## 6. Company registration and verification



\- First visit to the admin panel shows "Register your company": company name, company domain, industry, hiring contact email, number of students to hire, and a required checkbox agreeing to the candidate-data terms (tell candidates what is recorded, keep data only as long as needed, a person makes every decision).

\- Verification: the contact email domain must match the company domain and be confirmed through an emailed link. Otherwise the workspace stays "Pending review" and tests cannot be published (drafts allowed). In development, print the link to the console.

\- Company page: profile, verification status, hiring target, partner colleges with registered and verified student counts, and "Sync from placement portals".

\- Multi-tenant: every row belongs to a company\_id. Enforce isolation in queries and with row-level security.



\## 7. College placement portal and the student registry



\- Colleges have an account with a domain and a placement officer role. Officers upload or sync student lists (CSV and API) and approve registrations, for their own college only.

\- Student self-registration: name, college, graduation batch, branch, CGPA, roll number, college email. If the email domain matches the college domain and the email is confirmed, the student is verified. Otherwise the status is "Pending college check" and the student sees no tests until the placement officer approves.

\- students: id, name, college\_id, batch\_year, branch, cgpa, college\_email, roll\_no, status (pending, verified, suspended), registered\_via (portal or self), created\_at.

\- Admin "Students" page: filter by college and batch, show status and a "Can see" column listing the tests each student is eligible for.



\## 8. Test visibility (the core access rule)



A student can see, open or start a test only if all are true: the student is verified; the test is published and inside its open window; the audience matches (colleges: all partner colleges or a chosen list; graduation batches such as 2028; branches or all; CGPA at or above the minimum); for later rounds, the student passed the previous round.



Implement as one server-side eligibility function used by every endpoint (list, detail, start, submit, upload recording). Unauthorized access returns 404. Test every rule, including edge cases (wrong batch, unverified, outside window). There must be no header-based identity such as x-student-id anywhere.



\## 9. Admin panel pages



Sidebar: Overview, Tests, Create test, Coding questions, Aptitude bank, Students, Candidates, Live proctoring, Analytics, Similarity, Languages, Invite candidates, Company.



\- Overview: counts (live tests, candidates, average score, waiting for review) and a "needs your attention" list.

\- Tests: name, type (coding, aptitude mock, AI interview), audience summary, number of students who can see it, window, number of AI checks enabled, pass mark, attempts, average score.

\- Create test: name, type, minutes, pass mark, open and close dates, questions, audience (colleges, batches, branches, minimum CGPA) with a live count "N registered students can see this test", a fixed notice that only registered verified students can see it, AI monitoring toggles (face check, camera covered or dark, speech in room, tab and window switches, paste and copy), allowed languages, CPU and RAM limits, camera and microphone requirement, and a "Generate blueprint from job description" helper. Publish is disabled until the company is verified.

\- Candidates: sortable table (name, college, language, score, status, IP address) with a detail panel: score breakdown (correctness, efficiency, code quality), device and network (IP, approximate location, device, browser, timezone), code similarity (closest match), session log, and actions Advance, Hold, Reject (each needs a person's click and writes to the audit log). Links to replay and recordings.

\- Live proctoring: cards for running sessions with video tile, risk level, events, and actions Send warning and Pause test. Settings for default rules and recording retention.

\- Analytics: score distribution, hiring funnel (invited, started, submitted, passed, advanced), section averages, language usage, average time per question, hardest questions, per-college and per-batch comparison, CSV export.

\- Similarity: pairwise structural match table with a reading (distinct, some overlap, review closely) and a note that short problems can match by chance.

\- Languages: runtime profiles (section 14).

\- Invite candidates: paste emails or upload CSV, pick a test and link expiry, track Sent, Opened, Started. Invites still respect the audience rule.

\- Company: section 6.

\## 10. Coding question builder



Fields: title, difficulty (easy, medium, hard), topics, time limit per test (seconds), memory limit (MB), problem description, input format, output format, constraints, examples (repeatable: input, output, explanation), test cases (repeatable: input, expected output, hidden flag), allowed languages, starter code per language, optional reference solution (server-side only), optional custom checker.



\- "Preview as candidate" renders exactly what candidates see: title and tags, Problem, Input format, Output format, Constraints, numbered Examples with input, output and explanation.

\- Validation: title and description required, at least one example with input and output, at least 2 test cases with at least one hidden; warn to include an edge case and one large input so slow solutions time out.

\- Output comparison trims whitespace at the ends; support a custom checker and floating point tolerance.

\- Two modes: stdin/stdout (default) and function mode (the judge wraps a named function per language).

\- Versioning: editing a question used by a live test creates a new version; past attempts are unchanged.

\- Optional AI helpers "Draft a question" and "Audit my test cases" (suggest edge cases, show which common wrong solutions the tests miss using mutation testing). Drafts are marked "AI draft, needs review" and never publish without a person saving them.

\- Also an aptitude question bank (MCQ): topic, difficulty, correct answer, explanation, accuracy statistics.



\## 11. Candidate dashboard



Tabs: Home, Practice, Mock tests, AI interview, Skill report, Leaderboard, Certificates.



\- Not registered: form "Register through your college placement portal". Tests stay hidden until verified. Pending: a message that the college placement cell has to confirm.

\- Home: name, college, batch, branch; four-round tracker (online screen, coding assessment, AI video interview, final round); "Tests for you" list showing only eligible tests with duration, window and a note that camera and microphone are on; Start button; attempts table; a short note on what is recorded.

\- Passing a round unlocks the next. A failed attempt shows what to improve and a retake if allowed.

\- Practice: topic cards (quantitative, logical, verbal, data interpretation, coding, SQL), mastery, quizzes with instant explanations.

\- Mock tests: full-length sections with timers, same camera, microphone and monitoring as real tests, then a test analysis (accuracy per section, seconds per question, compared with the batch average).

\- Skill report: section scores against the batch average, strongest and weakest areas, a short study plan.

\- Leaderboard: batch ranking (opt-in). Certificates: issued when a test is passed, verifiable ID, PDF download. Results: every attempt.



\## 12. Test-taking experience



Always start with a consent and device check:

\- List what is recorded (video, audio, tab and window changes, paste and copy, IP address, browser, device, automatic checks), the retention period (default 30 days) and who can view recordings (only the hiring team for that role).

\- Required consent checkbox, then "Turn on camera and microphone" with live preview, microphone level meter and clear success or failure messages. Start stays disabled until consent is given and both devices work. No "continue without camera" option in production unless the test allows it.



Coding test: problem panel (section 10 layout), language dropdown, Monaco editor with starter code, Run (public tests plus optional custom input) and Submit, results table (public and hidden rows, time, memory, verdict; hidden inputs never shown), countdown timer, side panel with camera preview, microphone meter, "Recording" indicator, AI monitoring status and session log. Autosave drafts and recover after refresh or disconnect.



Mock test: one question at a time, previous and next, section labels, answer review, timer, same side panel, submit confirmation.



AI video interview: questions one at a time (generated from the role and approved by the company), recording per answer with configurable length and re-record limits, resumable upload, no live human, clear statement that a person reviews the recordings. Reviewers see a transcript beside the recording.



\## 13. Proctoring and AI monitoring



Enabled per test with toggles. Results are signals that raise review priority (Low, Medium, High). They never end a test or reject a candidate on their own.



Client signals: camera and microphone permission state and stream loss; face count (browser FaceDetector where available, otherwise sampled frames with a small on-device model; if unavailable say so in the UI); camera covered or very dark (brightness below a threshold for several samples); large sudden movement; sustained speech or loud sound (not for AI interviews); tab or window switches, focus loss, fullscreen exit; paste of many lines, copy and cut; network drops and device changes.



Server signals: IP address and approximate location, user agent, device type and changes during a session; same IP or device used by several candidates in one test; timing patterns (very fast correct solution after a long idle gap).



Details: debounce events (one per type per 20 seconds) and weight them into a transparent score (for example no face 2, more than one face 3, camera covered 3, sustained speech 1, paste 1, tab switch 1), showing the reasons with the level. Event schema: session\_id, type, timestamp offset, details, confidence, source. Periodic snapshots (about every 30 seconds) and full recording, uploaded in chunks to private encrypted storage, reviewed through short-lived signed URLs. Reviewer screen: timeline with event markers linked to the recording, side by side with code replay, a note field, and decision buttons. Candidates can see their own flag summary and appeal. Warn the candidate in the UI when something is flagged so honest candidates can fix it. Document false-positive causes (shared Wi-Fi, hostels, poor lighting, accessibility tools, screen readers) in the reviewer UI.



\## 14. Code execution and submissions



Languages (version, build and run), kept in a registry table so more can be added without code changes: C (GCC 13, gcc -O2), C++ (G++ 13, C++20), Java (OpenJDK 21), Python 3.12, JavaScript (Node 20), TypeScript (5.4 on Node 20), Go 1.22, Rust 1.77, C# (.NET 8), Kotlin 1.9, PHP 8.3, Ruby 3.3, Swift 5.10, SQL (PostgreSQL 16). Each has a starter template, a time multiplier (slower runtimes get a longer limit) and a memory profile.



Submission API: POST /v1/submissions with code (max 64 KB), language, question id and an idempotency key. Validate, store code in object storage, write a row, enqueue a job, return 202 with an id. Results arrive over WebSocket with polling as fallback. Separate "run" (public tests and custom input, rate limited) from "submit" (all tests, final). Per-user and per-tenant rate limits.



Execution: each run uses a fresh microVM or gVisor sandbox with no network, read-only root, tmpfs scratch, cgroups v2 limits, seccomp allowlist, process count cap and output cap. Nothing is reused between runs. Limits per test: CPU time, wall time (about 2 to 3 times CPU), memory, stdout size, process count. Verdicts: Accepted, Wrong answer, Time limit, Memory limit, Runtime error, Output limit, Compile error. Public tests are shown to candidates; hidden tests are encrypted at rest, fetched by workers with short-lived scoped tokens and compared in a trusted judge outside the sandbox. Run public tests first, stop on compile error, fail fast on the first time-limit failure for large inputs. Result cache keyed by hash(code + language + test version). Warm pools per language, priority lanes (live interviews above bulk assessment), backpressure with an estimated wait.



Scale target: 2000 submissions per second at peak (roughly 2600 vCPUs with headroom, about 330 nodes of 8 vCPU, at about 1 vCPU-second per run), autoscaled on queue lag, p95 under 5 seconds for the first verdict. Provide a k6 or Locust load test, dashboards and alerts.

\## 15. Live interview room



Collaborative editor (Monaco + Yjs) with presence and named cursors, language switch, run and test results visible to both people. One owner node per room by consistent hashing; snapshots about every 30 seconds; update log stored for replay. Replay rebuilds the document at any time t with a timeline of run and event markers. The candidate view hides interviewer tools and hidden test inputs. Interviewer panel (private): suggested follow-ups, complexity explanation, notes mapped to a rubric. Optional video and audio with recording and the same consent screen. Structured evaluation: versioned rubric templates with weighted dimensions (problem decomposition, correctness and testing, complexity awareness, code quality, communication, handling hints, judgement about tools), behavioural anchors 1 to 4, and every score needs at least one evidence link (note quote, code line, run or replay timestamp).



\## 16. Similarity check



Normalize code: strip comments, replace identifiers and numbers with placeholders, keep keywords and operators, compare token 4-grams with Jaccard similarity so renamed copies still match. Compare each submission with all others in the test, earlier cohorts, and optionally known public solutions. Correlate with signals (same IP, paste events, timing) and show everything with a reading: Distinct, Some overlap, Review closely. State on the page that short problems can match by chance and that no tool can prove AI authorship; a person decides.



\## 17. AI features (each must earn its place and have guardrails)



1. Job description to assessment blueprint (skills, weights, problem types, time split, draft problems; a manager approves).

2. Adaptive follow-up questions from code, test results, run history and uncovered rubric dimensions (2 to 3 per request, tagged to a dimension, with what a strong answer sounds like; private to the interviewer).

3. Complexity failure explainer: run the code on growing input sizes (N, 2N, 4N), fit a curve, and let the model only narrate the measured result. Measured, never guessed.

4. Interview notes mapped to rubric: link note text to dimensions, highlight gaps, interviewer confirms each link, every mapping cites the exact note.

5. Hidden-test auditor and question drafting (section 10).

6. Scorecard draft from rubric ratings and linked evidence; editable.

7. AI interview question generation and transcript summaries for reviewers; summaries are drafts.

8. Problem variants with regenerated tests verified against the reference solution.



Guardrails: candidate code, notes and transcripts are untrusted input (prompt-injection safe); the model has no tools that can change scores or decisions; log prompt version, input hash, output, cost and who accepted each suggestion in ai\_runs; AI features are switchable per company.



\## 18. Data model (minimum)



companies, company\_members, colleges, college\_officers, students, tests, test\_audiences (college\_ids, batches, branches, min\_cgpa), test\_questions, questions (versions), question\_examples, question\_tests (visibility, encrypted blob, version), languages, invites, attempts, submissions, executions (per test verdict, cpu\_ms, mem\_kb), sessions (device, ip, user agent), proctor\_events, recordings, similarity\_results, rooms, room\_events (append-only, partitioned by time), rubric\_templates, evaluations, ratings, evidence, certificates, audit\_log, ai\_runs, consents (what was shown, when, version).



\## 19. Security and privacy



Strong sandbox isolation, dedicated worker nodes with no cloud credentials, regular patching, pen test plan. Signed upload URLs, size limits, per-IP and per-user rate limits, CSRF and CORS rules, secure cookies, argon2 password hashing, optional 2FA for admins. Row-level security for tenants, least-privilege service accounts, encrypted storage and secrets, backups. Consent records, retention policy with automatic deletion (default 30 days for recordings), data export and deletion requests, access logs of who viewed which recording. Compliance notes: India's DPDP Act, and automated employment tool rules elsewhere (NYC bias audits, EU AI Act). Include a bias and false-positive review checklist in the docs. Never print or commit secrets; .env must be in .gitignore and not tracked.



\## 20. Testing and quality



Unit tests (eligibility rules, similarity, scoring, risk weights). Integration tests that run against a real Postgres test database, not mocks, for: anonymous 401, wrong role 403, ineligible student 404, eligible student 200, officer approves only their own college, another company's admin blocked by company\_id. Mocked tests are allowed only if labelled unit tests. Integration tests for the submission pipeline, sandbox limits and hidden-test isolation. End-to-end tests (Playwright): company registration, student registration and verification, creating a test with an audience, a student outside the audience unable to see it, building a custom question, taking a test with camera and microphone, passing and moving to the next round, admin review. Sandbox tests for fork bombs, memory bombs, infinite loops, network access, large output and filesystem reads. Load test to 2000 submissions per second; chaos tests for worker crashes and queue backlog. Accessibility and visual checks in both themes at 360, 768 and 1280 px.



\## 21. Build order



\- Phase 1: repo, auth, roles, company registration and verification, college and student registry with verification, eligibility function with full tests, admin and candidate shells in the design system, docs (ARCHITECTURE.md, SECURITY.md, PRIVACY.md, RUNBOOK.md), migrations and seed running on the real Postgres.

\- Phase 2: test creation with audience, question builder and aptitude bank, candidate dashboard, practice and mocks.

\- Phase 3: submission API, queue, sandbox workers (Python and C++ first, then all languages), public and hidden tests, results over WebSocket.

\- Phase 4: consent and device check, camera and microphone, AI monitoring signals, recordings and reviewer screen, risk scoring.

\- Phase 5: similarity check, analytics, certificates, invites, leaderboard, skill reports.

\- Phase 6: live interview room, replay, rubric, AI interviewer helpers and AI interview rounds.

\- Phase 7: load test to 2000 per second, security review, accessibility pass, documentation, demo seed data.

After each phase: demo script I can follow by hand, tests green with raw output, short changelog.



\## 21b. Seed and demo data



A seed script with one verified company, four colleges, about 10 students across batches 2026 to 2029 (some pending), four tests with different audiences (batch 2028 at all colleges; CSE and IT at three colleges with CGPA 7 and above; an AI interview for CGPA 7.5 and above; an open mock for batches 2027 and 2028), two built-in questions plus one custom question, and sample submissions including two renamed copies and one brute-force solution. Seeded data is clearly labelled demo data.



\## 22. How to work



\- Start every session by reading PROMPT.md, PROGRESS.md and CLAUDE.md.

\- Keep docs/ARCHITECTURE.md, SECURITY.md, PRIVACY.md and RUNBOOK.md updated.

\- Do not invent features, fake metrics or placeholder numbers in the UI.

\- Whatever cannot run for real in a browser (compiling C++, Java, Rust and so on) runs only in the sandboxed workers. Do not fake results in production code.

\- Match section 3 on every screen and check it against the "Do NOT use" list before finishing.

\- Finish each phase with a demo script that works in PowerShell (Invoke-RestMethod or curl.exe).

\- Never delete, skip or weaken a test to make it pass. Never claim done, works or complete without pasting raw command output. If a command fails, show the error and fix the cause. Never guess credentials or probe databases with default passwords; ask me to fix .env.



