#!/bin/bash
# Add WebSocket notification calls to Engine state transition methods

cd /opt/swarm/engine/lib

# claimTicket - add notification before return (after line 161)
sed -i '161a\        if (result.rowCount > 0) notifyTicketStateChange(ticketId, "in_progress", { vmId });' engine.js

# completeTicket - add notification after query (after line 176 - adjusted for +1 line)
sed -i '176a\        notifyTicketStateChange(ticketId, "done");' engine.js

# failTicket - add notification after query (after line 189 - adjusted for +2 lines)
sed -i '189a\        notifyTicketStateChange(ticketId, "cancelled", { error });' engine.js

# releaseTicket - add notification after query (after line 202 - adjusted for +3 lines)  
sed -i '202a\        notifyTicketStateChange(ticketId, "ready");' engine.js

# setInReview - add notification after query (after line 215 - adjusted for +4 lines)
sed -i '215a\        notifyTicketStateChange(ticketId, "in_review", { prUrl });' engine.js

# setNeedsReview - add notification after query (after line 228 - adjusted for +5 lines)
sed -i '228a\        notifyTicketStateChange(ticketId, "needs_review");' engine.js

# setVerifying - add notification after query (after line 238 - adjusted for +6 lines)
sed -i '238a\        notifyTicketStateChange(ticketId, "verifying");' engine.js

echo "Done"
