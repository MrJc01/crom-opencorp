const fs = require('fs');
const path = require('path');

const dir = '/home/j/.opencorp/workspaces/yt-factory-01/.opencorp/agents';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace model line
  content = content.replace(/^model:\s+.*$/m, 'model: opencode/nemotron-3-ultra-free');
  
  // Replace rotation line
  content = content.replace(/^rotation:\s+\[.*\]$/m, 'rotation: [opencode/nemotron-3-ultra-free, opencode/nemotron-3.5-lightning-free, openrouter/openrouter/free, openrouter/qwen/qwen3.8-27b:free]');
  
  fs.writeFileSync(filePath, content);
  console.log(`Patched ${file}`);
}
