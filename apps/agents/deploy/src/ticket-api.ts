/**
 * Ticket API Client - Interface to Swarm Ticket System
 * 
 * Queries the ticket API to understand ticket relationships
 * and determine deployment eligibility.
 */

import fetch from 'node-fetch';
import { logger } from './logger';

const TICKET_API_URL = process.env.TICKET_API_URL || 'http://localhost:8080';
const TICKET_API_TOKEN = process.env.TICKET_API_TOKEN || '';

export interface Ticket {
  id: string;
  title: string;
  status: string;
  parent_id: string | null;
  project_id: string;
  metadata?: {
    commit_sha?: string;
    pr_number?: number;
    repo?: string;
  };
}

export interface TicketRelationship {
  ticket: Ticket;
  parent: Ticket | null;
  siblings: Ticket[];
  isFeatureComplete: boolean;
  incompleteSiblings: Ticket[];
}

export class TicketApiClient {
  private baseUrl: string;
  private token: string;
  
  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || TICKET_API_URL;
    this.token = token || TICKET_API_TOKEN;
  }
  
  private async request(endpoint: string, options: any = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`Ticket API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      logger.error('Ticket API request failed', { url, error: error.message });
      throw error;
    }
  }
  
  /**
   * Find a ticket by its linked commit SHA
   */
  async findByCommit(commitSha: string): Promise<Ticket | null> {
    try {
      const result = await this.request(`/api/tickets/by-commit/${commitSha}`);
      return result.ticket || null;
    } catch (error) {
      // If endpoint doesn't exist or ticket not found, return null
      logger.debug('No ticket found for commit', { commitSha });
      return null;
    }
  }
  
  /**
   * Find a ticket by PR number and repo
   */
  async findByPR(repo: string, prNumber: number): Promise<Ticket | null> {
    try {
      const result = await this.request(`/api/tickets/by-pr/${repo}/${prNumber}`);
      return result.ticket || null;
    } catch (error) {
      logger.debug('No ticket found for PR', { repo, prNumber });
      return null;
    }
  }
  
  /**
   * Get a ticket by ID
   */
  async getTicket(ticketId: string): Promise<Ticket | null> {
    try {
      const result = await this.request(`/api/tickets/${ticketId}`);
      return result.ticket || result;
    } catch (error) {
      logger.error('Failed to get ticket', { ticketId, error: error.message });
      return null;
    }
  }
  
  /**
   * Get all children of a parent ticket
   */
  async getChildren(parentId: string): Promise<Ticket[]> {
    try {
      const result = await this.request(`/api/tickets/${parentId}/children`);
      return result.children || result.tickets || [];
    } catch (error) {
      logger.error('Failed to get children', { parentId, error: error.message });
      return [];
    }
  }
  
  /**
   * Get complete relationship info for a ticket
   */
  async getRelationship(ticketId: string): Promise<TicketRelationship | null> {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return null;
    
    let parent: Ticket | null = null;
    let siblings: Ticket[] = [];
    
    if (ticket.parent_id) {
      parent = await this.getTicket(ticket.parent_id);
      siblings = await this.getChildren(ticket.parent_id);
    }
    
    const incompleteSiblings = siblings.filter(s => 
      s.id !== ticket.id && s.status !== 'completed' && s.status !== 'done'
    );
    
    return {
      ticket,
      parent,
      siblings,
      isFeatureComplete: incompleteSiblings.length === 0,
      incompleteSiblings
    };
  }
  
  /**
   * Update ticket metadata with deployment info
   */
  async updateTicketMetadata(ticketId: string, metadata: Record<string, any>): Promise<void> {
    try {
      await this.request(`/api/tickets/${ticketId}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({ metadata })
      });
    } catch (error) {
      logger.error('Failed to update ticket metadata', { ticketId, error: error.message });
    }
  }
  
  /**
   * Link a commit to a ticket
   */
  async linkCommit(ticketId: string, commitSha: string, repo: string, prNumber?: number): Promise<void> {
    try {
      await this.request(`/api/tickets/${ticketId}/link-commit`, {
        method: 'POST',
        body: JSON.stringify({ commit_sha: commitSha, repo, pr_number: prNumber })
      });
    } catch (error) {
      logger.error('Failed to link commit to ticket', { ticketId, commitSha, error: error.message });
    }
  }
  /**
   * Update ticket state (e.g., mark as done after deployment)
   */
  async updateTicketState(ticketId: string, state: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ state })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update ticket state: ${response.status}`);
      }
      
      logger.info('Ticket state updated', { ticketId, state });
      return true;
    } catch (error) {
      logger.error('Failed to update ticket state', { ticketId, state, error: error.message });
      return false;
    }
  }
}

export const ticketApi = new TicketApiClient();
