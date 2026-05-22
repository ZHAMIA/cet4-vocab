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

  // 获取所有词源类型（所有词统一在 WordDB 中，按 id 范围分源）
  getWordSources() {
    // 主词库只显示原版四级高频词（id <= 100）
    const core = WordDB.filter(w => w.id <= 100);
    const importedWords = this.getImportedWords();
    return [
      { id: 'core', name: '核心高频词', icon: '📖', count: core.length },
      { id: 'imported', name: '导入词', icon: '📥', count: importedWords.length },
    ];
  },

  // 根据词源获取词列表
  getWordsBySource(source) {
    switch (source) {
      case 'core': return WordDB.filter(w => w.id <= 100);
      case 'imported': return this.getImportedWords();
      default: return [];
    }
  },

  getAllWords() {
    return [...WordDB, ...this.getImportedWords()];
  },

  findWord(id) {
    const n = Number(id);
    const w = WordDB.find(w => w.id === n);
    if (w) return w;
    return this.getImportedWords().find(w => w.id === n);
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
  // ===== 测验进度保存 =====
  _quizProgressKey: 'cet4_quiz_in_progress',

  /** 保存当前测验进度 */
  saveQuizProgress(data) {
    localStorage.setItem(this._quizProgressKey, JSON.stringify(data));
  },

  /** 读取已保存的测验进度（无进度时返回 null） */
  loadQuizProgress() {
    try {
      return JSON.parse(localStorage.getItem(this._quizProgressKey));
    } catch { return null; }
  },

  /** 清除已保存的测验进度 */
  clearQuizProgress() {
    localStorage.removeItem(this._quizProgressKey);
  },

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
    return [...WordDB, ...this.getImportedWords()];
  },

  findWord(id) {
    const n = Number(id);
    const w = WordDB.find(w => w.id === n);
    if (w) return w;
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


// ===== 桌面词��表导入 =====
// 从 OneDrive Desktop 词汇表文件创建单词本
const DefaultLists = {
  "副词": [
    397,
    398,
    399,
    400,
    401,
    402,
    403,
    404,
    405,
    406,
    407,
    408,
    409,
    410,
    411,
    412,
    413,
    414,
    415,
    416,
    417,
    418,
    419,
    420,
    421,
    422,
    423,
    424,
    425,
    426,
    427,
    428,
    429,
    430,
    431,
    432,
    433,
    434,
    435,
    436,
    437,
    438,
    439,
    440,
    441,
    442,
    443,
    444,
    445,
    446,
    447,
    448,
    449,
    450,
    451
  ],
  "动词": [
    1,
    4,
    452,
    13,
    14,
    17,
    21,
    453,
    454,
    30,
    455,
    456,
    41,
    43,
    457,
    458,
    224,
    459,
    460,
    68,
    69,
    71,
    76,
    461,
    462,
    80,
    82,
    463,
    464,
    92,
    465,
    466,
    99,
    100,
    467,
    468,
    469,
    470,
    471,
    472,
    473,
    474,
    475,
    476,
    477,
    478,
    479,
    480,
    481,
    482,
    483,
    484,
    485,
    486,
    487,
    488,
    489,
    490,
    491,
    492,
    493,
    494,
    495,
    496,
    497,
    498,
    499,
    500,
    501,
    502,
    503,
    504,
    505,
    506,
    507,
    508,
    509,
    510,
    511,
    512,
    513,
    514,
    515,
    516,
    517,
    518,
    519,
    520,
    521,
    522,
    523,
    524,
    525,
    526,
    527,
    528,
    529,
    530,
    531,
    532,
    533,
    534,
    535,
    536,
    537,
    538,
    539,
    540,
    541,
    542,
    543,
    544,
    545,
    546,
    547,
    548,
    549,
    302,
    550,
    551,
    552,
    553,
    554,
    555,
    556,
    557,
    207,
    558,
    559,
    560,
    561,
    562,
    563,
    564,
    565,
    566,
    567,
    568,
    569,
    570,
    571,
    572,
    573,
    574,
    575,
    576,
    577,
    578,
    579,
    580,
    581,
    582,
    583,
    584,
    585,
    586,
    587,
    588,
    589,
    590,
    591,
    592,
    593,
    594,
    595,
    596,
    597,
    598,
    599,
    600
  ],
  "动词2": [
    1,
    4,
    11,
    13,
    14,
    17,
    21,
    454,
    30,
    38,
    40,
    41,
    43,
    224,
    59,
    66,
    68,
    69,
    71,
    72,
    74,
    76,
    78,
    79,
    80,
    82,
    601,
    602,
    463,
    90,
    92,
    93,
    94,
    99,
    100,
    603,
    468,
    604,
    469,
    605,
    470,
    606,
    303,
    607,
    608,
    475,
    609,
    480,
    610,
    611,
    612,
    484,
    485,
    613,
    488,
    614,
    490,
    615,
    491,
    493,
    616,
    617,
    501,
    506,
    618,
    619,
    510,
    511,
    620,
    513,
    621,
    622,
    623,
    519,
    521,
    523,
    524,
    525,
    528,
    624,
    529,
    530,
    625,
    626,
    532,
    627,
    628,
    533,
    534,
    629,
    630,
    537,
    539,
    541,
    542,
    543,
    544,
    546,
    631,
    632,
    548,
    633,
    634,
    554,
    556,
    558,
    560,
    561,
    562,
    635,
    564,
    636,
    565,
    637,
    567,
    568,
    569,
    571,
    573,
    577,
    638,
    639,
    579,
    640,
    641,
    642,
    583,
    584,
    586,
    587,
    643,
    644,
    645,
    588,
    590,
    646,
    647,
    648,
    598
  ],
  "名词": [
    6,
    8,
    649,
    650,
    651,
    32,
    36,
    652,
    45,
    52,
    653,
    224,
    63,
    64,
    65,
    654,
    460,
    655,
    656,
    657,
    658,
    659,
    660,
    80,
    661,
    83,
    662,
    663,
    664,
    665,
    666,
    667,
    95,
    668,
    669,
    99,
    670,
    671,
    672,
    673,
    674,
    675,
    676,
    677,
    678,
    679,
    680,
    478,
    681,
    682,
    683,
    684,
    685,
    686,
    687,
    688,
    689,
    690,
    691,
    692,
    693,
    497,
    694,
    617,
    695,
    500,
    696,
    697,
    698,
    699,
    700,
    701,
    702,
    514,
    703,
    704,
    705,
    706,
    707,
    708,
    709,
    710,
    711,
    712,
    713,
    714,
    715,
    716,
    529,
    717,
    718,
    719,
    720,
    721,
    722,
    723,
    724,
    725,
    726,
    727,
    728,
    729,
    730,
    731,
    732,
    733,
    734,
    735,
    736,
    737,
    738,
    739,
    740,
    741,
    742,
    743,
    744,
    745,
    746,
    747,
    748,
    749,
    750,
    751,
    752,
    550,
    753,
    754,
    755,
    756,
    757,
    758,
    759,
    760,
    761,
    762,
    763,
    764,
    765,
    575,
    766,
    767,
    768,
    769,
    770,
    771,
    772,
    582,
    773,
    774,
    775,
    776,
    777,
    778,
    643,
    644,
    779,
    780,
    781,
    782,
    783,
    784,
    785,
    786,
    787,
    788,
    789,
    790,
    317,
    791,
    792,
    793
  ],
  "名词3": [
    2,
    794,
    6,
    8,
    795,
    796,
    301,
    19,
    322,
    797,
    651,
    32,
    798,
    36,
    799,
    45,
    800,
    49,
    52,
    53,
    653,
    224,
    58,
    60,
    63,
    64,
    309,
    65,
    801,
    654,
    66,
    802,
    304,
    803,
    804,
    805,
    73,
    806,
    658,
    659,
    807,
    808,
    86,
    809,
    664,
    810,
    666,
    811,
    812,
    813,
    814,
    308,
    815,
    95,
    816,
    669,
    97,
    817,
    99,
    818,
    819,
    820,
    821,
    822,
    672,
    823,
    824,
    825,
    826,
    827,
    828,
    829,
    677,
    830,
    831,
    832,
    680,
    833,
    478,
    682,
    683,
    685,
    834,
    835,
    836,
    687,
    837,
    838,
    839,
    840,
    841,
    842,
    843,
    691,
    693,
    844,
    497,
    845,
    846,
    847,
    617,
    848,
    849,
    850,
    500,
    696,
    851,
    697,
    698,
    699,
    700,
    852,
    853,
    854,
    621,
    855,
    704,
    856,
    857,
    858,
    859,
    312,
    860,
    861,
    709,
    862,
    710,
    863,
    864,
    865,
    712,
    526,
    866,
    867,
    527,
    714,
    868,
    869,
    715,
    870,
    529,
    871,
    719,
    872,
    873,
    874,
    875,
    722,
    876,
    877,
    878,
    879,
    724,
    880,
    881,
    882,
    725,
    883,
    884,
    726,
    885,
    886,
    887,
    888,
    889,
    890,
    891,
    732,
    892,
    893,
    894,
    895,
    896,
    734,
    897,
    736,
    898,
    737,
    899,
    739,
    741,
    900,
    901,
    902,
    743,
    903,
    222,
    744,
    904,
    746,
    747,
    905,
    906,
    750,
    751,
    752,
    550,
    753,
    907,
    908,
    909,
    910,
    911,
    912,
    913,
    557,
    914,
    915,
    916,
    917,
    918,
    919,
    759,
    920,
    763,
    764,
    921,
    572,
    922,
    923,
    924,
    575,
    766,
    925,
    926,
    927,
    928,
    576,
    929,
    930,
    931,
    932,
    933,
    579,
    934,
    935,
    936,
    769,
    937,
    770,
    938,
    771,
    939,
    940,
    941,
    772,
    582,
    942,
    583,
    943,
    777,
    643,
    644,
    944,
    779,
    780,
    781,
    945,
    782,
    946,
    947,
    783,
    948,
    949,
    950,
    951,
    784,
    952,
    953,
    954,
    955,
    956,
    787,
    957,
    958,
    959,
    960,
    961,
    962,
    963,
    788,
    789,
    790,
    964,
    965,
    317,
    966,
    967,
    968,
    791,
    969,
    599,
    970
  ],
  "形容词 (2)": [
    15,
    971,
    322,
    972,
    324,
    973,
    974,
    48,
    51,
    975,
    976,
    977,
    978,
    979,
    77,
    980,
    88,
    89,
    981,
    982,
    983,
    334,
    984,
    985,
    986,
    987,
    988,
    96,
    336,
    339,
    989,
    990,
    991,
    992,
    993,
    994,
    995,
    996,
    997,
    998,
    999,
    1000,
    1001,
    342,
    1002,
    1003,
    1004,
    1005,
    1006,
    1007,
    349,
    1008,
    350,
    351,
    1009,
    352,
    1010,
    354,
    1011,
    1012,
    1013,
    1014,
    1015,
    1016,
    363,
    1017,
    1018,
    1019,
    895,
    365,
    1020,
    366,
    1021,
    1022,
    1023,
    369,
    1024,
    371,
    1025,
    373,
    374,
    1026,
    1027,
    1028,
    378,
    1029,
    379,
    1030,
    381,
    1031,
    1032,
    386,
    387,
    1033,
    1034,
    1035,
    1036,
    389,
    1037,
    1038,
    1039,
    1040,
    1041,
    1042,
    1043,
    1044,
    394,
    1045,
    1046,
    1047,
    1048
  ],
  "形容词": [
    992,
    994,
    996,
    998,
    1000,
    1001,
    343,
    1049,
    1003,
    1004,
    1050,
    1051,
    1052,
    1053,
    1054,
    1007,
    1009,
    1055,
    1010,
    1056,
    1057,
    1058,
    1011,
    1059,
    1060,
    1013,
    1061,
    1062,
    1063,
    1064,
    1065,
    1016,
    1066,
    1017,
    1019,
    895,
    1067,
    364,
    1068,
    1069,
    1020,
    1070,
    1071,
    1072,
    1073,
    1074,
    1022,
    371,
    1075,
    1076,
    372,
    1025,
    1026,
    1027,
    1028,
    1077,
    1030,
    1078,
    387,
    1079,
    1080,
    1039,
    1081,
    1040,
    1082,
    391,
    1043,
    1045,
    1083,
    1084,
    1047
  ],
  "形容词3": [
    1085,
    3,
    5,
    1086,
    1087,
    10,
    321,
    15,
    1088,
    1089,
    971,
    1090,
    322,
    972,
    1091,
    1092,
    27,
    323,
    324,
    325,
    973,
    326,
    974,
    48,
    49,
    51,
    1093,
    975,
    1094,
    327,
    1095,
    1096,
    976,
    1097,
    1098,
    1099,
    1100,
    977,
    1101,
    1102,
    1103,
    328,
    1104,
    1105,
    329,
    978,
    1106,
    330,
    979,
    77,
    980,
    331,
    1107,
    332,
    88,
    89,
    981,
    982,
    333,
    983,
    91,
    334,
    1108,
    984,
    1109,
    985,
    986,
    987,
    988,
    96,
    1110,
    1111,
    335,
    336,
    337,
    338,
    1112,
    1113,
    339,
    1114,
    989,
    990,
    1115,
    991,
    1116,
    1117,
    1118,
    992,
    993,
    994,
    340,
    1119,
    995,
    1120,
    1121,
    996,
    1122,
    997,
    1123,
    998,
    341,
    999,
    1000,
    1001,
    342,
    343,
    1049,
    1002,
    315,
    1124,
    1003,
    344,
    1125,
    1004,
    1126,
    1005,
    345,
    1050,
    1127,
    346,
    1053,
    1128,
    1129,
    347,
    1130,
    1131,
    1132,
    1133,
    1006,
    348,
    1007,
    349,
    1134,
    1135,
    1008,
    350,
    351,
    1009,
    1136,
    1055,
    352,
    1010,
    1056,
    1057,
    353,
    354,
    1137,
    1138,
    1139,
    1140,
    355,
    1058,
    1011,
    1141,
    1142,
    1143,
    1059,
    1012,
    356,
    1060,
    357,
    1144,
    1145,
    1146,
    358,
    359,
    1147,
    1013,
    360,
    1014,
    361,
    1061,
    1062,
    1063,
    1148,
    1149,
    1150,
    1015,
    1151,
    1152,
    1065,
    1153,
    1154,
    1016,
    1155,
    1156,
    362,
    1066,
    363,
    1017,
    1157,
    1158,
    1019,
    895,
    364,
    1068,
    365,
    1020,
    1071,
    366,
    1021,
    1159,
    1022,
    1023,
    367,
    368,
    369,
    1024,
    1160,
    1161,
    370,
    1162,
    1163,
    1164,
    1165,
    1166,
    1167,
    371,
    1075,
    1168,
    372,
    1025,
    1169,
    1170,
    373,
    374,
    1171,
    767,
    375,
    1172,
    1173,
    376,
    1026,
    1027,
    1174,
    377,
    1028,
    1077,
    378,
    1029,
    1175,
    1176,
    1177,
    1178,
    1179,
    379,
    380,
    1030,
    381,
    1078,
    771,
    382,
    1180,
    383,
    384,
    385,
    1181,
    1031,
    1032,
    386,
    387,
    1182,
    1033,
    1079,
    1034,
    1035,
    388,
    1036,
    389,
    1080,
    390,
    1183,
    1184,
    1185,
    1186,
    1187,
    1037,
    1038,
    1039,
    1081,
    1040,
    1188,
    1041,
    1189,
    1082,
    391,
    1190,
    1042,
    392,
    393,
    1043,
    1044,
    394,
    395,
    396,
    1045,
    1084,
    1046,
    1047,
    1048,
    1191
  ],
  "形容词3_标星": [
    321,
    322,
    323,
    324,
    325,
    326,
    327,
    328,
    329,
    330,
    331,
    332,
    333,
    334,
    335,
    336,
    337,
    338,
    339,
    340,
    341,
    342,
    343,
    344,
    345,
    346,
    347,
    348,
    349,
    350,
    351,
    352,
    353,
    354,
    355,
    356,
    357,
    358,
    359,
    360,
    361,
    362,
    363,
    364,
    365,
    366,
    367,
    368,
    369,
    370,
    371,
    372,
    373,
    374,
    375,
    376,
    377,
    378,
    379,
    380,
    381,
    382,
    383,
    384,
    385,
    386,
    387,
    388,
    389,
    390,
    391,
    392,
    393,
    394,
    395,
    396
  ]
};

// 首次运行时创建这些单词本
(function initLists() {
  const existing = Store.getWordLists();
  const keys = Object.keys(DefaultLists);
  let changed = false;
  keys.forEach(name => {
    if (!existing[name] || existing[name].length === 0) {
      existing[name] = DefaultLists[name];
      changed = true;
    }
  });
  if (changed) Store.saveWordLists(existing);
})();
