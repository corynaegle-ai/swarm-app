# Swarm Dashboard UI Development Guide

> **CRITICAL**: Read this entire document before creating or modifying any UI pages or components.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Color System](#color-system)
3. [Page Structure Template](#page-structure-template)
4. [Adding New Pages](#adding-new-pages)
5. [Adding Menu Items](#adding-menu-items)
6. [CSS Patterns](#css-patterns)
7. [Common Mistakes](#common-mistakes)
8. [Component Library](#component-library)
9. [Quick Reference](#quick-reference)

---

## Architecture Overview

### Tech Stack
- **React 19** with Vite
- **Plain CSS** (NOT Tailwind)
- **Lucide React** for icons
- **React Router v7** for routing
- **React Hot Toast** for notifications

### File Structure
```
/opt/swarm-app/apps/dashboard/src/
├── App.jsx           # Routes & global imports
├── App.css           # Component styles (63KB - large file)
├── index.css         # Root variables & resets
├── layout.css        # Sidebar & page layout
├── main.jsx          # Entry point
├── components/       # Reusable components
│   ├── Sidebar.jsx   # Main navigation
│   └── *.css         # Component-specific styles
├── pages/            # Page components
│   ├── PageName.jsx  # Page component
│   └── PageName.css  # Page-specific styles
├── context/          # React contexts (AuthContext)
├── services/         # API service modules
└── hooks/            # Custom hooks
```

### CSS File Hierarchy (Load Order)
1. `index.css` - CSS variables, resets, base elements
2. `App.css` - Global component styles
3. `layout.css` - Sidebar, page-main, page-container
4. Page-specific CSS - Imported in each page component

---

## Color System

### ⚠️ CRITICAL: CSS Variables Are NOT Defined

The codebase has a **MAJOR ISSUE**: Many CSS files reference undefined variables like `var(--primary-color)`. These will fail silently and produce invisible or broken elements.

### REQUIRED: Always Use Fallback Values

```css
/* ❌ WRONG - Variable not defined, element invisible */
background: var(--primary-color);

/* ✅ CORRECT - Fallback ensures visibility */
background: var(--primary-color, #00d4ff);
```

### Official Color Palette (Use These Values)

| Purpose | Variable (with fallback) | Hex Value |
|---------|-------------------------|-----------|
| Primary (Cyan) | `var(--primary, #00d4ff)` | `#00d4ff` |
| Primary Hover | `var(--primary-hover, #00b8e6)` | `#00b8e6` |
| Background Main | `var(--bg-main, #09090b)` | `#09090b` |
| Background Card | `var(--bg-card, #1a1a2e)` | `#1a1a2e` |
| Background Alt | `var(--bg-alt, #16213e)` | `#16213e` |
| Background Input | `var(--bg-input, #0a0a0a)` | `#0a0a0a` |
| Border | `var(--border, #333)` or `rgba(255,255,255,0.06)` | `#333333` |
| Text Primary | `var(--text-primary, #fff)` | `#ffffff` |
| Text Secondary | `var(--text-secondary, #888)` | `#888888` |
| Text Muted | `var(--text-muted, #71717a)` | `#71717a` |
| Success | `var(--success, #22c55e)` | `#22c55e` |
| Warning | `var(--warning, #fbbf24)` | `#fbbf24` |
| Danger | `var(--danger, #ef4444)` | `#ef4444` |
| Info | `var(--info, #3b82f6)` | `#3b82f6` |

### Status Badge Colors
```css
.status-pending { background: #fbbf24; color: #000; }
.status-in-progress { background: #3b82f6; color: #fff; }
.status-claimed { background: #8b5cf6; color: #fff; }
.status-done, .status-merged { background: #22c55e; color: #000; }
.status-blocked, .status-failed { background: #ef4444; color: #fff; }
```

---

## Page Structure Template

### JSX Template (ALWAYS follow this structure)

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { SomeIcon, OtherIcon } from 'lucide-react';
import './PageName.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function PageName() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/endpoint`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const result = await res.json();
      setData(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <Sidebar />
      
      <main className="page-main">
        {/* Page Header */}
        <header className="page-header">
          <div className="header-content">
            <h1>Page Title</h1>
            <p className="header-subtitle">Description of the page</p>
          </div>
          <div className="header-actions">
            {/* Action buttons go here */}
          </div>
        </header>

        {/* Main Content */}
        <div className="page-content">
          {loading ? (
            <div className="loading-state">
              <Loader2 className="spinner" size={24} />
              <span>Loading...</span>
            </div>
          ) : (
            /* Your content here */
          )}
        </div>
      </main>
    </div>
  );
}
```

### CSS Template (Create PageName.css)

```css
/* PageName.css - Always scope styles to page class */

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  color: #fff;
}

.header-subtitle {
  color: #71717a;
  margin: 0;
  font-size: 0.9rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

/* Content Containers */
.page-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Cards */
.card {
  background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 1.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.card-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  color: #71717a;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: #71717a;
}

.empty-state-icon {
  color: #52525b;
  margin-bottom: 1rem;
}
```

---

## Adding New Pages

### Step 1: Create the Files

```bash
# On droplet
touch /opt/swarm-app/apps/dashboard/src/pages/NewPage.jsx
touch /opt/swarm-app/apps/dashboard/src/pages/NewPage.css
```

### Step 2: Add Route in App.jsx

```jsx
// Import the page
import NewPage from './pages/NewPage';

// Add route inside <Routes>
<Route path="/new-page" element={
  <ProtectedRoute>
    <NewPage />
  </ProtectedRoute>
} />

// For admin-only pages:
<Route path="/admin/new-page" element={
  <ProtectedRoute adminOnly>
    <NewPage />
  </ProtectedRoute>
} />
```

### Step 3: Add Menu Item (See next section)

---

## Adding Menu Items

### Edit Sidebar.jsx

Location: `/opt/swarm-app/apps/dashboard/src/components/Sidebar.jsx`

```jsx
import { 
  // ... existing icons
  YourNewIcon,  // Add your icon import
} from 'lucide-react';

// Add to navItems array (for regular items)
const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets', icon: Ticket, label: 'Tickets' },
  // ... existing items
  { to: '/new-page', icon: YourNewIcon, label: 'New Page' },  // ADD HERE
];

// Or add to adminItems array (for admin-only items)
const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/secrets', icon: KeyRound, label: 'Secrets' },
  { to: '/admin/new-page', icon: YourNewIcon, label: 'New Page' },  // ADD HERE
];
```

### Active State Handling

If your route has subroutes, update `isActive()`:

```jsx
const isActive = (path) => {
  // Exact match for specific routes
  if (path === '/new-page' && location.pathname === '/new-page') return true;
  
  // Prefix match for routes with children
  if (path === '/new-page') return location.pathname.startsWith('/new-page');
  
  // ... existing logic
};
```

---

## CSS Patterns

### Buttons

```css
/* Primary Button (Cyan) */
.btn-primary {
  padding: 0.75rem 1.5rem;
  background: #00d4ff;
  color: #000;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #00b8e6;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Secondary Button (Outline) */
.btn-secondary {
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: #00d4ff;
  border: 1px solid #00d4ff;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(0, 212, 255, 0.1);
}

/* Danger Button */
.btn-danger {
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;
  border-radius: 8px;
  cursor: pointer;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

/* Icon Button */
.btn-icon {
  padding: 0.5rem;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: #71717a;
  cursor: pointer;
}

.btn-icon:hover {
  background: rgba(255,255,255,0.04);
  color: #fff;
}
```

### Form Elements

```css
/* Text Input */
.form-input {
  width: 100%;
  padding: 0.75rem;
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 1rem;
}

.form-input:focus {
  outline: none;
  border-color: #00d4ff;
}

.form-input::placeholder {
  color: #52525b;
}

/* Form Label */
.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #fff;
}

.form-hint {
  display: block;
  color: #71717a;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

/* Form Group */
.form-group {
  margin-bottom: 1.5rem;
}

/* Textarea */
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-family: inherit;
  font-size: 1rem;
  resize: vertical;
  min-height: 120px;
}

.form-textarea:focus {
  outline: none;
  border-color: #00d4ff;
}
```

### Tables

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0.875rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.data-table th {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #71717a;
}

.data-table tr:hover {
  background: rgba(255,255,255,0.02);
}

.data-table td {
  color: #e4e4e7;
}
```

### Grid Layouts

```css
/* Stats Grid (4 columns) */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  .stats-grid { grid-template-columns: 1fr; }
}

/* Cards Grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}
```

---

## Common Mistakes

### ❌ DON'T: Use CSS Variables Without Fallbacks

```css
/* WRONG - Variable doesn't exist, element invisible */
background: var(--bg-card);
color: var(--text-primary);
```

```css
/* CORRECT - Always include fallback */
background: var(--bg-card, #1a1a2e);
color: var(--text-primary, #fff);
```

### ❌ DON'T: Forget Sidebar Import

```jsx
/* WRONG - No sidebar, content fills full width */
export default function Page() {
  return (
    <div className="page-container">
      <main className="page-main">...</main>
    </div>
  );
}
```

```jsx
/* CORRECT - Sidebar required for layout */
import Sidebar from '../components/Sidebar';

export default function Page() {
  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">...</main>
    </div>
  );
}
```

### ❌ DON'T: Forget page-container Wrapper

```jsx
/* WRONG - Layout breaks */
return (
  <>
    <Sidebar />
    <main>...</main>
  </>
);
```

```jsx
/* CORRECT */
return (
  <div className="page-container">
    <Sidebar />
    <main className="page-main">...</main>
  </div>
);
```

### ❌ DON'T: Use Tailwind Classes

```jsx
/* WRONG - Tailwind not installed */
<div className="bg-gray-900 p-4 rounded-lg">
```

```jsx
/* CORRECT - Use plain CSS */
<div className="card">
/* With CSS: .card { background: #1a1a2e; padding: 1rem; border-radius: 8px; } */
```

### ❌ DON'T: Hardcode Different Colors

```css
/* WRONG - Inconsistent colors across files */
.button { background: #0099ff; }  /* File A */
.button { background: #00d4ff; }  /* File B */
.button { background: cyan; }     /* File C */
```

```css
/* CORRECT - Use established palette */
.button { background: #00d4ff; }  /* Always use #00d4ff for primary cyan */
```

### ❌ DON'T: Forget CSS Import in Page Component

```jsx
/* WRONG - Styles won't load */
export default function NewPage() { ... }
```

```jsx
/* CORRECT */
import './NewPage.css';
export default function NewPage() { ... }
```

### ❌ DON'T: Add inline styles for layout

```jsx
/* WRONG */
<main style={{ marginLeft: '260px', padding: '2rem' }}>
```

```jsx
/* CORRECT - Use existing layout classes */
<main className="page-main">
```

---

## Component Library

### Available Icons (Lucide React)

```jsx
import { 
  // Navigation
  LayoutDashboard, Ticket, Kanban, Bot, Server, 
  FolderPlus, Users, KeyRound, Layers, Brain, Wand2,
  
  // Actions
  RefreshCw, Trash2, Power, Play, Plus, Download,
  ChevronRight, ChevronDown, Edit, Save, X, Check,
  
  // Status
  Loader2, AlertCircle, CheckCircle2, Clock, Activity,
  Circle, Wifi, AlertTriangle,
  
  // General
  FileCode, Settings, LogOut, Search, Filter
} from 'lucide-react';

// Usage
<Loader2 size={18} className="spinning" />
<CheckCircle2 size={20} color="#22c55e" />
```

### Toast Notifications

```jsx
import toast from 'react-hot-toast';

// Success
toast.success('Operation completed!');

// Error
toast.error('Something went wrong');

// Custom
toast('Hello World', {
  icon: '👋',
  duration: 4000,
});
```

### Auth Context

```jsx
import { useAuth } from '../context/AuthContext';

const { user, token, logout } = useAuth();

// user.name, user.email, user.role
// token - JWT for API calls
// logout() - Sign out function
```

---

## Quick Reference

### Layout Classes (from layout.css)

| Class | Purpose |
|-------|---------|
| `.page-container` | Flex container for sidebar + main |
| `.sidebar` | Fixed 260px sidebar |
| `.page-main` | Main content area (margin-left: 260px) |
| `.nav-item` | Sidebar navigation link |
| `.nav-item.active` | Active nav item (cyan highlight) |

### Color Hex Values

| Color | Hex |
|-------|-----|
| Primary Cyan | `#00d4ff` |
| Primary Hover | `#00b8e6` |
| Background Dark | `#09090b` |
| Card Background | `#1a1a2e` |
| Alt Background | `#16213e` |
| Border Dark | `#333` |
| Border Subtle | `rgba(255,255,255,0.06)` |
| Success Green | `#22c55e` |
| Warning Yellow | `#fbbf24` |
| Danger Red | `#ef4444` |
| Info Blue | `#3b82f6` |
| Purple | `#8b5cf6` |

### Spacing Scale

| Size | Value |
|------|-------|
| xs | `0.25rem` (4px) |
| sm | `0.5rem` (8px) |
| md | `0.75rem` (12px) |
| base | `1rem` (16px) |
| lg | `1.5rem` (24px) |
| xl | `2rem` (32px) |

### Border Radius

| Size | Value |
|------|-------|
| Small | `4px` |
| Medium | `6px` |
| Default | `8px` |
| Large | `12px` |
| Round | `50%` |

---

## Deployment Checklist

Before committing UI changes:

- [ ] CSS imports added to page component
- [ ] Uses `page-container` + `Sidebar` + `page-main` structure
- [ ] No CSS variables without fallback values
- [ ] Route added to App.jsx
- [ ] Menu item added to Sidebar.jsx (if applicable)
- [ ] Colors from established palette only
- [ ] Responsive breakpoints considered
- [ ] Loading and empty states implemented
- [ ] Toast notifications for user feedback
- [ ] Error handling with try/catch

### Build and Test

```bash
cd /opt/swarm-app/apps/dashboard
npm run build
# Check for build errors
pm2 restart swarm-dashboard
```

---

*Last Updated: December 22, 2024*
*Dashboard Location: `/opt/swarm-app/apps/dashboard/`*
