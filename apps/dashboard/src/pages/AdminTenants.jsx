import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import { Edit as EditIcon, Refresh as RefreshIcon } from '@mui/icons-material';

const AdminTenants = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    status: '',
    domain: '',
    contactEmail: ''
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tenants', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tenants: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setTenants(data);
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setError(err.message || 'Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  const updateTenant = async (tenantId, updateData) => {
    setEditLoading(true);
    setEditError(null);
    
    try {
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update tenant: ${response.status} ${response.statusText}`);
      }
      
      const updatedTenant = await response.json();
      
      // Update the tenant in the local state
      setTenants(prevTenants => 
        prevTenants.map(tenant => 
          tenant.id === tenantId ? updatedTenant : tenant
        )
      );
      
      // Close the edit dialog
      setEditDialogOpen(false);
      setSelectedTenant(null);
      
      // Refresh the table data
      await fetchTenants();
      
    } catch (err) {
      console.error('Error updating tenant:', err);
      setEditError(err.message || 'Failed to update tenant');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditClick = (tenant) => {
    setSelectedTenant(tenant);
    setEditForm({
      name: tenant.name || '',
      status: tenant.status || '',
      domain: tenant.domain || '',
      contactEmail: tenant.contactEmail || ''
    });
    setEditError(null);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (selectedTenant) {
      await updateTenant(selectedTenant.id, editForm);
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setSelectedTenant(null);
    setEditError(null);
  };

  const handleRefresh = () => {
    fetchTenants();
  };

  const handleEditFormChange = (field) => (e) => {
    setEditForm(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      case 'suspended':
        return 'warning';
      default:
        return 'default';
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Tenant Management
        </Typography>
        <IconButton 
          onClick={handleRefresh} 
          disabled={loading}
          color="primary"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Domain</TableCell>
                <TableCell>Contact Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Loading tenants...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="textSecondary">
                      No tenants found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((tenant) => (
                  <TableRow key={tenant.id} hover>
                    <TableCell>{tenant.id}</TableCell>
                    <TableCell>{tenant.name}</TableCell>
                    <TableCell>{tenant.domain}</TableCell>
                    <TableCell>{tenant.contactEmail}</TableCell>
                    <TableCell>
                      <Chip
                        label={tenant.status}
                        size="small"
                        color={getStatusColor(tenant.status)}
                      />
                    </TableCell>
                    <TableCell>
                      {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleEditClick(tenant)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditCancel} maxWidth="sm" fullWidth>
        <form onSubmit={handleEditSubmit}>
          <DialogTitle>
            Edit Tenant: {selectedTenant?.name}
          </DialogTitle>
          <DialogContent>
            {editError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {editError}
              </Alert>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Name"
                value={editForm.name}
                onChange={handleEditFormChange('name')}
                fullWidth
                required
              />
              <TextField
                label="Domain"
                value={editForm.domain}
                onChange={handleEditFormChange('domain')}
                fullWidth
                required
              />
              <TextField
                label="Contact Email"
                type="email"
                value={editForm.contactEmail}
                onChange={handleEditFormChange('contactEmail')}
                fullWidth
                required
              />
              <TextField
                label="Status"
                value={editForm.status}
                onChange={handleEditFormChange('status')}
                fullWidth
                required
                select
                SelectProps={{ native: true }}
              >
                <option value="">Select Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleEditCancel} disabled={editLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={editLoading}
              startIcon={editLoading ? <CircularProgress size={16} /> : null}
            >
              {editLoading ? 'Updating...' : 'Update'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
};

export default AdminTenants;