const fs = require('fs');
let c = fs.readFileSync('cet4-vocab/js/app.js', 'utf8');

const oldFunc = `  renderImport() {
    const lists = Store.getWordLists();
    const listNames = Object.keys(lists);
    let html = '<div class="card"><div class="card-content">';
    html += '<div style="margin-bottom:12px;font-size:15px;font-weight:500">将单词批量导入到单词本</div>';
    html += '<div style="margin-bottom:8px;font-size:13px;color:var(--text2)">每行一个单词，或逗号分隔。格式：<code>word,释义,音标</code>（释义和音标可选）</div>';
    html += '<textarea id="import-text" placeholder="输入单词，每行一个：\\nabandon\\nability,能力,/\\u0259\\u02c8b\\u026al\\u0259ti/\\naccess" style="width:100%;min-height:150px;padding:12px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;resize:vertical"></textarea>';
    html += '<div style="margin:10px 0">';
    html += '<label style="font-size:14px;font-weight:500">导入到单词本：</label>';
    html += '<select id="import-list" style="margin-left:8px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px">';
    listNames.forEach(n => html += '<option value="' + n.replace(/"/g,'&quot;') + '">' + n + '</option>');
    html += '</select></div>';
    html += '<button class="btn btn-primary" onclick="App.doImport()">📥 开始导入</button>';
    html += '<div id="import-result" style="margin-top:12px;font-size:14px"></div>';
    html += '</div></div>';
    document.getElementById('import-content').innerHTML = html;
  },

  doImport() {
    const text = document.getElementById('import-text')?.value?.trim();
    if (!text) { document.getElementById('import-result').textContent = '\\u26a0\\ufe0f 请先输入单词'; return; }
    const listName = document.getElementById('import-list')?.value || '默认收藏';
    const lines = text.split(/[\\n,]+/).map(l => l.trim()).filter(Boolean);
    let found = 0, added = 0;`;

if (c.indexOf(oldFunc) === -1) {
  console.log('找不到旧函数，尝试宽泛匹配');
  // Try to find by smaller unique segment
  const seg = "html += '<div style=\"margin-bottom:8px;font-size:13px;color:var(--text2)\">每行一个单词";
  const idx = c.indexOf(seg);
  if (idx === -1) { console.log('仍然找不到'); process.exit(1); }
  // Find the end of the function by looking for unique post-import text
  const afterImport = c.indexOf("function importFile", idx);
  // Just replace the renderImport and doImport functions
  // Find from renderImport to the end of doImport (before "speak")
  const speakStart = c.indexOf("  speak(text) {", idx + 1000);
  const replaceFrom = c.lastIndexOf("  renderImport", idx);
  const replaceTo = speakStart;
  
  if (replaceFrom === -1 || replaceTo === -1) { console.log('无法定位函数边界'); process.exit(1); }
  
  console.log('替换范围:', replaceFrom, '-', replaceTo);
  process.exit(0);
}

console.log('找到旧函数，长度:', oldFunc.length);
// Will implement piece by piece
