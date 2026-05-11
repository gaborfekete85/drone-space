#!/usr/bin/env bash

set -euo pipefail

OWNER="gaborfekete85"
PROJECT_NUMBER="9"
LABEL_FILTER="${1:-Gabor}"

IN_PROGRESS_TASK=$(
  gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
    | jq --arg label "$LABEL_FILTER" '
        first(
          .items[]
          | select(.status == "Review" or .status == "In Progress")
          | select((.labels // []) | any(test($label; "i")))
          | {
              id,
              title,
              url,
              body: .content.body,
              labels,
              status
            }
        ) // empty
      '
)

if [[ -n "$IN_PROGRESS_TASK" ]]; then
  TASK_STATUS=$(printf '%s' "$IN_PROGRESS_TASK" | jq -r '.status')
  TASK_URL=$(printf '%s' "$IN_PROGRESS_TASK" | jq -r '.url // empty')

  if [[ "$TASK_STATUS" == "In Progress" && -n "$TASK_URL" && "$TASK_URL" != "null" ]]; then
    LAST_COMMENT=$(gh issue view "$TASK_URL" --json comments --jq '[.comments[]] | last | .body // ""' 2>/dev/null || echo "")
    if [[ "$LAST_COMMENT" == @Rework* ]]; then
      ISSUE_NUMBER=$(echo "$TASK_URL" | grep -o '[0-9]*$')
      jq -n \
        --argjson task "$IN_PROGRESS_TASK" \
        --arg rework "$LAST_COMMENT" \
        --arg issueNumber "$ISSUE_NUMBER" \
        '{
          next_step: "REWORK",
          message: "Rework requested",
          rework_instructions: $rework,
          task: ($task + {issueNumber: ($issueNumber | tonumber)})
        }'
      exit 0
    fi
  fi

  jq -n --argjson task "$IN_PROGRESS_TASK" '
    {
      next_step: "STOP",
      message: "Task in progress",
      task: $task
    }
  '
  exit 0
fi

gh api graphql -f query="
query {
  user(login: \"$OWNER\") {
    projectV2(number: $PROJECT_NUMBER) {
      items(first: 100) {
        nodes {
          id
          databaseId
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
              }
            }
          }
          content {
            ... on Issue {
              number
              title
              url
              body
              labels(first: 50) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
}
" | jq --arg label "$LABEL_FILTER" '
  def status:
    (.fieldValues.nodes[]
      | select(.field.name == "Status")
      | .name);

  def labels:
    (.content.labels.nodes | map(.name));

  def task:
    {
      id: .id,
      projectItemDbId: .databaseId,
      issueNumber: .content.number,
      title: .content.title,
      url: .content.url,
      body: .content.body,
      labels: labels,
      status: status
    };

  [
    .data.user.projectV2.items.nodes[]
    | select(.content != null)
    | select(status == "AI-Ready")
    | select(labels | any(test($label; "i")))
  ] as $items

  | (
      first($items[] | select(labels | any(test("^proirity:HIGH$"; "i"))) | task)
      //
      first($items[] | select(labels | any(test("^proirity:NORMAL$"; "i"))) | task)
      //
      first($items[] | select(labels | any(test("^proirity:LOW$"; "i"))) | task)
      //
      first(
        $items[]
        | select(labels | all(test("^proirity:"; "i") | not))
        | task
      )
    ) as $task

  | if $task == null then
      {
        next_step: "STOP",
        message: "No Task",
        task: null
      }
    else
      {
        next_step: "PICK_UP",
        message: "Ready to pick up",
        task: $task
      }
    end
'