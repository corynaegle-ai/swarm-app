import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Person as PersonIcon,
  Business as BusinessIcon
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EditTenantModal from '../components/EditTenantModal';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function AdminUsers() {
  const { user, hasPermission } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [updatingTenant, setUpdatingTenant] = useState(null);

  // Check if user has admin permissions
  const canManageUsers = hasPermission('admin.users.manage');
  const canManageTenants = hasPermission('admin.tenants.manage');

  useEffect(() => {
    if (!canManageUsers && !canManageTenants) {
      setError('You do not have permission to access this page');
      setLoading(false);
      return;
    }
    fetchData();
  }, [canManageUsers, canManageTenants]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const promises = [];
      
      if (canManageUsers) {
        promises.push(apiClient.get('/admin/users'));
      }
      
      if (canManageTenants) {
        promises.push(apiClient.get('/admin/tenants'));
      }

      const responses = await Promise.all(promises);
      
      let responseIndex = 0;
      if (canManageUsers) {
        setUsers(responses[responseIndex].data);
        responseIndex++;
      }
      
      if (canManageTenants) {
        setTenants(responses[responseIndex].data);
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserDialogOpen(true);
  };

  const handleEditTenant = (tenant) => {
    setEditingTenant(tenant);
    setTenantModalOpen(true);
  };

  const handleSaveUser = async (userData) => {
    try {
      setLoading(true);
      await apiClient.put(`/admin/users/${editingUser.id}`, userData);
      setSuccess('User updated successfully');
      setUserDialogOpen(false);
      setEditingUser(null);
      await fetchData();
    } catch (err) {
      setError('Failed to update user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTenant = async (tenantData) => {
    try {
      setUpdatingTenant(editingTenant.id);
      await apiClient.put(`/admin/tenants/${editingTenant.id}`, tenantData);
      setSuccess('Tenant updated successfully');
      setTenantModalOpen(false);
      setEditingTenant(null);
      // Refresh tenant list
      const response = await apiClient.get('/admin/tenants');
      setTenants(response.data);
    } catch (err) {
      setError('Failed to update tenant: ' + err.message);
    } finally {
      setUpdatingTenant(null);
    }
  };

  const handleCloseTenantModal = () => {
    setTenantModalOpen(false);
    setEditingTenant(null);
  };

  const renderUsersTable = () => {
    if (!canManageUsers) return null;

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Users Management
          </Typography>
          {users.length === 0 ? (
            <Typography>No users found</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Tenant</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip 
                          label={user.role} 
                          size="small" 
                          color={user.role === 'admin' ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={user.status} 
                          size="small" 
                          color={user.status === 'active' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>{user.tenant?.name || 'N/A'}</TableCell>
                      <TableCell>
                        <Tooltip title="Edit User">
                          <IconButton 
                            size="small" 
                            onClick={() => handleEditUser(user)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderTenantsTable = () => {
    if (!canManageTenants) return null;

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Tenants Management
          </Typography>
          {tenants.length === 0 ? (
            <Typography>No tenants found</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Domain</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Plan</TableCell>
                    <TableCell>Users Count</TableCell>
                    <TableCell>Created Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>{tenant.name}</TableCell>
                      <TableCell>{tenant.domain}</TableCell>
                      <TableCell>
                        <Chip 
                          label={tenant.status} 
                          size="small" 
                          color={tenant.status === 'active' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={tenant.plan} 
                          size="small" 
                          color={tenant.plan === 'premium' ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell>{tenant.usersCount || 0}</TableCell>
                      <TableCell>
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Edit Tenant">
                          <IconButton 
                            size="small" 
                            onClick={() => handleEditTenant(tenant)}
                            disabled={updatingTenant === tenant.id}
                          >
                            {updatingTenant === tenant.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <EditIcon />
                            )}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!canManageUsers && !canManageTenants) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          You do not have permission to access this page.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Administration
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          {canManageUsers && (
            <Tab 
              icon={<PersonIcon />} 
              label="Users" 
              id="admin-tab-0"
              aria-controls="admin-tabpanel-0"
            />
          )}
          {canManageTenants && (
            <Tab 
              icon={<BusinessIcon />} 
              label="Tenants" 
              id={`admin-tab-${canManageUsers ? 1 : 0}`}
              aria-controls={`admin-tabpanel-${canManageUsers ? 1 : 0}`}
            />
          )}
        </Tabs>
      </Box>

      {canManageUsers && (
        <TabPanel value={tabValue} index={0}>
          {renderUsersTable()}
        </TabPanel>
      )}
      
      {canManageTenants && (
        <TabPanel value={tabValue} index={canManageUsers ? 1 : 0}>
          {renderTenantsTable()}
        </TabPanel>
      )}

      {/* User Edit Dialog */}
      <Dialog 
        open={userDialogOpen} 
        onClose={() => setUserDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          {editingUser && (
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="Name"
                defaultValue={editingUser.name}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Email"
                defaultValue={editingUser.email}
                margin="normal"
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Role</InputLabel>
                <Select defaultValue={editingUser.role} label="Role">
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth margin="normal">
                <InputLabel>Status</InputLabel>
                <Select defaultValue={editingUser.status} label="Status">
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => handleSaveUser({})} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tenant Edit Modal */}
      <EditTenantModal
        open={tenantModalOpen}
        tenant={editingTenant}
        onSave={handleSaveTenant}
        onClose={handleCloseTenantModal}
        loading={updatingTenant === editingTenant?.id}
      />
    </Box>
  );
}

export default AdminUsers;