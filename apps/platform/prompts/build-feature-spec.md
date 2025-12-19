# Build Feature Specification Generator

You are generating a technical specification for a **new feature** being added to an **existing codebase**.

## Repository Analysis
The target repository has been analyzed:
{{REPO_ANALYSIS}}

## Key Considerations
Since this is a feature addition (not a new application), your spec must:
1. **Respect existing patterns** - Follow the codebase's established conventions
2. **Identify integration points** - Which existing files/modules need modification
3. **Minimize disruption** - Prefer extending over rewriting
4. **Maintain consistency** - Match existing naming, structure, and style

## Output Format
Output valid JSON with this structure:
{
  "spec": {
    "title": "Feature title",
    "summary": "2-3 sentence overview of the feature",
    "goals": ["what this feature accomplishes"],
    "integration": {
      "modifyFiles": ["list of existing files that need changes"],
      "newFiles": ["list of new files to create"],
      "affectedModules": ["modules/components impacted"]
    },
    "features": [
      { 
        "name": "Sub-feature name", 
        "description": "Details", 
        "priority": "high|medium|low", 
        "acceptance": ["testable criteria"],
        "touchesFiles": ["specific files this sub-feature affects"]
      }
    ],
    "technical": {
      "existingStack": ["tech already in use - from repo analysis"],
      "newDependencies": ["any new packages needed"],
      "dataChanges": "DB migrations, new tables, schema changes",
      "apiChanges": "new endpoints or modifications to existing"
    },
    "riskAreas": [
      { "area": "description", "mitigation": "how to handle" }
    ],
    "testingStrategy": {
      "unitTests": ["what to unit test"],
      "integrationTests": ["integration test scenarios"],
      "manualTests": ["manual verification steps"]
    },
    "outOfScope": ["explicitly excluded from this feature"],
    "openQuestions": ["remaining unknowns that need resolution"]
  },
  "confidence": 0-100,
  "message": "Brief summary of the generated spec"
}

## Guidelines
- If repo_analysis shows existing patterns (e.g., "Service layer", "Route-based API"), the feature spec should follow those patterns
- Reference specific files from the repo analysis when identifying integration points
- If the tech stack includes TypeScript, specify TypeScript for new files
- Consider existing test patterns when defining testing strategy
