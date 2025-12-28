# Prompt: Backlog File Upload API Consistency

**Target File**: `apps/dashboard/src/pages/Backlog.jsx`  
**Repository**: `swarm-app`  
**Priority**: Low  
**Type**: Refactor

---

## Objective

Refactor the file upload in `handleFileUpload` to use the centralized `apiCall` utility instead of direct `fetch`, ensuring consistency with all other API calls in the application.

---

## Current Implementation (Lines ~373-410)

```javascript
const handleFileUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file || !selectedItem) return;
  
  // Check file size (10MB limit)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    toast.error("File too large. Maximum size is 10MB");
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    setUploadProgress(10);
    const token = getAuthToken();  // Manual token fetch
    const res = await fetch(`/api/backlog/${selectedItem.id}/attachments/file`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },  // Manual auth header
      body: formData
    });
    
    setUploadProgress(90);
    
    if (res.ok) {
      const data = await res.json();
      setAttachments(prev => [data.attachment, ...prev]);
      toast.success('File uploaded');
      setShowAttachmentModal(false);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Upload failed');
    }
  } catch (err) {
    toast.error('Upload failed');
  } finally {
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};
```

---

## Problems with Current Implementation

1. **Inconsistent with codebase**: All other API calls use `apiCall()` from `../utils/api`
2. **Manual token handling**: Duplicates logic that `apiCall` already provides
3. **Missing 401 redirect**: Direct `fetch` doesn't handle token expiry/redirect to signin
4. **No base URL support**: Hardcoded path won't work if `VITE_API_URL` is set

---

## Required Changes

### 1. Update `apiCall` in `utils/api.js`

The current `apiCall` always sets `Content-Type: application/json`, which breaks `FormData` uploads. Modify to skip Content-Type for FormData:

```javascript
export async function apiCall(endpoint, options = {}) {
  const token = getAuthToken();
  
  // Don't set Content-Type for FormData (browser sets it with boundary)
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(token && !options.skipAuth && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status === 401) {
    clearAuthToken();
    window.location.href = '/signin';
  }

  return response;
}
```

### 2. Refactor `handleFileUpload` in `Backlog.jsx`

```javascript
const handleFileUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file || !selectedItem) return;
  
  // Check file size (10MB limit)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    toast.error("File too large. Maximum size is 10MB");
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    setUploadProgress(10);
    
    const res = await apiCall(`/api/backlog/${selectedItem.id}/attachments/file`, {
      method: 'POST',
      body: formData  // apiCall now handles FormData correctly
    });
    
    setUploadProgress(90);
    
    if (res.ok) {
      const data = await res.json();
      setAttachments(prev => [data.attachment, ...prev]);
      toast.success('File uploaded');
      setShowAttachmentModal(false);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Upload failed');
    }
  } catch (err) {
    toast.error('Upload failed');
  } finally {
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};
```

### 3. Clean up import

Remove `getAuthToken` from import if no longer used elsewhere in file:

```javascript
// Before
import { apiCall, getAuthToken } from '../utils/api';

// After (if getAuthToken not used elsewhere)
import { apiCall } from '../utils/api';
```

---

## Chat History Key Prop

**Status**: ✅ Already OK

The chat history map at ~line 870 already uses `key={idx}`:

```jsx
chatHistory.map((msg, idx) => (
  <div key={idx} className={`chat-message ${msg.role}`}>
    <div className="message-content">{msg.content}</div>
  </div>
))
```

**Note**: Using array index as key is acceptable here because:
- Chat messages are append-only (no reordering)
- Messages are not deleted or inserted in the middle
- No unique ID is available from the API

If message IDs become available from the backend, prefer using those instead.

---

## Testing Checklist

- [ ] Upload a small file (< 10MB) - should succeed
- [ ] Upload a large file (> 10MB) - should show error toast before upload
- [ ] Upload with expired token - should redirect to /signin
- [ ] Upload with no token - should redirect to /signin
- [ ] Verify no console warnings about missing keys in chat

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/dashboard/src/utils/api.js` | Add FormData detection, skip Content-Type |
| `apps/dashboard/src/pages/Backlog.jsx` | Use `apiCall` for upload, clean import |

---

## Estimated Effort

~15 minutes

---

*Created: 2024-12-23*
