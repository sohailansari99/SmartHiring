# Rules for this repository

Read these at the start of every session: PROMPT.md (the spec), PROGRESS.md (what is verified), this file.

1. Never delete, skip or weaken a test to make it pass. Fix the code.
2. Never say "done", "works", "fixed" or "complete" unless you ran the command and pasted the raw output.
3. If a command fails, show the error and fix the cause. Do not hide it.
4. Never guess database or API credentials. Never print or commit secrets. If DATABASE_URL is wrong, stop and ask me to fix .env.
5. Mocked tests are unit tests and must be labelled so. Access rules (401, 403, 404, 200) need integration tests against the real Postgres test database.
6. Do not use any header such as x-student-id for identity. Identity comes from the signed-in session only.
7. One commit per step, with a clear message. Update PROGRESS.md after every step with the evidence (command and result).
8. Follow the design rules in PROMPT.md section 3 for every screen.
9. Do not start the next phase until I have run the demo for the current one.
10. Ask one short question when something is unclear. Do not invent requirements.
