/**
 * Kanban Board - Drag and drop ticket management
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './KanbanBoard.css';
import Sidebar from '../components/Sidebar';
import useTickets from '../hooks/useTickets';

const STATE_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
  ready: { label: 'Ready', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  blocked: { label: 'Blocked', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  on_hold: { label: 'On Hold', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  assigned: { label: 'Assigned', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  in_progress: { label: 'In Progress', color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)' },
  in_review: { label: 'In Review', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  done: { label: 'Done', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  cancelled: { label: 'Cancelled', color: '#4b5563', bg: 'rgba(75, 85, 99, 0.15)' }
};

// Default columns to show (can be customized)
// Fixed column order - all columns in correct sequence
const COLUMN_ORDER = ['draft', 'ready', 'blocked', 'on_hold', 'assigned', 'in_progress', 'in_review', 'done', 'cancelled'];

// Default visible columns
const DEFAULT_VISIBLE = new Set(['ready', 'assigned', 'in_progress', 'in_review', 'done']);

const SCOPE_CONFIG = {
  small: { label: 'S', color: '#10b981' },
  medium: { label: 'M', color: '#f59e0b' },
  large: { label: 'L', color: '#ef4444' }
};


export default function KanbanBoard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { listTickets, getProjects, updateTicket, loading, error } = useTickets();
  
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState(searchParams.get('project') || '');
  const [localError, setLocalError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);
  
  // Drag state
  const [draggedTicket, setDraggedTicket] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const dragCounter = useRef({});

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [ticketData, projectData] = await Promise.all([
        listTickets({ projectId: filterProject || undefined }),
        getProjects()
      ]);
      setTickets(ticketData.tickets || []);
      setProjects(projectData.projects || []);
      setLocalError(null);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [listTickets, getProjects, filterProject]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group tickets by state
  const ticketsByState = tickets.reduce((acc, ticket) => {
    const state = ticket.state || 'draft';
    if (!acc[state]) acc[state] = [];
    acc[state].push(ticket);
    return acc;
  }, {});

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown';
  };

  // Drag handlers
  const handleDragStart = (e, ticket) => {
    setDraggedTicket(ticket);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticket.id);
    e.target.classList.add('dragging');
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging');
    setDraggedTicket(null);
    setDragOverColumn(null);
    dragCounter.current = {};
  };

  const handleDragEnter = (e, state) => {
    e.preventDefault();
    dragCounter.current[state] = (dragCounter.current[state] || 0) + 1;
    setDragOverColumn(state);
  };

  const handleDragLeave = (e, state) => {
    dragCounter.current[state] = (dragCounter.current[state] || 0) - 1;
    if (dragCounter.current[state] === 0) {
      if (dragOverColumn === state) setDragOverColumn(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, newState) => {
    e.preventDefault();
    setDragOverColumn(null);
    dragCounter.current = {};
    
    if (!draggedTicket || draggedTicket.state === newState) return;
    
    // Optimistic update
    const oldState = draggedTicket.state;
    setTickets(prev => prev.map(t => 
      t.id === draggedTicket.id ? { ...t, state: newState } : t
    ));
    
    try {
      await updateTicket(draggedTicket.id, { state: newState });
    } catch (err) {
      // Rollback on error
      setTickets(prev => prev.map(t => 
        t.id === draggedTicket.id ? { ...t, state: oldState } : t
      ));
      setLocalError(`Failed to update ticket: ${err.message}`);
    }
  };

  const toggleColumn = (state) => {
    setVisibleColumns(prev => 
      prev.has(state) 
        ? new Set([...prev].filter(s => s !== state))
        : new Set([...prev, state])
    );
  };


  return (
    <div className="page-container">
      
      <Sidebar />
      
      <main className="kanban-main">
        {/* Header */}
        <div className="kanban-header">
          <div className="kanban-title">
            <h2>📋 Kanban Board</h2>
            <p>Drag and drop tickets between columns</p>
          </div>
          <div className="kanban-controls">
            <select 
              value={filterProject} 
              onChange={e => setFilterProject(e.target.value)}
              className="filter-select"
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button 
              className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={fetchData}
              disabled={loading || refreshing}
            >
              <span className="refresh-icon">↻</span>
            </button>
            <Link to="/tickets" className="view-toggle">
              <span>📊</span> List View
            </Link>
          </div>
        </div>

        {/* Column Toggles */}
        <div className="column-toggles">
          {Object.entries(STATE_CONFIG).map(([state, config]) => (
            <button
              key={state}
              className={`column-toggle ${visibleColumns.has(state) ? 'active' : ''}`}
              style={{ '--toggle-color': config.color }}
              onClick={() => toggleColumn(state)}
            >
              {config.label}
              <span className="toggle-count">{(ticketsByState[state] || []).length}</span>
            </button>
          ))}
        </div>

        {/* Error Banner */}
        {(error || localError) && (
          <div className="error-banner">
            <span>⚠</span> {error || localError}
            <button onClick={() => setLocalError(null)}>×</button>
          </div>
        )}

        {/* Kanban Board */}
        <div className="kanban-board">
          {COLUMN_ORDER.filter(s => visibleColumns.has(s)).map(state => (
            <div 
              key={state}
              className={`kanban-column ${dragOverColumn === state ? 'drag-over' : ''}`}
              style={{ '--column-color': STATE_CONFIG[state]?.color }}
              onDragEnter={(e) => handleDragEnter(e, state)}
              onDragLeave={(e) => handleDragLeave(e, state)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, state)}
            >
              <div className="column-header">
                <span className="column-title">{STATE_CONFIG[state]?.label}</span>
                <span className="column-count">{(ticketsByState[state] || []).length}</span>
              </div>
              <div className="column-body">
                {(ticketsByState[state] || []).map(ticket => (
                  <div
                    key={ticket.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, ticket)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <div className="card-header">
                      <span className="card-id">#{ticket.id}</span>
                      {ticket.estimated_scope && (
                        <span 
                          className="card-scope"
                          style={{ color: SCOPE_CONFIG[ticket.estimated_scope]?.color }}
                        >
                          {SCOPE_CONFIG[ticket.estimated_scope]?.label}
                        </span>
                      )}
                    </div>
                    <div className="card-title">{ticket.title}</div>
                    <div className="card-footer">
                      <span className="card-project">{getProjectName(ticket.project_id)}</span>
                      {ticket.assignee_id && (
                        <span className="card-assignee">
                          {ticket.assignee_type === 'agent' ? <Bot size={14} /> : <User size={14} />}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {(ticketsByState[state] || []).length === 0 && (
                  <div className="column-empty">
                    Drop tickets here
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>


        {/* Ticket Detail Modal */}
        {selectedTicket && (
          <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-area">
                  <span className="modal-ticket-id">#{selectedTicket.id}</span>
                  <h2>{selectedTicket.title}</h2>
                </div>
                <button className="modal-close" onClick={() => setSelectedTicket(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="detail-row">
                  <label>State</label>
                  <span 
                    className="state-badge"
                    style={{ 
                      color: STATE_CONFIG[selectedTicket.state]?.color,
                      background: STATE_CONFIG[selectedTicket.state]?.bg 
                    }}
                  >
                    {STATE_CONFIG[selectedTicket.state]?.label}
                  </span>
                </div>
                <div className="detail-row">
                  <label>Project</label>
                  <span>{getProjectName(selectedTicket.project_id)}</span>
                </div>
                {selectedTicket.description && (
                  <div className="detail-block">
                    <label>Description</label>
                    <div className="description-box">{selectedTicket.description}</div>
                  </div>
                )}
                <div className="modal-actions">
                  <Link 
                    to={`/tickets?highlight=${selectedTicket.id}`} 
                    className="btn-primary"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Styles */}
        <style>{`
          .kanban-dashboard { min-height: 100vh; background: #0a0a0a; }
          .kanban-main { 
            padding: 1.5rem 2rem; 
            height: calc(100vh - 120px);
            display: flex;
            flex-direction: column;
          }
          
          /* Header */
          .kanban-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }
          .kanban-title h2 {
            margin: 0;
            font-size: 1.5rem;
            color: #fff;
          }
          .kanban-title p {
            margin: 0.25rem 0 0;
            color: #666;
            font-size: 0.9rem;
          }
          .kanban-controls {
            display: flex;
            gap: 0.75rem;
            align-items: center;
          }
          .filter-select {
            background: #1a1a2e;
            border: 1px solid #333;
            color: #fff;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            font-size: 0.9rem;
          }
          .filter-select:focus { outline: none; border-color: #00d4ff; }
          .refresh-btn {
            background: #1a1a2e;
            border: 1px solid #333;
            color: #fff;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .refresh-btn:hover { border-color: #00d4ff; color: #00d4ff; }
          .refresh-btn.spinning .refresh-icon { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .view-toggle {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.3);
            color: #00d4ff;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.2s;
          }
          .view-toggle:hover { background: rgba(0, 212, 255, 0.2); }

          /* Column Toggles */
          .column-toggles {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1rem;
          }
          .column-toggle {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.35rem 0.75rem;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 20px;
            color: #666;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.2s;
          }
          .column-toggle:hover { border-color: var(--toggle-color); color: #999; }
          .column-toggle.active {
            background: rgba(255,255,255,0.05);
            border-color: var(--toggle-color);
            color: var(--toggle-color);
          }
          .toggle-count {
            background: rgba(255,255,255,0.1);
            padding: 0.1rem 0.4rem;
            border-radius: 10px;
            font-size: 0.7rem;
          }
          .column-toggle.active .toggle-count {
            background: var(--toggle-color);
            color: #000;
          }

          /* Error Banner */
          .error-banner {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
          }
          .error-banner button {
            margin-left: auto;
            background: none;
            border: none;
            color: inherit;
            font-size: 1.25rem;
            cursor: pointer;
          }


          /* Kanban Board */
          .kanban-board {
            display: flex;
            gap: 1rem;
            flex: 1;
            overflow-x: auto;
            padding-bottom: 1rem;
          }
          .kanban-column {
            flex: 0 0 280px;
            background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            max-height: 100%;
            transition: all 0.2s;
          }
          .kanban-column.drag-over {
            border-color: var(--column-color);
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
            background: linear-gradient(180deg, #1f1f35 0%, #1a2744 100%);
          }
          .column-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            border-bottom: 2px solid var(--column-color);
          }
          .column-title {
            font-weight: 600;
            color: var(--column-color);
            font-size: 0.9rem;
          }
          .column-count {
            background: var(--column-color);
            color: #000;
            padding: 0.15rem 0.5rem;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 700;
          }
          .column-body {
            flex: 1;
            overflow-y: auto;
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .column-empty {
            text-align: center;
            padding: 2rem 1rem;
            color: #555;
            font-size: 0.85rem;
            border: 2px dashed rgba(255,255,255,0.1);
            border-radius: 8px;
          }

          /* Kanban Cards */
          .kanban-card {
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 8px;
            padding: 0.75rem;
            cursor: grab;
            transition: all 0.2s;
          }
          .kanban-card:hover {
            border-color: rgba(0, 212, 255, 0.3);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .kanban-card:active { cursor: grabbing; }
          .kanban-card.dragging {
            opacity: 0.5;
            transform: rotate(3deg);
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          .card-id {
            font-size: 0.7rem;
            color: #00d4ff;
            font-family: monospace;
            font-weight: 600;
          }
          .card-scope {
            font-weight: 800;
            font-size: 0.75rem;
          }
          .card-title {
            font-size: 0.85rem;
            color: #fff;
            line-height: 1.4;
            margin-bottom: 0.75rem;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .card-project {
            font-size: 0.7rem;
            color: #666;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .card-assignee {
            font-size: 0.9rem;
          }


          /* Modal */
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            padding: 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .modal-title-area { flex: 1; }
          .modal-ticket-id {
            font-size: 0.75rem;
            color: #00d4ff;
            font-family: monospace;
          }
          .modal-header h2 {
            margin: 0.25rem 0 0;
            font-size: 1.1rem;
            color: #fff;
          }
          .modal-close {
            background: rgba(255,255,255,0.05);
            border: none;
            color: #666;
            font-size: 1.5rem;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
          }
          .modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
          .modal-body { padding: 1.25rem; }
          .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
          }
          .detail-row label {
            font-size: 0.75rem;
            color: #666;
            text-transform: uppercase;
          }
          .detail-row span { color: #fff; }
          .state-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
          }
          .detail-block {
            margin-top: 1rem;
          }
          .detail-block label {
            display: block;
            font-size: 0.75rem;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 0.5rem;
          }
          .description-box {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 1rem;
            color: #ccc;
            font-size: 0.9rem;
            line-height: 1.5;
          }
          .modal-actions {
            margin-top: 1.5rem;
            display: flex;
            justify-content: flex-end;
          }
          .btn-primary {
            background: linear-gradient(135deg, #00d4ff, #0099cc);
            color: #000;
            padding: 0.6rem 1.25rem;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.2s;
          }
          .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,212,255,0.3); }

          /* Nav active */
          .dashboard-nav a.active {
            color: #00d4ff;
            background: rgba(0, 212, 255, 0.1);
          }

          /* Scrollbar */
          .column-body::-webkit-scrollbar { width: 6px; }
          .column-body::-webkit-scrollbar-track { background: transparent; }
          .column-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
          .column-body::-webkit-scrollbar-thumb:hover { background: #444; }
          
          .kanban-board::-webkit-scrollbar { height: 8px; }
          .kanban-board::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 4px; }
          .kanban-board::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        `}</style>
      </main>
    </div>
  );
}
