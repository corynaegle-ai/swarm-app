# HITL Phase 5 UI Polish Prompt

## 🎯 Mission

Complete the CSS polish for the Human-in-the-Loop (HITL) interface. The core functionality is complete - this is purely visual refinement to deliver a professional, polished user experience.

**Estimated Time:** 30-60 minutes

---

## ✅ Current Status

| Component | Functionality | CSS Polish |
|-----------|---------------|------------|
| useHITL.js Hook | ✅ Complete | N/A |
| CreateProject.jsx | ✅ Complete | 🟡 Needs polish |
| DesignSession.jsx | ✅ Complete | ⚠️ Missing animations |
| Navigation | ✅ Complete | ✅ Good |

---

## 🎨 Design System Reference

### Color Palette (Swarm Brand)

```css
:root {
  /* Primary */
  --cyan-400: #22d3ee;
  --cyan-500: #06b6d4;
  --cyan-600: #0891b2;
  
  /* Backgrounds */
  --slate-900: #0f172a;
  --slate-800: #1e293b;
  --slate-700: #334155;
  
  /* Text */
  --slate-100: #f1f5f9;
  --slate-300: #cbd5e1;
  --slate-400: #94a3b8;
  
  /* Accents */
  --emerald-500: #10b981;
  --amber-500: #f59e0b;
  --red-500: #ef4444;
}
```

### Glass Card Effect

```css
.glass-card {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 12px;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -2px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.glass-card:hover {
  border-color: rgba(34, 211, 238, 0.3);
  box-shadow: 
    0 10px 15px -3px rgba(0, 0, 0, 0.2),
    0 4px 6px -4px rgba(0, 0, 0, 0.1),
    0 0 20px rgba(34, 211, 238, 0.1);
}
```

---

## 📋 Tasks

### Task 1: Add Typing Indicator Animation

**File:** `src/components/DesignSession.jsx` (or separate CSS file)

When AI is generating a response, show an animated typing indicator:

```css
.typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 12px;
  margin: 8px 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--cyan-400);
  border-radius: 50%;
  animation: typing-bounce 1.4s ease-in-out infinite;
}

.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}
```

**React Component:**
```jsx
const TypingIndicator = () => (
  <div className="typing-indicator">
    <span></span>
    <span></span>
    <span></span>
  </div>
);
```

---

### Task 2: Apply Glass Card to Message Bubbles

**File:** `src/components/DesignSession.jsx`

Update message styling to use glass morphism:

```css
/* AI Messages (left side) */
.message-ai {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px 16px 16px 4px;
  padding: 14px 18px;
  max-width: 80%;
  color: var(--slate-100);
  line-height: 1.6;
}

/* User Messages (right side) */
.message-user {
  background: linear-gradient(135deg, var(--cyan-600), var(--cyan-500));
  border-radius: 16px 16px 4px 16px;
  padding: 14px 18px;
  max-width: 80%;
  color: white;
  margin-left: auto;
  box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);
}

/* Message entrance animation */
.message-enter {
  animation: message-slide-in 0.3s ease-out;
}

@keyframes message-slide-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

### Task 3: Polish CreateProject Form

**File:** `src/components/CreateProject.jsx`

```css
.create-project-container {
  max-width: 640px;
  margin: 0 auto;
  padding: 40px 24px;
}

.create-project-card {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  padding: 32px;
}

.create-project-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--slate-100);
  margin-bottom: 8px;
}

.create-project-subtitle {
  color: var(--slate-400);
  margin-bottom: 32px;
}

/* Textarea styling */
.project-textarea {
  width: 100%;
  min-height: 160px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 16px;
  color: var(--slate-100);
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.project-textarea:focus {
  outline: none;
  border-color: var(--cyan-500);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15);
}

.project-textarea::placeholder {
  color: var(--slate-500);
}

/* Submit button */
.submit-button {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(135deg, var(--cyan-600), var(--cyan-500));
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  margin-top: 24px;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(6, 182, 212, 0.4);
}

.submit-button:active:not(:disabled) {
  transform: translateY(0);
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Loading spinner in button */
.submit-button.loading {
  position: relative;
  color: transparent;
}

.submit-button.loading::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  top: 50%;
  left: 50%;
  margin: -10px 0 0 -10px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### Task 4: Add State Badge Styling

**File:** `src/components/DesignSession.jsx`

For the session state indicator in the header:

```css
.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.state-badge.gathering {
  background: rgba(245, 158, 11, 0.15);
  color: var(--amber-500);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.state-badge.generating {
  background: rgba(6, 182, 212, 0.15);
  color: var(--cyan-400);
  border: 1px solid rgba(6, 182, 212, 0.3);
  animation: pulse-glow 2s ease-in-out infinite;
}

.state-badge.reviewing {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.state-badge.approved {
  background: rgba(16, 185, 129, 0.15);
  color: var(--emerald-500);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.state-badge.building {
  background: rgba(34, 211, 238, 0.15);
  color: var(--cyan-400);
  border: 1px solid rgba(34, 211, 238, 0.3);
  animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Dot indicator before text */
.state-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
```

---

### Task 5: Progress Bar Enhancement

**File:** `src/components/DesignSession.jsx`

```css
.progress-container {
  width: 100%;
  height: 4px;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 2px;
  overflow: hidden;
  margin: 16px 0;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--cyan-500), var(--cyan-400));
  border-radius: 2px;
  transition: width 0.5s ease-out;
  position: relative;
}

.progress-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

---

## 🔍 Verification Checklist

Before marking complete, verify:

- [ ] Typing indicator shows during AI response generation
- [ ] Message bubbles have glass effect with proper border radius
- [ ] Messages animate in smoothly (slide up + fade)
- [ ] User messages are cyan gradient, right-aligned
- [ ] AI messages are dark glass, left-aligned
- [ ] CreateProject form has glass card styling
- [ ] Textarea has focus ring animation
- [ ] Submit button has hover lift effect
- [ ] Loading spinner shows in button during submission
- [ ] State badges show correct colors for each state
- [ ] Progress bar has shimmer animation
- [ ] All animations are smooth (60fps)
- [ ] No CSS conflicts with existing styles
- [ ] `npm run build` succeeds without errors

---

## 📁 File Locations

```
/opt/swarm-dashboard/src/
├── components/
│   ├── CreateProject.jsx    ← Update form styling
│   └── DesignSession.jsx    ← Update chat styling
├── styles/
│   └── globals.css          ← Add shared animations/utilities
└── App.jsx                  ← Verify routing works
```

---

## 🚀 Getting Started

```bash
# SSH to DEV droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Navigate to dashboard
cd /opt/swarm-dashboard

# Pull latest
git pull

# Install deps if needed
npm install

# Start dev server
npm run dev

# View at http://134.199.235.140:5173
```

---

## 💡 Tips

1. **Use Tailwind where possible** - The project uses Tailwind CSS. Prefer utility classes over custom CSS when practical.

2. **Test on the live dashboard** - Access `http://134.199.235.140:5173` to see changes in real-time.

3. **Check dark mode** - All styles should work on the dark slate background.

4. **Performance** - Use `transform` and `opacity` for animations (GPU accelerated).

5. **Mobile responsive** - Test that chat interface works on narrow viewports.

---

*Prompt created: December 28, 2025*
*Target: HITL Phase 5 CSS Polish*
