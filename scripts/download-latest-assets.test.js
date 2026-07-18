import * as asar from '@electron/asar';
import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress } from 'node:zlib';
import test from 'node:test';
import {
  addZpxDownloadUrls,
  addZpxDownloadUrlsToPluginsJson,
  collectReferencedZipAssets,
  normalizePluginForServer,
  packDirectoryAsZpx,
} from './download-latest-assets.js';

test('collectReferencedZipAssets groups entries by their ZIP asset', () => {
  const pluginsJson = [
    {
      name: 'demo',
      version: '1.0.0',
      downloadUrl: 'https://github.com/ZToolsCenter/ZTools-plugins/releases/download/v1/demo-1.0.0.zip',
    },
    {
      name: 'demo',
      version: '1.0.0',
      platform: ['win32'],
      downloadUrl: 'https://github.com/ZToolsCenter/ZTools-plugins/releases/download/v1/demo-1.0.0.zip',
    },
  ];

  const assets = collectReferencedZipAssets(pluginsJson);

  assert.equal(assets.size, 1);
  assert.equal(assets.get('demo-1.0.0.zip').length, 2);
});

test('addZpxDownloadUrls preserves ZIP fields and adds the ZPX URL', () => {
  const pluginsJson = [
    {
      name: 'demo',
      version: '1.0.0',
      downloadUrl: 'https://ztools.zosen.link/demo-1.0.0.zip',
      size: 100,
    },
  ];
  const convertedAssets = new Map([
    ['demo-1.0.0.zip', { fileName: 'demo-1.0.0.zpx', size: 80 }],
  ]);

  const updatedPluginsJson = addZpxDownloadUrls(pluginsJson, convertedAssets);

  assert.equal(pluginsJson[0].downloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zip');
  assert.equal(pluginsJson[0].size, 100);
  assert.equal(pluginsJson[0].zpxDownloadUrl, undefined);
  assert.equal(updatedPluginsJson[0].downloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zip');
  assert.equal(updatedPluginsJson[0].zpxDownloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zpx');
  assert.equal(updatedPluginsJson[0].size, 100);
});

test('normalizePluginForServer includes both download URLs', () => {
  const plugin = normalizePluginForServer({
    name: 'demo',
    version: '1.0.0',
    downloadUrl: 'https://ztools.zosen.link/demo-1.0.0.zip',
    zpxDownloadUrl: 'https://ztools.zosen.link/demo-1.0.0.zpx',
  });

  assert.equal(plugin.downloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zip');
  assert.equal(plugin.zpxDownloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zpx');
});

test('addZpxDownloadUrlsToPluginsJson updates the original manifest and removes the legacy one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ztools-zpx-manifest-test-'));
  const pluginsJsonPath = join(root, 'plugins.json');
  const legacyPluginsJsonPath = join(root, 'plugins-zpx.json');
  const convertedAssets = new Map([
    ['demo-1.0.0.zip', { fileName: 'demo-1.0.0.zpx', size: 80 }],
  ]);

  try {
    await writeFile(pluginsJsonPath, JSON.stringify([{
      name: 'demo',
      version: '1.0.0',
      downloadUrl: 'https://ztools.zosen.link/demo-1.0.0.zip',
      size: 100,
    }]));
    await writeFile(legacyPluginsJsonPath, '[]');

    await addZpxDownloadUrlsToPluginsJson(convertedAssets, root);

    const pluginsJson = JSON.parse(await readFile(pluginsJsonPath, 'utf-8'));
    assert.equal(pluginsJson[0].downloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zip');
    assert.equal(pluginsJson[0].zpxDownloadUrl, 'https://ztools.zosen.link/demo-1.0.0.zpx');
    await assert.rejects(readFile(legacyPluginsJsonPath), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('packDirectoryAsZpx creates a Brotli-compressed readable ASAR', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ztools-zpx-test-'));
  const sourceDir = join(root, 'plugin');
  const outputPath = join(root, 'demo-1.0.0.zpx');
  const extractedAsarPath = join(root, 'result.asar');
  const pluginConfig = {
    name: 'demo',
    version: '1.0.0',
    main: 'index.html',
    unpack: '*.exe',
  };

  try {
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'plugin.json'), JSON.stringify(pluginConfig));
    await writeFile(join(sourceDir, 'index.html'), '<h1>demo</h1>');
    await writeFile(join(sourceDir, 'tool.exe'), 'binary');

    const result = await packDirectoryAsZpx(sourceDir, outputPath, [pluginConfig]);

    assert.equal(result.fileName, 'demo-1.0.0.zpx');
    assert.ok(result.size > 0);

    // 独立解压产物，确认不是只通过了打包函数内部的验证。
    await pipeline(
      createReadStream(outputPath),
      createBrotliDecompress(),
      createWriteStream(extractedAsarPath),
    );
    const packedConfig = JSON.parse(asar.extractFile(extractedAsarPath, 'plugin.json').toString('utf-8'));
    assert.deepEqual(packedConfig, pluginConfig);
    assert.equal(asar.extractFile(extractedAsarPath, 'tool.exe').toString('utf-8'), 'binary');
    assert.equal(await readFile(outputPath).then(buffer => buffer.length), result.size);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
