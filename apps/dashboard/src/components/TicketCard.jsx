import React from 'react';
import { Clock, CheckCircle, AlertCircle, MoreVertical } from 'lucide-react';

const TicketCard = ({ ticket, onUpdate, onDelete }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'text-green-500';
            case 'in_progress': return 'text-blue-500';
            case 'closed': return 'text-gray-500';
            default: return 'text-yellow-500';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high': return 'text-red-500 bg-red-100 dark:bg-red-900/20';
            case 'medium': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/20';
            default: return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority || 'low'}
                </div>
                <button
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={() => { }}
                >
                    <MoreVertical size={16} />
                </button>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {ticket.title}
            </h3>

            <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-3">
                {ticket.description}
            </p>

            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    {ticket.status === 'completed' ? (
                        <CheckCircle size={16} className={getStatusColor(ticket.status)} />
                    ) : (
                        <Clock size={16} className={getStatusColor(ticket.status)} />
                    )}
                    <span className={`capitalize ${getStatusColor(ticket.status)}`}>
                        {ticket.status.replace('_', ' ')}
                    </span>
                </div>
                <div className="text-gray-400 text-xs">
                    {new Date(ticket.created_at).toLocaleDateString()}
                </div>
            </div>
        </div>
    );
};

export default TicketCard;
