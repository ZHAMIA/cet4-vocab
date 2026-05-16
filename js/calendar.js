/**
 * calendar.js — GitHub 风格热力图日历
 */
const Calendar = {
  render(containerId, streakData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 364);

    // 获取一周的第一天（周日=0）
    const startDay = oneYearAgo.getDay();
    const startDate = new Date(oneYearAgo);
    startDate.setDate(startDate.getDate() - startDay);

    // 计算总周数
    const totalDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.ceil(totalDays / 7);

    // 生成日历网格
    let html = `<div class="heatmap-container">
      <div class="heatmap-header">
        <span class="heatmap-title">学习热力图</span>
        <span class="heatmap-streak">🔥 连续 ${Store.getStreakCount()} 天</span>
      </div>
      <div class="heatmap-grid">`;

    // 月份标签
    html += '<div class="heatmap-months">';
    let lastMonth = -1;
    for (let w = 0; w < totalWeeks; w++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + w * 7 + 3); // 周三作为参考
      const month = d.getMonth();
      if (month !== lastMonth) {
        html += `<span style="grid-column:${w + 1}">${['','一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'][month]}</span>`;
        lastMonth = month;
      }
    }
    html += '</div>';

    // 星期标签 + 格子
    html += '<div class="heatmap-body">';
    const weekDays = ['', '一', '', '三', '', '五', ''];
    for (let day = 0; day < 7; day++) {
      html += `<div class="heatmap-row">`;
      html += `<span class="heatmap-day-label">${weekDays[day] || ''}</span>`;
      for (let w = 0; w < totalWeeks; w++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + w * 7 + day);
        const key = d.toISOString().split('T')[0];
        const dayData = streakData[key];
        let count = 0;
        if (dayData) count = (dayData.learned || 0) + (dayData.reviewed || 0);
        
        const isToday = key === today.toISOString().split('T')[0];
        const isFuture = d > today;
        const isInRange = d >= oneYearAgo && d <= today;
        
        let level = 0;
        if (!isFuture && isInRange && count > 0) {
          if (count <= 5) level = 1;
          else if (count <= 15) level = 2;
          else if (count <= 30) level = 3;
          else level = 4;
        }

        const tooltip = isFuture ? '' : `${key}: ${count} 个单词`;
        const cls = [
          'heatmap-cell',
          isToday ? 'today' : '',
          isFuture ? 'future' : '',
          `level-${level}`
        ].filter(Boolean).join(' ');

        html += `<div class="${cls}" title="${tooltip}"></div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    // 图例
    html += `<div class="heatmap-legend">
      <span>少</span>
      <div class="legend-cell level-0"></div>
      <div class="legend-cell level-1"></div>
      <div class="legend-cell level-2"></div>
      <div class="legend-cell level-3"></div>
      <div class="legend-cell level-4"></div>
      <span>多</span>
    </div>`;

    html += '</div></div>';
    container.innerHTML = html;
  }
};
