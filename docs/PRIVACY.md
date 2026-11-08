# Signal — Privacy Policy (Draft for Phase 1)

## Who we are

Signal is a technical hiring platform operated by the contributing company. Contact: privacy@[your-domain].com.

## What data we collect

| Category | Fields | Purpose | Retention |
|----------|--------|---------|-----------|
| Company | name, domain, industry, contactEmail | Identity and verification | Until deletion request |
| User accounts | email, hashedPassword, name | Authentication | Account lifetime |
| Students | name, rollNo, collegeEmail, branch, batchYear, cgpa, status | Eligibility screening | Until deletion request |
| Officers | userId → college mapping | Approve/reject authority | Until removal |
| Tests | name, type, duration, passMark, openAt, closeAt, audience rules | Assessment scheduling | Per company policy |
| Questions | title, difficulty, topics, starterCode, referenceSolution | Test content | Per company policy |
| Submissions | attempt answers, scores, time spent | Grading & results | 2 years after assessment |
| Audit log | action, summary, actorType, timestamp | Compliance | Indefinite (append-only) |

We do **not** collect biometric data, device fingerprinting, or keystroke dynamics in Phase 1.

## Legal basis for processing

- **Legitimate interest** — evaluating candidates for employment (students, officers)
- **Consent** — where required by local law for profiling or marketing
- **Contractual necessity** — running assessments agreed between candidate and employer

## Data sharing

We do not sell personal data. Data may be shared with:
- The recruiting company (as data controller)
- Hosted infrastructure providers (AWS/GCP/Azure) under data-processing agreements
- Law enforcement when required by valid legal process

## Rights of data subjects

Candidates and employees may request:
- Access to their data (export as JSON)
- Rectification of incorrect information
- Erasure ("right to be forgotten") where no retention obligation applies
- Portability to another provider (CSV export on request)

Requests should be sent to [privacy email]. We respond within 30 days.

## Cookies

We set one session cookie (`token`) containing a JWT. It is:
- httpOnly (not readable by JavaScript)
- sameSite=lax (CSRF mitigation)
- Secure flag in production (HTTPS only)
- Expires after 1 hour of inactivity

No tracking or advertising cookies are used.

## Children's data

We do not knowingly collect data from persons under 16. If we learn we have, we will delete it promptly.

## Changes to this policy

We will notify registered users by email of material changes and post the updated version on our website.

---
*This document reflects Phase 1 implementation. Sections marked "(not built)" are placeholders for features to come.*
