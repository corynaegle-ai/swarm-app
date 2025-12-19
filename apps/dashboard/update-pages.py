#!/usr/bin/env python3
import re
import os

pages_dir = '/opt/swarm-dashboard/src/pages'
files = ['Tickets.jsx', 'KanbanBoard.jsx', 'AgentMonitor.jsx', 'CreateProject.jsx', 
         'AdminUsers.jsx', 'Secrets.jsx', 'DesignSession.jsx', 'SpecReview.jsx']

# Pattern to match the old header/nav structure
nav_pattern = re.compile(
    r'<nav className="dashboard-nav">.*?</nav>',
    re.DOTALL
)

header_pattern = re.compile(
    r'<header className="dashboard-header">.*?</header>',
    re.DOTALL
)

for filename in files:
    filepath = os.path.join(pages_dir, filename)
    if not os.path.exists(filepath):
        print(f"Skipping {filename} - not found")
        continue
    
    print(f"Processing {filename}...")
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace UserMenu import with Sidebar
    content = content.replace(
        "import UserMenu from '../components/UserMenu';",
        "import Sidebar from '../components/Sidebar';"
    )
    
    # Remove the header section
    content = header_pattern.sub('', content)
    
    # Remove the nav section
    content = nav_pattern.sub('<Sidebar />', content, count=1)
    
    # Update wrapper class
    content = re.sub(
        r'<div className="dashboard[^"]*">',
        '<div className="page-container">',
        content,
        count=1
    )
    
    # Update main class
    content = content.replace('dashboard-main', 'page-main')
    
    # Clean up any leftover UserMenu references
    content = content.replace('<UserMenu />', '')
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"  Updated {filename}")

print("\nAll pages updated!")
