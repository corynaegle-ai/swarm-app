import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentsSection from '../CommentsSection';
import { formatRelativeTime } from '../../utils/dateUtils';

// Mock the formatRelativeTime function
jest.mock('../../utils/dateUtils', () => ({
  formatRelativeTime: jest.fn()
}));

describe('CommentsSection', () => {
  const mockOnSaveComment = jest.fn();
  const mockComments = [
    {
      id: '1',
      text: 'This is the first comment',
      author: 'John Doe',
      timestamp: '2024-01-01T10:00:00Z'
    },
    {
      id: '2', 
      text: 'This is a more recent comment',
      author: 'Jane Smith',
      timestamp: '2024-01-02T10:00:00Z'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    formatRelativeTime.mockImplementation((date) => `${date} ago`);
  });

  it('renders comments section with heading', () => {
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('renders textarea with correct styling class', () => {
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const textarea = screen.getByPlaceholderText('Add a comment... (Ctrl+Enter to save)');
    expect(textarea).toHaveClass('edit-description-textarea');
  });

  it('renders save button with correct styling class', () => {
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const saveButton = screen.getByText('Save Comment');
    expect(saveButton).toHaveClass('save-btn');
  });

  it('disables save button when textarea is empty', () => {
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const saveButton = screen.getByText('Save Comment');
    expect(saveButton).toBeDisabled();
  });

  it('enables save button when text is entered', async () => {
    const user = userEvent.setup();
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const textarea = screen.getByPlaceholderText('Add a comment... (Ctrl+Enter to save)');
    const saveButton = screen.getByText('Save Comment');
    
    await user.type(textarea, 'Test comment');
    
    expect(saveButton).not.toBeDisabled();
  });

  it('calls onSaveComment when save button is clicked', async () => {
    const user = userEvent.setup();
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const textarea = screen.getByPlaceholderText('Add a comment... (Ctrl+Enter to save)');
    const saveButton = screen.getByText('Save Comment');
    
    await user.type(textarea, 'Test comment');
    await user.click(saveButton);
    
    expect(mockOnSaveComment).toHaveBeenCalledWith('Test comment');
  });

  it('clears textarea after saving comment', async () => {
    const user = userEvent.setup();
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const textarea = screen.getByPlaceholderText('Add a comment... (Ctrl+Enter to save)');
    const saveButton = screen.getByText('Save Comment');
    
    await user.type(textarea, 'Test comment');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('displays comments with user name and timestamp', () => {
    render(<CommentsSection comments={mockComments} onSaveComment={mockOnSaveComment} />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('This is the first comment')).toBeInTheDocument();
    expect(screen.getByText('This is a more recent comment')).toBeInTheDocument();
  });

  it('uses formatRelativeTime for timestamps', () => {
    render(<CommentsSection comments={mockComments} onSaveComment={mockOnSaveComment} />);
    
    expect(formatRelativeTime).toHaveBeenCalledWith('2024-01-01T10:00:00Z');
    expect(formatRelativeTime).toHaveBeenCalledWith('2024-01-02T10:00:00Z');
  });

  it('sorts comments by most recent first', () => {
    render(<CommentsSection comments={mockComments} onSaveComment={mockOnSaveComment} />);
    
    const comments = screen.getAllByText(/This is.*comment/);
    expect(comments[0]).toHaveTextContent('This is a more recent comment');
    expect(comments[1]).toHaveTextContent('This is the first comment');
  });

  it('shows no comments message when comments array is empty', () => {
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    expect(screen.getByText('No comments yet. Be the first to add one!')).toBeInTheDocument();
  });

  it('saves comment when Ctrl+Enter is pressed', async () => {
    const user = userEvent.setup();
    render(<CommentsSection comments={[]} onSaveComment={mockOnSaveComment} />);
    
    const textarea = screen.getByPlaceholderText('Add a comment... (Ctrl+Enter to save)');
    
    await user.type(textarea, 'Test comment');
    await user.keyboard('{Control>}{Enter}{/Control}');
    
    expect(mockOnSaveComment).toHaveBeenCalledWith('Test comment');
  });
});