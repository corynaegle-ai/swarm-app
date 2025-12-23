const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Comment text cannot be empty'
      },
      len: {
        args: [1, 5000],
        msg: 'Comment text must be between 1 and 5000 characters'
      }
    }
  },
  ticketId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Tickets',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Tenants',
      key: 'id'
    },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'Comments',
  timestamps: true,
  indexes: [
    {
      fields: ['ticketId']
    },
    {
      fields: ['userId']
    },
    {
      fields: ['tenantId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Define associations
Comment.associate = function(models) {
  Comment.belongsTo(models.Ticket, {
    foreignKey: 'ticketId',
    as: 'ticket'
  });
  
  Comment.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  
  Comment.belongsTo(models.Tenant, {
    foreignKey: 'tenantId',
    as: 'tenant'
  });
};

module.exports = Comment;