  /**
   * Send ticket state update
   */
  ticketUpdate(ticketId, state, extra = {}) {
    // Broadcast to ticket-specific room
    this.toRoom(`ticket:${ticketId}`, 'ticket:update', {
      ticketId,
      state,
      ...extra
    });
    
    // Also broadcast to project room if projectId provided
    if (extra.projectId) {
      this.toRoom(`project:${extra.projectId}`, 'ticket:update', {
        ticketId,
        state,
        ...extra
      });
    }
    
    // Also broadcast to session room if sessionId provided
    if (extra.sessionId) {
      this.toSession(extra.sessionId, 'ticket:update', {
        ticketId,
        state,
        ...extra
      });
    }
  },

  /**
   * Send ticket progress (for long-running operations)
   */
  ticketProgress(ticketId, phase, message, extra = {}) {
    this.toRoom(`ticket:${ticketId}`, 'ticket:progress', {
      ticketId,
      phase,
      message,
      ...extra
    });
    
    if (extra.projectId) {
      this.toRoom(`project:${extra.projectId}`, 'ticket:progress', {
        ticketId,
        phase,
        message,
        ...extra
      });
    }
  },

  /**
   * Send PR created notification
   */
  prCreated(ticketId, prUrl, extra = {}) {
    this.toRoom(`ticket:${ticketId}`, 'pr:created', {
      ticketId,
      prUrl,
      ...extra
    });
    
    if (extra.projectId) {
      this.toRoom(`project:${extra.projectId}`, 'pr:created', {
        ticketId,
        prUrl,
        ...extra
      });
    }
    
    if (extra.sessionId) {
      this.toSession(extra.sessionId, 'pr:created', {
        ticketId,
        prUrl,
        ...extra
      });
    }
  }
