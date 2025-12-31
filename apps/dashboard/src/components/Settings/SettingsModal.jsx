import { useState, useEffect } from 'react';
import { X, Key, Cpu, Sliders } from 'lucide-react';
import ApiKeysSection from './ApiKeysSection';
import ModelConfigSection from './ModelConfigSection';
import './Settings.css';

const TABS = [
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'model-config', label: 'Model', icon: Cpu },
  { id: 'preferences', label: 'Preferences', icon: Sliders },
];

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('api-keys');

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'api-keys':
        return <ApiKeysSection />;
      case 'model-config':
        return <ModelConfigSection />;
      case 'preferences':
        return (
          <div className="settings-placeholder">
            <p>Preferences coming soon...</p>
          </div>
        );
      default:
        return null;
    }
  };


  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-sidebar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={18} />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <main className="settings-content">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}

export { SettingsModal };
