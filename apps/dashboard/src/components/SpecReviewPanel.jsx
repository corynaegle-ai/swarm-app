import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';

// Updated priority colors to match ticket system PRIORITY_CONFIG
const PRIORITY_COLORS = {
  'Critical': 'bg-red-500 text-white',
  'High': 'bg-orange-500 text-white',
  'Medium': 'bg-yellow-500 text-black',
  'Low': 'bg-green-500 text-white'
};

const STATUS_COLORS = {
  'pending': 'bg-yellow-100 text-yellow-800',
  'in-review': 'bg-blue-100 text-blue-800',
  'approved': 'bg-green-100 text-green-800',
  'rejected': 'bg-red-100 text-red-800'
};

const STATUS_ICONS = {
  'pending': Clock,
  'in-review': AlertCircle,
  'approved': CheckCircle,
  'rejected': AlertCircle
};

export default function SpecReviewPanel({ specs = [], onReview, onApprove, onReject }) {
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [filteredSpecs, setFilteredSpecs] = useState(specs);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => {
    let filtered = specs;
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(spec => spec.status === statusFilter);
    }
    
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(spec => spec.priority === priorityFilter);
    }
    
    setFilteredSpecs(filtered);
  }, [specs, statusFilter, priorityFilter]);

  const handleReviewSubmit = (action) => {
    if (!selectedSpec) return;
    
    const reviewData = {
      specId: selectedSpec.id,
      action,
      comment: reviewComment,
      timestamp: new Date().toISOString()
    };
    
    switch (action) {
      case 'approve':
        onApprove?.(reviewData);
        break;
      case 'reject':
        onReject?.(reviewData);
        break;
      default:
        onReview?.(reviewData);
    }
    
    setSelectedSpec(null);
    setReviewComment('');
  };

  const getPriorityBadgeClass = (priority) => {
    return PRIORITY_COLORS[priority] || 'bg-gray-500 text-white';
  };

  const getStatusBadgeClass = (status) => {
    return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status) => {
    return STATUS_ICONS[status] || Clock;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Specification Review Panel</CardTitle>
          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium">Status Filter:</label>
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="ml-2 px-2 py-1 border rounded"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="in-review">In Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Priority Filter:</label>
              <select 
                value={priorityFilter} 
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="ml-2 px-2 py-1 border rounded"
              >
                <option value="all">All</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {filteredSpecs.map((spec) => {
              const StatusIcon = getStatusIcon(spec.status);
              return (
                <Card key={spec.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedSpec(spec)}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold">{spec.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{spec.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <StatusIcon className="w-4 h-4" />
                          <Badge className={getStatusBadgeClass(spec.status)}>
                            {spec.status}
                          </Badge>
                          <Badge className={getPriorityBadgeClass(spec.priority)}>
                            {spec.priority}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            Created: {new Date(spec.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedSpec && (
        <Card>
          <CardHeader>
            <CardTitle>Review Specification: {selectedSpec.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium">Specification Details</h4>
              <p className="text-sm text-gray-600 mt-1">{selectedSpec.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={getStatusBadgeClass(selectedSpec.status)}>
                  {selectedSpec.status}
                </Badge>
                <Badge className={getPriorityBadgeClass(selectedSpec.priority)}>
                  {selectedSpec.priority}
                </Badge>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Review Comment</label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Add your review comments here..."
                className="mt-1"
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={() => handleReviewSubmit('approve')} 
                className="bg-green-600 hover:bg-green-700"
              >
                Approve
              </Button>
              <Button 
                onClick={() => handleReviewSubmit('reject')} 
                variant="destructive"
              >
                Reject
              </Button>
              <Button 
                onClick={() => handleReviewSubmit('review')} 
                variant="outline"
              >
                Submit Review
              </Button>
              <Button 
                onClick={() => {
                  setSelectedSpec(null);
                  setReviewComment('');
                }} 
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}