const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sourceModules = path.join(root, 'node_modules')
const targetModules = path.join(root, 'dist', 'node_modules')
const runtimePackages = ['tar', 'extract-zip']
const copied = new Set()

fs.rmSync(targetModules, { recursive: true, force: true })
fs.mkdirSync(targetModules, { recursive: true })

for (const packageName of runtimePackages) {
  copyPackageWithDependencies(packageName)
}

console.log(`Copied ${copied.size} preload runtime packages to dist/node_modules`)

/**
 * Copies a CommonJS preload dependency and its transitive runtime dependencies.
 * @param {string} packageName npm package name.
 * @returns {void}
 */
function copyPackageWithDependencies(packageName) {
  if (copied.has(packageName)) return
  copied.add(packageName)

  const sourceDir = packageDir(sourceModules, packageName)
  const targetDir = packageDir(targetModules, packageName)
  const packageJsonPath = path.join(sourceDir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing preload dependency: ${packageName}`)
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (source) => !path.relative(sourceDir, source).startsWith('.git')
  })

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const dependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies }
  for (const dependencyName of Object.keys(dependencies)) {
    copyPackageWithDependencies(dependencyName)
  }
}

/**
 * Resolves scoped and unscoped package directories.
 * @param {string} base node_modules root.
 * @param {string} packageName npm package name.
 * @returns {string} Absolute package directory.
 */
function packageDir(base, packageName) {
  return path.join(base, ...packageName.split('/'))
}
