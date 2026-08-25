const CONFIG_KEY = 'qixi-fireworks-love:config';
const DEFAULT_CONFIG = Object.freeze({
    recipient: '尹向前',
    message: '尹向前，山河远阔，人间烟火，\n无一是你，无一不是你。\n往后的每一个七夕，我都想陪你一起看。',
});
const MAX_RECIPIENT_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 180;

/**
 * 将文本收敛到安全长度，并在无有效内容时使用默认值。
 * @param {unknown} value 待校验的文本。
 * @param {string} fallback 无效输入使用的默认值。
 * @param {number} maxLength 最大字符数。
 * @returns {string} 可供页面显示的文本。
 */
function normalizeText(value, fallback, maxLength) {
    const text = typeof value === 'string' ? value.trim() : '';
    return (text || fallback).slice(0, maxLength);
}

/**
 * 规范化插件的全部持久化设置。
 * @param {unknown} value 待校验的设置对象。
 * @returns {{recipient: string, message: string}} 安全设置。
 */
function normalizeConfig(value) {
    const config = value && typeof value === 'object' ? value : {};
    return {
        recipient: normalizeText(config.recipient, DEFAULT_CONFIG.recipient, MAX_RECIPIENT_LENGTH),
        message: normalizeText(config.message, DEFAULT_CONFIG.message, MAX_MESSAGE_LENGTH),
    };
}

/**
 * 获取已保存的告白设置。
 * @returns {{recipient: string, message: string}} 当前设置。
 */
function getConfig() {
    try {
        return normalizeConfig(window.ztools.dbStorage.getItem(CONFIG_KEY));
    } catch (error) {
        console.warn('读取七夕星愿设置失败:', error);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * 保存并返回规范化后的告白设置。
 * @param {unknown} value 页面提交的设置。
 * @returns {{recipient: string, message: string}} 已保存设置。
 */
function saveConfig(value) {
    const config = normalizeConfig(value);
    window.ztools.dbStorage.setItem(CONFIG_KEY, config);
    return config;
}

window.qixiLove = {
    getConfig,
    saveConfig,
};

window.ztools.onPluginEnter((param = {}) => {
    // 重复进入时通知页面重新聚焦并重放开场动画。
    window.__qixiLoveEntry = param;
    window.dispatchEvent(new CustomEvent('qixi-love-enter', { detail: param }));
});

window.ztools.onPluginOut(() => {
    // 离开插件时通知页面暂停音乐和动画，避免后台消耗资源。
    window.dispatchEvent(new CustomEvent('qixi-love-out'));
});

console.log('qixi-fireworks-love preload loaded');
