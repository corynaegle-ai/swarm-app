#!/bin/bash

# Usage: ./scripts/rag-search.sh "your query here"

QUERY=$1
LIMIT=${2:-5}
HOST="root@134.199.235.140"
KEY="~/.ssh/swarm_key"

if [ -z "$QUERY" ]; then
  echo "Usage: ./scripts/rag-search.sh \"query string\" [limit]"
  exit 1
fi

# Escape double quotes in query
ESCAPED_QUERY=$(echo "$QUERY" | sed 's/"/\\"/g')

# Get remote URL from git config
REPO_URL=$(git config --get remote.origin.url)

CMD="curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"$ESCAPED_QUERY\", \"repoUrls\": [\"$REPO_URL\"], \"limit\": $LIMIT, \"maxTokens\": 200}'"

ssh -i $KEY $HOST "$CMD"
