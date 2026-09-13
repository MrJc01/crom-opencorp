const Database = require('./node_modules/better-sqlite3');
const db = new Database('/home/j/.opencorp/workspaces/yt-factory-01/.opencorp/corp.db'); // readwrite by default

// Try adding flow_id to sessoes
console.log('=== Trying ALTER TABLE sessoes ===');
try {
  db.exec('ALTER TABLE sessoes ADD COLUMN flow_id TEXT');
  console.log('ALTER TABLE sessoes SUCCEEDED');
  const scols = db.prepare('PRAGMA table_info("sessoes")').all();
  scols.forEach(c => console.log('  now:', c.name, c.type));
} catch(e) {
  console.log('ALTER TABLE sessoes FAILED:', e.message.substring(0, 100));
}

// Try adding flow_id to mensagens
console.log('\n=== Trying ALTER TABLE mensagens ===');
try {
  db.exec('ALTER TABLE mensagens ADD COLUMN flow_id TEXT');
  console.log('ALTER TABLE mensagens SUCCEEDED');
  const mcols = db.prepare('PRAGMA table_info("mensagens")').all();
  mcols.forEach(c => console.log('  now:', c.name, c.type));
} catch(e) {
  console.log('ALTER TABLE mensagens FAILED:', e.message.substring(0, 100));
}

db.close();