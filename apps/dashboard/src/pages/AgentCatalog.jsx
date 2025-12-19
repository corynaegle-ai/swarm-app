import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AgentCard from '../components/AgentCard';
import { getAgents } from '../services/registryApi';
import './AgentCatalog.css';
import toast from 'react-hot-toast';
import { 
  Search, Filter, RefreshCw, Loader2, Bot, Plus, AlertCircle 
} from 'lucide-react';

export default function AgentCatalog() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    runtime: '',
    tag: ''
  });

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filterParams = {};
      if (filters.search) filterParams.name = filters.search;
      if (filters.runtime) filterParams.runtime = filters.runtime;
      if (filters.tag) filterParams.tag = filters.tag;
      
      const data = await getAgents(filterParams);
      setAgents(data.agents || []);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleAgentClick = (agent) => {
    navigate(`/agents/catalog/${agent.id}`);
  };

  const handleSearchChange = (e) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleRuntimeChange = (e) => {
    setFilters(prev => ({ ...prev, runtime: e.target.value }));
  };

  const runtimes = ['node', 'python', 'bash'];

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        <div className="page-header">
          <div className="page-title">
            <Bot size={28} />
            <h1>Agent Catalog</h1>
            <span className="count-badge">{agents.length}</span>
          </div>
          <div className="page-actions">
            <button onClick={fetchAgents} className="btn btn-secondary" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
            <button className="btn btn-primary">
              <Plus size={16} />
              Register Agent
            </button>
          </div>
        </div>

        <div className="filters-bar">
          <div className="search-input">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search agents..."
              value={filters.search}
              onChange={handleSearchChange}
            />
          </div>
          <select value={filters.runtime} onChange={handleRuntimeChange} className="filter-select">
            <option value="">All Runtimes</option>
            {runtimes.map(rt => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={fetchAgents}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <Loader2 size={32} className="spin" />
            <p>Loading agents...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="empty-state">
            <Bot size={48} />
            <h3>No agents found</h3>
            <p>Register your first agent to get started</p>
            <button className="btn btn-primary">
              <Plus size={16} />
              Register Agent
            </button>
          </div>
        ) : (
          <div className="agent-grid">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={handleAgentClick}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
