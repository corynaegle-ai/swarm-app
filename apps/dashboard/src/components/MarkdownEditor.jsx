/**
 * MarkdownEditor - Textarea with line numbers for spec editing
 */
import { useRef, useEffect, useState } from 'react';

export default function MarkdownEditor({ 
  value, 
  onChange, 
  placeholder = 'Enter markdown...',
  disabled = false,
  minHeight = 400
}) {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);

  // Sync line numbers with textarea scroll
  useEffect(() => {
    const textarea = textareaRef.current;
    const lineNumbers = lineNumbersRef.current;
    
    if (!textarea || !lineNumbers) return;

    const syncScroll = () => {
      lineNumbers.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener('scroll', syncScroll);
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, []);

  // Update line count when value changes
  useEffect(() => {
    const lines = (value || '').split('\n').length;
    setLineCount(Math.max(lines, 20));
  }, [value]);


  // Handle tab key for indentation
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      // Reset cursor position after React re-render
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="markdown-editor" style={{ minHeight }}>
      <div className="editor-header">
        <span className="editor-label">📝 Edit Specification</span>
        <span className="line-count">{lineCount} lines</span>
      </div>
      <div className="editor-container">
        <div className="line-numbers" ref={lineNumbersRef}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="line-number">{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="editor-textarea"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
