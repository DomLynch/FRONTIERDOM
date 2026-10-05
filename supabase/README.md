# Supabase compatibility boundary

No Supabase project has been created or connected. `../server/schema.sql` is plain PostgreSQL, in private unexposed schema `frontierdom`, with RLS and no grants/policies for browser roles. The Node API uses a restricted direct database login, not client Supabase mutations. Guest sessions are not yet Supabase Auth users; no claim of Auth integration or cross-device recovery.

When the dedicated project is selected, inspect its actual PostgreSQL version, connection/TLS settings, grants and exposed schemas. Generate the first migration using the installed CLI's discovered `supabase migration new` command, then copy the reviewed bootstrap SQL into that generated file; do not invent migration history or run changes against another project's database. Check current changelog/docs and database advisors, apply only to the approved dedicated project, and repeat isolation/concurrency/recovery checks with that target.

Do not provision paid plans, store keys in Git or expose this private schema to browser Data API access. Supabase managed backups/retention are unverified and require checking the selected plan and a restore rehearsal.
