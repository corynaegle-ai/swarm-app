/**
 * RepoAnalysisPanel - Display repository analysis for Build Feature workflow
 * Shows tech stack, entry points, and file structure
 */
import { Loader2, GitBranch, Code, Database, FileCode, Folder } from 'lucide-react';
import './RepoAnalysisPanel.css';

export default function RepoAnalysisPanel({ analysis, isLoading }) {
  if (isLoading) {
    return (
      <div className="repo-analysis-panel loading">
        <Loader2 className="spin" size={20} />
        <span>Analyzing repository...</span>
      </div>
    );
  }

  if (!analysis) return null;

  const { techStack, entryPoints, files } = analysis;

  return (
    <div className="repo-analysis-panel">
      <h3><GitBranch size={16} /> Repository Analysis</h3>
      
      {/* Tech Stack */}
      {techStack && (
        <div className="analysis-section">
          <h4><Code size={14} /> Tech Stack</h4>
          <div className="tags">
            {techStack.languages?.map(lang => (
              <span key={lang} className="tag language">{lang}</span>
            ))}
            {techStack.frameworks?.map(fw => (
              <span key={fw} className="tag framework">{fw}</span>
            ))}
            {techStack.databases?.map(db => (
              <span key={db} className="tag database"><Database size={12} /> {db}</span>
            ))}
          </div>
        </div>
      )}

      {/* Entry Points */}
      {entryPoints?.length > 0 && (
        <div className="analysis-section">
          <h4><FileCode size={14} /> Entry Points</h4>
          <ul className="entry-points">
            {entryPoints.slice(0, 8).map(file => (
              <li key={file}><code>{file}</code></li>
            ))}
          </ul>
        </div>
      )}

      {/* File Structure Summary */}
      {files?.length > 0 && (
        <div className="analysis-section">
          <h4><Folder size={14} /> Structure</h4>
          <div className="file-summary">
            {files.filter(f => f.type === 'directory').slice(0, 6).map(dir => (
              <span key={dir.path} className="dir-tag">{dir.name}/</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
