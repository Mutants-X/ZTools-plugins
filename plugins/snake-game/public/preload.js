const STORAGE_KEY = 'snake-game:stats';
const DEFAULT_STATS = Object.freeze({ highScore: 0, gamesPlayed: 0 });
const MAX_SAFE_SCORE = 1000000;

/**
 * 将未知值限制为安全的非负整数。
 * @param {unknown} value 待处理的数值。
 * @param {number} fallback 输入无效时使用的默认值。
 * @returns {number} 规范化后的整数。
 */
function normalizeInteger(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_SAFE_SCORE, Math.max(0, Math.floor(value)));
}

/**
 * 规范化从 ZTools 存储读取的游戏统计。
 * @param {unknown} value 原始存储值。
 * @returns {{highScore: number, gamesPlayed: number}} 安全的统计对象。
 */
function normalizeStats(value) {
  const stats = value && typeof value === 'object' ? value : DEFAULT_STATS;
  return {
    highScore: normalizeInteger(stats.highScore),
    gamesPlayed: normalizeInteger(stats.gamesPlayed),
  };
}

/**
 * 读取持久化的游戏统计。
 * @returns {{highScore: number, gamesPlayed: number}} 当前统计。
 */
function getStats() {
  try {
    return normalizeStats(window.ztools.dbStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn('读取贪吃蛇统计失败:', error);
    return { ...DEFAULT_STATS };
  }
}

/**
 * 保存一局游戏结果并返回更新后的统计。
 * @param {unknown} score 本局分数。
 * @returns {{highScore: number, gamesPlayed: number}} 更新后的统计。
 */
function recordGame(score) {
  const normalizedScore = normalizeInteger(score);
  const current = getStats();
  const next = {
    highScore: Math.max(current.highScore, normalizedScore),
    gamesPlayed: normalizeInteger(current.gamesPlayed + 1),
  };

  try {
    window.ztools.dbStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    console.warn('保存贪吃蛇统计失败:', error);
  }
  return next;
}

/**
 * 清空游戏统计。
 * @returns {{highScore: number, gamesPlayed: number}} 重置后的统计。
 */
function resetStats() {
  const stats = { ...DEFAULT_STATS };
  try {
    window.ztools.dbStorage.setItem(STORAGE_KEY, stats);
  } catch (error) {
    console.warn('重置贪吃蛇统计失败:', error);
  }
  return stats;
}

window.snakeGame = {
  getStats,
  recordGame,
  resetStats,
};

window.ztools.onPluginEnter((param = {}) => {
  window.__snakeGameEntry = param;
  window.dispatchEvent(new CustomEvent('snake-game-enter', { detail: param }));
});

window.ztools.onPluginOut(() => {
  window.dispatchEvent(new CustomEvent('snake-game-out'));
});
