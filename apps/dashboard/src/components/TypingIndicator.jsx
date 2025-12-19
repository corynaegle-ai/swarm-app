/**
 * TypingIndicator - Animated dots showing AI is thinking
 */
import { Bot } from 'lucide-react';
import './TypingIndicator.css';

export default function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <div className="chat-avatar chat-avatar-assistant">
        <Bot size={18} />
      </div>
      <div className="typing-bubble">
        <span>Thinking</span>
        <div className="typing-dots">
          <div className="typing-dot" style={{ animationDelay: '0s' }} />
          <div className="typing-dot" style={{ animationDelay: '0.2s' }} />
          <div className="typing-dot" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}
