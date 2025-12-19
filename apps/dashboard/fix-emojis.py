#!/usr/bin/env python3
import re
import os

pages_dir = '/opt/swarm-dashboard/src/pages'

# Fix AdminUsers.jsx - add Bot icon import and replace
filepath = os.path.join(pages_dir, 'AdminUsers.jsx')
with open(filepath, 'r') as f:
    content = f.read()

# Add User icon to existing lucide imports if not present
if 'User,' not in content and "from 'lucide-react'" in content:
    content = re.sub(
        r"(from 'lucide-react';)",
        r"User, \1",
        content,
        count=1
    )
elif "from 'lucide-react'" not in content:
    content = content.replace(
        "import Sidebar from '../components/Sidebar';",
        "import Sidebar from '../components/Sidebar';\nimport { User } from 'lucide-react';"
    )

content = content.replace('<span className="role-icon">👤</span>', '<User size={14} />')
with open(filepath, 'w') as f:
    f.write(content)
print("Fixed AdminUsers.jsx")

# Fix KanbanBoard.jsx
filepath = os.path.join(pages_dir, 'KanbanBoard.jsx')
with open(filepath, 'r') as f:
    content = f.read()

# Add Bot, User to imports
if 'Bot,' not in content:
    content = re.sub(
        r"(from 'lucide-react';)",
        r"Bot, User, \1",
        content
    )

content = content.replace("{ticket.assignee_type === 'agent' ? '🤖' : '👤'}", "{ticket.assignee_type === 'agent' ? <Bot size={14} /> : <User size={14} />}")
with open(filepath, 'w') as f:
    f.write(content)
print("Fixed KanbanBoard.jsx")

# Fix Secrets.jsx
filepath = os.path.join(pages_dir, 'Secrets.jsx')
with open(filepath, 'r') as f:
    content = f.read()

if "from 'lucide-react'" not in content:
    content = content.replace(
        "import Sidebar from '../components/Sidebar';",
        "import Sidebar from '../components/Sidebar';\nimport { Github, Bot } from 'lucide-react';"
    )
else:
    if 'Github,' not in content:
        content = re.sub(r"(from 'lucide-react';)", r"Github, Bot, \1", content)

content = content.replace('{secret.type === "github" ? "🐙" : "🤖"}', '{secret.type === "github" ? <Github size={14} /> : <Bot size={14} />}')
with open(filepath, 'w') as f:
    f.write(content)
print("Fixed Secrets.jsx")

# Fix SpecReview.jsx
filepath = os.path.join(pages_dir, 'SpecReview.jsx')
with open(filepath, 'r') as f:
    content = f.read()

if 'Bot,' not in content:
    content = re.sub(r"(from 'lucide-react';)", r"Bot, \1", content)

content = content.replace('🤖 Request AI Revision', '<Bot size={16} /> Request AI Revision')
with open(filepath, 'w') as f:
    f.write(content)
print("Fixed SpecReview.jsx")

# Fix Tickets.jsx
filepath = os.path.join(pages_dir, 'Tickets.jsx')
with open(filepath, 'r') as f:
    content = f.read()

if 'Bot,' not in content:
    content = re.sub(r"(from 'lucide-react';)", r"Bot, User, \1", content)

content = content.replace("{ticket.assignee_type === 'agent' ? '🤖' : '👤'}", "{ticket.assignee_type === 'agent' ? <Bot size={14} /> : <User size={14} />}")
content = content.replace("{selectedTicket.assignee_type === 'agent' ? '🤖 Agent' : '👤 Human'}", "{selectedTicket.assignee_type === 'agent' ? <><Bot size={14} /> Agent</> : <><User size={14} /> Human</>}")
with open(filepath, 'w') as f:
    f.write(content)
print("Fixed Tickets.jsx")

print("\nAll emoji fixes applied!")
