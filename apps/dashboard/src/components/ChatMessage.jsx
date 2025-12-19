/**
 * ChatMessage - Message bubble with distinct user/assistant styling
 */
import { User, Bot } from 'lucide-react';
import './ChatMessage.css';

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}>
      <div className={`chat-avatar ${isUser ? 'chat-avatar-user' : 'chat-avatar-assistant'}`}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
        {message.content}
      </div>
    </div>
  );
}
