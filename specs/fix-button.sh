OLD='                    {selectedItem.state === '\''draft'\'' && (
                      <button 
                        className="btn-secondary"
                        onClick={() => handleStartChat(selectedItem)}
                        disabled={actionLoading}
                      >
                        <MessageSquare size={16} />
                        Start Refinement
                      </button>
                    )}'

NEW='                    {selectedItem.state === '\''draft'\'' && (
                      <button 
                        className="btn-secondary"
                        onClick={() => handleStartChat(selectedItem)}
                        disabled={actionLoading}
                      >
                        {actionLoading === `start-${selectedItem.id}` ? (
                          <><Loader2 size={16} className="spin" /> Gathering context...</>
                        ) : (
                          <><MessageSquare size={16} /> Start Refinement</>
                        )}
                      </button>
                    )}'

cd /opt/swarm-app/apps/dashboard/src/pages
cp Backlog.jsx Backlog.jsx.bak

# Use node for reliable string replacement
node -e "
const fs = require('fs');
let content = fs.readFileSync('Backlog.jsx', 'utf8');

const oldStr = \`                    {selectedItem.state === 'draft' && (
                      <button 
                        className=\"btn-secondary\"
                        onClick={() => handleStartChat(selectedItem)}
                        disabled={actionLoading}
                      >
                        <MessageSquare size={16} />
                        Start Refinement
                      </button>
                    )}\`;

const newStr = \`                    {selectedItem.state === 'draft' && (
                      <button 
                        className=\"btn-secondary\"
                        onClick={() => handleStartChat(selectedItem)}
                        disabled={actionLoading}
                      >
                        {actionLoading === \\\`start-\\\${selectedItem.id}\\\` ? (
                          <><Loader2 size={16} className=\"spin\" /> Gathering context...</>
                        ) : (
                          <><MessageSquare size={16} /> Start Refinement</>
                        )}
                      </button>
                    )}\`;

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync('Backlog.jsx', content);
  console.log('SUCCESS: Button updated');
} else {
  console.log('ERROR: Old string not found');
}
"
