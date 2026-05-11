---
name: github-ai-task-runner
description: Query a GitHub project board, pick the first Ready for AI task matching a configured tag, move it through workflow states, create a branch, implement, test, commit, push, and deploy for online testing.
allowed-tools: Bash Read Write Edit MultiEdit Grep Glob Task
---

# GitHub AI Task Runner

Use this skill when the user asks Claude to pick up a GitHub project-board task from a "Ready for AI" column and implement it.

## Required MCP/tools

Prefer the GitHub MCP server when available. Otherwise use the GitHub CLI:

- `gh`
- `git`
- repository write access
- project board access
- a deploy script configured in `config.json`

Before making changes, inspect:

```bash
cat .claude/skills/github-ai-task-runner/config.json
```

## Workflow

### 1. Load config

```bash
LABEL=$(jq -r '."label-id"' .claude/skills/github-ai-task-runner/config.json)
```

`config.json` also holds `owner`, `project_number`, `ready_column`, `in_progress_column`, `ready_for_review_column`, and deploy settings — read whichever the current step needs.

### 2. Find the next task

Run the helper script. It picks the highest-priority item (`HIGH` → `NORMAL` → `LOW`) in the configured ready column whose labels contain the given label-id.

```bash
RESPONSE=$(.claude/skills/github-ai-task-runner/scripts/get_next.sh "$LABEL")
```

 - IF `"next_step"` is `"REWORK"` → jump to the **Rework Flow** section below and follow it exclusively
 - IF `"next_step"` is anything other than `"PICK_UP"` or `"REWORK"` → STOP and report the current state from the json message

The response is either the literal string `No task` (no match in any priority bucket), or a single compact JSON object like:

```json
{
  "id": "PVTI_lAHOAMABIs4BXQjWzgsX46o",
  "title": "Test Task3",
  "url": null,
  "body": "Test Tas3",
  "labels": ["Gabor", "proirity:HIGH"]
}
```

### 3. Identify the task



- If `$RESPONSE` equals `No task` → STOP and respond `No Task`.
- Otherwise parse the `id` and `title` from the response.

```bash
if [ "$RESPONSE" = "No task" ]; then
  echo "No Task"
  exit 0
fi

# IMPORTANT: use `printf '%s'` (not `echo`) — body fields contain JSON `\n`
# escape sequences that `echo` would expand into real newlines, breaking
# the re-parse with a "control characters must be escaped" error.
ID=$(printf '%s' "$RESPONSE" | jq -r '.id')
TITLE=$(printf '%s' "$RESPONSE" | jq -r '.title')
```

### 4. Confirm the title via the resolved id

The `title` field returned by step 2 comes straight from the project board entry. If the project item is backed by a real GitHub issue (i.e. `.url` is non-null), re-fetch the canonical title from the issue itself to make sure the board entry isn't stale:

```bash
URL=$(printf '%s' "$RESPONSE" | jq -r '.url')
if [ "$URL" != "null" ] && [ -n "$URL" ]; then
  TITLE=$(gh issue view "$URL" --json title --jq '.title')
fi
# For draft items (url == null) the project-board title is authoritative.
```

### 5. Report back

Respond to Claude with the resolved id + title, or `No Task` if step 2 found nothing:

```bash
echo "id    : $ID"
echo "title : $TITLE"
```

## Why `printf` instead of `echo`?

`zsh`'s built-in `echo` interprets backslash escape sequences in some configurations, so `echo "$RESPONSE"` can turn the `\n` characters inside a JSON string field into real newlines. Re-parsing that mangled JSON with `jq` then fails with *"Invalid string: control characters from U+0000 through U+001F must be escaped"*. Using `printf '%s'` (or `<<<"$RESPONSE"`) preserves the bytes verbatim and the re-parse is safe.

### Step6: Create a worktree
 - Before branching out make sure you are on the main branch and pull all the changes by git pull origin main
 - The worktree folder must be under .claude/worktrees/DRN-${ISSUE_NUMBER}
 - Worktree name: DRN-${ISSUE_NUMBER} from the json responded by the get_next.sh
 - The branch name also must be DRN-${ISSUE_NUMBER}

 ### Step7: Implement
  - Under the worktree start the implementation based on the description of the issue
  - Run the start.sh under the scripts folder as ./start.sh ${ISSUE_ID} ${ISSUE_NUMBER} ${ISSUER} where ISSUE_ID is task.id from the previous step json, ISSUE_NUMBER is task.issueNumber from the previous step json and ISSUER is the label-id from the config.json

 ### Step8: Push and create pull request
  - Commit message: Short one line summary of the changes
  - Push the changes to the branch
  - Open a pull request
  - The PR body MUST include `Closes #${ISSUE_NUMBER}` so GitHub links the PR to the issue. When the PR is merged GitHub will automatically close the issue and project automation will move it to Done.

### Step9: Deploy the current change: 
 - Enter into the .claude/worktrees/DRN-${ISSUE_NUMBER} folder and deploy from the folder where the changes has been made ... as a docker image needs to be created from the new content including the changes from the worktree
 - Under the scripts run the ./redeploy.sh
 - Run this .claude/worktrees/DRN-${ISSUE_NUMBER}/script/redeploy.sh -b -n ${NAMESPACE} - where namespace is coming from the deploy_namespace variable of the config.json

### Step10: Document changes: 
  - Add a comment to the issue: 
    - Add the Available at: https://${NAMESPACE}.findipend.com
    - Bullet point listed changes has been accomplished separated sections for backend, frontend, Infrastructure

### Step11: Push to Review state
  - Push the the issue into the Review column

---

## Rework Flow

Triggered when `get_next.sh` returns `"next_step": "REWORK"`. The task is already "In Progress"; its last issue comment starts with `@Rework` and contains the instructions.

### RW-1: Parse rework context

```bash
ISSUE_NUMBER=$(printf '%s' "$RESPONSE" | jq -r '.task.issueNumber')
TASK_ID=$(printf '%s' "$RESPONSE" | jq -r '.task.id')
TASK_URL=$(printf '%s' "$RESPONSE" | jq -r '.task.url')
# Strip the @Rework prefix to get plain instructions
REWORK_INSTRUCTIONS=$(printf '%s' "$RESPONSE" | jq -r '.rework_instructions' | sed 's/^@Rework[[:space:]]*//')
```

### RW-2: Re-use or restore the worktree

Check whether the worktree already exists. If it does, use it as-is. If not, create it from the existing remote branch so work stays on the same branch and PR:

```bash
WORKTREE_PATH=".claude/worktrees/DRN-${ISSUE_NUMBER}"
BRANCH="DRN-${ISSUE_NUMBER}"

if [ ! -d "$WORKTREE_PATH" ]; then
  # Branch exists on remote — check it out into a new worktree
  git fetch origin "$BRANCH"
  git worktree add "$WORKTREE_PATH" "$BRANCH"
fi
```

### RW-3: Implement the rework

Read `$REWORK_INSTRUCTIONS` carefully and make the required changes inside `$WORKTREE_PATH`. Do not change anything unrelated to those instructions.

### RW-4: Commit and push

```bash
cd "$WORKTREE_PATH"
git add -p   # stage only relevant changes
git commit -m "Rework: <one-line summary of what was aligned>"
git push origin "$BRANCH"
```

### RW-5: Deploy

Same as the normal Step 9 — run from inside the worktree:

```bash
cd "$WORKTREE_PATH"
./scripts/redeploy.sh -b -n ${NAMESPACE}
# NAMESPACE comes from deploy_namespace in config.json
```

### RW-6: Add rework-resolution comment

Add a comment to the issue documenting what was aligned:

- `Available at: https://${NAMESPACE}.findipend.com`
- Bullet-pointed list of what was changed to satisfy the rework instructions
- Separated sections for Frontend / Backend / Infrastructure (omit empty sections)

### RW-7: Move issue back to Review

Push the project board item back to the configured `ready_for_review_column` (same GraphQL mutation used in normal Step 11).