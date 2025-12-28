INSERT INTO tickets (id, project_id, title, description, acceptance_criteria, state, estimated_scope, created_at)
VALUES (
  'fix-estimate-calc-001',
  'swarm-platform',
  'Fix Ticket Generator Estimate Calculation',
  '[backend] Remove AI-hallucinated estimatedDays field. Calculate estimates programmatically from ticket scope values.

Scope definitions:
- small: 1.5 hrs, 1 point
- medium: 3 hrs, 3 points  
- large: 6 hrs, 5 points

Implementation:
1. Remove estimatedDays from AI prompt
2. Add calculateEstimates() function
3. Return estimates object with totalHours, totalPoints, soloDays, teamDays, breakdown

Files: /opt/swarm-platform/services/ai-dispatcher.js - executeGenerateTickets method',
  '["AI prompt no longer asks for estimatedDays","estimates object returned with calculated values","totalHours matches sum of scope hours","soloDays equals ceil of totalHours divided by 8","breakdown shows count per scope category"]',
  'draft',
  'small',
  datetime('now')
);
