# RBAC Management Page Specification

## Overview

A comprehensive Role-Based Access Control (RBAC) management interface for the Swarm Platform. This page allows administrators to manage roles, permissions, and role-permission assignments with full CRUD capabilities and visual permission matrices.

## Current System State (from RAG)

### Database Schema
```sql
-- Roles table
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  level INTEGER NOT NULL,  -- Higher = more privilege
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,  -- System roles cannot be deleted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Permissions table  
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),  -- Group permissions by feature
  created_at TIMESTAMP DEFAULT NOW()
);

-- Role-Permission junction table
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id),
  granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID REFERENCES users(id)
);
```

### Current Role Levels
```javascript
const ROLE_LEVELS = {
  SUPER_ADMIN: 100,
  ADMIN: 75,
  DEVELOPER: 50,
  VIEWER: 25
};
```

---

## Route & Permissions

**Route**: `/admin/rbac`
**Required Permission**: `manage:rbac`
**Sidebar**: Add under Admin section with Shield icon

---

## Page Layout

### Tab Navigation
The page uses a tabbed interface with three main sections:
1. **Roles** - Manage role definitions and levels
2. **Permissions** - View/create individual permissions  
3. **Matrix** - Visual permission assignment grid

---

## Tab 1: Roles Management

### Hero Section Stats
| Stat | Description | Color |
|------|-------------|-------|
| Total Roles | Count of all roles | Cyan |
| System Roles | Built-in (non-deletable) | Amber |
| Custom Roles | User-created roles | Blue |
| Avg Permissions | Average per role | Green |

### Role Card Display
Each role displayed as a card showing:
- Role name with level badge
- Description
- Permission count pill
- User count (users assigned to role)
- Created/updated timestamps
- Actions: Edit, Delete (if not system role)

### Create/Edit Role Modal
```jsx
Fields:
- name (required, unique)
- level (required, 1-100 slider with preset markers)
- description (optional, textarea)
- Copy permissions from (optional, dropdown of existing roles)
```

### Role Level Visual
```
|-------|-------|-------|-------|
25      50      75      100
VIEWER  DEV     ADMIN   SUPER
```

---

## Tab 2: Permissions Management

### Permission Categories (Suggested)
| Category | Permissions |
|----------|-------------|
| `tickets` | view:tickets, create:tickets, edit:tickets, delete:tickets, assign:tickets |
| `vms` | view:vms, start:vms, stop:vms, destroy:vms, ssh:vms |
| `agents` | view:agents, create:agents, control:agents, configure:agents |
| `projects` | view:projects, create:projects, edit:projects, delete:projects |
| `users` | view:users, create:users, edit:users, delete:users, impersonate:users |
| `rbac` | view:rbac, manage:rbac |
| `system` | view:logs, manage:settings, manage:secrets, admin:full |

### Permissions Table
| Column | Description |
|--------|-------------|
| Name | Permission identifier (e.g., `view:tickets`) |
| Description | Human-readable explanation |
| Category | Grouping for organization |
| Roles | Count of roles with this permission |
| Actions | Edit, Delete (if no roles assigned) |

### Create Permission Modal
```jsx
Fields:
- name (required, format: action:resource, e.g., "create:tickets")
- description (required)
- category (required, dropdown + "Create new")
```

### Bulk Actions
- Select multiple permissions
- Bulk delete (only unassigned)
- Bulk assign to role

---

## Tab 3: Permission Matrix

### Visual Grid Layout
```
                    │ VIEWER │ DEVELOPER │ ADMIN │ SUPER_ADMIN │
────────────────────┼────────┼───────────┼───────┼─────────────┤
TICKETS             │        │           │       │             │
  view:tickets      │   ✓    │     ✓     │   ✓   │      ✓      │
  create:tickets    │        │     ✓     │   ✓   │      ✓      │
  edit:tickets      │        │     ✓     │   ✓   │      ✓      │
  delete:tickets    │        │           │   ✓   │      ✓      │
────────────────────┼────────┼───────────┼───────┼─────────────┤
VMs                 │        │           │       │             │
  view:vms          │   ✓    │     ✓     │   ✓   │      ✓      │
  start:vms         │        │     ✓     │   ✓   │      ✓      │
  stop:vms          │        │     ✓     │   ✓   │      ✓      │
  destroy:vms       │        │           │   ✓   │      ✓      │
────────────────────┼────────┼───────────┼───────┼─────────────┤
SYSTEM              │        │           │       │             │
  view:rbac         │        │           │   ✓   │      ✓      │
  manage:rbac       │        │           │       │      ✓      │
  admin:full        │        │           │       │      ✓      │
```

### Matrix Features
- **Click cell** → Toggle permission on/off with immediate save
- **Row headers** → Category names (collapsible)
- **Column headers** → Role name + level badge + user count
- **Sticky headers** → Roles stay visible while scrolling
- **Color coding**:
  - Green checkmark = explicitly assigned
  - Amber dot = inherited from higher role (implicit)
  - Empty = not assigned
- **Hover tooltips** → Show who granted permission and when
- **Filter bar** → Filter by category or search permissions

### Bulk Row Operations
- **Grant all** → Assign all permissions in category to selected role
- **Revoke all** → Remove all permissions in category from role
- **Copy column** → Copy role's permissions to another role

---

## API Endpoints

### Roles
```
GET    /api/admin/roles                  - List all roles with stats
POST   /api/admin/roles                  - Create new role
GET    /api/admin/roles/:id              - Get role with permissions
PUT    /api/admin/roles/:id              - Update role (name, level, desc)
DELETE /api/admin/roles/:id              - Delete role (fail if users assigned)
GET    /api/admin/roles/:id/users        - List users with this role
```

### Permissions
```
GET    /api/admin/permissions            - List all with role counts
POST   /api/admin/permissions            - Create new permission
PUT    /api/admin/permissions/:id        - Update permission
DELETE /api/admin/permissions/:id        - Delete (fail if role-assigned)
GET    /api/admin/permissions/categories - List unique categories
```

### Role-Permission Assignments
```
GET    /api/admin/roles/:id/permissions  - Get role's permissions
POST   /api/admin/roles/:id/permissions  - Assign permission(s) to role
DELETE /api/admin/roles/:roleId/permissions/:permId - Revoke single
POST   /api/admin/roles/:id/permissions/bulk  - Bulk assign/revoke
```

### Matrix
```
GET    /api/admin/rbac/matrix            - Full matrix data
PUT    /api/admin/rbac/matrix            - Bulk update matrix
POST   /api/admin/rbac/cache/clear       - Clear permissions cache
```

---

## API Response Schemas

### Role Object
```json
{
  "id": "uuid",
  "name": "Developer",
  "level": 50,
  "description": "Standard development access",
  "is_system": false,
  "permissions_count": 12,
  "users_count": 5,
  "created_at": "2024-12-18T...",
  "updated_at": "2024-12-18T..."
}
```

### Permission Object
```json
{
  "id": "uuid",
  "name": "create:tickets",
  "description": "Create new tickets",
  "category": "tickets",
  "roles_count": 3,
  "created_at": "2024-12-18T..."
}
```

### Matrix Response
```json
{
  "roles": [
    { "id": "uuid", "name": "Viewer", "level": 25 },
    { "id": "uuid", "name": "Developer", "level": 50 }
  ],
  "categories": [
    {
      "name": "tickets",
      "permissions": [
        { "id": "uuid", "name": "view:tickets", "description": "..." }
      ]
    }
  ],
  "assignments": {
    "role_uuid": ["permission_uuid", "permission_uuid"]
  }
}
```

---

## React Component Structure

### File: `src/pages/AdminRBAC.jsx`

### State Management
```jsx
const [activeTab, setActiveTab] = useState('roles');
const [roles, setRoles] = useState([]);
const [permissions, setPermissions] = useState([]);
const [categories, setCategories] = useState([]);
const [matrix, setMatrix] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

// Modals
const [showRoleModal, setShowRoleModal] = useState(false);
const [showPermModal, setShowPermModal] = useState(false);
const [editingRole, setEditingRole] = useState(null);
const [editingPerm, setEditingPerm] = useState(null);

// Filters
const [searchQuery, setSearchQuery] = useState('');
const [categoryFilter, setCategoryFilter] = useState('all');
```

### Data Fetching
```jsx
useEffect(() => {
  const fetchData = async () => {
    try {
      const [rolesRes, permsRes, catsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/roles`, authHeaders()),
        fetch(`${API_BASE}/api/admin/permissions`, authHeaders()),
        fetch(`${API_BASE}/api/admin/permissions/categories`, authHeaders())
      ]);
      setRoles(await rolesRes.json());
      setPermissions(await permsRes.json());
      setCategories(await catsRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, []);
```

---

## UI Styling (follows existing admin patterns)

### Color Scheme
```css
/* Role level colors */
--level-super: #f59e0b;    /* Amber for SUPER_ADMIN */
--level-admin: #8b5cf6;    /* Purple for ADMIN */
--level-dev: #3b82f6;      /* Blue for DEVELOPER */
--level-viewer: #6b7280;   /* Gray for VIEWER */

/* Permission states */
--perm-granted: #22c55e;   /* Green checkmark */
--perm-inherited: #f59e0b; /* Amber dot */
--perm-revoked: transparent;

/* Category headers */
--cat-tickets: #06b6d4;
--cat-vms: #8b5cf6;
--cat-agents: #f59e0b;
--cat-system: #ef4444;
```

### Key CSS Classes
```css
.rbac-page { min-height: 100vh; background: #0a0a0a; }
.rbac-tabs { display: flex; gap: 0.5rem; padding: 1rem 2rem; }
.rbac-tab { padding: 0.75rem 1.5rem; border-radius: 8px; }
.rbac-tab.active { background: rgba(0,212,255,0.1); color: #00d4ff; }

.role-card { background: linear-gradient(135deg, #1a1a2e, #16213e); }
.role-level-badge { padding: 0.25rem 0.5rem; border-radius: 4px; }

.perm-matrix { overflow-x: auto; }
.matrix-cell { width: 100px; text-align: center; cursor: pointer; }
.matrix-cell:hover { background: rgba(255,255,255,0.05); }
.matrix-checkbox { width: 20px; height: 20px; }
```

---

## Security Considerations

1. **Self-Protection**: Users cannot modify their own role
2. **Super Admin Lock**: Cannot delete last SUPER_ADMIN role
3. **System Roles**: Built-in roles marked `is_system=true` cannot be deleted
4. **Permission Guard**: API routes protected by `requirePermission('manage:rbac')`
5. **Audit Trail**: All changes logged to `audit_log` table
6. **Cache Invalidation**: Clear RBAC cache after any change
7. **Level Enforcement**: Users can only modify roles below their level

---

## Implementation Checklist

### Phase 1: Backend API (Priority: HIGH)
- [ ] Add `category` column to permissions table
- [ ] Add `is_system` column to roles table
- [ ] Create `GET /api/admin/roles` with stats
- [ ] Create `POST/PUT/DELETE /api/admin/roles`
- [ ] Create `GET /api/admin/permissions` with role counts
- [ ] Create `POST/PUT/DELETE /api/admin/permissions`
- [ ] Create `GET /api/admin/permissions/categories`
- [ ] Create role-permission assignment endpoints
- [ ] Create `GET /api/admin/rbac/matrix`
- [ ] Create `POST /api/admin/rbac/cache/clear`

### Phase 2: Frontend Components (Priority: HIGH)
- [ ] Create `AdminRBAC.jsx` page component
- [ ] Implement tab navigation (Roles/Permissions/Matrix)
- [ ] Build role cards with stats
- [ ] Build permissions table with filtering
- [ ] Build permission matrix grid
- [ ] Implement create/edit role modal
- [ ] Implement create/edit permission modal
- [ ] Add delete confirmations with dependency checks

### Phase 3: Matrix Interactions (Priority: MEDIUM)
- [ ] Click-to-toggle permission cells
- [ ] Bulk row operations (grant/revoke all)
- [ ] Copy role permissions feature
- [ ] Sticky column/row headers
- [ ] Category collapse/expand

### Phase 4: Polish (Priority: LOW)
- [ ] Keyboard navigation in matrix
- [ ] Undo/redo for bulk operations
- [ ] Export permissions report (CSV)
- [ ] Permission usage analytics

---

## Acceptance Criteria

1. ✅ Admin can view all roles with permission counts
2. ✅ Admin can create custom roles with any level 1-100
3. ✅ Admin can edit role name, level, description
4. ✅ Admin can delete custom roles (not system roles)
5. ✅ Admin can view all permissions grouped by category
6. ✅ Admin can create new permissions with category
7. ✅ Admin can toggle permissions on/off in matrix view
8. ✅ Matrix reflects changes immediately (optimistic UI)
9. ✅ Cache is cleared after permission changes
10. ✅ Users cannot modify roles at/above their level
11. ✅ Cannot delete role with users assigned
12. ✅ Cannot delete permission assigned to roles

---

## Testing Checklist

- [ ] Create role → verify appears in list
- [ ] Edit role level → verify middleware respects new level
- [ ] Delete role → verify users' role_id set to null/default
- [ ] Create permission → verify appears in matrix
- [ ] Toggle permission in matrix → verify API updates
- [ ] Bulk assign permissions → verify all assigned
- [ ] Clear cache → verify fresh data on next load
- [ ] Non-admin user → verify 403 on all endpoints
- [ ] Self-modification → verify prevented

---

## Files to Create/Modify

### New Files
- `src/pages/AdminRBAC.jsx` - Main page component
- `routes/rbac.js` - API routes for RBAC management

### Modify Files  
- `src/components/Sidebar.jsx` - Add RBAC nav item
- `src/App.jsx` - Add route `/admin/rbac`
- `middleware/rbac.js` - Add `clearPermissionsCache` export
- Database migrations - Add columns to existing tables

---

*Spec Version: 1.0*
*Created: 2024-12-18*
*Author: Neural + Claude*
