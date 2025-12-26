---
description: How to query the RAG service on DEV to find code implementations
---
Use this workflow when you need to understand how a feature is implemented or find relevant code snippets without manually searching the entire codebase.

1.  Run the helper script with your query:
    ```bash
    ./scripts/rag-search.sh "your query here"
    ```
    
2.  Review the JSON output for file paths and code snippets.

Example:
```bash
./scripts/rag-search.sh "ticket history logging"
```
