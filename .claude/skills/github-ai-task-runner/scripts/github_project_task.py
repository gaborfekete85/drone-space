#!/usr/bin/env python3
"""
Helper script for Claude.

Claude may run this script to inspect config and prepare GitHub CLI commands.
Project v2 field mutation is intentionally left to gh/graphql or GitHub MCP,
because project field IDs differ per repo.
"""

import json
from pathlib import Path

CONFIG_PATH = Path(".claude/skills/github-ai-task-runner/config.json")

if not CONFIG_PATH.exists():
    CONFIG_PATH = Path(".claude/skills/github-ai-task-runner/config.example.json")

config = json.loads(CONFIG_PATH.read_text())

owner = config["owner"]
repo = config["repo"]
label = config["required_label"]

print("Loaded GitHub AI task runner config")
print(f"Repository: {owner}/{repo}")
print(f"Required label: {label}")
print()
print("Suggested issue query:")
print(
    f'gh issue list --repo {owner}/{repo} '
    f'--label "{label}" --state open --limit 20 --json number,title,labels,url'
)