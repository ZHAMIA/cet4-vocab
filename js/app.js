/**
 * app.js — CET-4 Vocab v3.0 核心应用逻辑 + 路由 + 页面渲染
 * 新增：暗色模式、拼写模式、统计图表、手势滑动、UI 打磨、PWA 支持
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

  // 拼写模式状态
  spellingMode: false,
  spellingWord: null,
  spellingInput: '',
  spellingCorrect: false,

  // 滑动状态
  swipeStartX: 0,
  swipeStartY: 0,
  swiping: false,

  // 长按定时器
  longPressTimer: null,
  longPressWordId: null,

  // 搜索防抖
  searchTimer: null,
  _searchTimer: null,

  // ============ 工具方法 ============

  /** 防抖工具 */
  debounce(fn, delay) {
    return (...args) => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /** Ripple 水波纹效果 */
  createRipple(e) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = (e.clientX || e.touches?.[0]?.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY || e.touches?.[0]?.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  },

  // ============ 暗色模式 ============

  /** 切换暗色/亮色主题 */
  toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? '' : 'dark');
    localStorage.setItem('cet4_theme', isDark ? '' : 'dark');
    this.updateThemeUI();
    this.updateMetaThemeColor();
  },

  /** 更新主题切换按钮图标 */
  updateThemeUI() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '☀️' : '🌙';
  },

  /** 更新 meta theme-color */
  updateMetaThemeColor() {
    const meta = document.getElementById('meta-theme-color');
    if (!meta) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    meta.content = isDark ? '#0f1729' : '#f2f4f8';
  },

  // ============ 初始化 & 路由 ============

  init() {
    // 初始化暗色模式
    this.updateThemeUI();
    this.updateMetaThemeColor();

    this.router();
    window.addEventListener('hashchange', () => this.router());

    // 水波纹全局委托
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn, .action-btn, .nav-btn, .listening-option, .listening-icon');
      if (btn) this.createRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      const onStudy = location.hash === '#study';
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

      // 快捷键帮助 (? / H)
      if (e.key === '?' || (e.key === 'h' || e.key === 'H')) {
        if (!inInput) { e.preventDefault(); this.toggleShortcutsHelp(); }
        return;
      }

      if (inInput) return;
      if (!onStudy) return;

      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (this.spellingMode) return; // 拼写模式下空格不触发揭示
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

    // 长按事件
    this.setupLongPress();

    // 监听暗色模式系统变化
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => {
        const saved = localStorage.getItem('cet4_theme');
        if (!saved) {
          document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : '');
          this.updateThemeUI();
          this.updateMetaThemeColor();
        }
      });
    }

    // v4.0: 监听 Service Worker 消息（每日提醒）
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GET_REMINDER_SETTING') {
          const setting = Store.getReminderSetting();
          event.source.postMessage({ type: 'REMINDER_SETTING', setting });
        }
        if (event.data && event.data.type === 'GET_STUDY_STATS') {
          const learnData = Store.getLearnData();
          const dueWords = SM2.getDueWords(learnData);
          const streakData = Store.getStreakData();
          const today = new Date().toISOString().split('T')[0];
          const todayData = streakData[today] || {};
          event.source.postMessage({
            type: 'STUDY_STATS',
            stats: {
              due: dueWords.length,
              todayLearned: (todayData.learned || 0) + (todayData.reviewed || 0)
            }
          });
        }
        if (event.data && event.data.type === 'NAVIGATE') {
          location.hash = event.data.hash || '#study';
        }
      });
    }
  },

  router() {
    const hash = location.hash || '#dashboard';
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // 停止长按定时器
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }

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
        this.quizMode = 'normal';
        this.showQuizModePicker();
        break;
      case '#spelling':
        document.getElementById('page-quiz')?.classList.remove('hidden');
        document.querySelector('[data-page="quiz"]')?.classList.add('active');
        this.startSpellingQuiz();
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
      case '#settings':
        document.getElementById('page-settings')?.classList.remove('hidden');
        this.renderSettings();
        break;
      default:
        location.hash = '#dashboard';
    }
  },

  getWordDB() {
    if (this.currentSource === 'list') {
      const ids = this.currentListName ? Store.getWordList(this.currentListName) : Store.getAllWordsInLists();
      return ids.map(id => Store.findWord(id)).filter(Boolean);
    }
    return Store.getWordsBySource(this.currentSource);
  },

  // ============ 快捷键帮助 ============

  toggleShortcutsHelp() {
    const el = document.getElementById('shortcuts-help');
    if (el) el.classList.toggle('hidden');
  },

  closeShortcutsHelp() {
    const el = document.getElementById('shortcuts-help');
    if (el) el.classList.add('hidden');
  },

  // ============ 长按快捷菜单 ============

  setupLongPress() {
    document.addEventListener('touchstart', (e) => {
      const wordEl = e.target.closest('.word-word');
      if (!wordEl || location.hash !== '#study') return;
      const words = this.getWordDB();
      const word = words[this.currentWordIndex];
      if (!word) return;
      this.longPressWordId = word.id;
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this.showLongpressMenu(word.id);
      }, 500);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    }, { passive: true });

    document.addEventListener('touchmove', () => {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    }, { passive: true });
  },

  showLongpressMenu(wordId) {
    const el = document.getElementById('longpress-menu');
    if (el) el.classList.remove('hidden');
    this.longPressWordId = wordId;
  },

  closeLongpressMenu() {
    const el = document.getElementById('longpress-menu');
    if (el) el.classList.add('hidden');
    this.longPressWordId = null;
  },

  longpressAction(action) {
    const word = Store.findWord(this.longPressWordId);
    this.closeLongpressMenu();
    if (!word) return;

    switch (action) {
      case 'bookmark':
        this.toggleBookmark(word.id);
        break;
      case 'copy':
        navigator.clipboard?.writeText(word.word).then(() => {
          this.showToast('已复制: ' + word.word);
        }).catch(() => {});
        break;
      case 'speak':
        this.speak(word.word);
        break;
      case 'addToList':
        this.showAddToList(word.id);
        break;
    }
  },

  /** Toast 提示 */
  showToast(msg, duration = 2000) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface-glass);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:12px;padding:10px 20px;font-size:14px;box-shadow:var(--shadow);z-index:300;transition:opacity 0.3s,transform 0.3s';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, duration);
  },

  // ============ 仪表盘 ============

  renderDashboard() {
    const stats = Store.getStats();
    const sources = Store.getWordSources();
    const learnData = Store.getLearnData();

    // 数字滚动动画
    this.animateNumber('stat-learned', stats.totalLearned);
    this.animateNumber('stat-mastered', stats.totalMastered);
    document.getElementById('stat-streak').textContent = `${stats.streak} 天`;
    this.animateNumber('stat-today', stats.todayLearned + stats.todayReviewed);

    // 待复习 Widget
    this.renderDueWidget();

    // 统计图表
    this.renderTrendChart();
    this.renderDistributionChart();

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
      const dueCount = dueWords.filter(([id]) => {
        const w = Store.findWord(Number(id));
        return w && (this.currentSource === 'core' || w.id <= 100) ||
               (this.currentSource === 'listening' || (w.id >= 200 && w.id < 300)) ||
               (this.currentSource === 'tricky' || w.id >= 300);
      }).length;
      html += '<div class="task-item">📝 复习 <strong>' + dueWords.length + '</strong> 个待复习单词' +
        (dueCount !== dueWords.length ? '（当前词库 ' + dueCount + ' 个）' : '') +
        '</div>';
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

    // ===== v4.0: 遗忘曲线图 =====
    this.renderForgettingCurve();

    // ===== v4.0: 学习时间统计 =====
    this.renderStudyTimeStats();

    // ===== v4.0: 学习时间统计 =====
    this.renderStudyTimeStats();
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

  /** 数字滚动动画 */
  animateNumber(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const current = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
    if (current === target) return;

    el.classList.remove('animate');
    void el.offsetWidth; // 触发回流以重新播放动画
    el.textContent = target;
    el.classList.add('animate');
  },

  /** 待复习 Widget */
  renderDueWidget() {
    const learnData = Store.getLearnData();
    const dueWords = SM2.getDueWords(learnData);
    const widget = document.getElementById('due-widget');
    const countEl = document.getElementById('due-count');
    if (!widget || !countEl) return;
    if (dueWords.length > 0) {
      widget.classList.remove('hidden');
      countEl.textContent = dueWords.length + ' 个单词需要复习';
    } else {
      widget.classList.add('hidden');
    }
  },

  /** 学习趋势折线图（Canvas） */
  renderTrendChart() {
    const canvas = document.getElementById('trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // 设置实际尺寸
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = 200;

    // 获取14天数据
    const dailyStats = Store.getDailyStats(14);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, w, h);

    const padding = { top: 20, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const counts = dailyStats.map(d => d.learned + d.reviewed);
    const maxVal = Math.max(1, ...counts);

    // 网格线
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 绘制折线
    const points = counts.map((c, i) => ({
      x: padding.left + (chartW / (counts.length - 1 || 1)) * i,
      y: padding.top + chartH - (c / maxVal) * chartH
    }));

    // 渐变填充区域
    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, isDark ? 'rgba(96,165,250,0.3)' : 'rgba(59,130,246,0.15)');
    gradient.addColorStop(1, isDark ? 'rgba(96,165,250,0.02)' : 'rgba(59,130,246,0.02)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // 折线
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = isDark ? '#60a5fa' : '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 数据点
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#60a5fa' : '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#0f1729' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // X 轴标签
    ctx.fillStyle = isDark ? '#8896ae' : '#6c7a91';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    dailyStats.forEach((d, i) => {
      if (i % 2 === 0 || i === dailyStats.length - 1) {
        const dateStr = d.date.slice(5); // MM-DD
        ctx.fillText(dateStr, points[i].x, h - 5);
      }
    });
  },

  /** 掌握分布环形图（Canvas） */
  renderDistributionChart() {
    const canvas = document.getElementById('distribution-chart');
    const legend = document.getElementById('distribution-legend');
    if (!canvas || !legend) return;

    const learnData = Store.getLearnData();
    const allWords = this.getWordDB();

    let newCount = 0;
    let learning = 0;
    let mastered = 0;

    allWords.forEach(w => {
      const state = learnData[w.id];
      if (!state || state.level === 0) newCount++;
      else if (state.level < 4) learning++;
      else mastered++;
    });

    const total = newCount + learning + mastered;
    if (total === 0) {
      legend.innerHTML = '<div style="color:var(--text2);font-size:13px">暂无数据</div>';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // 只在首次或resize时设置尺寸
    if (canvas._initW !== rect.width) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas._initW = rect.width;
    }
    ctx.scale(dpr, dpr);

    const size = Math.min(rect.width, rect.height);
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR * 0.6;

    ctx.clearRect(0, 0, rect.width, rect.height);

    const colors = [
      { label: '新词', color: isDark() ? '#4b5568' : '#d1d5db', count: newCount },
      { label: '学习中', color: isDark() ? '#fbbf24' : '#ff9500', count: learning },
      { label: '已掌握', color: isDark() ? '#4ade80' : '#34c759', count: mastered }
    ].filter(c => c.count > 0);

    // 根据暗色模式调整
    function isDark() {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    let startAngle = -Math.PI / 2;
    const totalVal = colors.reduce((s, c) => s + c.count, 0);

    colors.forEach(seg => {
      const sliceAngle = (seg.count / totalVal) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // 中心文字
    ctx.fillStyle = isDark() ? '#e8edf5' : '#1e2a3a';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 6);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = isDark() ? '#8896ae' : '#6c7a91';
    ctx.fillText('总计', cx, cy + 10);

    // 图例
    legend.innerHTML = colors.map(c => `
      <div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${c.color}"></span>
        <span>${c.label}</span>
        <span class="donut-legend-count">${c.count}词 (${Math.round(c.count/totalVal*100)}%)</span>
      </div>
    `).join('');
  },

  // ============ 📈 遗忘曲线图（v4.0） ============

  /** 绘制遗忘曲线散点图 */
  renderForgettingCurve() {
    const container = document.getElementById('diagnosis-section');
    if (!container) return;

    const learnData = Store.getLearnData();
    const entries = Object.entries(learnData).filter(([_, s]) => s.reps > 0 && s.stability > 0);

    let html = '<div class="card" style="margin-top:16px"><div class="card-content">';
    html += '<div class="section-label" style="margin-bottom:12px">🧠 遗忘曲线预测</div>';

    if (entries.length < 3) {
      html += '<div style="padding:12px 0;text-align:center;color:var(--text2);font-size:14px">📊 再学几个单词，这里会展示每个词的 retention 预测值</div>';
      html += '</div></div>';
      // Find the last card in diagnosis-section and append after it
      // Actually let's just append to the container directly
      const existing = container.querySelector('.forgetting-curve-card');
      if (existing) existing.remove();
      const wrapper = document.createElement('div');
      wrapper.className = 'forgetting-curve-card';
      wrapper.innerHTML = html;
      container.appendChild(wrapper);
      return;
    }

    const now = Date.now();
    // 为每个已学词计算 retention
    const points = entries.map(([id, s]) => {
      const elapsedDays = (now - s.lastReview) / (24 * 60 * 60 * 1000);
      const retention = SM2.recall(s.stability, elapsedDays);
      return { id, elapsedDays, retention, stability: s.stability, level: s.level };
    });

    html += `<canvas id="forgetting-curve-canvas" class="trend-chart" style="height:200px"></canvas>`;
    html += '</div></div>';

    const existing = container.querySelector('.forgetting-curve-card');
    if (existing) existing.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'forgetting-curve-card';
    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    // 绘制 Canvas（延迟确保 DOM 渲染完成）
    setTimeout(() => this._drawForgettingCurve(points), 50);
  },

  /** 绘制遗忘曲线 Canvas */
  _drawForgettingCurve(points) {
    const canvas = document.getElementById('forgetting-curve-canvas');
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = 200;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.clearRect(0, 0, w, h);

    const padding = { top: 20, bottom: 30, left: 36, right: 16 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // 计算范围
    const maxDays = Math.max(7, ...points.map(p => Math.ceil(p.elapsedDays)));

    // 绘制理论遗忘曲线（R = e^(-t/s) 用平均 stability）
    const avgStability = points.reduce((s, p) => s + p.stability, 0) / points.length;

    // 网格
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Y 轴标签
      const val = 1 - i / 4;
      ctx.fillStyle = isDark ? '#8896ae' : '#6c7a91';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((val * 100).toFixed(0) + '%', padding.left - 4, y + 3);
    }
    ctx.setLineDash([]);

    // 绘制理论曲线
    ctx.beginPath();
    for (let x = 0; x <= chartW; x++) {
      const day = (x / chartW) * maxDays;
      const r = SM2.recall(avgStability, day);
      const y = padding.top + chartH - r * chartH;
      if (x === 0) ctx.moveTo(padding.left + x, y);
      else ctx.lineTo(padding.left + x, y);
    }
    ctx.strokeStyle = isDark ? 'rgba(96,165,250,0.3)' : 'rgba(59,130,246,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制散点（每个单词一个点）
    points.forEach(p => {
      const x = padding.left + (p.elapsedDays / maxDays) * chartW;
      const y = padding.top + chartH - p.retention * chartH;

      // 点的颜色根据掌握程度
      let color;
      if (p.level >= 4) color = isDark ? '#4ade80' : '#34c759';
      else if (p.level >= 2) color = isDark ? '#fbbf24' : '#ff9500';
      else color = isDark ? '#f87171' : '#ff3b30';

      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isDark ? '#0f1729' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // X 轴标签
    ctx.fillStyle = isDark ? '#8896ae' : '#6c7a91';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const day = Math.round((i / 5) * maxDays);
      const x = padding.left + (i / 5) * chartW;
      ctx.fillText(day + '天', x, h - 5);
    }

    // 图例
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    const legendY = padding.top + 12;
    ctx.fillStyle = isDark ? 'rgba(96,165,250,0.3)' : 'rgba(59,130,246,0.25)';
    ctx.fillRect(w - 140, legendY - 6, 16, 3);
    ctx.fillStyle = isDark ? '#8896ae' : '#6c7a91';
    ctx.fillText('理论遗忘曲线', w - 118, legendY + 2);
    ctx.fillStyle = isDark ? '#4ade80' : '#34c759';
    ctx.beginPath();
    ctx.arc(w - 140, legendY + 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark ? '#8896ae' : '#6c7a91';
    ctx.fillText('各词 retention', w - 118, legendY + 20);
  },

  // ============ ⏱ 学习时间统计（v4.0） ============

  /** 渲染学习时间统计 */
  renderStudyTimeStats() {
    const container = document.getElementById('dashboard');
    if (!container) return;

    const streakData = Store.getStreakData();
    const dailyStats = Store.getDailyStats(30);

    // 过去 30 天
    const activeDays = dailyStats.filter(d => d.learned > 0 || d.reviewed > 0);
    if (activeDays.length === 0) return;

    // 最活跃的一天
    let maxDay = activeDays[0];
    activeDays.forEach(d => {
      if (d.learned + d.reviewed > maxDay.learned + maxDay.reviewed) maxDay = d;
    });

    // 平均每天学习词数
    const avgWords = activeDays.reduce((s, d) => s + d.learned + d.reviewed, 0) / activeDays.length;

    // 查找某个现有卡片后面插入
    let targetEl = document.getElementById('study-time-stats');
    if (!targetEl) {
      targetEl = document.createElement('div');
      targetEl.id = 'study-time-stats';
      // 插入到诊断区后面
      const diagSection = document.getElementById('diagnosis-section');
      if (diagSection) {
        diagSection.parentNode.insertBefore(targetEl, diagSection.nextSibling);
      } else {
        document.getElementById('task-list')?.parentNode?.appendChild(targetEl);
      }
    }

    targetEl.innerHTML = `
      <div class="card"><div class="card-content">
        <div class="section-label" style="margin-bottom:12px">⏱ 学习时间统计（近 30 天）</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--primary)">${activeDays.length}</div>
            <div style="font-size:12px;color:var(--text2)">学习天数</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--primary)">${avgWords.toFixed(1)}</div>
            <div style="font-size:12px;color:var(--text2)">日均词数</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--accent)">${maxDay.learned + maxDay.reviewed}</div>
            <div style="font-size:12px;color:var(--text2)">最活跃 (${maxDay.date.slice(5)})</div>
          </div>
        </div>
      </div></div>`;
  },

  switchSource(source) {
    this.currentSource = source;
    this.currentListName = null;
    this.revealStage = 0;
    this.spellingMode = false;
    location.hash = '#study';
  },

  switchToList(name) {
    this.currentSource = 'list';
    this.currentListName = name;
    this.revealStage = 0;
    this.spellingMode = false;
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

  // ============ 单词学习（v3.0） ============

  renderStudy() {
    this.loadStudyState();
    const words = this.getWordDB();
    if (this.currentWordIndex >= words.length || !words.length) {
      this.currentWordIndex = 0;
      this.revealStage = 0;
    }
    if (!words.length) {
      document.getElementById('study-content').innerHTML = '<div class="empty-state">🎉 没有单词可选，先去选择词库吧！</div>';
      this.updateStudyProgress(words.length);
      this.updateSwipeDots(words.length);
      return;
    }
    const word = words[this.currentWordIndex];
    if (!word) return;

    // 更新进度条
    this.updateStudyProgress(words.length);
    this.updateSwipeDots(words.length);

    // 设置滑动
    this.setupSwipeGestures();

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
            <div class="word-word" ontouchstart="">${word.word}</div>
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
      <div style="text-align:center;margin-top:4px">
        <span style="font-size:11px;color:var(--text2);cursor:pointer" onclick="App.diagSpeech()">🔊 无声？点此诊断</span>
        <span style="font-size:11px;color:var(--text2);margin-left:12px;cursor:pointer" onclick="App.toggleShortcutsHelp()">⌨️ 快捷键</span>
      </div>`;

    Store.logDailyActivity(new Date().toISOString().split('T')[0], 'learn');
  },

  /** 更新学习进度条 */
  updateStudyProgress(total) {
    const bar = document.getElementById('study-progress-wrap');
    const inner = document.getElementById('study-progress-bar');
    if (!bar || !inner) return;
    if (total === 0) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const pct = ((this.currentWordIndex + 1) / total * 100).toFixed(1);
    inner.style.width = pct + '%';
  },

  /** 更新滑动指示器（小圆点） */
  updateSwipeDots(total) {
    const container = document.getElementById('swipe-dots');
    if (!container) return;
    if (total <= 1) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    // 最多显示20个点
    const maxDots = Math.min(total, 20);
    const step = Math.max(1, Math.floor(total / maxDots));
    const currentDot = Math.min(Math.floor(this.currentWordIndex / step), maxDots - 1);

    let html = '';
    for (let i = 0; i < maxDots; i++) {
      html += `<span class="swipe-dot ${i === currentDot ? 'active' : ''}"></span>`;
    }
    container.innerHTML = html;
  },

  /** 左右滑动手势 */
  setupSwipeGestures() {
    const content = document.getElementById('study-content');
    if (!content) return;

    const onTouchStart = (e) => {
      this.swipeStartX = e.touches[0].clientX;
      this.swipeStartY = e.touches[0].clientY;
      this.swiping = false;
    };

    const onTouchMove = (e) => {
      if (this.swipeStartX === 0) return;
      const dx = e.touches[0].clientX - this.swipeStartX;
      const dy = e.touches[0].clientY - this.swipeStartY;
      // 只有当水平滑动距离大于垂直时才触发
      if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.swiping = true;
      }
    };

    const onTouchEnd = (e) => {
      if (!this.swiping) { this.swipeStartX = 0; this.swipeStartY = 0; return; }
      const dx = e.changedTouches[0].clientX - this.swipeStartX;
      const threshold = 60;
      if (dx > threshold) {
        this.prevWord();
      } else if (dx < -threshold) {
        this.nextWord();
      }
      this.swipeStartX = 0;
      this.swipeStartY = 0;
      this.swiping = false;
    };

    content.removeEventListener('touchstart', content._swipeStart);
    content.removeEventListener('touchmove', content._swipeMove);
    content.removeEventListener('touchend', content._swipeEnd);

    content._swipeStart = onTouchStart;
    content._swipeMove = onTouchMove;
    content._swipeEnd = onTouchEnd;

    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: true });
    content.addEventListener('touchend', onTouchEnd, { passive: true });
  },

  studyReveal() {
    this.revealStage = (this.revealStage + 1) % 4;
    this.renderStudy();
  },

  nextWord() {
    const words = this.getWordDB();
    if (this.currentWordIndex < words.length - 1) {
      this.currentWordIndex++;
    } else {
      this.currentWordIndex = 0;
    }
    this.revealStage = 0;
    this.saveStudyState();
    this.renderStudy();
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
      <input id="new-list-input" placeholder="新建单词本..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text)">
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

  // ============ 测验进度保存/恢复 ============

  /** 保存当前测验进度到 localStorage */
  saveQuizProgress() {
    const data = {
      mode: this.quizMode,
      quizWords: this.quizWords,
      quizIndex: this.quizIndex,
      spellingMode: this.spellingMode,
      currentStudyMode: this.currentStudyMode,
      startTime: Date.now(),
    };
    // 真题模拟特有状态
    if (this.quizMode === 'exam') {
      data.examWords = this.examWords;
      data.examQuestions = this.examQuestions;
      data.examCurrent = this.examCurrent;
      data.examScore = this.examScore;
      data.examStarted = this.examStarted;
      data.examTimeLeft = this.examTimeLeft;
      data._examSubmitted = this._examSubmitted;
      data._examReadingMatch = this._examReadingMatch;
    }
    // 选择题特有状态
    if (this.quizMode === 'choice') {
      data.mcCorrectCount = this.mcCorrectCount;
      data.mcTotalCount = this.mcTotalCount;
      data._choiceSubmitted = this._choiceSubmitted;
    }
    Store.saveQuizProgress(data);
  },

  /** 退出当前测验（保存进度并回到模式选择） */
  exitQuiz() {
    this.saveQuizProgress();
    this.showQuizModePicker();
  },

  /** 放弃已保存的进度 */
  discardQuizProgress() {
    Store.clearQuizProgress();
    this.showQuizModePicker();
  },

  /** 恢复已保存的测验 */
  resumeQuiz(saved) {
    Store.clearQuizProgress();
    this.quizMode = saved.mode;
    this.quizWords = saved.quizWords;
    this.quizIndex = saved.quizIndex;
    this.spellingMode = saved.spellingMode || false;
    this.currentStudyMode = saved.currentStudyMode || 'en2cn';

    if (this.quizMode === 'exam') {
      this.examWords = saved.examWords;
      this.examQuestions = saved.examQuestions;
      this.examCurrent = saved.examCurrent;
      this.examScore = saved.examScore;
      this.examStarted = saved.examStarted;
      this.examTimeLeft = saved.examTimeLeft;
      this._examSubmitted = saved._examSubmitted || false;
      this._examReadingMatch = saved._examReadingMatch;
      // 如果有计时器未超时，重新启动
      if (this.examStarted) {
        this._startExamTimer();
      }
    }

    if (this.quizMode === 'choice') {
      this.mcCorrectCount = saved.mcCorrectCount || 0;
      this.mcTotalCount = saved.mcTotalCount || 0;
      this._choiceSubmitted = saved._choiceSubmitted || false;
    }

    this.renderQuiz();
  },

  showQuizModePicker() {
    // 检测是否有未完成的测验
    const saved = Store.loadQuizProgress();
    if (saved) {
      // 显示恢复提示
      const modeNames = {
        normal: '英⇄中 闪卡',
        listening: '听音辨义',
        spelling: '拼写模式',
        choice: '选择题',
        exam: '真题模拟',
      };
      const progressPct = saved.quizWords.length > 0
        ? Math.round(saved.quizIndex / saved.quizWords.length * 100)
        : 0;
      document.getElementById('quiz-content').innerHTML = `
        <div class="quiz-mode-picker">
          <h2 style="margin-bottom:12px">📝 选择测验模式</h2>
          <div class="resume-card">
            <div style="font-size:28px;margin-bottom:8px">📂</div>
            <div style="font-weight:600;font-size:16px">检测到上次未完成的测验</div>
            <div style="font-size:13px;color:var(--text2);margin:4px 0 12px">
              ${modeNames[saved.mode] || saved.mode} · 进度 ${progressPct}% （${saved.quizIndex}/${saved.quizWords.length}）
            </div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="App.resumeQuiz(Store.loadQuizProgress())">📂 继续答题</button>
              <button class="btn btn-outline" onclick="App.discardQuizProgress()">🔄 重新开始</button>
              <button class="btn btn-outline" onclick="App.discardQuizProgress()">✕ 算了</button>
            </div>
          </div>
          <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
            <div style="font-size:14px;color:var(--text2);margin-bottom:12px">— 或开始新的测验 —</div>
            <div class="mode-card" onclick="App.discardQuizProgress();App.startNormalQuiz()">
              <div style="font-size:32px">📝</div>
              <div class="mode-name">英⇄中 闪卡</div>
              <div class="mode-desc">看英文选中文 / 看中文拼英文</div>
            </div>
            <div class="mode-card" onclick="App.discardQuizProgress();App.startListeningQuiz()">
              <div style="font-size:32px">🎧</div>
              <div class="mode-name">听音辨义</div>
              <div class="mode-desc">听单词发音，选择正确释义（专练听力）</div>
            </div>
            <div class="mode-card" onclick="App.discardQuizProgress();App.startSpellingQuiz()">
              <div style="font-size:32px">✍️</div>
              <div class="mode-name">拼写模式</div>
              <div class="mode-desc">看中文释义，输入英文单词（练拼写）</div>
            </div>
            <div class="mode-card" onclick="App.discardQuizProgress();App.startMultipleChoiceQuiz()">
              <div style="font-size:32px">✅</div>
              <div class="mode-name">选择题</div>
              <div class="mode-desc">四选一，选完立即反馈，计入学习记录</div>
            </div>
            <div class="mode-card" onclick="App.discardQuizProgress();App.startMockExam()">
              <div style="font-size:32px">🎯</div>
              <div class="mode-name">真题模拟</div>
              <div class="mode-desc">30 题混合题型 · 15 分钟限时</div>
            </div>
          </div>
        </div>`;
      return;
    }
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
        <div class="mode-card" onclick="App.startSpellingQuiz()">
          <div style="font-size:32px">✍️</div>
          <div class="mode-name">拼写模式</div>
          <div class="mode-desc">看中文释义，输入英文单词（练拼写）</div>
        </div>
        <div class="mode-card" onclick="App.startMultipleChoiceQuiz()">
          <div style="font-size:32px">✅</div>
          <div class="mode-name">选择题</div>
          <div class="mode-desc">四选一，选完立即反馈，计入学习记录</div>
        </div>
        <div class="mode-card" onclick="App.startMockExam()">
          <div style="font-size:32px">🎯</div>
          <div class="mode-name">真题模拟</div>
          <div class="mode-desc">30 题混合题型 · 15 分钟限时</div>
        </div>
      </div>`;
  },

  startNormalQuiz() {
    Store.clearQuizProgress();
    this.quizMode = 'normal';
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB];
    this.quizWords = words.sort(() => Math.random() - 0.5).slice(0, Math.min(20, words.length));
    this.quizIndex = 0;
    this.currentStudyMode = Math.random() > 0.5 ? 'en2cn' : 'cn2en';
    this.renderQuiz();
  },

  startListeningQuiz() {
    Store.clearQuizProgress();
    this.quizMode = 'listening';
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB];
    const listeningPool = words.sort(() => Math.random() - 0.5);
    this.quizWords = listeningPool.slice(0, Math.min(15, listeningPool.length));
    this.quizIndex = 0;
    this.renderQuiz();
  },

  // ============ ✍️ 拼写模式（v3.0） ============

  startSpellingQuiz() {
    Store.clearQuizProgress();
    this.quizMode = 'spelling';
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB];
    this.quizWords = words.sort(() => Math.random() - 0.5).slice(0, Math.min(15, words.length));
    this.quizIndex = 0;
    this.spellingMode = true;
    this.spellingCorrect = false;
    location.hash = '#quiz'; // 确保 quiz 页面被激活
    this.renderQuiz();
  },

  renderQuiz() {
    if (this.quizIndex >= this.quizWords.length) {
      Store.clearQuizProgress();
      document.getElementById('quiz-content').innerHTML = `
        <div class="quiz-complete">
          <div class="complete-icon">🎉</div>
          <h2>本轮测验完成！</h2>
          <p>本次共完成 ${this.quizWords.length} 题</p>
          <button class="btn btn-primary" onclick="App.showQuizModePicker()">选择模式</button>
          <button class="btn btn-outline" onclick="location.hash='#dashboard'">返回</button>
        </div>`;
      this.spellingMode = false;
      return;
    }
    const word = this.quizWords[this.quizIndex];
    if (!word) return;
    this.showAnswer = false;
    this.spellingCorrect = false;

    if (this.quizMode === 'listening') this.renderListeningQuiz(word);
    else if (this.quizMode === 'spelling') this.renderSpellingQuiz(word);
    else this.renderNormalQuiz(word);
  },

  /** ✍️ 渲染拼写测验 */
  renderSpellingQuiz(word) {
    const wordLen = word.word.replace(/[^a-zA-Z]/g, '').length;
    const hints = Array(wordLen).fill('_').join(' ');

    document.getElementById('quiz-content').innerHTML = `
      <div class="quiz-progress">
        <span>第 ${this.quizIndex + 1} / ${this.quizWords.length} 题 · ✍️ 拼写模式</span>
        <span class="badge">${wordLen} 字母</span>
        <button class="quiz-exit-btn" onclick="App.exitQuiz()" title="退出测验">✕</button>
      </div>
      <div class="card quiz-card">
        <div class="quiz-prompt" style="padding:24px 16px">
          <div style="font-size:14px;color:var(--text2);margin-bottom:8px">请拼写以下单词：</div>
          <h2 style="font-size:22px;font-weight:600">${word.def}</h2>
          <div style="font-size:13px;color:var(--text2);margin-top:4px">（${word.pos || ''}）</div>
          <div class="spelling-hint" id="spelling-hint">${hints}</div>
        </div>
        <div class="spelling-input-wrap" id="spelling-input-wrap">
          <input
            type="text"
            id="spelling-input"
            class="spelling-input"
            placeholder="输入英文单词..."
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            oninput="App.checkSpelling(this.value)"
          />
          <div id="spelling-feedback" class="spelling-feedback"></div>
          <div id="spelling-reveal" class="spelling-reveal hidden" style="margin-top:12px">
            <div class="word-word" style="font-size:32px;color:var(--primary)">${word.word}</div>
            <div class="pronounce-tag" style="display:inline-flex;margin-top:6px;justify-content:center">
              <span class="pronounce-text">${word.phonetic || ''}</span>
              <span class="speaker-btn" onclick="event.stopPropagation();App.speak('${word.word.replace(/'/g, "\\'")}')">🔊</span>
            </div>
          </div>
        </div>
      </div>
      <div class="quiz-buttons">
        <button class="btn btn-outline" onclick="App.skipSpelling()">⏭ 跳过</button>
        <button class="btn btn-outline" onclick="App.revealSpelling()">👁 显示答案</button>
        <button class="btn btn-primary" onclick="App.nextSpelling()" id="spelling-next" style="display:none">下一题 →</button>
      </div>`;

    setTimeout(() => document.getElementById('spelling-input')?.focus(), 300);
  },

  /** ✍️ 逐字母检查拼写 */
  checkSpelling(value) {
    const word = this.quizWords[this.quizIndex];
    if (!word || this.spellingCorrect) return;

    const input = value.trim().toLowerCase();
    const target = word.word.toLowerCase();
    const inputEl = document.getElementById('spelling-input');
    const feedback = document.getElementById('spelling-feedback');
    const hint = document.getElementById('spelling-hint');

    if (!input) {
      // 显示全部下划线
      const len = target.replace(/[^a-z]/g, '').length;
      hint.textContent = Array(len).fill('_').join(' ');
      inputEl.className = 'spelling-input';
      feedback.textContent = '';
      return;
    }

    // 逐字母检查，生成提示
    let hintChars = [];
    let allCorrect = true;
    for (let i = 0; i < target.length; i++) {
      if (i < input.length) {
        if (input[i] === target[i]) {
          hintChars.push(target[i]);
        } else {
          hintChars.push(target[i].toUpperCase());
          allCorrect = false;
        }
      } else {
        hintChars.push('_');
        allCorrect = false;
      }
    }
    hint.textContent = hintChars.join(' ');

    // 完整输入时做判断
    if (input.length >= target.length) {
      if (input === target) {
        // 拼写正确
        this.spellingCorrect = true;
        inputEl.className = 'spelling-input correct';
        feedback.textContent = '✅ 拼写正确！';
        feedback.className = 'spelling-feedback correct';
        this.onSpellingCorrect(word);
        document.getElementById('spelling-reveal')?.classList.remove('hidden');
        const nxt = document.getElementById('spelling-next'); if (nxt) nxt.style.display = 'block';
        inputEl.disabled = true;
      } else if (input.length >= target.length + 1) {
        // 拼写错误
        inputEl.className = 'spelling-input wrong';
        feedback.textContent = '❌ 不对哦，再试试～';
        feedback.className = 'spelling-feedback wrong';
      }
    }
  },

  /** 拼写正确后的处理 */
  onSpellingCorrect(word) {
    const learnData = Store.getLearnData();
    Store.saveWordState(word.id, SM2.calculate(learnData[word.id], 5));
    const today = new Date().toISOString().split('T')[0];
    Store.logDailyActivity(today, 'review');
    Store.logDailyActivity(today, 'correct');
    Store.logDailyActivity(today, 'total');
    Store.logQuiz(word.id, true, 'spelling');
    this.saveQuizProgress();
  },

  /** ✍️ 跳过拼写 */
  skipSpelling() {
    const word = this.quizWords[this.quizIndex];
    if (word) {
      const learnData = Store.getLearnData();
      Store.saveWordState(word.id, SM2.calculate(learnData[word.id], 1));
      const today = new Date().toISOString().split('T')[0];
      Store.logDailyActivity(today, 'review');
      Store.logDailyActivity(today, 'total');
      Store.logQuiz(word.id, false, 'spelling');
    }
    this.saveQuizProgress();
    this.nextSpelling();
  },

  /** ✍️ 显示答案 */
  revealSpelling() {
    const word = this.quizWords[this.quizIndex];
    if (!word) return;
    const reveal = document.getElementById('spelling-reveal');
    const input = document.getElementById('spelling-input');
    const nextBtn = document.getElementById('spelling-next');
    if (reveal) reveal.classList.remove('hidden');
    if (input) input.disabled = true;
    if (nextBtn) nextBtn.style.display = 'block';

    // 拼写检查算一次模糊
    const learnData = Store.getLearnData();
    Store.saveWordState(word.id, SM2.calculate(learnData[word.id], 2));
    const today = new Date().toISOString().split('T')[0];
    Store.logDailyActivity(today, 'review');
    Store.logDailyActivity(today, 'total');
    Store.logQuiz(word.id, false, 'spelling');
    this.saveQuizProgress();
  },

  /** ✍️ 下一题 */
  nextSpelling() {
    this.quizIndex++;
    this.renderQuiz();
  },

  // ============ 普通测验渲染 ============

  renderNormalQuiz(word) {
    const prompt = this.currentStudyMode === 'en2cn' ? word.word : word.def;
    const answer = this.currentStudyMode === 'en2cn' ? word.def : word.word;
    const safePrompt = prompt.replace(/'/g, "\\'");
    document.getElementById('quiz-content').innerHTML = `
      <div class="quiz-progress">
        <span>第 ${this.quizIndex + 1} / ${this.quizWords.length} 题 · ${this.currentStudyMode === 'en2cn' ? '英→中' : '中→英'}</span>
        <button class="quiz-exit-btn" onclick="App.exitQuiz()" title="退出测验">✕</button>
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
        <button class="quiz-exit-btn" onclick="App.exitQuiz()" title="退出测验">✕</button>
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
    this.saveQuizProgress();
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
    this.saveQuizProgress();
    document.querySelectorAll('.btn-quiz').forEach(b => b.disabled = true);
    document.querySelectorAll('.btn-quiz').forEach((b, i) => { if ([1, 3, 5][i] === quality) b.classList.add('selected'); });
    setTimeout(() => { this.quizIndex++; this.renderQuiz(); }, 800);
  },

  // ============ ✍️ 选择题模式（v4.0） ============

  /** 开始选择题测验 */
  startMultipleChoiceQuiz() {
    Store.clearQuizProgress();
    this.quizMode = 'choice';
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB];
    this.quizWords = words.sort(() => Math.random() - 0.5).slice(0, Math.min(20, words.length));
    this.quizIndex = 0;
    this.mcCorrectCount = 0;
    this.mcTotalCount = this.quizWords.length;
    this.renderMultipleChoice();
  },

  /** 渲染选择题 */
  renderMultipleChoice() {
    if (this.quizIndex >= this.quizWords.length) {
      // 完成
      Store.clearQuizProgress();
      const pct = this.mcTotalCount > 0 ? Math.round(this.mcCorrectCount / this.mcTotalCount * 100) : 0;
      document.getElementById('quiz-content').innerHTML = `
        <div class="quiz-complete">
          <div class="complete-icon">🏆</div>
          <h2>选择题完成！</h2>
          <p style="font-size:18px;font-weight:600;color:var(--primary)">${this.mcCorrectCount} / ${this.mcTotalCount} 正确 (${pct}%)</p>
          <button class="btn btn-primary" onclick="App.showQuizModePicker()">选择模式</button>
          <button class="btn btn-outline" onclick="location.hash='#dashboard'">返回</button>
        </div>`;
      return;
    }

    const word = this.quizWords[this.quizIndex];
    if (!word) { this.quizIndex++; this.renderMultipleChoice(); return; }

    // 决定题目方向：展示中文释义选英文，或展示英文选中释义
    const isEn2Cn = Math.random() > 0.5;
    const prompt = isEn2Cn ? word.word : word.def;
    const correctAnswer = isEn2Cn ? word.def : word.word;

    // 生成选项：正确 + 3 个干扰项
    const options = this._generateChoiceOptions(word, isEn2Cn);

    document.getElementById('quiz-content').innerHTML = `
      <div class="quiz-progress">
        <span>第 ${this.quizIndex + 1} / ${this.quizWords.length} 题 · ✍️ 选择题</span>
        <span class="badge" style="background:${this.mcCorrectCount > 0 ? 'rgba(52,199,89,0.1);color:var(--accent)' : 'var(--surface2);color:var(--text2)'}">✅ ${this.mcCorrectCount}</span>
        <button class="quiz-exit-btn" onclick="App.exitQuiz()" title="退出测验">✕</button>
      </div>
      <div class="card quiz-card">
        <div class="quiz-prompt" style="padding:20px 16px">
          <div style="font-size:14px;color:var(--text2);margin-bottom:8px">${isEn2Cn ? '选择正确的中文释义' : '选择正确的英文单词'}</div>
          <h2 style="font-size:24px;font-weight:700">${prompt}</h2>
          ${isEn2Cn ? `<div class="pronounce-tag" style="display:inline-flex;margin-top:6px;justify-content:center">
            <span class="speaker-btn" onclick="event.stopPropagation();App.speak('${word.word.replace(/'/g, "\'")}')">🔊 听发音</span>
          </div>` : ''}
        </div>
        <div class="choice-options" id="choice-options">
          ${options.map((opt, i) => `
            <button class="choice-option" data-idx="${i}" onclick="App.submitChoice(${i}, ${isEn2Cn ? `'${correctAnswer.replace(/'/g, "\\'")}'` : `\`${correctAnswer.replace(/\\/g,'\\\\').replace(/`/g,'\\`')}\``}, '${opt.replace(/'/g, "\\'")}', ${isEn2Cn})">
              <span class="choice-letter">${String.fromCharCode(65 + i)}</span>
              <span class="choice-text">${opt}</span>
            </button>
          `).join('')}
        </div>
        <div id="choice-feedback" class="choice-feedback hidden"></div>
      </div>
      <div class="quiz-buttons" id="choice-next" style="display:none">
        <button class="btn btn-primary" onclick="App.nextChoice()">下一题 →</button>
      </div>`;
  },

  /** 生成选择题选项（1 正确 + 3 干扰） */
  _generateChoiceOptions(word, isEn2Cn) {
    const correctAnswer = isEn2Cn ? word.def : word.word;
    // 从词库获取干扰项
    const pool = this.quizWords
      .filter(w => w.id !== word.id)
      .map(w => isEn2Cn ? w.def : w.word)
      .filter(Boolean);
    // 去重
    const unique = [...new Set(pool)];
    // 打乱后取 3 个
    const distractors = unique.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correctAnswer, ...distractors];
    // 打乱顺序
    return options.sort(() => Math.random() - 0.5);
  },

  /** 提交选择题答案 */
  submitChoice(idx, correctAnswer, selectedText, isEn2Cn) {
    const word = this.quizWords[this.quizIndex];
    if (!word || this._choiceSubmitted) return;
    this._choiceSubmitted = true;

    const isCorrect = selectedText === correctAnswer;
    const buttons = document.querySelectorAll('.choice-option');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      const text = btn.querySelector('.choice-text')?.textContent || '';
      if (text === correctAnswer) btn.classList.add('correct');
      if (i === idx && !isCorrect) btn.classList.add('wrong');
    });

    if (isCorrect) this.mcCorrectCount++;

    // SM-2 记录
    const quality = isCorrect ? 5 : 1;
    const learnData = Store.getLearnData();
    Store.saveWordState(word.id, SM2.calculate(learnData[word.id], quality));
    const today = new Date().toISOString().split('T')[0];
    Store.logDailyActivity(today, 'review');
    if (isCorrect) Store.logDailyActivity(today, 'correct');
    Store.logDailyActivity(today, 'total');
    Store.logQuiz(word.id, isCorrect, 'choice');
    this.saveQuizProgress();

    // 反馈
    const feedback = document.getElementById('choice-feedback');
    if (feedback) {
      feedback.className = 'choice-feedback ' + (isCorrect ? 'correct' : 'wrong');
      feedback.classList.remove('hidden');
      feedback.innerHTML = isCorrect
        ? '✅ 正确！'
        : `❌ 正确答案是：<strong>${correctAnswer}</strong>`;
    }

    const next = document.getElementById('choice-next');
    if (next) next.style.display = 'flex';
  },

  /** 选择题下一题 */
  nextChoice() {
    this._choiceSubmitted = false;
    this.quizIndex++;
    this.renderMultipleChoice();
  },

  // ============ 🎯 真题模拟模式（v4.0） ============

  /** 开始真题模拟 */
  startMockExam() {
    Store.clearQuizProgress();
    this.quizMode = 'exam';
    this.examAnswers = [];
    this.examStarted = false;
    this.examTimeLeft = 15 * 60; // 15 分钟，秒为单位
    this.examTimer = null;

    // 从词库随机抽 30 题
    const words = this.getWordDB().length > 0 ? this.getWordDB() : [...WordDB];
    const shuffled = words.sort(() => Math.random() - 0.5);
    this.examWords = shuffled.slice(0, Math.min(30, shuffled.length));

    // 分配题型：选词填空(5) + 英译中(10) + 中译英(10) + 阅读理解判断(5)
    this.examQuestions = [];
    let idx = 0;

    // 选词填空 5 题
    for (let i = 0; i < 5 && idx < this.examWords.length; i++, idx++) {
      this.examQuestions.push({ type: 'fill', word: this.examWords[idx] });
    }
    // 英译中 10 题
    for (let i = 0; i < 10 && idx < this.examWords.length; i++, idx++) {
      this.examQuestions.push({ type: 'en2cn', word: this.examWords[idx] });
    }
    // 中译英 10 题
    for (let i = 0; i < 10 && idx < this.examWords.length; i++, idx++) {
      this.examQuestions.push({ type: 'cn2en', word: this.examWords[idx] });
    }
    // 阅读理解判断 5 题
    for (let i = 0; i < 5 && idx < this.examWords.length; i++, idx++) {
      this.examQuestions.push({ type: 'reading', word: this.examWords[idx] });
    }

    // 打乱题型顺序
    this.examQuestions = this.examQuestions.sort(() => Math.random() - 0.5);

    this.examCurrent = 0;
    this.examScore = { correct: 0, total: this.examQuestions.length };

    this.renderMockExam();
  },

  /** 渲染真题模拟 */
  renderMockExam() {
    if (this.examCurrent >= this.examQuestions.length) {
      // 考试完成
      this._finishExam();
      return;
    }

    const q = this.examQuestions[this.examCurrent];
    const word = q.word;
    if (!word) { this.examCurrent++; this.renderMockExam(); return; }

    // 启动计时器
    if (!this.examStarted) {
      this.examStarted = true;
      this._startExamTimer();
    }

    const timeStr = this._formatExamTime(this.examTimeLeft);

    let questionHtml = '';
    switch (q.type) {
      case 'fill':
        // 选词填空：显示中文释义和首字母提示
        questionHtml = `
          <div class="exam-question-type">📝 选词填空 <span style="font-size:12px;color:var(--text2);font-weight:400">（填入正确的英文单词）</span></div>
          <div class="exam-prompt">
            <div style="font-size:16px;margin-bottom:8px">中文释义：<strong>${word.def}</strong></div>
            <div style="font-size:14px;color:var(--text2)">词性：${word.pos || ''}</div>
          </div>
          <input type="text" id="exam-input" class="exam-input" placeholder="输入英文单词..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        `;
        break;
      case 'en2cn':
        // 英译中
        questionHtml = `
          <div class="exam-question-type">📖 英译中 <span style="font-size:12px;color:var(--text2);font-weight:400">（选择正确的中文释义）</span></div>
          <div class="exam-prompt">
            <h2 style="font-size:22px;font-weight:700">${word.word}</h2>
            <div style="font-size:13px;color:var(--text2);margin-top:4px">${word.phonetic || ''}</div>
          </div>
          <div class="choice-options">
            ${this._generateExamOptions(word, 'en2cn').map((opt, i) => `
              <button class="choice-option" onclick="App.submitExamAnswer('en2cn', ${i}, '${opt.replace(/'/g, "\\'")}')">
                <span class="choice-letter">${String.fromCharCode(65 + i)}</span>
                <span class="choice-text">${opt}</span>
              </button>
            `).join('')}
          </div>
        `;
        break;
      case 'cn2en':
        // 中译英
        questionHtml = `
          <div class="exam-question-type">✍️ 中译英 <span style="font-size:12px;color:var(--text2);font-weight:400">（选择正确的英文单词）</span></div>
          <div class="exam-prompt">
            <h2 style="font-size:20px;font-weight:600">${word.def}</h2>
            <div style="font-size:13px;color:var(--text2);margin-top:4px">${word.pos || ''}</div>
          </div>
          <div class="choice-options">
            ${this._generateExamOptions(word, 'cn2en').map((opt, i) => `
              <button class="choice-option" onclick="App.submitExamAnswer('cn2en', ${i}, '${opt.replace(/'/g, "\\'")}')">
                <span class="choice-letter">${String.fromCharCode(65 + i)}</span>
                <span class="choice-text">${opt}</span>
              </button>
            `).join('')}
          </div>
        `;
        break;
      case 'reading':
        // 阅读理解判断
        const isMatch = Math.random() > 0.4;
        const displayDef = isMatch ? word.def : (this._getRandomDef(word));
        questionHtml = `
          <div class="exam-question-type">📄 阅读理解判断</div>
          <div class="exam-reading-box">
            <div style="font-size:14px;font-weight:500;margin-bottom:8px">阅读以下句子：</div>
            <div class="exam-reading-text">${word.example || word.word + ' 是一个英语单词。'}</div>
          </div>
          <div class="exam-prompt" style="margin-top:12px">
            <div style="font-size:14px;color:var(--text2);margin-bottom:8px">根据上下文，单词 <strong>${word.word}</strong> 的意思是：</div>
            <div style="font-size:16px">${displayDef}</div>
          </div>
          <div class="choice-options exam-judge">
            <button class="choice-option" onclick="App.submitExamAnswer('reading', ${isMatch ? 1 : 0}, 'true')">
              <span class="choice-letter">A</span>
              <span class="choice-text">✅ 释义正确</span>
            </button>
            <button class="choice-option" onclick="App.submitExamAnswer('reading', ${isMatch ? 0 : 1}, 'false')">
              <span class="choice-letter">B</span>
              <span class="choice-text">❌ 释义错误</span>
            </button>
          </div>
        `;
        this._examReadingMatch = isMatch;
        break;
    }

    document.getElementById('quiz-content').innerHTML = `
      <div class="exam-header">
        <span class="exam-badge">🎯 真题模拟</span>
        <span class="exam-timer" id="exam-timer">⏱ ${timeStr}</span>
        <button class="quiz-exit-btn" onclick="App.exitQuiz()" title="退出测验">✕</button>
      </div>
      <div class="quiz-progress">
        <span>第 ${this.examCurrent + 1} / ${this.examQuestions.length} 题</span>
        <span>✅ ${this.examScore.correct} / ${this.examCurrent}</span>
      </div>
      <div class="card quiz-card">
        ${questionHtml}
        <div id="exam-feedback" class="choice-feedback hidden"></div>
      </div>
      <div class="quiz-buttons" id="exam-next" style="display:none">
        <button class="btn btn-primary" onclick="App.nextExamQuestion()">下一题 →</button>
      </div>`;

    // 自动聚焦输入框
    if (q.type === 'fill') {
      setTimeout(() => document.getElementById('exam-input')?.focus(), 300);
    }
  },

  /** 生成考试选项（干扰项） */
  _generateExamOptions(word, mode) {
    const correctAnswer = mode === 'en2cn' ? word.def : word.word;
    const pool = this.examWords
      .filter(w => w.id !== word.id)
      .map(w => mode === 'en2cn' ? w.def : w.word)
      .filter(Boolean);
    const unique = [...new Set(pool)];
    const distractors = unique.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correctAnswer, ...distractors];
    return options.sort(() => Math.random() - 0.5);
  },

  /** 获取随机错误释义（阅读判断题用） */
  _getRandomDef(word) {
    const pool = this.examWords.filter(w => w.id !== word.id && w.def);
    if (pool.length === 0) return '这是一个英语单词的定义';
    return pool[Math.floor(Math.random() * pool.length)].def;
  },

  /** 提交考试答案 */
  submitExamAnswer(type, isCorrect, value) {
    if (this._examSubmitted) return;
    this._examSubmitted = true;

    const q = this.examQuestions[this.examCurrent];
    const word = q.word;
    let correct = false;

    if (type === 'fill') {
      const input = document.getElementById('exam-input');
      if (input) {
        const answer = input.value.trim().toLowerCase();
        correct = answer === word.word.toLowerCase();
      }
    } else if (type === 'reading') {
      const matchExpected = this._examReadingMatch;
      const userSaidCorrect = (value === 'true');
      correct = (matchExpected === userSaidCorrect);
    } else {
      correct = isCorrect === 1;
    }

    if (correct) this.examScore.correct++;
    this.saveQuizProgress();

    // 标记按钮（选择题型）
    document.querySelectorAll('.choice-option').forEach(btn => btn.disabled = true);
    if (type !== 'fill') {
      document.querySelectorAll('.choice-option').forEach((btn, i) => {
        if (btn.querySelector('.choice-text')?.textContent === (correct ? value : '')) {
          // Highlight what they chose
        }
      });
    }

    // 反馈
    const feedback = document.getElementById('exam-feedback');
    if (feedback) {
      feedback.className = 'choice-feedback ' + (correct ? 'correct' : 'wrong');
      feedback.classList.remove('hidden');
      feedback.innerHTML = correct
        ? `✅ 正确！<span style="font-size:13px;color:var(--text2)">${word.word} — ${word.def}</span>`
        : `❌ 正确答案：<strong>${word.word}</strong> — ${word.def}`;
    }

    // 如果是 fill 类型，显示正确答案
    if (type === 'fill') {
      const input = document.getElementById('exam-input');
      if (input) {
        input.disabled = true;
        input.className = 'exam-input ' + (correct ? 'correct' : 'wrong');
      }
    }

    const next = document.getElementById('exam-next');
    if (next) next.style.display = 'flex';
  },

  /** 考试下一题 */
  nextExamQuestion() {
    this._examSubmitted = false;
    this.examCurrent++;
    this.renderMockExam();
  },

  /** 格式化计时器显示 */
  _formatExamTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  /** 启动考试计时器 */
  _startExamTimer() {
    if (this.examTimer) clearInterval(this.examTimer);
    this.examTimer = setInterval(() => {
      this.examTimeLeft--;
      const timerEl = document.getElementById('exam-timer');
      if (timerEl) timerEl.textContent = '⏱ ' + this._formatExamTime(this.examTimeLeft);

      // 时间快到时变红
      if (timerEl && this.examTimeLeft <= 60) {
        timerEl.style.color = this.examTimeLeft <= 30 ? 'var(--danger)' : 'var(--warn)';
        timerEl.style.animation = 'pulse 1s infinite';
      }

      if (this.examTimeLeft <= 0) {
        clearInterval(this.examTimer);
        this.examTimer = null;
        this._finishExam();
      }
    }, 1000);
  },

  /** 完成考试 */
  _finishExam() {
    if (this.examTimer) { clearInterval(this.examTimer); this.examTimer = null; }
    Store.clearQuizProgress();

    const total = this.examQuestions.length;
    const correct = this.examScore.correct;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;

    // 评级
    let grade, gradeColor;
    if (pct >= 90) { grade = 'S · 卓越'; gradeColor = 'var(--primary)'; }
    else if (pct >= 80) { grade = 'A · 优秀'; gradeColor = 'var(--accent)'; }
    else if (pct >= 70) { grade = 'B · 良好'; gradeColor = 'var(--accent)'; }
    else if (pct >= 60) { grade = 'C · 及格'; gradeColor = 'var(--warn)'; }
    else { grade = 'D · 需努力'; gradeColor = 'var(--danger)'; }

    document.getElementById('quiz-content').innerHTML = `
      <div class="exam-result">
        <div class="exam-grade" style="color:${gradeColor}">${grade}</div>
        <div class="exam-score">${correct} / ${total}</div>
        <div class="exam-pct">正确率 ${pct}%</div>
        <div class="exam-stats-row">
          <div class="exam-stat"><div class="exam-stat-value" style="color:var(--accent)">${correct}</div><div class="exam-stat-label">正确</div></div>
          <div class="exam-stat"><div class="exam-stat-value" style="color:var(--danger)">${total - correct}</div><div class="exam-stat-label">错误</div></div>
          <div class="exam-stat"><div class="exam-stat-value">${total}</div><div class="exam-stat-label">总题数</div></div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:24px">
          <button class="btn btn-primary" style="flex:none;padding:12px 24px" onclick="App.showQuizModePicker()">返回</button>
          <button class="btn btn-outline" style="flex:none;padding:12px 24px" onclick="location.hash='#dashboard'">面板</button>
        </div>
      </div>`;
  },

  // ============ 词库浏览（搜索防抖） ============

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
      <div class="word-search"><input type="text" placeholder="搜索单词或释义..." value="${query}" oninput="App.debouncedSearch(this.value)" /></div>
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

  /** 防抖搜索 */
  debouncedSearch(value) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.renderWordList(value);
    }, 200);
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
      <input id="list-input" placeholder="输入单词本名称..." style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text)">
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
    html += '<textarea id="import-text" placeholder="每行一个单词\nabandon\nability\naccess" style="width:100%;min-height:100px;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;resize:vertical;background:var(--surface);color:var(--text)"></textarea>';
    html += '<div style="margin:10px 0;display:flex;gap:8px;align-items:center">';
    html += '<label style="font-size:14px;font-weight:500">导入到：</label>';
    html += '<select id="import-list" style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text)">';
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
    if (!text) { document.getElementById('import-result').textContent = '⚠️ 请先输入或选择文件'; return; }
    const listName = document.getElementById('import-list')?.value || '默认收藏';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let found = 0, added = 0;
    lines.forEach(line => {
      const match = line.match(/[a-zA-Z-]+/);
      if (!match) return;
      const w = match[0].toLowerCase();
      const ex = Store.getAllWords().find(x => x.word.toLowerCase() === w);
      if (ex) { Store.addToList(ex.id, listName); found++; return; }
      Store.addImportedWord(w, '', '', '', listName);
      added++;
    });
    const r = '✅ 完成！找到 ' + found + ' 个已有词 + 新增 ' + added + ' 个自定义词 → 已加入「' + listName + '」';
    document.getElementById('import-result').innerHTML = r + '<br><button class="btn btn-outline" style="margin-top:8px;padding:6px 14px;font-size:13px" onclick="location.hash=\'#lists\'">去单词本查看</button>';
  },

  // ============ v4.0: 数据导出/备份 ============

  /** 导出全部数据为 JSON 并下载 */
  exportData() {
    const data = Store.exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `cet4-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('📦 数据已导出');
  },

  /** 导入数据（通过文件选择） */
  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const result = Store.importAllData(data);
          this.showToast(result.msg);
          if (result.success) {
            // 刷新面板
            if (location.hash === '#dashboard') this.renderDashboard();
          }
        } catch (err) {
          this.showToast('❌ 解析失败：' + err.message);
        }
      };
      reader.readAsText(file, 'UTF-8');
    };
    input.click();
  },

  // ============ v4.0: 设置页面 ============

  /** 渲染设置页面 */
  renderSettings() {
    const reminder = Store.getReminderSetting();
    document.getElementById('settings-content').innerHTML = `
      <div class="card"><div class="card-content">
        <div class="section-label" style="margin-bottom:12px">🔔 提醒设置</div>
        <div class="reminder-row">
          <label class="toggle-label">
            <span>每日提醒复习</span>
            <input type="checkbox" id="reminder-toggle" ${reminder.enabled ? 'checked' : ''} onchange="App.toggleReminder(this.checked)" />
            <span class="toggle-switch"></span>
          </label>
        </div>
        <div id="reminder-time-row" class="reminder-time-row" style="${reminder.enabled ? '' : 'display:none'}">
          <span style="font-size:14px">提醒时间：</span>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="reminder-hour" class="reminder-select" onchange="App.saveReminderTime()">
              ${Array.from({length: 24}, (_, i) => `<option value="${i}" ${reminder.hour === i ? 'selected' : ''}>${i.toString().padStart(2, '0')}</option>`).join('')}
            </select>
            <span style="font-size:14px">:</span>
            <select id="reminder-minute" class="reminder-select" onchange="App.saveReminderTime()">
              ${[0, 15, 30, 45].map(m => `<option value="${m}" ${reminder.minute === m ? 'selected' : ''}>${m.toString().padStart(2, '0')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">💡 需要浏览器通知权限才能生效</div>
      </div></div>

      <div class="card"><div class="card-content">
        <div class="section-label" style="margin-bottom:12px">📤 数据管理</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" style="flex:1;min-width:120px" onclick="App.exportData()">📤 导出数据</button>
          <button class="btn btn-outline" style="flex:1;min-width:120px" onclick="App.importData()">📥 导入数据</button>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">导出包含全部学习记录、打卡、测验、收藏、单词本和导入词</div>
      </div></div>`;
  },

  /** 切换每日提醒 */
  toggleReminder(enabled) {
    const setting = Store.getReminderSetting();
    setting.enabled = enabled;
    Store.saveReminderSetting(setting);
    const row = document.getElementById('reminder-time-row');
    if (row) row.style.display = enabled ? '' : 'none';

    if (enabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
      // 尝试注册定期通知
      this._registerPeriodicReminder();
    }

    this.showToast(enabled ? '🔔 每日提醒已开启' : '🔕 每日提醒已关闭');
  },

  /** 保存提醒时间 */
  saveReminderTime() {
    const hour = parseInt(document.getElementById('reminder-hour')?.value || '9');
    const minute = parseInt(document.getElementById('reminder-minute')?.value || '0');
    const setting = Store.getReminderSetting();
    setting.hour = hour;
    setting.minute = minute;
    Store.saveReminderSetting(setting);
  },

  /** 注册定期提醒（通过 Service Worker） */
  _registerPeriodicReminder() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      // 尝试 Periodic Background Sync API
      if ('periodicSync' in reg) {
        reg.periodicSync.register('cet4-reminder', {
          minInterval: 24 * 60 * 60 * 1000 // 每天
        }).catch(() => {});
      }
    });
  },

  // ============ 通用 ============

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

  toggleBookmark(wordId) {
    Store.toggleBookmark(wordId);
    const hash = location.hash;
    if (hash === '#words') this.renderWordList(document.querySelector('.word-search input')?.value || '');
    else if (hash === '#study') this.renderStudy();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
