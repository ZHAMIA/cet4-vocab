/**
 * app.js — 核心应用逻辑 + 路由 + 页面渲染
 */
const App = {
  currentSource: 'core',
  currentWordIndex: 0,
  currentStudyMode: 'en2cn',
  quizWords: [],
  quizIndex: 0,
  showAnswer: false,
  revealStage: 0,
  currentListName: null,
  quizMode: 'normal',

  getWordDB() {
    if (this.currentSource === 'list') {
      const ids = this.currentListName ? Store.getWordList(this.currentListName) : Store.getAllWordsInLists();
      return ids.map(id => Store.findWord(id)).filter(Boolean);
    }
    return Store.getWordsBySource(this.currentSource);
  },

  init() {
    this.router();
    window.addEventListener('hashchange', () => this.router());
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      const onStudy = location.hash === '#study';
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (inInput) return;
      if (!onStudy) return;
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        this.studyReveal();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextWord();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevWord();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const w = this.getWordDB()[this.currentWordIndex];
        if (w) this.speak(w.word);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const w = this.getWordDB()[this.currentWordIndex];
        if (w && w.example) this.speak(w.example);
      }
    });
  },

  router() {
    const hash = location.hash || '#dashboard';
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    switch (hash) {
      case '#dashboard':
        document.getElementById('page-dashboard')?.classList.remove('hidden');
        document.querySelector('[data-page="dashboard"]')?.classList.add('active');
        this.renderDashboard();
        break;
      case '#study':
        document.getElementById('page-study')?.classList.remove('hidden');
        document.querySelector('[data-page="study"]')?.classList.add('active');
        this.renderStudy();
        break;
      case '#quiz':
        document.getElementById('page-quiz')?.classList.remove('hidden');
        document.querySelector('[data-page="quiz"]')?.classList.add('active');
        this.showQuizModePicker();
        break;
      case '#words':
        document.getElementById('page-words')?.classList.remove('hidden');
        document.querySelector('[data-page="words"]')?.classList.add('active');
        this.renderWordList();
        break;
      case '#lists':
        document.getElementById('page-lists')?.classList.remove('hidden');
        this.renderLists();
        break;
      case '#import':
        document.getElementById('page-import')?.classList.remove('hidden');
        this.renderImport();
        break;
      default:
        location.hash = '#dashboard';
    }
  },

  // ============ 仪表盘 ============
  renderDashboard() {
    const stats = Store.getStats();
    const sources = Store.getWordSources();
    const learnData = Store.getLearnData();

    document.getElementById('stat-learned').textContent = stats.totalLearned;
    document.getElementById('stat-mastered').textContent = stats.totalMastered;
    document.getElementById('stat-streak').textContent = `${stats.streak} 天`;
    document.getElementById('stat-today').textContent = stats.todayLearned + stats.todayReviewed;

    Calendar.render('calendar-container', Store.getStreakData());

    let sourceHtml = '<div class="source-cards">';
    sources.forEach(s => {
      const count = Object.keys(learnData).filter(id => {
        const w = Store.findWord(Number(id));
        if (!w) return false;
        if (s.id === 'core') return w.id <= 100;
        if (s.id === 'listening') return w.id >= 200 && w.id < 300;
        if (s.id === 'tricky') return w.id >= 300;
        return false;
      }).length;
      sourceHtml += `<div class="source-card" onclick="App.switchSource('${s.id}')">
        <div class="source-icon">${s.icon}</div>
        <div class="source-name">${s.name}</div>
        <div class="source-count">${s.count} 词 · 已学 ${count}</div>
      </div>`;
    });
    sourceHtml += '</div>';
    document.getElementById('source-selector').innerHTML = sourceHtml;

    // 添加单词本到面板
    const lists = Store.getWordLists();
    let listHtml = '';
    Object.entries(lists).forEach(([name, ids]) => {
      const mastered = ids.filter(id => learnData[id] && learnData[id].level >= 4).length;
      listHtml += '<div class="list-card" style="margin-bottom:8px;cursor:pointer" onclick="App.switchToList(\'' + name.replace(/'/g, "\\'") + '\')">';
      listHtml += '<div style="flex:1"><div style="font-size:15px;font-weight:600">📁 ' + name + '</div><div style="font-size:12px;color:var(--text2)">' + ids.length + ' 词 · 已掌握 ' + mastered + '</div></div>';
      listHtml += '<button class="btn btn-outline" style="flex:none;padding:4px 12px;font-size:12px" onclick="event.stopPropagation();App.switchToList(\'' + name.replace(/'/g, "\\'") + '\')">学习</button>';
      listHtml += '</div>';
    });
    if (listHtml) document.getElementById('wordlist-dashboard').innerHTML = '<div style="margin-top:16px;font-size:16px;font-weight:600">📁 我的单词本</div>' + listHtml;

    const dueWords = SM2.getDueWords(learnData);
    const curSource = Store.getWordSources().find(s => s.id === this.currentSource);
    let html = '';
    if (dueWords.length > 0) {
      html += '<div class="task-item">📝 复习 <strong>' + dueWords.length + '</strong> 个待复习单词</div>';
    }
    const words = this.getWordDB();
    if (words.length > 0) {
      const cur = words[this.currentWordIndex];
      if (cur) {
        html += '<div class="task-item">📖 学习中：<strong>' + (curSource?.name || '') + '</strong> · ' + cur.word + ' (' + this.currentWordIndex + '/' + words.length + ')</div>';
      }
    } else {
      html += '<div class="task-item">📖 当前学习：<strong>' + (curSource?.name || '') + '</strong></div>';
    }
    if (!html) html = '<div class="task-item done">✅ 今日任务已完成</div>';
    document.getElementById('task-list').innerHTML = html;

    // 学习诊断
    const analysis = Store.getWeaknessAnalysis();
    let hasData = false;
    let diagHtml = '<div style="margin-top:20px"><div class="page-title" style="font-size:18px;margin-bottom:12px">📊 学习诊断</div>';
    const sourceNames = { core: '📖 核心高频', listening: '🎧 听力场景', tricky: '🎯 熟词生义', imported: '📥 导入词', other: '其他' };
    Object.entries(analysis).forEach(([key, val]) => {
      if (val.total === 0) return;
      hasData = true;
      const rate = Math.round(val.correct / val.total * 100);
      const color = rate >= 80 ? 'var(--accent)' : rate >= 60 ? 'var(--warn)' : 'var(--danger)';
      diagHtml += '<div class="diag-row"><div class="diag-label">' + (sourceNames[key] || key) + '</div>';
      diagHtml += '<div class="diag-bar-bg"><div class="diag-bar" style="width:' + rate + '%;background:' + color + '"></div></div>';
      diagHtml += '<div class="diag-rate" style="color:' + color + '">' + rate + '%</div>';
      diagHtml += '<div class="diag-count">' + val.correct + '/' + val.total + '</div></div>';
    });
    // 没用测验数据的场景，按学习记录生成简单诊断
    if (!hasData && stats.totalLearned > 0) {
      const mastered = stats.totalMastered;
      const rate = stats.totalLearned > 0 ? Math.round(mastered / stats.totalLearned * 100) : 0;
      const color = rate >= 50 ? 'var(--accent)' : rate >= 30 ? 'var(--warn)' : 'var(--danger)';
      diagHtml += '<div class="diag-row"><div class="diag-label">📖 总体</div>';
      diagHtml += '<div class="diag-bar-bg"><div class="diag-bar" style="width:' + rate + '%;background:' + color + '"></div></div>';
      diagHtml += '<div class="diag-rate" style="color:' + color + '">' + rate + '%</div>';
      diagHtml += '<div class="diag-count">' + mastered + '/' + stats.totalLearned + '</div></div>';
      diagHtml += '<div style="font-size:12px;color:var(--text2);margin-top:4px">💡 多做测验获取更详细的分类诊断</div>';
      hasData = true;
    }
    if (!hasData) {
      diagHtml += '<div style="padding:20px 0;text-align:center;color:var(--text2);font-size:14px">📊 去做几道题，这里会显示你的弱点分析</div>';
    }
    diagHtml += '</div>';
    document.getElementById('diagnosis-section').innerHTML = diagHtml;

    // 成就检测
    const newAchi = Store.checkAchievements(stats);
    if (newAchi.length > 0) {
      let aHtml = '<div class="achi-popup" id="achi-popup">';
      newAchi.forEach(a => {
        aHtml += '<div class="achi-card"><div class="achi-icon">' + a.icon + '</div><div class="achi-name">' + a.name + '</div><div class="achi-desc">' + a.desc + '</div></div>';
      });
      aHtml += '</div>';
      document.getElementById('achievement-section').innerHTML = aHtml;
      setTimeout(() => { const el = document.getElementById('achi-popup'); if (el) el.remove(); }, 5000);
    }

    // 已获得成就列表
    const earned = Store.getEarnedAchievements();
    const allAchi = Store.getAllAchievements();
    let earnedHtml = '<div style="margin-top:16px"><div class="page-title" style="font-size:18px;margin-bottom:12px">🏆 成就</div><div class="achi-grid">';
    allAchi.forEach(a => {
      const got = earned.includes(a.id);
      earnedHtml += '<div class="achi-item ' + (got ? '' : 'locked') + '">';
      earnedHtml += '<div class="achi-item-icon">' + (got ? a.icon : '🔒') + '</div>';
      earnedHtml += '<div class="achi-item-name">' + a.name + '</div>';
      earnedHtml += '<div class="achi-item-desc">' + a.desc + '</div></div>';
    });
    earnedHtml += '</div></div>';
    document.getElementById('achievements-list').innerHTML = earnedHtml;
  },

  switchSource(source) {
    this.currentSource = source;
    this.currentListName = null;
    this.revealStage = 0;
    location.hash = '#study';
  },

  switchToList(name) {
    this.currentSource = 'list';
    this.currentListName = name;
    this.revealStage = 0;
    location.hash = '#study';
  },

  // 按词源分别保存/恢复位置
  saveStudyState() {
    const key = this.currentSource + '|' + (this.currentListName || '');
    try {
      const all = JSON.parse(localStorage.getItem('cet4_study_positions') || '{}');
      all[key] = this.currentWordIndex;
      localStorage.setItem('cet4_study_positions', JSON.stringify(all));
    } catch(e) {}
  },

  loadStudyState() {
    try {
      const key = this.currentSource + '|' + (this.currentListName || '');
      const all = JSON.parse(localStorage.getItem('cet4_study_positions') || '{}');
      if (typeof all[key] === 'number') this.currentWordIndex = all[key];
    } catch(e) {}
  },

  // ============ 单词学习 ============
  renderStudy() {
    this.loadStudyState();
    const words = this.getWordDB();
    if (this.currentWordIndex >= words.length || !words.length) {
      this.currentWordIndex = 0;
      this.revealStage = 0;
    }
    if (!words.length) {
      document.getElementById('study-content').innerHTML = '<div class="empty-state">🎉 没有单词可选，先去选择词库吧！</div>';
      return;
    }
    const word = words[this.currentWordIndex];
    if (!word) return;

    const learnData = Store.getLearnData();
    const isBookmarked = Store.isBookmarked(word.id);
    const state = learnData[word.id];
    const stats = Store.getStats();
    const reps = state ? state.reps : 0;
    const level = state ? state.level : 0;
    const nextIn = state ? Math.max(0, Math.ceil((state.nextReview - Date.now()) / (24*60*60*1000))) : '-';
    const safeWord = word.word.replace(/'/g, "\\'");
    const sourceInfo = word.tag ? ` · ${word.type}` : ` · ${word.type || '核心'}`;

    document.getElementById('study-content').innerHTML = `
      <div class="card">
        <div class="card-content">
          <div class="study-progress-bar">
            <div class="progress-text">${this.currentSource === 'list' ? (this.currentListName || '单词本') : (Store.getWordSources().find(s => s.id === this.currentSource)?.name || '')} · 第${this.currentWordIndex + 1}/${words.length}</div>
            ${state ? `<span class="badge level-${level}">Lv.${level}</span>` : '<span class="badge badge-new">新词</span>'}
          </div>

          <div class="word-header">
            <div class="word-word">${word.word}</div>
            <div class="pronounce-tag">
              <span class="pronounce-text">${word.phonetic || ''}</span>
              <span class="speaker-btn" onclick="event.stopPropagation();App.speak('${safeWord}')">🔊</span>
            </div>
          </div>

          ${this.revealStage >= 3 
            ? `<div class="definition-row"><div class="def-item"><span class="pos-tag">${word.pos || ''}</span> ${word.def}</div></div>`
            : `<div class="reveal-hint-def" onclick="App.studyReveal()">${['👆 点击查看例句','👆 点击查看例句译文','👆 点击查看单词释义','🔄 再来一次'][this.revealStage]}</div>`
          }

          <div class="stats-row">
            <div class="stat-item"><div class="stat-label">已学次数</div><div class="stat-value">${reps}</div></div>
            <div class="stat-item"><div class="stat-label">掌握</div><div class="stat-value">${level}/5</div></div>
            <div class="stat-item"><div class="stat-label">下次复习</div><div class="stat-value">${nextIn === '-' ? '-' : nextIn + '天'}</div></div>
            <div class="stat-item"><div class="stat-label">已掌握</div><div class="stat-value">${stats.totalMastered}</div></div>
          </div>

          <div class="section-label">📖 真题例句${word.note ? ` · <span style="font-size:13px;color:#b45f1b;font-weight:400">${word.note}</span>` : ''}</div>
          <div class="example-section" onclick="App.studyReveal()">
            ${this.revealStage >= 1 ? `<div class="example-en">${word.example}</div>` : '<div class="reveal-placeholder">👆 点击显示例句</div>'}
            ${this.revealStage >= 2 ? `<div class="example-zh">${word.example_cn || ''}</div>` : ''}
            ${this.revealStage >= 3 ? `<div class="example-meta">${word.year || ''}${sourceInfo}</div>` : ''}
          </div>

          ${this.revealStage >= 3 && word.collocation ? `
            <div class="section-label" style="margin-top:20px">🔗 四级搭配</div>
            <div class="colloc-section">${word.collocation.split('/').map(c => `<span class="colloc-tag">${c.trim()}</span>`).join('')}</div>
          ` : ''}

          <div class="action-bar">
            <div class="nav-btns">
              <button class="nav-btn" onclick="App.prevWord()" ${this.currentWordIndex === 0 ? 'disabled' : ''}>←</button>
              <button class="nav-btn" onclick="App.nextWord()">→</button>
            </div>
            <div class="action-btns">
              <button class="action-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="App.toggleBookmark(${word.id})">${isBookmarked ? '⭐' : '☆'}</button>
              <button class="action-btn play-btn" onclick="App.speakExample(${word.id})">💬</button>
              <button class="action-btn" onclick="App.showAddToList(${word.id})" title="加入单词本">📁</button>
            </div>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:4px"><span style="font-size:11px;color:var(--text2);cursor:pointer" onclick="App.diagSpeech()">🔊 无声？点此诊断</span></div>`;

    Store.logDailyActivity(new Date().toISOString().split('T')[0], 'learn');
  },

  studyReveal() {
    this.revealStage = (this.revealStage + 1) % 4;
    this.renderStudy();
  },

  nextWord() {
    const words = this.getWordDB();
    if (this.currentWordIndex < words.length - 1) {
      this.currentWordIndex++;
      this.revealStage = 0;
      this.saveStudyState();
      this.renderStudy();
    } else {
      this.currentWordIndex = 0;
      this.revealStage = 0;
      this.saveStudyState();
      this.renderStudy();
    }
  },

  prevWord() {
    this.revealStage = 0;
    if (this.currentWordIndex > 0) {
      this.currentWordIndex--;
      this.saveStudyState();
      this.renderStudy();
    }
  },

  // ============ 加入单词本弹窗 ============
  showAddToList(wordId) {
    const lists = Store.getWordLists();
    const listNames = Object.keys(lists);
    let html = `<div class="modal-overlay" onclick="this.remove()"><div class="modal" onclick="event.stopPropagation()">
      <div style="font-size:18px;font-weight:600;margin-bottom:12px">📁 加入单词本</div>`;
    listNames.forEach(name => {
      const checked = lists[name].includes(wordId) ? 'checked' : '';
      html += `<label class="list-option"><input type="checkbox" ${checked} onchange="App.toggleListWord('${name.replace(/'/g, "\\'")}', ${wordId}, this.checked)"> ${name} (${lists[name].length})</label>`;
    });
    html += `<div style="margin-top:12px;display:flex;gap:8px">
      <input id="new-list-input" placeholder="新建单词本..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px">
      <button class="btn" style="flex:none;padding:8px 16px;background:var(--primary);color:white" onclick="App.createListAndAdd(document.getElementById('new-list-input').value, ${wordId})">新建</button>
    </div>
    <button class="btn btn-outline" style="margin-top:10px" onclick="this.closest('.modal-overlay').remove()">关闭</button>
    </div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  toggleListWord(name, wordId, checked) {
    if (checked) Store.addToList(wordId, name);
    else Store.removeFromList(wordId, name);
  },

  createListAndAdd(name, wordId) {
    if (!name.trim()) return;
    Store.createWordList(name.trim());
    Store.addToList(wordId, name.trim());
    document.querySelector('.modal-overlay')?.remove();
  },

  // ============ 闪卡测验 ============
  showQuizModePicker() {
    document.getElementById('quiz-content').innerHTML = `
      <div class="quiz-mode-picker">
        <h2 style="margin-bottom:16px">选择测验模式</h2>
        <div class="mode-card" onclick="App.startNormalQuiz()">
          <div style="font-size:32px">📝</div>
          <div class="mode-name">英⇄中 闪卡</div>
          <div class="mode-desc">看英文选中文 / 看中文拼英文</div>
        </div>
        <div class="mode-card" onclick="App.startListeningQuiz()">
          <div style="font-size:32px">🎧</div>
          <div class="mode-name">听音辨义</div>
          <div class="mode-desc">听单词发音，选择正确释义（专练听力）</div>
        </div>
      </div>`;
  },

  startNormalQuiz() {
    this.quizMode = 'normal';
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB];
    this.quizWords = words.sort(() => Math.random() - 0.5).slice(0, Math.min(20, words.length));
    this.quizIndex = 0;
    this.currentStudyMode = Math.random() > 0.5 ? 'en2cn' : 'cn2en';
    this.renderQuiz();
  },

  startListeningQuiz() {
    this.quizMode = 'listening';
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB, ...ListeningWords];
    const listeningPool = words.sort(() => Math.random() - 0.5);
    this.quizWords = listeningPool.slice(0, Math.min(15, listeningPool.length));
    this.quizIndex = 0;
    this.renderQuiz();
  },

  renderQuiz() {
    if (this.quizIndex >= this.quizWords.length) {
      document.getElementById('quiz-content').innerHTML = `
        <div class="quiz-complete">
          <div class="complete-icon">🎉</div>
          <h2>本轮测验完成！</h2>
          <p>本次共完成 ${this.quizWords.length} 题</p>
          <button class="btn btn-primary" onclick="App.showQuizModePicker()">选择模式</button>
          <button class="btn btn-outline" onclick="location.hash='#dashboard'">返回</button>
        </div>`;
      return;
    }
    const word = this.quizWords[this.quizIndex];
    if (!word) return;
    this.showAnswer = false;
    if (this.quizMode === 'listening') this.renderListeningQuiz(word);
    else this.renderNormalQuiz(word);
  },

  renderNormalQuiz(word) {
    const prompt = this.currentStudyMode === 'en2cn' ? word.word : word.def;
    const answer = this.currentStudyMode === 'en2cn' ? word.def : word.word;
    const safePrompt = prompt.replace(/'/g, "\\'");
    document.getElementById('quiz-content').innerHTML = `
      <div class="quiz-progress">
        <span>第 ${this.quizIndex + 1} / ${this.quizWords.length} 题 · ${this.currentStudyMode === 'en2cn' ? '英→中' : '中→英'}</span>
      </div>
      <div class="card quiz-card">
        <div class="quiz-prompt">
          ${this.currentStudyMode === 'en2cn' 
            ? `<h2 class="word-text" onclick="App.speak('${safePrompt}')">${prompt}</h2><div class="quiz-hint">点击听发音</div>`
            : `<h2>${prompt}</h2><div class="quiz-hint">想想对应的英文单词</div>`
          }
        </div>
        <div id="quiz-answer" class="quiz-answer hidden">
          <div class="answer-divider">———— 答案 ————</div>
          <h3>${answer}</h3>
          ${word.example ? `<div class="quiz-example">📖 ${word.example}</div>` : ''}
        </div>
      </div>
      <div class="quiz-buttons">
        <button class="btn btn-quiz btn-forget" onclick="App.submitQuiz(1)">😰 忘记</button>
        <button class="btn btn-quiz btn-blur" onclick="App.submitQuiz(3)">🤔 模糊</button>
        <button class="btn btn-quiz btn-know" onclick="App.submitQuiz(5)">😊 认识</button>
      </div>`;
    if (this.currentStudyMode === 'en2cn') setTimeout(() => this.speak(word.word), 300);
  },

  renderListeningQuiz(word) {
    const options = this.generateOptions(word);
    const safeWord = word.word.replace(/'/g, "\\'");
    document.getElementById('quiz-content').innerHTML = `
      <div class="quiz-progress">
        <span>第 ${this.quizIndex + 1} / ${this.quizWords.length} 题 · 🎧 听音辨义</span>
      </div>
      <div class="card quiz-card listening-card">
        <div class="listening-header">
          <div class="listening-icon" id="listen-icon" onclick="App.speakNow('${safeWord}')">🔊</div>
          <div class="listening-hint" id="listen-status">👂 点击喇叭听发音</div>
        </div>
        <div id="listening-options" class="listening-options">
          ${options.map((opt, i) => `<button class="listening-option" data-idx="${i}" onclick="App.submitListening(${word.id}, '${opt.replace(/'/g, "\\'")}', ${i})">${opt}</button>`).join('')}
        </div>
      </div>
      <div id="quiz-feedback" class="quiz-buttons" style="display:none">
        <button class="btn btn-quiz btn-forget" onclick="App.continueListening()">下一题 →</button>
      </div>
      <div style="text-align:center;margin-top:8px"><span style="font-size:11px;color:var(--text2);cursor:pointer" onclick="App.diagSpeech()">🔊 没声音？点我诊断</span></div>`;
  },

  generateOptions(correctWord) {
    const allDefs = this.quizWords.map(w => w.def).filter(Boolean);
    const unique = [...new Set(allDefs)];
    const options = [correctWord.def];
    const pool = unique.filter(d => d !== correctWord.def);
    while (options.length < 4 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      options.push(pool.splice(idx, 1)[0]);
    }
    return options.sort(() => Math.random() - 0.5);
  },

  submitListening(wordId, selectedDef, idx) {
    const word = Store.findWord(wordId);
    const isCorrect = selectedDef === word.def;
    document.querySelectorAll('.listening-option').forEach((btn, i) => {
      btn.disabled = true;
      if (parseInt(btn.dataset.idx) === idx) btn.classList.add(isCorrect ? 'correct' : 'wrong');
      if (btn.textContent === word.def) btn.classList.add('correct');
    });
    document.getElementById('quiz-feedback').style.display = 'flex';
    const quality = isCorrect ? 5 : 1;
    const learnData = Store.getLearnData();
    Store.saveWordState(word.id, SM2.calculate(learnData[word.id], quality));
    const today = new Date().toISOString().split('T')[0];
    Store.logDailyActivity(today, 'review');
    if (isCorrect) Store.logDailyActivity(today, 'correct');
    Store.logDailyActivity(today, 'total');
    Store.logQuiz(wordId, isCorrect, 'listening');
  },

  continueListening() {
    this.quizIndex++;
    this.renderQuiz();
  },

  submitQuiz(quality) {
    const word = this.quizWords[this.quizIndex];
    if (!word) return;
    document.getElementById('quiz-answer')?.classList.remove('hidden');
    const learnData = Store.getLearnData();
    Store.saveWordState(word.id, SM2.calculate(learnData[word.id], quality));
    const today = new Date().toISOString().split('T')[0];
    Store.logDailyActivity(today, 'review');
    if (quality >= 3) Store.logDailyActivity(today, 'correct');
    Store.logDailyActivity(today, 'total');
    Store.logQuiz(word.id, quality >= 3, 'normal');
    document.querySelectorAll('.btn-quiz').forEach(b => b.disabled = true);
    document.querySelectorAll('.btn-quiz').forEach((b, i) => { if ([1, 3, 5][i] === quality) b.classList.add('selected'); });
    setTimeout(() => { this.quizIndex++; this.renderQuiz(); }, 800);
  },

  // ============ 词库浏览 ============
  renderWordList(query = '') {
    const sources = Store.getWordSources();
    const lists = Store.getWordLists();
    const activeSource = document.querySelector('.source-tab.active')?.dataset?.source || 'core';
    const learnData = Store.getLearnData();
    let words = [];
    if (activeSource === 'bookmark') words = Store.getBookmarks().map(id => Store.findWord(id)).filter(Boolean);
    else if (activeSource === 'list') {
      const name = document.querySelector('.source-tab.active')?.dataset?.listname;
      if (name) words = Store.getWordList(name).map(id => Store.findWord(id)).filter(Boolean);
    } else words = Store.getWordsBySource(activeSource);
    if (query) words = words.filter(w => (w.word + w.def).includes(query));

    let tabsHtml = '';
    const activeEl = document.querySelector('.source-tab.active');
    const activeName = activeEl?.dataset?.source;
    const activeListName = activeEl?.dataset?.listname;
    sources.forEach(s => {
      tabsHtml += `<button class="source-tab ${activeName === s.id ? 'active' : ''}" data-source="${s.id}" onclick="App.switchWordSource('${s.id}')">${s.icon} ${s.name}</button>`;
    });
    tabsHtml += `<button class="source-tab ${activeName === 'bookmark' ? 'active' : ''}" data-source="bookmark" onclick="App.switchWordSource('bookmark')">⭐ 收藏</button>`;
    Object.keys(lists).forEach(name => {
      tabsHtml += `<button class="source-tab ${activeName === 'list' && activeListName === name ? 'active' : ''}" data-source="list" data-listname="${name.replace(/"/g, '&quot;')}" onclick="App.switchWordSource('list', '${name.replace(/'/g, "\\'")}')">📁 ${name}</button>`;
    });

    let html = `<div class="word-source-tabs">${tabsHtml}</div>
      <div class="word-search"><input type="text" placeholder="搜索单词或释义..." value="${query}" oninput="App.renderWordList(this.value)" /></div>
      <div class="word-list">`;
    words.forEach(w => {
      if (!w) return;
      const state = learnData[w.id];
      const isBm = Store.isBookmarked(w.id);
      html += `<div class="word-item" onclick="App.speak('${w.word.replace(/'/g, "\\'")}')">
        <div class="word-item-main">
          <div><span class="word-item-word">${w.word}</span><span class="word-item-phonetic">${w.phonetic || ''}</span><span class="badge badge-new" style="font-size:10px;margin-left:6px">${w.pos || ''}</span></div>
          <div class="word-item-def">${w.def}</div>
        </div>
        <div class="word-item-meta">
          ${state ? `<span class="badge level-${state.level}">Lv.${state.level}</span>` : '<span class="badge badge-new">新词</span>'}
          <span class="bookmark-btn ${isBm ? 'active' : ''}" onclick="event.stopPropagation();App.toggleBookmark(${w.id})">${isBm ? '⭐' : '☆'}</span>
        </div></div>`;
    });
    if (!words.length) html += '<div class="empty-state">没有找到匹配的单词</div>';
    html += '</div>';
    document.getElementById('word-list-content').innerHTML = html;
  },

  switchWordSource(source, listName) {
    if (source === 'list' && listName) { this.currentListName = listName; this.currentSource = 'list'; }
    else { this.currentSource = source; this.currentListName = null; }
    this.renderWordList(document.querySelector('.word-search input')?.value || '');
  },

  // ============ 单词本管理 ============
  renderLists() {
    const lists = Store.getWordLists();
    const learnData = Store.getLearnData();
    let html = '<div class="page-title">📁 我的单词本</div>';
    html += `<div style="display:flex;gap:8px;margin-bottom:16px">
      <input id="list-input" placeholder="输入单词本名称..." style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px">
      <button class="btn btn-primary" style="flex:none;padding:10px 20px" onclick="App.createList(document.getElementById('list-input').value)">创建</button>
      <button class="btn btn-outline" style="flex:none;padding:10px 20px" onclick="location.hash='#import'">📥 导入</button>
    </div>`;
    Object.entries(lists).forEach(([name, ids]) => {
      const mastered = ids.filter(id => learnData[id] && learnData[id].level >= 4).length;
      html += `<div class="list-card">
        <div style="flex:1">
          <div style="font-size:17px;font-weight:600">📁 ${name}</div>
          <div style="font-size:13px;color:var(--text2);margin-top:4px">${ids.length} 词 · 已掌握 ${mastered}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline" style="flex:none;padding:6px 12px;font-size:13px" onclick="App.switchToList('${name.replace(/'/g, "\\'")}')">学习</button>
          ${name !== '默认收藏' ? `<button class="btn btn-outline" style="flex:none;padding:6px 12px;font-size:13px;color:var(--danger)" onclick="App.deleteList('${name.replace(/'/g, "\\'")}')">删除</button>` : ''}
        </div>
      </div>`;
    });
    document.getElementById('lists-content').innerHTML = html;
  },

  createList(name) { if (!name.trim()) return; if (Store.createWordList(name.trim())) this.renderLists(); },
  deleteList(name) { if (confirm(`确定删除「${name}」？`)) { Store.deleteWordList(name); this.renderLists(); } },


  // ============ 导入单词 ============
  renderImport() {
    const lists = Store.getWordLists();
    const listNames = Object.keys(lists);
    let html = '<div class="card"><div class="card-content">';
    html += '<div style="margin-bottom:12px;font-size:15px;font-weight:600">📥 导入单词到单词本</div>';
    html += '<div style="margin-bottom:8px;font-size:13px;color:var(--text2)">支持 .txt/.csv 文件或直接粘贴</div>';
    html += '<div class="import-dropzone" onclick="document.getElementById(\'file-input\').click()" ondragover="event.preventDefault();this.style.borderColor=\'var(--primary)\'" ondragleave="this.style.borderColor=\'var(--border)\'" ondrop="event.preventDefault();App.handleFileDrop(event)">';
    html += '<div style="font-size:40px;margin-bottom:8px">📂</div>';
    html += '<div style="font-size:15px;font-weight:500">点击选择文件或拖拽到此处</div>';
    html += '<div style="font-size:12px;color:var(--text2);margin-top:4px">.txt / .csv</div>';
    html += '<input id="file-input" type="file" accept=".txt,.csv" style="display:none" onchange="App.handleFileSelect(event)" />';
    html += '</div>';
    html += '<div style="font-size:13px;color:var(--text2);margin:4px 0 8px;text-align:center">— 或直接粘贴文本 —</div>';
    html += '<textarea id="import-text" placeholder="每行一个单词\nabandon\nability\naccess" style="width:100%;min-height:100px;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;resize:vertical"></textarea>';
    html += '<div style="margin:10px 0;display:flex;gap:8px;align-items:center">';
    html += '<label style="font-size:14px;font-weight:500">导入到：</label>';
    html += '<select id="import-list" style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px">';
    listNames.forEach(n => html += '<option value="' + n.replace(/"/g,'&quot;') + '">' + n + '</option>');
    html += '</select></div>';
    html += '<button class="btn btn-primary" onclick="App.doImport()">📥 开始导入</button>';
    html += '<div id="import-result" style="margin-top:12px;font-size:14px"></div>';
    html += '</div></div>';
    document.getElementById('import-content').innerHTML = html;
  },

  handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.readFile(file);
  },

  handleFileDrop(event) {
    event.target.style.borderColor = 'var(--border)';
    const file = event.dataTransfer.files[0];
    if (!file) return;
    this.readFile(file);
  },

  readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const ta = document.getElementById('import-text');
      if (!ta) return;
      ta.value = e.target.result;
      const wordCount = ta.value.split('\n').filter(l => l.trim()).length;
      document.getElementById('import-result').textContent = '✅ 已读取 ' + file.name + '，共 ' + wordCount + ' 行';
    };
    reader.readAsText(file, 'UTF-8');
  },

  doImport() {
    const ta = document.getElementById('import-text');
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) { document.getElementById('import-result').textContent = '\u26a0\ufe0f 请先输入或选择文件'; return; }
    const listName = document.getElementById('import-list')?.value || '默认收藏';
    // 只按换行分割，每行一个单词
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let found = 0, added = 0;
    lines.forEach(line => {
      // 取每行第一个英文单词，忽略中文/音标/例句
      const match = line.match(/[a-zA-Z-]+/);
      if (!match) return;
      const w = match[0].toLowerCase();
      const ex = Store.getAllWords().find(x => x.word.toLowerCase() === w);
      if (ex) { Store.addToList(ex.id, listName); found++; return; }
      Store.addImportedWord(w, '', '', '', listName);
      added++;
    });
    const r = '\u2705 完成！找到 ' + found + ' 个已有词 + 新增 ' + added + ' 个自定义词 \u2192 已加入\u300c' + listName + '\u300d';
    document.getElementById('import-result').innerHTML = r + '<br><button class="btn btn-outline" style="margin-top:8px;padding:6px 14px;font-size:13px" onclick="location.hash=\'#lists\'">去单词本查看</button>';
  },  // ============ 通用 ============
  speak(text) {
    if (!text || !window.speechSynthesis) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch(e) {}
  },

  speakNow(text) {
    const el = document.getElementById('listen-status');
    if (el) el.textContent = '🔊 正在播放...';
    this.speak(text);
    if (el) setTimeout(() => el.textContent = '👂 再听一次？', 3000);
  },

  speakExample(wordId) {
    const w = Store.findWord(wordId);
    if (w && w.example) this.speak(w.example);
  },

  diagSpeech() {
    let msg = '📋 语音诊断\n';
    msg += 'SpeechSynthesis: ' + (window.speechSynthesis ? '✅ 支持' : '❌ 不支持') + '\n';
    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      msg += '语音总数: ' + voices.length + '\n';
      const enVoices = voices.filter(v => v.lang.startsWith('en'));
      msg += '英语语音: ' + enVoices.length + ' 个\n';
      enVoices.slice(0, 5).forEach(v => msg += '  - ' + v.name + ' (' + v.lang + ')\n');
      if (enVoices.length > 0) {
        msg += '\n🔊 正在播放测试语音...';
        alert(msg);
        this.speak('Hello, test one two three.');
      } else { alert(msg); }
    } else { alert(msg); }
  },

  diagBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 523;
      gain.gain.value = 0.3;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
      alert('✅ 喇叭测试成功！');
    } catch(e) { alert('❌ 测试失败: ' + e.message); }
  },

  toggleBookmark(wordId) {
    Store.toggleBookmark(wordId);
    const hash = location.hash;
    if (hash === '#words') this.renderWordList(document.querySelector('.word-search input')?.value || '');
    else if (hash === '#study') this.renderStudy();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
