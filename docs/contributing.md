# Contribution workflow

`dev` is the default branch and the daily integration branch. `main` contains batches that passed full application verification. Releases use reviewed commits on `main`; the [release guide](releasing.md) owns package verification and publication.

## Start or resume work

1. Inspect the checkout, branch, and uncommitted files. Fetch `origin/dev` and `origin/main`.
2. Start routine feature, fix, test, and documentation branches from the fetched `origin/dev`. Name task branches `<type>/<short-description>`, such as `fix/reading-recovery`. For a new worktree, explicitly select `origin/dev` as its starting revision.
3. For an existing task branch or worktree, compare its changes with `origin/dev`, preserve local work, and merge the current development branch when integration is needed. An unavailable `origin/dev` requires restoring the development branch before selecting a routine task base.
4. Check for an open promotion PR from `dev` to `main`. While that PR is open, keep new features on their task branches and leave their development PRs open. Batch corrections follow the promotion procedure below.

## Complete a routine change

1. Implement one independently deliverable change. Run `npm run check`, `npm run test:smoke`, and the affected tests. The [test guide](../tests/README.md) defines their evidence scope.
2. Open the PR with an explicit `dev` base, for example `gh pr create --base dev`. Review the complete diff against that base. Existing PRs moving from `main` to `dev` require the same diff review and fresh checks.
3. When the user asks to submit and merge, verify the latest PR revision and the `CI gate` result, then merge with a merge commit. This completes the request on `dev`; main promotion follows its own user request.
4. Verify the resulting development-branch Checks run and report the PR, merge revision, and validation result. Keep the shared `dev` and `main` branches available for later batches.

Requests to implement a feature use the development base. Requests to submit a PR use the development target. Requests to merge a routine PR complete on `dev`. Requests to promote a batch or prepare a release enter the main-promotion procedure.

## Promote a batch to main

1. Fetch both branches and inspect every change in `origin/main...origin/dev`. The batch includes all development changes since the previous promotion. Confirm that the batch matches the requested delivery scope.
2. If `main` contains commits that `dev` has yet to receive, complete a synchronization PR with `main` as head and `dev` as base first.
3. Open `dev` to `main` as a promotion PR. Record the included work and the candidate revision in its description. The open PR marks the batch as fixed while full checks run.
4. Submit batch corrections through task PRs targeting `dev`. Each correction updates the promotion candidate and triggers fresh full checks. A failed full check keeps the promotion PR open for correction or removal of the failing change.
5. Confirm that the candidate includes current `main`, that its full `CI gate` passed, and that requested acceptance is complete. Merge with a merge commit and verify the main-branch quick checks.
6. Open and merge a synchronization PR from `main` back to `dev` when their histories differ. Use a merge commit, wait for the development checks, and confirm that `origin/main` is an ancestor of `origin/dev`. Routine integration then resumes.

The [Checks workflow](../.github/workflows/checks.yml) validates the PR merge result. Branch rules require current-base checks before merging. The main push performs quick confirmation; the promotion PR supplies the full regression evidence. Release preparation records both the promotion evidence and the resulting main revision.

## Fix a released version

For an explicitly requested urgent release fix, start a `fix/<short-description>` branch from current `origin/main` and target `main`. Complete the full gate and the required release acceptance. After merging, synchronize `main` back to `dev` through a checked PR. If a promotion is open, the new main commit requires updating and verifying that candidate again.

## Repository configuration

The GitHub default branch is `dev`. Active rulesets explicitly target `refs/heads/dev` and `refs/heads/main`. Each requires a PR, a successful GitHub Actions `CI gate`, and an up-to-date branch; merge commits preserve shared history. Both branches have deletion and force-push protection. The main ruleset uses the explicit main ref so changing the default branch retains main protection.

Manual full checks are available through Actions → Checks → Run workflow. Select `dev` or the task branch under investigation. Their evidence supports investigation; the PR-triggered gate supplies the merge requirement. Each PR and branch update cancels its older Checks run; manual runs have a separate concurrency group.

Homepage changes build during related PRs and deploy when they enter `main`. Ordinary development merges retain the current published homepage and desktop release. Publication follows the release owner's request and the [release acceptance](releasing.md#acceptance-and-publication).
