const fs = require('node:fs')
const path = require('node:path')

/**
 * 向渲染进程暴露狭窄的本地能力：将游戏棋盘截图保存为 PNG 到下载目录。
 * 只暴露业务需要的最小接口，不暴露完整 Node/Electron 模块。
 */
window.tetrisServices = {
  /**
   * 将 base64 PNG 数据写入下载目录。
   * @param {string} base64Url data:image/png;base64,... 格式的数据
   * @returns {string|null} 保存成功的文件路径；参数非法或写入失败时返回 null
   */
  saveSnapshot(base64Url) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(base64Url || ''))
    if (!match) {
      return null
    }
    try {
      const downloads = window.ztools.getPath('downloads')
      const filePath = path.join(downloads, `tetris-${Date.now()}.png`)
      fs.writeFileSync(filePath, match[1], { encoding: 'base64' })
      return filePath
    } catch (error) {
      return null
    }
  }
}
