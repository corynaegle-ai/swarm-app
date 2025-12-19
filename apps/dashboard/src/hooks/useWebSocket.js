/**
 * useWebSocket - Real-time WebSocket hook for HITL updates
 * Replaces polling with push-based updates
 * 
 * Features:
 * - Auto-connect with authentication
 * - Room-based subscriptions (session, tenant)
 * - Auto-reconnect with exponential backoff
 * - Event handler registration
 * - Connection state management
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// WebSocket connection states
export const WS_STATE = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

// Default configuration
const DEFAULT_CONFIG = {
  reconnectAttempts: 5,
  reconnectBaseDelay: 1000,  // 1 second
  reconnectMaxDelay: 30000,  // 30 seconds
  heartbeatInterval: 30000,  // 30 seconds
  debug: true  // Enable for debugging
};

/**
 * Get WebSocket URL based on current location with auth token
 */
function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  
  // Get JWT token from localStorage
  const token = localStorage.getItem('swarm_token');
  
  if (!token) {
    console.warn('[WebSocket] No auth token found in localStorage');
    return null;
  }
  
  return `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * useWebSocket Hook
 * 
 * @param {Object} options
 * @param {string} options.room - Room to subscribe to (e.g., 'session:123')
 * @param {Object} options.handlers - Event handlers { eventName: callback }
 * @param {boolean} options.enabled - Whether to connect (default: true)
 * @param {Object} options.config - Override default config
 * 
 * @returns {Object} { state, send, subscribe, unsubscribe, isConnected }
 */
export function useWebSocket({ room, handlers = {}, enabled = true, config = {} } = {}) {
  const [state, setState] = useState(WS_STATE.DISCONNECTED);
  const [lastMessage, setLastMessage] = useState(null);
  
  const wsRef = useRef(null);
  const handlersRef = useRef(handlers);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const mountedRef = useRef(true);
  
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Keep handlers ref updated
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Debug logger
  const log = useCallback((...args) => {
    if (cfg.debug) {
      console.log('[WebSocket]', ...args);
    }
  }, [cfg.debug]);

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(
      cfg.reconnectBaseDelay * Math.pow(2, reconnectAttemptRef.current),
      cfg.reconnectMaxDelay
    );
    return delay;
  }, [cfg.reconnectBaseDelay, cfg.reconnectMaxDelay]);

  // Start heartbeat to keep connection alive
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        log('Heartbeat sent');
      }
    }, cfg.heartbeatInterval);
  }, [cfg.heartbeatInterval, log]);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Subscribe to a room
  const subscribe = useCallback((roomId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      log('Subscribing to', roomId);
      wsRef.current.send(JSON.stringify({ type: 'subscribe', room: roomId }));
    }
  }, [log]);

  // Unsubscribe from a room
  const unsubscribe = useCallback((roomId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      log('Unsubscribing from', roomId);
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', room: roomId }));
    }
  }, [log]);

  // Send a message
  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      wsRef.current.send(payload);
      return true;
    }
    return false;
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      setLastMessage(data);
      log('Message received:', data.type);

      // Route to appropriate handler
      const handler = handlersRef.current[data.type];
      if (handler) {
        handler(data);
      }

      // Always call onMessage if defined
      if (handlersRef.current.onMessage) {
        handlersRef.current.onMessage(data);
      }
    } catch (err) {
      console.error('[WebSocket] Failed to parse message:', err);
    }
  }, [log]);

  // Attempt reconnection
  const attemptReconnect = useCallback(() => {
    if (!mountedRef.current || reconnectAttemptRef.current >= cfg.reconnectAttempts) {
      log('Max reconnect attempts reached');
      setState(WS_STATE.ERROR);
      return;
    }

    setState(WS_STATE.RECONNECTING);
    const delay = getReconnectDelay();
    log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1}/${cfg.reconnectAttempts})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptRef.current++;
      connect();
    }, delay);
  }, [cfg.reconnectAttempts, getReconnectDelay, log]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = getWebSocketUrl();
    if (!url) {
      log('Cannot connect - no auth token');
      setState(WS_STATE.ERROR);
      return;
    }

    setState(WS_STATE.CONNECTING);
    log('Connecting to', url.replace(/token=[^&]+/, 'token=***'));

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        if (!mountedRef.current) return;
        
        log('Connected');
        setState(WS_STATE.CONNECTED);
        reconnectAttemptRef.current = 0;
        
        // Subscribe to room if specified
        if (room) {
          subscribe(room);
        }

        // Start heartbeat
        startHeartbeat();

        // Call onConnect handler
        if (handlersRef.current.onConnect) {
          handlersRef.current.onConnect();
        }
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setState(WS_STATE.ERROR);
      };

      wsRef.current.onclose = (event) => {
        if (!mountedRef.current) return;
        
        log('Disconnected:', event.code, event.reason);
        stopHeartbeat();
        setState(WS_STATE.DISCONNECTED);

        // Call onDisconnect handler
        if (handlersRef.current.onDisconnect) {
          handlersRef.current.onDisconnect(event);
        }

        // Attempt reconnect if not intentional close
        if (event.code !== 1000 && event.code !== 4001 && event.code !== 4002) {
          attemptReconnect();
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection error:', err);
      setState(WS_STATE.ERROR);
      attemptReconnect();
    }
  }, [enabled, room, subscribe, startHeartbeat, stopHeartbeat, handleMessage, attemptReconnect, log]);

  // Connect on mount / when enabled changes
  useEffect(() => {
    mountedRef.current = true;
    
    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      stopHeartbeat();
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [enabled, connect, stopHeartbeat]);

  // Reconnect when room changes
  useEffect(() => {
    if (state === WS_STATE.CONNECTED && room) {
      subscribe(room);
    }
  }, [room, state, subscribe]);

  return {
    state,
    isConnected: state === WS_STATE.CONNECTED,
    lastMessage,
    send,
    subscribe,
    unsubscribe,
    reconnect: connect
  };
}

export default useWebSocket;
// cache bust
