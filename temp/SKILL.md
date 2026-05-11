---
name: github-ai-task-runner
description: Query a GitHub project board, pick the first Ready for AI task matching a configured tag, move it through workflow states, create a branch, implement, test, commit, push, and deploy for online testing.
allowed-tools: Bash Read Write Edit MultiEdit Grep Glob Task
---

# GitHub AI Task Runner

Use this skill when the user asks Claude to pick up a GitHub project-board task from a “Ready for AI” column and implement it.

## Required MCP/tools

Prefer the GitHub MCP server when available. Otherwise use the GitHub CLI:

- `gh`
- `git`
- repository write access
- project board access
- a deploy script configured in `config.json`

Before making changes, inspect:

```bash
cat .claude/skills/github-ai-task-runner/config.json 2>/dev/null || cat .claude/skills/github-ai-task-runner/config.json
```

## Workflow
1. Load config.
2. Find issues/cards in the configured `ready_column`.

 - Task pickup rule
   - Before picking a new task from `ready_column`, first check that there is ano item in `ready_for_review_column` matching `required_label`.
   - If there is no matching item in `ready_for_review_column` then the task can be picked up and move to `in_progress_column`
   - No eligible task pickup: In this case just do nothing

3. Pick the first issue matching required_label.
Create a new branch:
```
git checkout main
git pull
git checkout -b ai/issue-ISSUE_ID
```

Move the project item to `in_progress_column`.
Add an issue comment:
```
Task has been started by the `owner`_claude field from to config
```

 - Inspect the issue, repository, and relevant files.
    - Use subagents when useful:
       - backend agent for API/database/server logic
       - frontend agent for UI/client changes
       - devops agent for deployment, CI, infra, scripts
- Run tests, lint, and type checks when available.

Commit changes:
```
git add .
git commit -m "Implement issue #ISSUE_ID"
git push -u origin ai/issue-ISSUE_ID
```

Invoke deploy script:
```
DEPLOY_NAMESPACE=preview ISSUE_ID=ISSUE_ID .claude/skills/github-ai-task-runner/scripts/deploy_issue.sh
```
 - Move the project item to ready_for_review_column.
 - Add a final comment with:
    - branch name
    - commit hash
    - test results
    - deployment namespace / URL if available
    - Safety rules

# Constraint rules
 - Do not start more than one issue unless explicitly asked.
 - Do not overwrite user changes.
 - If working tree is dirty, inspect before changing.
 - If tests fail, do not move to Ready for Review unless the failure is unrelated and clearly documented.
 - Never expose tokens or secrets.