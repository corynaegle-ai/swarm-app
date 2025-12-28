/**
 * AI Dispatcher Service
 * Central control point for all AI actions with approval checks
 * 
 * Phase 3 of HITL Implementation - PostgreSQL Migration
 * Updated: 2025-12-17
 */

const { queryOne, queryAll, execute } = require('../db');
const fs = require('fs');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const { chat, parseJsonResponse } = require('./claude-client');
const { clarificationAgent } = require('../agents/clarification-agent');
const { broadcast } = require('../websocket');

// Actions that require explicit user approval before execution
const APPROVAL_REQUIRED_ACTIONS = [
  'generate_tickets',
  'execute_ticket',
  'merge_pr',
  'delete_resource',
  'modify_infrastructure',
  'start_build'
];

// AI action permissions per session state
const AI_PERMISSIONS = {
  'input': ['suggest', 'validate_input'],
  'clarifying': ['clarify', 'summarize', 'suggest', 'check_completeness'],
  'ready_for_docs': ['generate_spec', 'summarize'],
  'reviewing': ['explain', 'suggest_edits', 'validate_spec'],
  'approved': ['generate_tickets', 'estimate', 'plan_execution'],
  'building': ['status_update', 'diagnose', 'decompose_ticket'],
  'completed': ['summarize', 'generate_report'],
  'failed': ['diagnose', 'suggest_fixes', 'summarize'],
  'cancelled': []
};

const BLOCKED_HINTS = {
  'input': { message: 'Waiting for initial project description', suggestedAction: 'submit_description', uiComponent: 'DescriptionForm' },
  'clarifying': { message: 'AI is asking clarifying questions', suggestedAction: 'answer_questions', uiComponent: 'ChatInterface' },
  'ready_for_docs': { message: 'Ready to generate specification', suggestedAction: 'generate_spec', uiComponent: 'GenerateSpecButton' },
  'reviewing': { message: 'Please review the generated specification', suggestedAction: 'approve_or_edit', uiComponent: 'SpecReviewPanel' },
  'approved': { message: 'Spec approved - ready to start build', suggestedAction: 'start_build', uiComponent: 'BuildStartPanel' },
  'building': { message: 'Build in progress - agents are working', suggestedAction: 'monitor', uiComponent: 'BuildProgressView' },
  'completed': { message: 'Session completed successfully', suggestedAction: null, uiComponent: 'CompletedView' },
  'failed': { message: 'Build failed - review errors and retry', suggestedAction: 'retry_or_cancel', uiComponent: 'FailureView' },
  'cancelled': { message: 'Session was cancelled', suggestedAction: 'restart', uiComponent: 'CancelledView' }
};

