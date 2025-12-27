import React, { useState, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import { Button, Box, Typography, Container } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

const StyledButton = styled(Button)(({ theme }) => ({
  background: 'linear-gradient(135deg, #ff4444 0%, #cc2200 100%)',
  border: 'none',
  borderRadius: '12px',
  padding: '12px 24px',
  fontSize: '16px',
  fontWeight: '600',
  color: '#ffffff',
  textTransform: 'none',
  boxShadow: '0 4px 12px rgba(255, 68, 68, 0.2)',
  transition: 'all 0.2s ease-in-out',
  minWidth: '160px',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 20px rgba(255, 68, 68, 0.3)',
    background: 'linear-gradient(135deg, #ff5555 0%, #dd3311 100%)',
  },
  '&:active': {
    transform: 'translateY(0)',
  },
}));

const BacklogContainer = styled(Container)(({ theme }) => ({
  marginTop: theme.spacing(4),
  marginBottom: theme.spacing(4),
}));

const HeaderSection = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing(3),
  flexWrap: 'wrap',
  gap: theme.spacing(2),
}));

const BacklogContent = styled(Box)(({ theme }) => ({
  minHeight: '400px',
  backgroundColor: theme.palette.background.paper,
  borderRadius: '12px',
  padding: theme.spacing(3),
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
}));

const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '300px',
  color: theme.palette.text.secondary,
}));

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    const fetchIdeas = async () => {
      setLoading(true);
      try {
        // Mock API call - replace with actual API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIdeas([]);
      } catch (error) {
        console.error('Error fetching ideas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchIdeas();
  }, []);

  const handleNewIdea = () => {
    // Handle new idea creation
    console.log('Creating new idea');
    // This would typically open a modal or navigate to a form
  };

  return (
    <BacklogContainer maxWidth="lg">
      <HeaderSection>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Backlog
        </Typography>
        <StyledButton
          onClick={handleNewIdea}
          startIcon={<AddIcon />}
          variant="contained"
        >
          New Idea
        </StyledButton>
      </HeaderSection>
      
      <BacklogContent>
        {loading ? (
          <EmptyState>
            <Typography variant="h6">
              Loading ideas...
            </Typography>
          </EmptyState>
        ) : ideas.length === 0 ? (
          <EmptyState>
            <Typography variant="h6" gutterBottom>
              No ideas in backlog yet
            </Typography>
            <Typography variant="body2">
              Click "New Idea" to get started
            </Typography>
          </EmptyState>
        ) : (
          // Render ideas list here
          <Box>
            {ideas.map((idea) => (
              <div key={idea.id}>{idea.title}</div>
            ))}
          </Box>
        )}
      </BacklogContent>
    </BacklogContainer>
  );
};

export default Backlog;