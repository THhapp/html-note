param(
  [string]$Output
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $Output) {
  $Output = Join-Path $root 'dist/公共编排层-整合候选.zip'
}
$outputPath = [IO.Path]::GetFullPath($Output)
if ([IO.Path]::GetExtension($outputPath) -ine '.zip') {
  throw 'Output 必须是 .zip 文件'
}
$outputParent = Split-Path -Parent $outputPath
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
  throw ('输出目录不存在：' + $outputParent)
}
$tempPath = $outputPath + '.tmp'

function Should-SkipDirectory([string]$relative, [string]$name) {
  if ($name -in @('node_modules', '.git', '__pycache__', '_dev', 'Cache', 'Code Cache', 'GPUCache')) { return $true }
  if ($name -match '^(browser-profile|profiles?)(-|$)') { return $true }
  # Headless Edge sometimes resolves its user-data-dir into a literal '%SystemDrive%' folder under the project.
  if ($relative -eq '%SystemDrive%' -or $relative.StartsWith('%SystemDrive%/')) { return $true }
  if ($relative -eq '.local' -or $relative.StartsWith('.local/')) { return $true }
  if ($relative -eq 'tests/.cache' -or $relative.StartsWith('tests/.cache/')) { return $true }
  return $false
}

function Should-SkipFile([string]$relative, [string]$fullName) {
  if ($fullName -eq $outputPath -or $fullName -eq $tempPath) { return $true }
  if ($relative -match '\.(zip|7z|log|out|tmp)$') { return $true }
  # 历史检查输出若再次出现也不入分发包。
  if ($relative -eq 'tests/checks/build-release-check.html') { return $true }
  # 工程检查生成的截图/结果 JSON 不是构建输入；检查输出统一写 tests/.cache（已整目录排除）。
  if ($relative -match '^tests/checks/.*\.(png|json)$') { return $true }
  if ($relative -match '^tests/demo/.*\.(json|png)$') { return $true }
  return $false
}

$files = [Collections.Generic.List[IO.FileInfo]]::new()
$pending = [Collections.Generic.Stack[IO.DirectoryInfo]]::new()
# 只枚举现行维护目录与明确的根文件，不从仓库根递归排除历史资料。
foreach ($name in @('src', 'dist', 'docs', 'examples', 'gallery', 'scripts', 'skills', 'vendor', 'tests')) {
  $directory = Join-Path $root $name
  if (Test-Path -LiteralPath $directory -PathType Container) {
    $pending.Push([IO.DirectoryInfo]::new($directory))
  }
}
foreach ($name in @('README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'registry.json', '.gitignore', '.gitattributes')) {
  $file = Join-Path $root $name
  if (Test-Path -LiteralPath $file -PathType Leaf) { $files.Add([IO.FileInfo]::new($file)) }
}
while ($pending.Count -gt 0) {
  $directory = $pending.Pop()
  foreach ($item in $directory.GetFileSystemInfos()) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
    $relative = [IO.Path]::GetRelativePath($root, $item.FullName).Replace('\', '/')
    if ($item -is [IO.DirectoryInfo]) {
      if (-not (Should-SkipDirectory $relative $item.Name)) { $pending.Push($item) }
    } elseif (-not (Should-SkipFile $relative $item.FullName)) {
      $files.Add($item)
    }
  }
}
if ($files.Count -eq 0) { throw '没有找到可打包文件' }

$archive = $null
$stream = $null
try {
  $stream = [IO.File]::Open($tempPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
  foreach ($file in ($files | Sort-Object FullName)) {
    $entryName = [IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  if ($archive) { $archive.Dispose() }
  elseif ($stream) { $stream.Dispose() }
}
Move-Item -LiteralPath $tempPath -Destination $outputPath -Force

$verify = [IO.Compression.ZipFile]::OpenRead($outputPath)
try {
  $entryNames = @($verify.Entries | ForEach-Object FullName)
  # 源码必含清单从 src/manifests 推导：模块拆分后新增的 js/css 与 gallery demo 自动纳入，
  # 不再手写 src/demo/*.js 等文件清单。
  $manifestRequired = [Collections.Generic.List[string]]::new()
  $manifestDir = Join-Path $root 'src/manifests'
  if (Test-Path -LiteralPath $manifestDir -PathType Container) {
    foreach ($manifestFile in (Get-ChildItem -LiteralPath $manifestDir -Filter '*.json' | Sort-Object Name)) {
      $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestFile.FullName | ConvertFrom-Json
      foreach ($file in @($manifest.js) + @($manifest.css) + @($manifest.demos)) {
        if ($file) { [void]$manifestRequired.Add(([string]$file).Replace('\', '/')) }
      }
    }
  }
  $required = @(
    'README.md', 'registry.json', 'THIRD_PARTY_NOTICES.md',
    'docs/公共编排层.md', 'docs/构建与分发.md', 'docs/架构与接口.md',
    'docs/取用与组合.md', 'docs/设计共识.md', 'docs/viz-flow.md',
    'scripts/build.mjs', 'scripts/check.mjs', 'scripts/build-demo-preview.mjs',
    'scripts/query.mjs', 'scripts/query/catalog.mjs', 'scripts/query/entries.mjs', 'scripts/inspect-note.mjs',
    'scripts/lib/note-browser.mjs', 'scripts/lib/inspect-session.mjs', 'tests/checks/query-cli-check.mjs',
    'tests/checks/expand-ui-check.mjs', 'tests/checks/flow-kit-check.mjs',
    'tests/checks/scene-adapter-check.mjs', 'tests/checks/expand-graphics-check.mjs',
    'tests/checks/timing-session-check.mjs', 'tests/checks/flow-scene-check.mjs',
    'tests/checks/flow-split-check.mjs', 'tests/checks/flow-geometry-check.mjs',
    'tests/checks/stable-layout-check.mjs', 'tests/checks/attention-composition-check.mjs',
    'tests/checks/density-config-check.mjs', 'tests/checks/density-screen-check.mjs',
    'tests/checks/minimal-scene-check.mjs',
    'tests/checks/query-closure-host-check.mjs',
    'tests/checks/skill-independent-check.mjs',
    'skills/html-note-authoring/SKILL.md',
    'skills/html-note-authoring/references/principles.md',
    'skills/html-note-authoring/references/task-brief.md',
    'skills/html-note-authoring/references/library-usage.md',
    'skills/html-note-authoring/references/validation.md',
    'skills/html-note-authoring/scripts/query.mjs',
    'skills/html-note-authoring/scripts/inspect-note.mjs',
    'scripts/package.ps1', 'scripts/expected-ids.json', 'scripts/lib/source-order.mjs',
    'gallery/index.html', 'gallery/gallery.js', 'gallery/gallery.css',
    'examples/authoring/index.html', 'examples/demo-runtime/index.html',
    'examples/demo-scene/index.html', 'examples/reuse-matrix-product/index.html',
    'examples/propagation/index.html', 'examples/propagation/example.css',
    'examples/propagation/graph.js', 'examples/propagation/adapter.js', 'examples/propagation/demo.js',
    'examples/propagation/README.md',
    'examples/continuous-scene/index.html', 'examples/continuous-scene/style.css',
    'examples/continuous-scene/scene.js', 'examples/continuous-scene/adapter.js',
    'examples/continuous-scene/demo.js', 'examples/continuous-scene/minimal.html', 'examples/continuous-scene/README.md',
    'examples/flow-kit/index.html', 'examples/flow-kit/flow-kit.css', 'examples/flow-kit/flow-kit.js', 'examples/flow-kit/README.md',
    'examples/flow-composition/index.html', 'examples/flow-composition/flow-composition.css',
    'examples/flow-composition/flow-composition.js', 'examples/flow-composition/README.md',
    'dist/note-library.js', 'dist/note-library.css', 'dist/registry.js',
    'dist/组件库-预览.html', 'dist/作者装配与聚焦-预览.html',
    'dist/传播过程与局部过渡-预览.html', 'dist/连续画面局部变化-预览.html', 'dist/自定义画面-最小接入预览.html', 'dist/图形扩展-中性示例.html',
    'dist/流程组合-预览.html',
    'dist/modules/demo-runtime.js', 'dist/modules/demo-ui.js'
  ) + @($manifestRequired | Select-Object -Unique)
  $missing = @($required | Where-Object { $entryNames -notcontains $_ })
  if ($missing.Count) { throw ('整理包缺少必要文件：' + ($missing -join ', ')) }
  [pscustomobject]@{
    Package = $outputPath
    Files = $verify.Entries.Count
    Bytes = (Get-Item -LiteralPath $outputPath).Length
  } | ConvertTo-Json
} finally {
  $verify.Dispose()
}
