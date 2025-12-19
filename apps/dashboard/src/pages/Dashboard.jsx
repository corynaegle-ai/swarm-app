import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import {
  LayoutDashboard,
  Ticket,
  Kanban,
  Bot,
  Server,
  FolderPlus,
  Users,
  KeyRound,
  Activity,
  Cpu,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Play,
  ChevronRight,
  Zap,
  Layers,
  LogOut,
  Settings
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [stats, setStats] = useState({
    tickets: { total: 0, active: 0, completed: 0 },
    vms: { running: 0, total: 0 },
    agents: { active: 0 }
  });
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const ticketRes = await fetch(`${API_BASE}/api/tickets?limit=1000`, { headers });
      if (ticketRes.ok) {
        const tickets = await ticketRes.json();
        const completed = tickets.filter(t => t.state === 'done' || t.state === 'merged').length;
        const active = tickets.filter(t => t.state === 'in_progress' || t.state === 'claimed').length;
        setStats(prev => ({ ...prev, tickets: { total: tickets.length, active, completed } }));
        setRecentTickets(tickets.slice(0, 5));
      }

      const vmRes = await fetch(`${API_BASE}/api/vms`, { headers });
      if (vmRes.ok) {
        const vms = await vmRes.json();
        const running = vms.filter(v => v.status === 'running').length;
        setStats(prev => ({ ...prev, vms: { running, total: vms.length } }));
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
    } finally {
      setLoading(false);
    }
  };


  const quickActions = [
    { to: '/projects/new', icon: FolderPlus, label: 'New Project', desc: 'Start a new agent project' },
    { to: '/tickets', icon: Play, label: 'Run Agents', desc: 'Execute pending tickets' },
    { to: '/vms', icon: Server, label: 'Spawn VM', desc: 'Launch a microVM instance' },
  ];

  const getStateColor = (state) => {
    const colors = {
      pending: '#fbbf24',
      in_progress: '#3b82f6',
      claimed: '#8b5cf6',
      done: '#22c55e',
      merged: '#22c55e',
      blocked: '#ef4444'
    };
    return colors[state] || '#6b7280';
  };


  return (
    <div className="page-container">
      <Sidebar />


      {/* Main Content */}
      <main className="page-main">
        <header className="dash-header">
          <div>
            <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
            <p className="header-subtitle">Here's what's happening with your swarm</p>
          </div>
          <div className="header-actions">
            <Link to="/projects/new" className="btn-primary">
              <FolderPlus size={18} />
              New Project
            </Link>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="stats-grid">
          <div className="stat-card stat-primary">
            <div className="stat-icon">
              <Ticket size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.tickets.total}</span>
              <span className="stat-label">Total Tickets</span>
            </div>
            <div className="stat-trend positive">
              <TrendingUp size={14} />
              <span>{stats.tickets.completed} completed</span>
            </div>
          </div>

          <div className="stat-card stat-success">
            <div className="stat-icon">
              <Activity size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.tickets.active}</span>
              <span className="stat-label">Active Tasks</span>
            </div>
            <div className="stat-badge">
              <Zap size={12} />
              In Progress
            </div>
          </div>


          <div className="stat-card stat-purple">
            <div className="stat-icon">
              <Server size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.vms.running}</span>
              <span className="stat-label">Running VMs</span>
            </div>
            <div className="stat-secondary">
              of {stats.vms.total} total
            </div>
          </div>

          <div className="stat-card stat-amber">
            <div className="stat-icon">
              <Cpu size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-value">8ms</span>
              <span className="stat-label">Avg Boot Time</span>
            </div>
            <div className="stat-badge success">
              <CheckCircle2 size={12} />
              Optimal
            </div>
          </div>
        </section>

        {/* Bento Grid */}
        <section className="bento-grid">
          {/* Quick Actions */}
          <div className="bento-card bento-actions">
            <h3>Quick Actions</h3>
            <div className="action-list">
              {quickActions.map(action => (
                <Link key={action.to} to={action.to} className="action-item">
                  <div className="action-icon">
                    <action.icon size={20} />
                  </div>
                  <div className="action-content">
                    <span className="action-label">{action.label}</span>
                    <span className="action-desc">{action.desc}</span>
                  </div>
                  <ChevronRight size={16} className="action-arrow" />
                </Link>
              ))}
            </div>
          </div>


          {/* Recent Tickets */}
          <div className="bento-card bento-tickets">
            <div className="card-header">
              <h3>Recent Tickets</h3>
              <Link to="/tickets" className="view-all">View all</Link>
            </div>
            {loading ? (
              <div className="loading-placeholder">Loading...</div>
            ) : recentTickets.length === 0 ? (
              <div className="empty-state">
                <Ticket size={32} />
                <p>No tickets yet</p>
              </div>
            ) : (
              <div className="ticket-list">
                {recentTickets.map(ticket => (
                  <div key={ticket.id} className="ticket-item">
                    <div 
                      className="ticket-status" 
                      style={{ background: getStateColor(ticket.state) }}
                    />
                    <div className="ticket-info">
                      <span className="ticket-title">{ticket.title}</span>
                      <span className="ticket-meta">{ticket.type} • {ticket.state}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Status */}
          <div className="bento-card bento-status">
            <h3>System Status</h3>
            <div className="status-list">
              <div className="status-item">
                <div className="status-indicator online" />
                <span className="status-name">API Server</span>
                <span className="status-value">Operational</span>
              </div>
              <div className="status-item">
                <div className="status-indicator online" />
                <span className="status-name">VM Orchestrator</span>
                <span className="status-value">Ready</span>
              </div>
              <div className="status-item">
                <div className="status-indicator online" />
                <span className="status-name">Agent Runtime</span>
                <span className="status-value">Active</span>
              </div>
              <div className="status-item">
                <div className="status-indicator online" />
                <span className="status-name">Database</span>
                <span className="status-value">Connected</span>
              </div>
            </div>
          </div>
        </section>
      </main>


      <style>{`
        .dashboard-page {
          display: flex;
          min-height: 100vh;
          background: #09090b;
        }

        /* Main Content */
        .dashboard-main-old {
          flex: 1;
          margin-left: 260px;
          padding: 2rem;
          max-width: 1400px;
        }

        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
        }

        .dash-header h1 {
          font-size: 1.75rem;
          font-weight: 600;
          color: #fff;
          margin-bottom: 0.25rem;
          letter-spacing: -0.02em;
        }

        .header-subtitle {
          color: #71717a;
          font-size: 0.9rem;
        }

        .header-actions {
          display: flex;
          gap: 0.75rem;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          background: linear-gradient(135deg, #00d4ff 0%, #0ea5e9 100%);
          color: #000;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 212, 255, 0.25);
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .stat-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 1.25rem;
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: var(--stat-gradient);
          opacity: 0.5;
        }

        .stat-primary { --stat-gradient: linear-gradient(90deg, #00d4ff, transparent); }
        .stat-success { --stat-gradient: linear-gradient(90deg, #22c55e, transparent); }
        .stat-purple { --stat-gradient: linear-gradient(90deg, #a855f7, transparent); }
        .stat-amber { --stat-gradient: linear-gradient(90deg, #fbbf24, transparent); }


        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1rem;
        }

        .stat-primary .stat-icon { background: rgba(0, 212, 255, 0.15); color: #00d4ff; }
        .stat-success .stat-icon { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .stat-purple .stat-icon { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .stat-amber .stat-icon { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

        .stat-content {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.02em;
          line-height: 1;
          margin-bottom: 0.25rem;
        }

        .stat-label {
          font-size: 0.8rem;
          color: #71717a;
        }

        .stat-trend {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.75rem;
          font-size: 0.75rem;
          color: #71717a;
        }

        .stat-trend.positive {
          color: #22c55e;
        }

        .stat-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.75rem;
          padding: 0.25rem 0.5rem;
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 500;
        }

        .stat-badge.success {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }

        .stat-secondary {
          margin-top: 0.75rem;
          font-size: 0.75rem;
          color: #52525b;
        }


        /* Bento Grid */
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .bento-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 1.25rem;
        }

        .bento-card h3 {
          font-size: 0.9rem;
          font-weight: 600;
          color: #fff;
          margin-bottom: 1rem;
        }

        .bento-actions {
          grid-row: span 2;
        }

        .bento-tickets {
          grid-column: span 2;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .card-header h3 {
          margin-bottom: 0;
        }

        .view-all {
          font-size: 0.8rem;
          color: #00d4ff;
          text-decoration: none;
        }

        .view-all:hover {
          text-decoration: underline;
        }

        /* Action Items */
        .action-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .action-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 10px;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .action-item:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(0, 212, 255, 0.2);
          transform: translateX(4px);
        }

        .action-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: rgba(0, 212, 255, 0.1);
          color: #00d4ff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }


        .action-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .action-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #fff;
        }

        .action-desc {
          font-size: 0.75rem;
          color: #71717a;
        }

        .action-arrow {
          color: #52525b;
          transition: transform 0.15s ease;
        }

        .action-item:hover .action-arrow {
          transform: translateX(4px);
          color: #00d4ff;
        }

        /* Ticket List */
        .ticket-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .ticket-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: rgba(255,255,255,0.02);
          border-radius: 8px;
          transition: background 0.15s ease;
        }

        .ticket-item:hover {
          background: rgba(255,255,255,0.04);
        }

        .ticket-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .ticket-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .ticket-title {
          font-size: 0.875rem;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ticket-meta {
          font-size: 0.75rem;
          color: #52525b;
        }

        .loading-placeholder, .empty-state {
          padding: 2rem;
          text-align: center;
          color: #52525b;
        }

        .empty-state svg {
          opacity: 0.5;
          margin-bottom: 0.5rem;
        }


        /* Status List */
        .status-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-indicator.online {
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }

        .status-indicator.offline {
          background: #ef4444;
        }

        .status-name {
          flex: 1;
          font-size: 0.875rem;
          color: #a1a1aa;
        }

        .status-value {
          font-size: 0.75rem;
          color: #22c55e;
          font-weight: 500;
        }

        /* Responsive */
        @media (max-width: 1200px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .bento-grid {
            grid-template-columns: 1fr 1fr;
          }
          .bento-actions {
            grid-row: span 1;
          }
          .bento-tickets {
            grid-column: span 2;
          }
        }

        @media (max-width: 900px) {
          .unused-dash-sidebar {
            display: none;
          }
          .dashboard-main-old {
            margin-left: 0;
          }
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .bento-grid {
            grid-template-columns: 1fr;
          }
          .bento-tickets {
            grid-column: span 1;
          }
        }

        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .dash-header {
            flex-direction: column;
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
