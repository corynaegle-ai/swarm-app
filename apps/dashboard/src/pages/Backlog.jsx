import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

export default function Backlog() {
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [tickets, setTickets] = useState([
    {
      id: 'TKT-001',
      title: 'Sample Ticket',
      description: 'This is a sample ticket',
      status: 'backlog',
      priority: 'medium'
    }
  ]);

  const handleCreateTicket = () => {
    if (ticketTitle.trim()) {
      const newTicket = {
        id: `TKT-${Date.now()}`,
        title: ticketTitle,
        description: ticketDescription,
        status: 'backlog',
        priority: 'medium'
      };
      setTickets([...tickets, newTicket]);
      setTicketTitle('');
      setTicketDescription('');
      setIsNewTicketOpen(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Backlog</h1>
        <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
          <DialogTrigger asChild>
            <Button 
              className="
                bg-gradient-to-r from-red-500 to-red-600 
                hover:from-red-600 hover:to-red-700 
                text-white font-medium px-6 py-2 rounded-lg 
                transition-all duration-200 
                hover:shadow-lg hover:shadow-red-500/30
                transform hover:scale-105
              "
            >
              + New Idea
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Create New Ticket</DialogTitle>
            <div className="space-y-4 mt-4">
              <Input
                placeholder="Ticket title"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
              />
              <textarea
                className="w-full p-3 border border-gray-300 rounded-md resize-none"
                placeholder="Ticket description"
                rows={4}
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setIsNewTicketOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateTicket}>
                  Create Ticket
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {tickets.map((ticket) => (
          <Card key={ticket.id} className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{ticket.title}</h3>
                <p className="text-gray-600 mt-1">{ticket.description}</p>
                <div className="flex gap-2 mt-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {ticket.status}
                  </span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                    {ticket.priority}
                  </span>
                </div>
              </div>
              <span className="text-sm text-gray-500">{ticket.id}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}