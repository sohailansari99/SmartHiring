# Architecture

Signal is a multi-tenant hiring platform.
- **Eligibility**: The core access rule (server-side).
- **Isolation**: Every query is `company_id`-partitioned.
- **Pipeline**: Submission -> Queue -> Sandbox Worker -> Judge -> Result.
