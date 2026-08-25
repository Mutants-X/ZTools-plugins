const { EventEmitter } = require('node:events')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const extractZip = require('extract-zip')
const tar = require('tar')

const INSTALL_LOCK_MAX_AGE_MS = 30 * 60 * 1000
const PROCESS_TIMEOUT_MS = 30 * 1000

class RuntimeManager {
  /**
   * Creates the isolated runtime manager.
   * @param {{ ztools?: any }} options Host integration options.
   */
  constructor(options = {}) {
    this.ztools = options.ztools
    this.events = new EventEmitter()
    this.manifest = readJson(path.join(__dirname, '..', 'runtime-manifest.json'))
    this.rootDir = path.join(this.resolveUserData(), 'claude-code-free')
    this.runtimeDir = path.join(this.rootDir, 'runtime')
    this.downloadsDir = path.join(this.rootDir, 'downloads')
    this.stagingDir = path.join(this.rootDir, 'staging')
    this.configDir = path.join(this.rootDir, 'claude-config')
    this.logsDir = path.join(this.rootDir, 'logs')
    this.npmCacheDir = path.join(this.runtimeDir, 'npm-cache')
    this.npmrcPath = path.join(this.runtimeDir, 'npmrc')
    this.statePath = path.join(this.rootDir, 'runtime-state.json')
    this.lockPath = path.join(this.rootDir, 'install.lock')
    this.installPromise = null
    this.initializeClaudeConfig()
    this.status = this.readInitialStatus()
  }

  /**
   * Subscribes to runtime progress changes.
   * @param {(status: object) => void} listener Progress listener.
   * @returns {() => void} Unsubscribe callback.
   */
  onProgress(listener) {
    this.events.on('progress', listener)
    return () => this.events.off('progress', listener)
  }

  /**
   * Returns the current runtime state without starting installation.
   * @returns {object} Serializable runtime status.
   */
  getStatus() {
    if (this.status.phase === 'ready' && !this.hasCompleteRuntime()) {
      this.status = this.createStatus('idle', 0, '需要修复运行环境')
    }
    return { ...this.status }
  }

  /**
   * Ensures the private Node, npm packages, Claude binary, and PTY are ready.
   * @param {{ force?: boolean }} options Installation controls.
   * @returns {Promise<object>} Final runtime status.
   */
  async ensureReady(options = {}) {
    if (this.installPromise) return this.installPromise
    if (!options.force && this.hasCompleteRuntime()) {
      this.updateStatus('ready', 100, '运行环境已就绪')
      return this.getStatus()
    }

    this.installPromise = this.install(options)
      .finally(() => {
        this.installPromise = null
      })
    return this.installPromise
  }

  /**
   * Returns absolute paths and environment values required by a Claude session.
   * @returns {{ claudeBinary: string, nodeBinary: string, packageDir: string, cwd: string, env: object }} Runtime launch details.
   * @throws {Error} If installation is incomplete.
   */
  getLaunchContext() {
    if (!this.hasCompleteRuntime()) {
      throw new Error('Claude Code 运行环境尚未安装完成')
    }
    const paths = this.resolveRuntimePaths()
    return {
      ...paths,
      cwd: os.homedir(),
      env: this.buildChildEnvironment(paths)
    }
  }

  /**
   * Loads the PTY module installed in the private runtime.
   * @returns {any} node-pty module.
   * @throws {Error} If the module cannot be loaded by Electron.
   */
  loadPty() {
    const { packageDir } = this.resolveRuntimePaths()
    const modulePath = path.join(packageDir, 'node_modules', 'node-pty')
    try {
      return require(modulePath)
    } catch (error) {
      throw new Error(`无法加载终端组件: ${errorMessage(error)}`)
    }
  }

  /**
   * Opens the isolated data directory in the system file manager.
   * @returns {Promise<void>} Resolves after the open request is sent.
   */
  async openDataDirectory() {
    await fsp.mkdir(this.rootDir, { recursive: true })
    try {
      const electronShell = require('electron')?.shell
      await electronShell?.openPath?.(this.rootDir)
    } catch {
      // The directory remains available even when Electron shell APIs are absent.
    }
  }

  /** @returns {string} Persistent plugin session index path. */
  getSessionStoragePath() {
    return path.join(this.rootDir, 'sessions.json')
  }

  /** @returns {string} Isolated Claude configuration directory holding conversation transcripts. */
  getClaudeConfigDir() {
    return this.configDir
  }

  /**
   * Installs every runtime component through a staging directory.
   * @param {{ force?: boolean }} options Installation controls.
   * @returns {Promise<object>} Final runtime status.
   * @throws {Error} If download, verification, extraction, or npm installation fails.
   */
  async install(options) {
    await this.prepareDirectories()
    const lockHandle = await this.acquireInstallLock()
    try {
      const platformKey = `${process.platform}-${detectRuntimeArch()}`
      const nodeSpec = this.manifest.node.platforms[platformKey]
      if (!nodeSpec) {
        throw new Error(`暂不支持当前平台: ${platformKey}`)
      }

      this.updateStatus('checking', 2, '正在检查隔离运行环境')
      if (options.force || !this.hasValidNode()) {
        await this.installNode(nodeSpec)
      }
      if (options.force || !this.hasValidPackages()) {
        await this.installPackages()
      }

      this.updateStatus('verifying', 94, '正在验证 Claude Code')
      await this.verifyRuntime()
      const installedState = {
        schemaVersion: 1,
        nodeVersion: this.manifest.node.version,
        claudeCodeVersion: this.manifest.claudeCode,
        nodePtyVersion: this.manifest.nodePty,
        platform: process.platform,
        runtimeArch: detectRuntimeArch(),
        electronArch: process.arch,
        installedAt: new Date().toISOString()
      }
      await writeJsonAtomic(this.statePath, installedState)
      this.updateStatus('ready', 100, '运行环境已就绪')
      return this.getStatus()
    } catch (error) {
      const message = errorMessage(error)
      await this.writeLog(message)
      this.updateStatus('error', this.status.progress, message, message)
      throw error
    } finally {
      await this.releaseInstallLock(lockHandle)
    }
  }

  /**
   * Downloads, verifies, and atomically installs portable Node.js.
   * @param {{ archive: string, sha256: string, size: number, format: string }} spec Platform archive specification.
   * @returns {Promise<void>} Resolves after Node is installed.
   */
  async installNode(spec) {
    const archivePath = path.join(this.downloadsDir, spec.archive)
    const archiveUrl = `${this.manifest.node.baseUrl}/${spec.archive}`
    let archiveValid = fs.existsSync(archivePath)
      && await sha256File(archivePath) === spec.sha256

    if (!archiveValid) {
      await fsp.rm(archivePath, { force: true })
      this.updateStatus('downloading-node', 5, '正在下载独立 Node.js')
      await downloadFile(archiveUrl, archivePath, (received, total) => {
        const size = total || spec.size
        const progress = 5 + Math.min(50, Math.round((received / size) * 50))
        this.updateStatus('downloading-node', progress, '正在下载独立 Node.js', undefined, {
          received,
          total: size
        })
      })
      archiveValid = await sha256File(archivePath) === spec.sha256
    }
    if (!archiveValid) throw new Error('Node.js 下载文件校验失败')

    this.updateStatus('extracting-node', 58, '正在解压独立 Node.js')
    const extractRoot = path.join(this.stagingDir, `node-${crypto.randomUUID()}`)
    await fsp.mkdir(extractRoot, { recursive: true })
    try {
      let extractedNodeDir = extractRoot
      if (spec.format === 'zip') {
        await extractZip(archivePath, { dir: extractRoot })
        const entries = await fsp.readdir(extractRoot, { withFileTypes: true })
        const rootEntry = entries.find((entry) => entry.isDirectory())
        if (!rootEntry) throw new Error('Node.js ZIP 缺少根目录')
        extractedNodeDir = path.join(extractRoot, rootEntry.name)
      } else {
        await tar.extract({ file: archivePath, cwd: extractRoot, strip: 1, strict: true })
      }

      const finalNodeDir = this.nodeDir()
      await fsp.mkdir(path.dirname(finalNodeDir), { recursive: true })
      await fsp.rm(finalNodeDir, { recursive: true, force: true })
      await fsp.rename(extractedNodeDir, finalNodeDir)
      if (process.platform !== 'win32') {
        await fsp.chmod(this.nodeBinary(), 0o755)
      }
      await runProcess(this.nodeBinary(), ['--version'], { timeout: PROCESS_TIMEOUT_MS })
    } finally {
      await fsp.rm(extractRoot, { recursive: true, force: true })
    }
  }

  /**
   * Installs Claude Code and node-pty with the private npm executable.
   * @returns {Promise<void>} Resolves after packages are installed and promoted.
   */
  async installPackages() {
    this.updateStatus('installing-packages', 68, '正在通过 npmmirror 安装 Claude Code')
    const packageStage = path.join(this.stagingDir, `packages-${crypto.randomUUID()}`)
    const packageSource = path.join(__dirname, '..', 'runtime-package')
    await fsp.mkdir(packageStage, { recursive: true })
    try {
      await fsp.copyFile(path.join(packageSource, 'package.json'), path.join(packageStage, 'package.json'))
      await fsp.copyFile(path.join(packageSource, 'package-lock.json'), path.join(packageStage, 'package-lock.json'))
      const npmEnv = this.buildNpmEnvironment()
      const args = [
        this.npmCliPath(),
        'ci',
        `--registry=${this.manifest.registry}`,
        '--include=optional',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--loglevel=notice'
      ]
      await runProcess(this.nodeBinary(), args, {
        cwd: packageStage,
        env: npmEnv,
        timeout: 15 * 60 * 1000,
        onOutput: (line) => this.updateStatus('installing-packages', 78, compactNpmLine(line))
      })
      await this.repairExecutablePermissions(packageStage)

      const finalPackageDir = this.packageDir()
      await fsp.mkdir(path.dirname(finalPackageDir), { recursive: true })
      await fsp.rm(finalPackageDir, { recursive: true, force: true })
      await fsp.rename(packageStage, finalPackageDir)
    } finally {
      await fsp.rm(packageStage, { recursive: true, force: true })
    }
  }

  /**
   * Validates Node, Claude, and PTY from their final locations.
   * @returns {Promise<void>} Resolves when all smoke tests pass.
   */
  async verifyRuntime() {
    await this.repairExecutablePermissions(this.packageDir())
    const paths = this.resolveRuntimePaths()
    const versionResult = await runProcess(paths.claudeBinary, ['--version'], {
      cwd: os.homedir(),
      env: this.buildChildEnvironment(paths),
      timeout: PROCESS_TIMEOUT_MS
    })
    if (!versionResult.output.includes(this.manifest.claudeCode)) {
      throw new Error(`Claude Code 版本验证失败: ${versionResult.output.trim()}`)
    }
    await this.verifyPty(paths)
  }

  /**
   * Spawns a short process inside node-pty to verify Electron compatibility.
   * @param {{ nodeBinary: string, packageDir: string }} paths Runtime paths.
   * @returns {Promise<void>} Resolves after the PTY prints its marker.
   */
  async verifyPty(paths) {
    const pty = this.loadPty()
    await new Promise((resolve, reject) => {
      let output = ''
      let settled = false
      const processHandle = pty.spawn(paths.nodeBinary, ['-e', 'process.stdout.write("pty-ok")'], {
        name: 'xterm-256color',
        cols: 40,
        rows: 10,
        cwd: os.homedir(),
        env: filterEnvironment(process.env)
      })
      const timer = setTimeout(() => finish(new Error('PTY 验证超时')), 10_000)

      const finish = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { processHandle.kill() } catch {}
        if (error) reject(error)
        else resolve()
      }
      processHandle.onData((data) => { output += data })
      processHandle.onExit(() => {
        if (output.includes('pty-ok')) finish()
        else finish(new Error(`PTY 验证失败: ${output.trim()}`))
      })
    })
  }

  /**
   * Restores executable bits that npm archives may omit on macOS.
   * @param {string} packageDir Installed package root.
   * @returns {Promise<void>} Resolves after permissions are repaired.
   */
  async repairExecutablePermissions(packageDir) {
    if (process.platform === 'win32') return
    const claudeBinary = path.join(packageDir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    if (fs.existsSync(claudeBinary)) await fsp.chmod(claudeBinary, 0o755)

    const prebuildRoot = path.join(packageDir, 'node_modules', 'node-pty', 'prebuilds')
    if (!fs.existsSync(prebuildRoot)) return
    const platformDirs = await fsp.readdir(prebuildRoot, { withFileTypes: true })
    for (const entry of platformDirs) {
      if (!entry.isDirectory() || !entry.name.startsWith('darwin-')) continue
      const helperPath = path.join(prebuildRoot, entry.name, 'spawn-helper')
      if (fs.existsSync(helperPath)) await fsp.chmod(helperPath, 0o755)
    }
  }

  /** @returns {Promise<void>} Creates private runtime directories and npm configuration. */
  async prepareDirectories() {
    await Promise.all([
      fsp.mkdir(this.runtimeDir, { recursive: true }),
      fsp.mkdir(this.downloadsDir, { recursive: true }),
      fsp.mkdir(this.stagingDir, { recursive: true }),
      fsp.mkdir(this.configDir, { recursive: true }),
      fsp.mkdir(this.logsDir, { recursive: true }),
      fsp.mkdir(this.npmCacheDir, { recursive: true })
    ])
    const npmrc = `registry=${this.manifest.registry}\ncache=${this.npmCacheDir}\naudit=false\nfund=false\nupdate-notifier=false\n`
    await fsp.writeFile(this.npmrcPath, npmrc, 'utf8')
  }

  /**
   * Creates Claude's isolated configuration directory and one-time onboarding state.
   * @returns {void}
   */
  initializeClaudeConfig() {
    fs.mkdirSync(this.configDir, { recursive: true })
    const configPath = path.join(this.configDir, '.claude.json')
    if (fs.existsSync(configPath)) return
    fs.writeFileSync(configPath, `${JSON.stringify({ hasCompletedOnboarding: true }, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    })
  }

  /** @returns {Promise<fs.promises.FileHandle>} Exclusive installation lock. */
  async acquireInstallLock() {
    try {
      return await fsp.open(this.lockPath, 'wx')
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const stat = await fsp.stat(this.lockPath).catch(() => null)
      if (stat && Date.now() - stat.mtimeMs > INSTALL_LOCK_MAX_AGE_MS) {
        await fsp.rm(this.lockPath, { force: true })
        return fsp.open(this.lockPath, 'wx')
      }
      throw new Error('另一个 Claude Code Free 窗口正在安装运行环境')
    }
  }

  /** @param {fs.promises.FileHandle} handle Lock file handle. @returns {Promise<void>} Resolves after cleanup. */
  async releaseInstallLock(handle) {
    await handle?.close().catch(() => undefined)
    await fsp.rm(this.lockPath, { force: true }).catch(() => undefined)
  }

  /** @returns {object} Environment used only by private npm. */
  buildNpmEnvironment() {
    return filterEnvironment({
      ...process.env,
      NPM_CONFIG_REGISTRY: this.manifest.registry,
      NPM_CONFIG_USERCONFIG: this.npmrcPath,
      NPM_CONFIG_CACHE: this.npmCacheDir,
      npm_config_registry: this.manifest.registry,
      npm_config_userconfig: this.npmrcPath,
      npm_config_cache: this.npmCacheDir,
      npm_config_update_notifier: 'false'
    })
  }

  /** @param {object} paths Runtime paths. @returns {object} Isolated Claude child environment. */
  buildChildEnvironment(paths) {
    const delimiter = path.delimiter
    const nodeBinDir = process.platform === 'win32' ? paths.nodeDir : path.join(paths.nodeDir, 'bin')
    const packageBinDir = path.join(paths.packageDir, 'node_modules', '.bin')
    return filterEnvironment({
      ...process.env,
      CLAUDE_CONFIG_DIR: this.configDir,
      DISABLE_AUTOUPDATER: '1',
      NPM_CONFIG_USERCONFIG: this.npmrcPath,
      NPM_CONFIG_CACHE: this.npmCacheDir,
      NPM_CONFIG_REGISTRY: this.manifest.registry,
      PATH: [nodeBinDir, packageBinDir, process.env.PATH || ''].filter(Boolean).join(delimiter),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    })
  }

  /** @returns {object} Resolved runtime files. */
  resolveRuntimePaths() {
    const nodeDir = this.nodeDir()
    const packageDir = this.packageDir()
    return {
      nodeDir,
      packageDir,
      nodeBinary: this.nodeBinary(),
      claudeBinary: path.join(packageDir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    }
  }

  /** @returns {string} Private Node installation directory. */
  nodeDir() { return path.join(this.runtimeDir, 'node', this.manifest.node.version) }
  /** @returns {string} Private package installation directory. */
  packageDir() { return path.join(this.runtimeDir, 'packages', `claude-${this.manifest.claudeCode}`) }
  /** @returns {string} Private Node executable. */
  nodeBinary() { return path.join(this.nodeDir(), process.platform === 'win32' ? 'node.exe' : 'bin/node') }
  /** @returns {string} npm CLI entry bundled in Node. */
  npmCliPath() {
    return path.join(this.nodeDir(), process.platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : 'lib/node_modules/npm/bin/npm-cli.js')
  }

  /** @returns {boolean} Whether the private Node files exist. */
  hasValidNode() { return fs.existsSync(this.nodeBinary()) && fs.existsSync(this.npmCliPath()) }
  /** @returns {boolean} Whether Claude and PTY package files exist. */
  hasValidPackages() {
    const paths = this.resolveRuntimePaths()
    return fs.existsSync(paths.claudeBinary)
      && fs.existsSync(path.join(paths.packageDir, 'node_modules', 'node-pty', 'package.json'))
  }
  /** @returns {boolean} Whether the complete runtime can be launched. */
  hasCompleteRuntime() { return this.hasValidNode() && this.hasValidPackages() && fs.existsSync(this.statePath) }

  /** @returns {object} Initial state loaded from disk. */
  readInitialStatus() {
    const saved = readJson(this.statePath, null)
    const matches = saved
      && saved.nodeVersion === this.manifest.node.version
      && saved.claudeCodeVersion === this.manifest.claudeCode
      && saved.nodePtyVersion === this.manifest.nodePty
    return this.createStatus(matches ? 'ready' : 'idle', matches ? 100 : 0, matches ? '运行环境已就绪' : '等待安装运行环境')
  }

  /** @returns {string} Writable ZTools user data directory. */
  resolveUserData() {
    try {
      const value = this.ztools?.getPath?.('userData')
      if (value) return value
    } catch {}
    return path.join(os.homedir(), '.ztools')
  }

  /** @param {string} phase Phase id. @param {number} progress Percent complete. @param {string} message Display message. @param {string} [error] Error detail. @param {object} [transfer] Download totals. @returns {object} Status. */
  createStatus(phase, progress, message, error, transfer) {
    return {
      phase,
      progress,
      message,
      error,
      transfer,
      ready: phase === 'ready',
      rootDir: this.rootDir,
      defaultCwd: os.homedir(),
      versions: {
        node: this.manifest.node.version,
        claudeCode: this.manifest.claudeCode,
        nodePty: this.manifest.nodePty
      }
    }
  }

  /** @param {string} phase Phase id. @param {number} progress Percent complete. @param {string} message Display message. @param {string} [error] Error detail. @param {object} [transfer] Download totals. @returns {void} */
  updateStatus(phase, progress, message, error, transfer) {
    this.status = this.createStatus(phase, progress, message, error, transfer)
    this.events.emit('progress', { ...this.status })
  }

  /** @param {string} message Log message. @returns {Promise<void>} Resolves after writing the log. */
  async writeLog(message) {
    await fsp.mkdir(this.logsDir, { recursive: true })
    const line = `[${new Date().toISOString()}] ${message}\n`
    await fsp.appendFile(path.join(this.logsDir, 'runtime.log'), line, 'utf8')
  }
}

/** @returns {'arm64'|'x64'|string} Native runtime architecture, accounting for Rosetta. */
function detectRuntimeArch() {
  if (process.platform === 'darwin' && process.arch === 'x64') {
    try {
      const translated = childProcess.execFileSync('sysctl', ['-n', 'sysctl.proc_translated'], { encoding: 'utf8' }).trim()
      if (translated === '1') return 'arm64'
    } catch {}
  }
  return process.arch
}

/** @param {string} filePath JSON file. @param {any} [fallback] Missing-file fallback. @returns {any} Parsed JSON. */
function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch (error) {
    if (arguments.length > 1) return fallback
    throw error
  }
}

/** @param {string} filePath Target file. @param {object} value JSON value. @returns {Promise<void>} Resolves after atomic replacement. */
async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`
  await fsp.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fsp.rename(tempPath, filePath)
}

/** @param {string} url Download URL. @param {string} destination Destination file. @param {(received: number, total: number) => void} onProgress Progress callback. @returns {Promise<void>} Resolves when the file is fully written. */
async function downloadFile(url, destination, onProgress) {
  const partialPath = `${destination}.part`
  await fsp.rm(partialPath, { force: true })
  await new Promise((resolve, reject) => {
    const request = (nextUrl, redirectsLeft) => {
      const client = nextUrl.startsWith('https:') ? https : http
      const req = client.get(nextUrl, { headers: { 'User-Agent': 'claude-code-free/0.1.0' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirectsLeft > 0) {
          response.resume()
          request(new URL(response.headers.location, nextUrl).toString(), redirectsLeft - 1)
          return
        }
        if (response.statusCode !== 200) {
          response.resume()
          reject(new Error(`下载失败: HTTP ${response.statusCode}`))
          return
        }
        const total = Number(response.headers['content-length']) || 0
        let received = 0
        const output = fs.createWriteStream(partialPath)
        response.on('data', (chunk) => {
          received += chunk.length
          onProgress(received, total)
        })
        response.on('error', reject)
        output.on('error', reject)
        output.on('finish', () => output.close(resolve))
        response.pipe(output)
      })
      req.setTimeout(30_000, () => req.destroy(new Error('下载连接超时')))
      req.on('error', reject)
    }
    request(url, 5)
  }).catch(async (error) => {
    await fsp.rm(partialPath, { force: true })
    throw error
  })
  await fsp.rename(partialPath, destination)
}

/** @param {string} filePath Input file. @returns {Promise<string>} Lowercase SHA-256 digest. */
async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const input = fs.createReadStream(filePath)
    input.on('error', reject)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

/** @param {string} executable Executable path. @param {string[]} args Arguments. @param {object} options Spawn options. @returns {Promise<{output: string}>} Captured process output. */
async function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    const child = childProcess.spawn(executable, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      windowsHide: true,
      shell: false
    })
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve({ output })
    }
    const append = (chunk) => {
      const text = chunk.toString('utf8')
      output = (output + text).slice(-200_000)
      options.onOutput?.(text)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (error) => finish(error))
    child.on('exit', (code, signal) => {
      if (code === 0) finish()
      else finish(new Error(`进程退出 (${code ?? signal}): ${output.trim()}`))
    })
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish(new Error(`进程执行超时: ${path.basename(executable)}`))
    }, options.timeout || PROCESS_TIMEOUT_MS)
  })
}

/** @param {object} env Raw environment. @returns {object} String-only environment accepted by node-pty. */
function filterEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string'))
}

/** @param {unknown} error Error value. @returns {string} Display-safe error message. */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** @param {string} output npm output chunk. @returns {string} Compact install detail. */
function compactNpmLine(output) {
  const line = output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1)
  return line ? `正在安装 Claude Code · ${line.slice(0, 120)}` : '正在安装 Claude Code'
}

module.exports = { RuntimeManager }
