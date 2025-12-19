/**
 * useSessionWebSocket - Convenience hook for HITL session real-time updates
 * Wraps useWebSocket with session-specific configuration
 */
import { useCallback, useMemo } from 'react';
import { useWebSocket, WS_STATE } from './useWebSocket';

/**
 * useSessionWebSocket - Subscribe to real-time updates for a HITL session
 * 
 * @param {string} sessionId - The HITL session ID to subscribe to
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onSessionUpdate - Called when session state/progress changes
 * @param {Function} callbacks.onNewMessage - Called when new message is added
 * @param {Function} callbacks.onApprovalNeeded - Called when approval is requested
 * @param {Function} callbacks.onBuildProgress - Called during build with progress updates
 * @param {Function} callbacks.onError - Called on WebSocket errors
 * @param {boolean} enabled - Whether to connect (default: true)
 * 
 * @example
 * const { isConnected } = useSessionWebSocket(sessionId, {
 *   onSessionUpdate: (data) => setSession(s => ({ ...s, ...data })),
 *   onNewMessage: (msg) => setMessages(m => [...m, msg]),
 *   onApprovalNeeded: (data) => showApprovalModal(data)
 * });
 */
export function useSessionWebSocket(sessionId, callbacks = {}, enabled = true) {
  const {
    onSessionUpdate,
    onNewMessage,
    onApprovalNeeded,
    onApprovalResolved,
    onBuildProgress,
    onSpecGenerated,
    onTicketsGenerated,
    onError,
    onConnect,
    onDisconnect
  } = callbacks;

  // Build handlers object for useWebSocket
  const handlers = useMemo(() => ({
    // Session state changes
    'session:update': (data) => {
      if (data.sessionId === sessionId && onSessionUpdate) {
        onSessionUpdate({
          state: data.state,
          progress: data.progress,
          updatedAt: data.updatedAt
        });
      }
    },

    // New message in session
    'session:message': (data) => {
      if (data.sessionId === sessionId && onNewMessage) {
        onNewMessage({
          id: data.messageId,
          role: data.role,
          content: data.content,
          messageType: data.messageType,
          createdAt: data.createdAt
        });
      }
    },

    // Approval requested
    'approval:requested': (data) => {
      if (data.sessionId === sessionId && onApprovalNeeded) {
        onApprovalNeeded({
          approvalId: data.approvalId,
          action: data.action,
          context: data.context
        });
      }
    },

    // Approval resolved (approved/rejected)
    'approval:resolved': (data) => {
      if (data.sessionId === sessionId && onApprovalResolved) {
        onApprovalResolved({
          approvalId: data.approvalId,
          status: data.status,
          resolvedBy: data.resolvedBy
        });
      }
    },

    // Build progress updates
    'build:progress': (data) => {
      if (data.sessionId === sessionId && onBuildProgress) {
        onBuildProgress({
          percent: data.percent,
          currentTask: data.currentTask,
          completedTasks: data.completedTasks,
          totalTasks: data.totalTasks
        });
      }
    },

    // Spec generated
    'spec:generated': (data) => {
      if (data.sessionId === sessionId && onSpecGenerated) {
        onSpecGenerated({
          specId: data.specId,
          specContent: data.specContent
        });
      }
    },

    // Tickets generated
    'tickets:generated': (data) => {
      if (data.sessionId === sessionId && onTicketsGenerated) {
        onTicketsGenerated({
          ticketCount: data.ticketCount,
          tickets: data.tickets
        });
      }
    },

    // Error handler
    onError: onError,
    
    // Connection handlers
    onConnect: onConnect,
    onDisconnect: onDisconnect

  }), [
    sessionId, 
    onSessionUpdate, 
    onNewMessage, 
    onApprovalNeeded,
    onApprovalResolved,
    onBuildProgress,
    onSpecGenerated,
    onTicketsGenerated,
    onError,
    onConnect,
    onDisconnect
  ]);

  // Room name for this session
  const room = sessionId ? `session:${sessionId}` : null;

  // Use base WebSocket hook
  const ws = useWebSocket({
    room,
    handlers,
    enabled: enabled && !!sessionId,
    config: {
      debug: process.env.NODE_ENV === 'development'
    }
  });

  return {
    ...ws,
    sessionId
  };
}

export default useSessionWebSocket;
