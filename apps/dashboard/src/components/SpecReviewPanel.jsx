import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const PRIORITY_COLORS = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
  urgent: 'bg-purple-100 text-purple-800'
};

const SpecReviewPanel = ({ specs }) => {
  const [expandedSpecs, setExpandedSpecs] = useState({});
  const [reviewStatuses, setReviewStatuses] = useState({});

  useEffect(() => {
    // Initialize review statuses from localStorage
    const savedStatuses = localStorage.getItem('specReviewStatuses');
    if (savedStatuses) {
      setReviewStatuses(JSON.parse(savedStatuses));
    }
  }, []);

  const toggleSpecExpansion = (specId) => {
    setExpandedSpecs(prev => ({
      ...prev,
      [specId]: !prev[specId]
    }));
  };

  const updateReviewStatus = (specId, status) => {
    const newStatuses = {
      ...reviewStatuses,
      [specId]: status
    };
    setReviewStatuses(newStatuses);
    localStorage.setItem('specReviewStatuses', JSON.stringify(newStatuses));
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800' },
      approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
      needs_revision: { label: 'Needs Revision', color: 'bg-orange-100 text-orange-800' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getPriorityBadge = (priority) => {
    const colorClass = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </span>
    );
  };

  const hasHighPriorityUnreviewed = (spec) => {
    const status = reviewStatuses[spec.id] || 'pending';
    return (spec.priority === 'high' || spec.priority === 'urgent') && status === 'pending';
  };

  if (!specs || specs.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Specification Review</h2>
        <p className="text-gray-500">No specifications available for review.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-gray-900">Specification Review</h2>
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
          <span className="text-sm text-gray-600">
            {specs.filter(spec => hasHighPriorityUnreviewed(spec)).length} high priority pending
          </span>
        </div>
      </div>
      
      <div className="space-y-4">
        {specs.map((spec) => {
          const isExpanded = expandedSpecs[spec.id];
          const reviewStatus = reviewStatuses[spec.id] || 'pending';
          const isHighPriority = hasHighPriorityUnreviewed(spec);
          
          return (
            <div
              key={spec.id}
              className={`border rounded-lg p-4 transition-colors ${
                isHighPriority ? 'border-amber-200 bg-amber-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => toggleSpecExpansion(spec.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="h-5 w-5" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5" />
                    )}
                  </button>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">{spec.title}</h3>
                    <p className="text-xs text-gray-500">{spec.description}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getPriorityBadge(spec.priority)}
                  {getStatusBadge(reviewStatus)}
                  {isHighPriority && (
                    <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                  )}
                </div>
              </div>
              
              {isExpanded && (
                <div className="mt-4 pl-8">
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Specification Details</h4>
                    <div className="text-sm text-gray-700">
                      <p><strong>Requirements:</strong> {spec.requirements}</p>
                      <p><strong>Acceptance Criteria:</strong> {spec.acceptanceCriteria}</p>
                      <p><strong>Technical Notes:</strong> {spec.technicalNotes}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700">Review Status:</span>
                    <select
                      value={reviewStatus}
                      onChange={(e) => updateReviewStatus(spec.id, e.target.value)}
                      className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="pending">Pending Review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="needs_revision">Needs Revision</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SpecReviewPanel;