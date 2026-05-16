/**
 * sm2.js — SM-2 间隔重复算法（简化版）
 * 基于 SuperMemo SM-2 算法
 */
const SM2 = {
  // 质量评分: 0=完全忘记, 1=错误但记得提示, 2=错误但感觉熟悉, 3=困难但正确, 4=犹豫后正确, 5=完美回忆
  // 简化三档转换: 忘记=1, 模糊=3, 认识=5
  
  calculate(state, quality) {
    if (!state) {
      state = { easiness: 2.5, interval: 0, reps: 0, nextReview: 0, level: 0, lastReview: 0 };
    }

    const now = Date.now();
    let { easiness, interval, reps } = state;

    // 更新 easiness factor
    easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easiness < 1.3) easiness = 1.3;

    let newInterval;
    let level;

    if (quality < 3) {
      // 忘记了，重置
      reps = 0;
      newInterval = 1;
      level = Math.max(0, Math.floor(quality / 2));
    } else {
      // 正确回忆
      reps++;
      if (reps === 1) {
        newInterval = 1;
      } else if (reps === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(interval * easiness);
      }
      level = Math.min(5, Math.floor(reps / 2) + 2);
    }

    const nextReview = now + newInterval * 24 * 60 * 60 * 1000;

    return {
      easiness: Math.round(easiness * 100) / 100,
      interval: newInterval,
      reps,
      nextReview,
      level,
      lastReview: now
    };
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
