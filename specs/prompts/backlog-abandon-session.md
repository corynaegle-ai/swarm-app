# Feature: Abandon Backlog Chat Session

## Summary
Add ability to abandon a backlog item that is in the "chatting" state, returning it to a deletable state.

## Context
When a user starts a clarification chat on a backlog item, it enters the "chatting" state. Currently there's no way to abandon this session if the user decides they don't want to proceed. The item gets stuck in "chatting" and cannot be deleted.

## Requirements

### UI Changes (Backlog.jsx)

1. **Add "Abandon Session" button** in the chat panel when:
   - Item is selected
   - Item state is "chatting"
   - Chat mode is active

2. **Button styling**:
   - Red/danger style to indicate destructive action
   - Icon: X or Trash2 from lucide-react
   - Text: "Abandon Session" or "Cancel Chat"

3. **Confirmation modal**:
   - Show confirmation before abandoning
   - Message: "Are you sure you want to abandon this chat session? The item will return to draft state and chat history will be cleared."
   - Buttons: "Cancel" / "Abandon Session"

4. **After abandoning**:
   - Close chat mode
   - Deselect item
   - Refresh items list
   - Show success toast: "Session abandoned"

### Backend Changes (backlog.js)

1. **New endpoint**: `POST /api/backlog/:id/abandon`
   - Requires auth
   - Validates item exists and belongs to tenant
   - Validates item is in "chatting" state
   - Updates item state to "draft"
   - Clears chat_history (set to empty array or null)
   - Returns updated item

2. **Response**:
   - 200: `{ success: true, item: {...} }`
   - 400: `{ error: "Item is not in chatting state" }`
   - 404: `{ error: "Item not found" }`

### Database Changes
None required - uses existing columns:
- `state` column (change from 'chatting' to 'draft')
- `chat_history` column (clear it)

## Acceptance Criteria

- [ ] Abandon button only visible when item is in "chatting" state
- [ ] Confirmation modal prevents accidental abandonment
- [ ] After abandoning, item state becomes "draft"
- [ ] After abandoning, chat history is cleared
- [ ] Item can be deleted after being abandoned
- [ ] Success/error toasts provide feedback
- [ ] Counts update correctly after state change

## Files to Modify

1. `/opt/swarm-app/apps/dashboard/src/pages/Backlog.jsx`
   - Add abandon button in chat panel
   - Add confirmation modal state
   - Add handleAbandon function

2. `/opt/swarm-app/apps/platform/routes/backlog.js`
   - Add POST /:id/abandon endpoint

## Testing

1. Start a chat on a draft backlog item
2. Click "Abandon Session" button
3. Confirm in modal
4. Verify item returns to draft state
5. Verify item can now be deleted
6. Verify chat history is cleared if you start a new chat
