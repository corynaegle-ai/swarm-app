import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Backlog from '../Backlog';

// Mock the API module
jest.mock('../../utils/api');

const MockedBacklog = () => (
  <BrowserRouter>
    <Backlog />
  </BrowserRouter>
);

describe('Backlog New Idea Button', () => {
  test('new idea button has red-themed hover shadow CSS variable', () => {
    render(<MockedBacklog />);
    const newIdeaBtn = screen.getByText('New Idea').closest('button');
    
    expect(newIdeaBtn).toBeInTheDocument();
    expect(newIdeaBtn.style.getPropertyValue('--hover-shadow')).toBe('rgba(255, 68, 68, 0.3)');
  });

  test('button maintains proper styling structure', () => {
    render(<MockedBacklog />);
    const newIdeaBtn = screen.getByText('New Idea').closest('button');
    
    expect(newIdeaBtn).toHaveClass('new-idea-btn');
    expect(newIdeaBtn.querySelector('svg')).toBeInTheDocument(); // Plus icon
  });
});