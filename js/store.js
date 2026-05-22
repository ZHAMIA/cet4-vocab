/**
 * store.js — localStorage 封装
 * 管理学习记录、打卡数据、用户进度
 * v4.0 新增：导出/导入、提醒设置
 */
const Store = {
  // 学习记录格式: { [wordId]: { level: 0-5, nextReview: timestamp, interval: days, stability, difficulty, reps: 0, lastReview: timestamp } }
  // v4.0 使用 FSRS 格式: { stability, difficulty, interval, reps, level, nextReview, lastReview }
  _key: 'cet4_learn_data',
  _streakKey: 'cet4_streak',
  _quizKey: 'cet4_quiz_log',
  _bookmarkKey: 'cet4_bookmarks',

  getLearnData() {
    try {
      return JSON.parse(localStorage.getItem(this._key)) || {};
    } catch { return {}; }
  },

  setLearnData(data) {
    localStorage.setItem(this._key, JSON.stringify(data));
  },

  getWordState(wordId) {
    const data = this.getLearnData();
    return data[wordId] || null;
  },

  saveWordState(wordId, state) {
    const data = this.getLearnData();
    data[wordId] = state;
    this.setLearnData(data);
  },

  // 打卡数据: { [dateStr]: { learned: n, reviewed: n, correct: n, total: n } }
  getStreakData() {
    try {
      return JSON.parse(localStorage.getItem(this._streakKey)) || {};
    } catch { return {}; }
  },

  saveStreakData(data) {
    localStorage.setItem(this._streakKey, JSON.stringify(data));
  },

  logDailyActivity(dateStr, type) {
    const data = this.getStreakData();
    if (!data[dateStr]) data[dateStr] = { learned: 0, reviewed: 0, correct: 0, total: 0 };
    if (type === 'learn') data[dateStr].learned++;
    if (type === 'review') data[dateStr].reviewed++;
    if (type === 'correct') data[dateStr].correct++;
    if (type === 'total') data[dateStr].total++;
    this.saveStreakData(data);
  },

  // 计算连续打卡天数
  getStreakCount() {
    const data = this.getStreakData();
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (data[key] && (data[key].learned > 0 || data[key].reviewed > 0)) {
        count++;
      } else if (i > 0) {
        break;
      }
    }
    return count;
  },

  // 今日是否已学习
  isStudiedToday() {
    const today = new Date().toISOString().split('T')[0];
    const data = this.getStreakData();
    return data[today] && (data[today].learned > 0 || data[today].reviewed > 0);
  },

  // 书签/收藏
  getBookmarks() {
    try {
      return JSON.parse(localStorage.getItem(this._bookmarkKey)) || [];
    } catch { return []; }
  },

  toggleBookmark(wordId) {
    const bookmarks = this.getBookmarks();
    const idx = bookmarks.indexOf(wordId);
    if (idx >= 0) bookmarks.splice(idx, 1);
    else bookmarks.push(wordId);
    localStorage.setItem(this._bookmarkKey, JSON.stringify(bookmarks));
    return bookmarks.indexOf(wordId) >= 0;
  },

  isBookmarked(wordId) {
    return this.getBookmarks().includes(wordId);
  },

  // ===== 自定义单词本（V2） =====
  _wordlistKey: 'cet4_wordlists',

  getWordLists() {
    try {
      return JSON.parse(localStorage.getItem(this._wordlistKey)) || { '默认收藏': [] };
    } catch { return { '默认收藏': [] }; }
  },

  saveWordLists(lists) {
    localStorage.setItem(this._wordlistKey, JSON.stringify(lists));
  },

  createWordList(name) {
    const lists = this.getWordLists();
    if (lists[name]) return false;
    lists[name] = [];
    this.saveWordLists(lists);
    return true;
  },

  deleteWordList(name) {
    if (name === '默认收藏') return false;
    const lists = this.getWordLists();
    delete lists[name];
    this.saveWordLists(lists);
    return true;
  },

  addToList(wordId, listName) {
    const lists = this.getWordLists();
    if (!lists[listName]) lists[listName] = [];
    if (!lists[listName].includes(wordId)) lists[listName].push(wordId);
    this.saveWordLists(lists);
    const bookmarks = this.getBookmarks();
    if (!bookmarks.includes(wordId)) {
      bookmarks.push(wordId);
      localStorage.setItem(this._bookmarkKey, JSON.stringify(bookmarks));
    }
  },

  removeFromList(wordId, listName) {
    const lists = this.getWordLists();
    if (lists[listName]) {
      lists[listName] = lists[listName].filter(id => id !== wordId);
      this.saveWordLists(lists);
    }
  },

  getWordList(name) {
    const lists = this.getWordLists();
    return lists[name] || [];
  },

  getAllWordsInLists() {
    const lists = this.getWordLists();
    const ids = new Set();
    Object.values(lists).forEach(arr => arr.forEach(id => ids.add(id)));
    return [...ids];
  },

  // 获取所有词源类型
  getWordSources() {
    return [
      { id: 'core', name: '核心高频词', icon: '📖', count: WordDB.length },
      { id: 'listening', name: '听力场景词', icon: '🎧', count: ListeningWords.length },
      { id: 'tricky', name: '熟词生义', icon: '🎯', count: TrickyWords.length },
    ];
  },

  // 根据词源获取词列表
  getWordsBySource(source) {
    switch (source) {
      case 'core': return [...WordDB];
      case 'listening': return [...ListeningWords];
      case 'tricky': return [...TrickyWords];
      default: return [];
    }
  },

  getAllWords() {
    return [...WordDB, ...ListeningWords, ...TrickyWords];
  },

  findWord(id) {
    return this.getAllWords().find(w => w.id === id);
  },

  // ===== 导入的自定义词 =====
  _importedKey: 'cet4_imported',
  _nextIdKey: 'cet4_next_import_id',

  getImportedWords() {
    try { return JSON.parse(localStorage.getItem(this._importedKey)) || []; } catch { return []; }
  },

  saveImportedWords(words) {
    localStorage.setItem(this._importedKey, JSON.stringify(words));
  },

  addImportedWord(word, def, phonetic, pos, listName) {
    const imported = this.getImportedWords();
    let nextId = parseInt(localStorage.getItem(this._nextIdKey) || '10001');
    const id = nextId++;
    localStorage.setItem(this._nextIdKey, String(nextId));
    const entry = { id, word, def: def || '', phonetic: phonetic || '', pos: pos || '', example: '', example_cn: '', collocation: '', year: '2026', type: '导入词', tag: 'imported' };
    imported.push(entry);
    this.saveImportedWords(imported);
    if (listName) this.addToList(id, listName);
    return id;
  },

  // Override getAllWords to include imported words
  // ===== 测验记录 =====
  _quizKey: 'cet4_quiz_history',

  logQuiz(wordId, correct, source) {
    const history = this.getQuizHistory();
    history.push({ wordId, correct, source, time: Date.now() });
    if (history.length > 2000) history.splice(0, history.length - 2000);
    localStorage.setItem(this._quizKey, JSON.stringify(history));
  },

  getQuizHistory() {
    try { return JSON.parse(localStorage.getItem(this._quizKey)) || []; } catch { return []; }
  },

  getWeaknessAnalysis() {
    const history = this.getQuizHistory();
    const all = this.getAllWords();
    const bySource = { core: { correct: 0, total: 0 }, listening: { correct: 0, total: 0 }, tricky: { correct: 0, total: 0 }, imported: { correct: 0, total: 0 }, other: { correct: 0, total: 0 } };
    history.forEach(h => {
      const w = all.find(x => x.id === h.wordId);
      let source = 'other';
      if (w) {
        if (w.id <= 100) source = 'core';
        else if (w.id >= 200 && w.id < 300) source = 'listening';
        else if (w.id >= 300 && w.id < 10000) source = 'tricky';
        else source = 'imported';
      }
      bySource[source].total++;
      if (h.correct) bySource[source].correct++;
    });
    return bySource;
  },

  getDailyStats(days = 30) {
    const data = this.getStreakData();
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const day = data[key] || { learned: 0, reviewed: 0, correct: 0, total: 0 };
      result.push({ date: key, learned: day.learned || 0, reviewed: day.reviewed || 0, correct: day.correct || 0, total: day.total || 0 });
    }
    return result;
  },

  // ===== 成就系统 =====
  _achiKey: 'cet4_achievements',

  getEarnedAchievements() {
    try { return JSON.parse(localStorage.getItem(this._achiKey)) || []; } catch { return []; }
  },

  saveEarnedAchievements(ids) {
    localStorage.setItem(this._achiKey, JSON.stringify(ids));
  },

  getAllAchievements() {
    return [
      { id: 'first_word', name: '新手入门', icon: '🌱', desc: '学习完成第一个单词' },
      { id: 'hundred_words', name: '百词斩', icon: '📚', desc: '累计学习 100 个单词' },
      { id: 'double_hundred', name: '词海遨游', icon: '🌊', desc: '累计学习 200 个单词' },
      { id: 'streak_7', name: '周冠军', icon: '🏅', desc: '连续打卡 7 天' },
      { id: 'streak_30', name: '满月勋章', icon: '🌙', desc: '连续打卡 30 天' },
      { id: 'master_10', name: '初露锋芒', icon: '⭐', desc: '掌握 10 个单词（Lv.4+）' },
      { id: 'master_50', name: '单词大师', icon: '💎', desc: '掌握 50 个单词（Lv.4+）' },
      { id: 'listening_master', name: '听力达人', icon: '🎧', desc: '听力词正确率≥80%（至少测 10 题）' },
      { id: 'quiz_50', name: '刷题狂魔', icon: '📝', desc: '累计答题 50 题' },
      { id: 'quiz_200', name: '战神', icon: '⚔️', desc: '累计答题 200 题' },
      { id: 'import_10', name: '搬运工', icon: '📥', desc: '导入 10 个自定义单词' },
      { id: 'all_core', name: '核心全通', icon: '👑', desc: '核心高频词全部学过一遍' },
    ];
  },

  checkAchievements(stats) {
    const earned = this.getEarnedAchievements();
    const newOnes = [];
    const all = this.getAllAchievements();
    all.forEach(a => {
      if (earned.includes(a.id)) return;
      let earn = false;
      switch (a.id) {
        case 'first_word': earn = stats.totalLearned >= 1; break;
        case 'hundred_words': earn = stats.totalLearned >= 100; break;
        case 'double_hundred': earn = stats.totalLearned >= 200; break;
        case 'streak_7': earn = stats.streak >= 7; break;
        case 'streak_30': earn = stats.streak >= 30; break;
        case 'master_10': earn = stats.totalMastered >= 10; break;
        case 'master_50': earn = stats.totalMastered >= 50; break;
        case 'listening_master': {
          const analysis = this.getWeaknessAnalysis();
          const l = analysis.listening;
          if (l.total >= 10 && l.correct / l.total >= 0.8) earn = true;
          break;
        }
        case 'quiz_50': earn = this.getQuizHistory().length >= 50; break;
        case 'quiz_200': earn = this.getQuizHistory().length >= 200; break;
        case 'import_10': earn = this.getImportedWords().length >= 10; break;
        case 'all_core': earn = Object.keys(this.getLearnData()).filter(id => parseInt(id) <= 100).length >= 100; break;
      }
      if (earn) { earned.push(a.id); newOnes.push(a); }
    });
    if (newOnes.length > 0) this.saveEarnedAchievements(earned);
    return newOnes;
  },

  getAllWords() {
    return [...WordDB, ...ListeningWords, ...TrickyWords, ...this.getImportedWords()];
  },

  findWord(id) {
    const n = Number(id);
    const w = WordDB.find(w => w.id === n);
    if (w) return w;
    const l = ListeningWords.find(w => w.id === n);
    if (l) return l;
    const t = TrickyWords.find(w => w.id === n);
    if (t) return t;
    return this.getImportedWords().find(w => w.id === n);
  },

  // 统计
  getStats() {
    const learnData = this.getLearnData();
    const streakData = this.getStreakData();
    let totalLearned = 0, totalMastered = 0;
    Object.values(learnData).forEach(s => {
      if (s.reps > 0) totalLearned++;
      if (s.level >= 4) totalMastered++;
    });
    const today = new Date().toISOString().split('T')[0];
    const todayData = streakData[today] || {};
    return {
      totalLearned,
      totalMastered,
      streak: this.getStreakCount(),
      todayLearned: todayData.learned || 0,
      todayReviewed: todayData.reviewed || 0,
      todayCorrect: todayData.correct || 0,
      todayTotal: todayData.total || 0,
    };
  },

  // ===== v4.0: 提醒设置 =====
  _reminderKey: 'cet4_reminder',

  /** 获取提醒设置 */
  getReminderSetting() {
    try {
      return JSON.parse(localStorage.getItem(this._reminderKey)) || { enabled: false, hour: 9, minute: 0 };
    } catch { return { enabled: false, hour: 9, minute: 0 }; }
  },

  /** 保存提醒设置 */
  saveReminderSetting(setting) {
    localStorage.setItem(this._reminderKey, JSON.stringify(setting));
  },

  // ===== v4.0: 数据导出 =====
  /** 导出全部数据为 JSON 对象 */
  exportAllData() {
    return {
      version: '4.0',
      exportTime: Date.now(),
      learn_data: this.getLearnData(),
      streak: this.getStreakData(),
      quiz_log: this.getQuizHistory(),
      bookmarks: this.getBookmarks(),
      wordlists: this.getWordLists(),
      imported: this.getImportedWords(),
      achievements: this.getEarnedAchievements(),
    };
  },

  /** 从 JSON 对象导入全部数据 */
  importAllData(data) {
    if (!data || !data.version) return { success: false, msg: '无效的数据文件' };
    try {
      if (data.learn_data) this.setLearnData(data.learn_data);
      if (data.streak) this.saveStreakData(data.streak);
      if (data.quiz_log) {
        localStorage.setItem(this._quizKey, JSON.stringify(data.quiz_log));
      }
      if (data.bookmarks) {
        localStorage.setItem(this._bookmarkKey, JSON.stringify(data.bookmarks));
      }
      if (data.wordlists) this.saveWordLists(data.wordlists);
      if (data.imported) {
        localStorage.setItem(this._importedKey, JSON.stringify(data.imported));
      }
      if (data.achievements) {
        localStorage.setItem(this._achiKey, JSON.stringify(data.achievements));
      }
      return { success: true, msg: '✅ 数据导入成功！' };
    } catch (e) {
      return { success: false, msg: '❌ 导入失败：' + e.message };
    }
  }
};
