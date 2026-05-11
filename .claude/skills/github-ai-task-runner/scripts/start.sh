# Sample
#   {
#   "next_step": "PICK_UP",
#   "message": "Ready to pick up",
#   "task": {
#     "id": "PVTI_lAHOAMABIs4BXQjWzgsX2tk", # ISSUE_ID
#     "projectItemDbId": 186112729,
#     "issueNumber": 3, # ISSUE_NUMBER
#     "title": "Test task - Gabor",
#     "url": "https://github.com/gaborfekete85/drone-space/issues/3",
#     "body": "Change the background to a drone on the welcome",
#     "labels": [
#       "Gabor",
#       "proirity:LOW"
#     ],
#     "status": "AI-Ready"
#   }
# }

ISSUE_ID=$1
ISSUE_NUMBER=$2
ISSUER=$3

ISSUE_URL="https://github.com/gaborfekete85/drone-space/issues/$ISSUE_NUMBER"
PROJECT_NUMBER="9"
OWNER="gaborfekete85"
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')

gh issue comment "$ISSUE_URL" --body "Started by $ISSUER"
STATUS_FIELD_ID=$(gh api graphql -f query='
query {
  user(login: "gaborfekete85") {
    projectV2(number: 9) {
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
          }
        }
      }
    }
  }
}' | jq -r '.data.user.projectV2.fields.nodes[]
  | select(.name == "Status")
  | .id')

IN_PROGRESS_OPTION_ID=$(gh api graphql -f query='
query {
  user(login: "gaborfekete85") {
    projectV2(number: 9) {
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}' | jq -r '
  .data.user.projectV2.fields.nodes[]
  | select(.name == "Status")
  | .options[]
  | select(.name == "In Progress")
  | .id
')

echo "Start to work on: ... "
echo "PROJECT_ID: $PROJECT_ID"
echo "ISSUE_ID: $ISSUE_ID"
echo "ISSUE_NUMBER: $ISSUE_NUMBER"
echo "STATUS_FIELD_ID: $STATUS_FIELD_ID"
echo "IN_PROGRESS_OPTION_ID: $IN_PROGRESS_OPTION_ID"

gh project item-edit \
  --id "$ISSUE_ID" \
  --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$IN_PROGRESS_OPTION_ID"
