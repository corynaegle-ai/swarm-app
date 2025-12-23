const express = require('express');
const healthcheckRouter = require('./healthcheck');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use('/api', healthcheckRouter);

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
