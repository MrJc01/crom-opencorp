import Database from 'better-sqlite3';
const db = new Database('/home/j/.opencorp/workspaces/yt-factory-01/.opencorp/corp.db', {readonly:true});
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map(t=>t.name));
tables.forEach(t => {
  const cols = db.prepare("PRAGMA table_info(" + t.name + ")").all().map(c=>c.name);
  console.log("\n--- " + t.name + " (" + cols.length + " cols) ---");
  console.log(cols.join(', '));
});
db.close();
