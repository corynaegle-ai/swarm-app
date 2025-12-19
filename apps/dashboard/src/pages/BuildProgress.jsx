/**
 * BuildProgress - Real-time ticket generation progress display
 * Updated to use sidebar layout matching other pages
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import useHITL from '../hooks/useHITL';
import { useSessionWebSocket } from '../hooks';
import { Hammer, Wifi, WifiOff, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

export default function BuildProgress() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getSession } = useHITL();
  
  const [session, setSession] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [logs, setLogs] = useState([]);

  const { isConnected } = useSessionWebSocket(sessionId, {
    onSessionUpdate: (data) => {
      setSession(prev => ({ ...prev, ...data }));
    },
    onTicketCreated: (data) => {
      if (data.ticket) {
        setTickets(prev => [...prev, data.ticket]);
        setLogs(prev => [...prev, `✅ Ticket created: ${data.ticket.title}`]);
      }
    },
    onBuildComplete: () => {
      setLogs(prev => [...prev, '🎉 Build complete!']);
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getSession(sessionId);
        setSession(data.session);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [sessionId, getSession]);

  const spec = (() => {
    try {
      if (!session?.spec_card) return null;
      return typeof session.spec_card === 'string' 
        ? JSON.parse(session.spec_card) 
        : session.spec_card;
    } catch { return null; }
  })();

  const expectedTickets = spec?.features?.length * 3 || 18;
  const progress = Math.min(100, Math.round((tickets.length / expectedTickets) * 100));
  const isComplete = session?.state === 'completed';
  const isFailed = session?.state === 'failed';

  return (
    <div className="page-container">
      <Sidebar />
      
      <main className="page-main">
        <header className="page-header">
          <div>
            <h1>
              <Hammer size={28} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
              Building: {session?.project_name || 'Project'}
            </h1>
            <p className="page-subtitle">Real-time ticket generation progress</p>
          </div>
          <div className="header-actions">
            <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </header>

        <div className="build-grid">
          {/* Progress Card */}
          <div className="card progress-card">
            <div className="card-header">
              <h3 className="card-title">📊 Progress</h3>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="progress-stats">
              <span className="progress-count">{tickets.length} / {expectedTickets} tickets</span>
              <span className="progress-percent">{progress}%</span>
            </div>

            {isComplete && (
              <div className="status-banner success">
                <CheckCircle2 size={20} />
                <span>Build Complete!</span>
                <button onClick={() => navigate('/tickets')} className="btn-primary">
                  View Tickets <ArrowRight size={16} />
                </button>
              </div>
            )}

            {isFailed && (
              <div className="status-banner error">
                <AlertCircle size={20} />
                <span>Build Failed</span>
                <button onClick={() => navigate(`/design/${sessionId}`)} className="btn-secondary">
                  Back to Design
                </button>
              </div>
            )}
          </div>

          {/* Logs Card */}
          <div className="card logs-card">
            <div className="card-header">
              <h3 className="card-title">📜 Build Logs</h3>
            </div>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p className="logs-empty">Waiting for build events...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="log-entry">{log}</div>
                ))
              )}
            </div>
          </div>

          {/* Tickets Card */}
          <div className="card tickets-card">
            <div className="card-header">
              <h3 className="card-title">📝 Tickets Created ({tickets.length})</h3>
            </div>
            <div className="tickets-list">
              {tickets.length === 0 ? (
                <p className="tickets-empty">No tickets created yet...</p>
              ) : (
                tickets.map((ticket) => (
                  <div key={ticket.id} className="ticket-item">
                    <span className="ticket-title">{ticket.title}</span>
                    <span className={`badge badge-${ticket.type === 'skeleton' ? 'primary' : 'success'}`}>
                      {ticket.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .connection-status {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 500;
        }
        .connection-status.connected {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }
        .connection-status.disconnected {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }

        .build-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .progress-card {
          grid-column: span 2;
        }

        .progress-bar-container {
          margin: 1rem 0;
        }

        .progress-bar {
          height: 12px;
          background: rgba(255,255,255,0.1);
          border-radius: 6px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d4ff 0%, #0ea5e9 100%);
          border-radius: 6px;
          transition: width 0.5s ease;
        }

        .progress-stats {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          color: #a1a1aa;
        }

        .progress-percent {
          font-weight: 600;
          color: #00d4ff;
        }

        .status-banner {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 1.5rem;
          padding: 1rem 1.5rem;
          border-radius: 8px;
        }

        .status-banner.success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
        }

        .status-banner.error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }

        .status-banner span {
          flex: 1;
          font-weight: 600;
        }

        .logs-container {
          max-height: 300px;
          overflow-y: auto;
        }

        .logs-empty, .tickets-empty {
          color: #52525b;
          font-style: italic;
          padding: 1rem 0;
        }

        .log-entry {
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          font-size: 0.875rem;
          color: #a1a1aa;
        }

        .log-entry:last-child {
          border-bottom: none;
        }

        .tickets-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .ticket-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .ticket-item:last-child {
          border-bottom: none;
        }

        .ticket-title {
          font-size: 0.875rem;
          color: #e4e4e7;
          flex: 1;
          margin-right: 1rem;
        }

        @media (max-width: 900px) {
          .build-grid {
            grid-template-columns: 1fr;
          }
          .progress-card {
            grid-column: span 1;
          }
        }
      `}</style>
    </div>
  );
}
