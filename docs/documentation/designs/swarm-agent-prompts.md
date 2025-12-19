# Swarm Agent Prompts

## Interview Agent
Gathers requirements via conversation. Asks one question at a time. Emits section completions as JSON.

## Decomposer Agent
Transforms spec into tickets. Rules: 1 interface per ticket, 12K token max, required acceptance criteria, explicit DAG deps.

## Coder Agent
Implements single ticket. Emits checkpoints: code_block, file_written, test_run, completed. Never exceeds scope.

## Sentinel Agent (Review)
Tiered review: Pass 1 (diff only), Pass 2 (related files), Pass 3 (full context). Validates acceptance criteria.
Verdicts: approved, changes_requested, escalated (after 3 passes).

## Shared Context
Injected to all agents: tech_stack, conventions (naming, structure, patterns), environment vars.

## Escalation Protocol
3 attempts → human. Escalation payload includes ticket_id, attempts, last_error, suggested_action.
