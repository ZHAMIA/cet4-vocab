/**
 * sm2.js — v4.0 简化版 FSRS (Free Spaced Repetition Scheduler) 间隔重复算法
 *
 * 保留原 SM-2 的 API 接口（calculate, getDueWords, getNewWords, classifyWords），
 * 内部改用 FSRS 的稳定性(stability)、难度(difficulty) 概念。
 *
 * 向后兼容：检测旧 SM-2 数据（含 easiness 字段）并自动迁移。
 */
const SM2 = {
  /**
   * 简化版 FSRS 计算
   * @param {object} state - { stability, difficulty, interval, reps, level, nextReview, lastReview }
   *                         旧数据格式: { easiness, interval, reps, nextReview, level, lastReview }
   * @param {number} quality - 1=Again(忘记), 3=Hard(模糊), 5=Good(认识)
   * @returns {object} 更新后的 state
   */
  calculate(state, quality) {
    // 初始化/空值处理
    if (!state) {
      state = { stability: 2.5, difficulty: 5, interval: 0, reps: 0, level: 0, nextReview: 0, lastReview: 0 };
    }

    // 向后兼容：如果 state 是旧的 SM-2 格式（含 easiness 字段），做一次迁移
    if (state.easiness !== undefined && state.stability === undefined) {
      state = this._migrateFromSM2(state);
    }

    const now = Date.now();
    let { stability, difficulty, interval, reps } = state;

    // 确保字段存在
    stability = stability ?? 2.5;
    difficulty = difficulty ?? 5;
    interval = interval ?? 0;
    reps = reps ?? 0;

    let newInterval;
    let newLevel;

    if (quality <= 2) {
      // Again：忘记，重置
      newInterval = 1;
      stability = Math.max(0.3, stability * 0.2);
      difficulty = Math.min(10, difficulty + 1);
      newLevel = 0;
    } else if (quality <= 4) {
      // Hard：模糊，保留但放缓
      newInterval = Math.max(1, Math.round(interval * 1.2));
      stability = stability * 0.8;
      difficulty = Math.min(10, difficulty + 0.5);
      newLevel = state.level || 0;
    } else {
      // Good：认识，正常复习
      reps++;
      stability = stability * 1.2;
      difficulty = Math.max(1, difficulty * 0.9);
      if (reps === 1) {
        newInterval = 1;
      } else {
        newInterval = Math.max(1, Math.round(interval * stability));
      }
      newLevel = Math.min(5, (state.level || 0) + 1);
    }

    const nextReview = now + newInterval * 24 * 60 * 60 * 1000;

    return {
      stability: Math.round(stability * 100) / 100,
      difficulty: Math.round(difficulty * 100) / 100,
      interval: newInterval,
      reps: Math.max(state.reps || 0, newLevel > 0 ? (state.reps || 0) + 1 : (state.reps || 0)),
      level: newLevel,
      nextReview,
      lastReview: now
    };
  },

  /**
   * 从旧 SM-2 数据迁移到 FSRS 格式
   */
  _migrateFromSM2(old) {
    return {
      stability: Math.max(0.5, old.easiness || 2.5),
      difficulty: 5 - Math.min(4, Math.max(0, (old.level || 0) - 1)),
      interval: old.interval || 0,
      reps: old.reps || 0,
      level: old.level || 0,
      nextReview: old.nextReview || 0,
      lastReview: old.lastReview || 0
    };
  },

  /**
   * 预测 retention（记忆保留率）
   * 使用 FSRS 简化公式：R = e^(-t/s)
   * @param {number} stability - 稳定性（天数）
   * @param {number} elapsedDays - 距上次复习的天数
   * @returns {number} 0~1 的 retention 值
   */
  recall(stability, elapsedDays) {
    if (stability <= 0) return 0;
    return Math.exp(-elapsedDays / stability);
  },

  // 待复习的单词 (按到期时间排序)
  getDueWords(learnData) {
    const now = Date.now();
    return Object.entries(learnData)
      .filter(([_, state]) => state.nextReview <= now && state.reps > 0)
      .sort((a, b) => a[1].nextReview - b[1].nextReview);
  },

  // 获取需要学习的生词 (从未学过的)
  getNewWords(allWords, learnData, limit = 10) {
    const learned = new Set(Object.keys(learnData));
    return allWords.filter(w => !learned.has(String(w.id))).slice(0, limit);
  },

  // 获取掌握程度分类
  classifyWords(learnData) {
    const result = { mastered: [], learning: [], new_: [] };
    Object.entries(learnData).forEach(([id, state]) => {
      if (state.level >= 4) result.mastered.push(id);
      else result.learning.push(id);
    });
    return result;
  }
};
