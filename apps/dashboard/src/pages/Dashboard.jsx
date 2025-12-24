import React, { useState, useEffect } from 'react';
import { Plus, Users, Building, DollarSign, TrendingUp } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import AddTenantModal from '../components/modals/AddTenantModal';
import { createTenant } from '../services/api';
import { toast } from 'sonner';

const Dashboard = () => {
  const [tenants, setTenants] = useState([]);
  const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Mock data for demonstration
  useEffect(() => {
    // In a real app, this would fetch from API
    setTenants([
      { id: 1, name: 'Acme Corp', units: 12, revenue: 15600 },
      { id: 2, name: 'Tech Solutions Inc', units: 8, revenue: 12800 },
      { id: 3, name: 'Global Enterprises', units: 20, revenue: 28400 }
    ]);
  }, []);

  const handleAddTenant = async (tenantData) => {
    setIsLoading(true);
    try {
      const newTenant = await createTenant(tenantData);
      
      // Add the new tenant to the list
      setTenants(prevTenants => [...prevTenants, newTenant]);
      
      // Close the modal
      setIsAddTenantModalOpen(false);
      
      // Show success message
      toast.success('Tenant created successfully!');
      
    } catch (error) {
      console.error('Error creating tenant:', error);
      toast.error(error.message || 'Failed to create tenant. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsAddTenantModalOpen(false);
  };

  const totalUnits = tenants.reduce((sum, tenant) => sum + tenant.units, 0);
  const totalRevenue = tenants.reduce((sum, tenant) => sum + tenant.revenue, 0);
  const averageRevenue = tenants.length > 0 ? totalRevenue / tenants.length : 0;

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={() => setIsAddTenantModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tenant
          </Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Tenants
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">
              Active tenant accounts
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Units
            </CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUnits}</div>
            <p className="text-xs text-muted-foreground">
              Across all tenants
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Monthly recurring revenue
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Average Revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(averageRevenue).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Per tenant
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Tenant Overview</CardTitle>
            <CardDescription>
              Current tenant accounts and their details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tenants.map((tenant) => (
                <div key={tenant.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <Building className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{tenant.name}</p>
                      <p className="text-sm text-muted-foreground">{tenant.units} units</p>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    ${tenant.revenue.toLocaleString()}/mo
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest updates and changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                No recent activity to display
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AddTenantModal
        open={isAddTenantModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleAddTenant}
        isLoading={isLoading}
      />
    </div>
  );
};

export default Dashboard;