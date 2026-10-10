#!/usr/bin/env node
// 공개된 macOS arm64 릴리스 ZIP으로 자체 tap의 Cask를 갱신한다. GitHub push는 하지 않는다.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} 값이 필요합니다`);
  return args[index + 1];
}

try {
  const version = option('--version');
  const zip = option('--zip');
  const out = option('--out');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`잘못된 버전: ${version}`);
  if (basename(zip) !== `twin-deck-${version}-macos-arm64.zip`) throw new Error('ZIP 파일 이름과 버전이 일치하지 않습니다');
  if (basename(out) !== 'twin-deck.rb') throw new Error('출력 파일은 twin-deck.rb여야 합니다');
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
  if (!entries.includes('Twin Deck.app/Contents/Info.plist') ||
      entries.some(entry => !entry.startsWith('Twin Deck.app/'))) {
    throw new Error('ZIP 최상위에 Twin Deck.app만 있어야 합니다');
  }
  const sha256 = createHash('sha256').update(await readFile(zip)).digest('hex');
  const cask = `cask "twin-deck" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/gyuha/twin-deck/releases/download/v#{version}/twin-deck-#{version}-macos-arm64.zip"
  name "Twin Deck"
  desc "키보드 중심의 듀얼 패널 파일 관리자"
  homepage "https://github.com/gyuha/twin-deck"

  auto_updates true
  depends_on arch: :arm64

  app "Twin Deck.app"
  # 터미널에서 td 폴더 로 앱을 연다(이슈 #45). 링크 이름이 td라서 실행 파일이 스스로 터미널에서 떨어져 나온다.
  binary "#{appdir}/Twin Deck.app/Contents/MacOS/twin-deck-desktop", target: "td"

  # 공식 서명·공증을 거치지 않은 앱이다. 이 앱에 한해서만 격리를 해제한다.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "{{appdir}}/Twin Deck.app"]
  end
end
`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, cask);
  console.log(`Cask 갱신: ${out} (${version}, sha256 ${sha256})`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
