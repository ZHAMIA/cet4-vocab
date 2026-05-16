/**
 * store.js — localStorage 封装
 * 管理学习记录、打卡数据、用户进度
 */
const Store = {
  // 学习记录格式: { [wordId]: { level: 0-5, nextReview: timestamp, interval: days, easiness: 2.5, reps: 0, lastReview: timestamp } }
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
  }
};
