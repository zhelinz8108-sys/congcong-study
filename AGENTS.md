# Project delivery

- The user has authorized automatic production deployment for this project.
  After completing requested changes and passing the relevant checks, commit
  and push the changes to `main` to trigger `.github/workflows/deploy.yml`.
  Do not ask for deployment confirmation again unless the user explicitly
  requests local-only work, a draft, or no deployment for the current task.
- Check the deployment run for the exact published commit and verify its result
  before reporting that changes are live. If publication is blocked or fails,
  state the blocker and do not claim that deployment succeeded.
- Use the existing isolated release, preflight, backup, health-check and rollback
  workflow described in `study-plan/CLOUD_DEPLOYMENT.md`. Preserve production
  secrets, learning records, uploads and independently maintained learning media.
- Follow the additional application instructions in `study-plan/AGENTS.md`.
