#!/usr/bin/env swift
// 선택한 원본의 바깥 흰 모서리만 투명하게 만들고 Tauri CLI로 플랫폼 아이콘을 생성한다.
import AppKit
import Foundation

let root = CommandLine.arguments.count > 1
    ? URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    : URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let fm = FileManager.default
let icons = root.appendingPathComponent("apps/desktop/src-tauri/icons", isDirectory: true)
let source = icons.appendingPathComponent("source/03-interlock-refined-v2.png")
let work = fm.temporaryDirectory.appendingPathComponent("twin-deck-icons-\(UUID().uuidString)", isDirectory: true)
try fm.createDirectory(at: work, withIntermediateDirectories: true)
defer { try? fm.removeItem(at: work) }

func read(_ url: URL) throws -> NSBitmapImageRep {
    guard let image = NSBitmapImageRep(data: try Data(contentsOf: url)),
          image.bitsPerSample == 8, !image.isPlanar,
          image.samplesPerPixel == 3 || image.samplesPerPixel == 4 else {
        fatalError("8비트 RGB 또는 RGBA PNG가 필요합니다: \(url.path)")
    }
    return image
}
func canvas(_ size: Int) -> NSBitmapImageRep {
    let image = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bitmapFormat: .alphaNonpremultiplied,
        bytesPerRow: size * 4, bitsPerPixel: 32)!
    image.bitmapData!.initialize(repeating: 0, count: size * size * 4)
    return image
}
func save(_ image: NSBitmapImageRep, _ url: URL) throws {
    try image.representation(using: .png, properties: [:])!.write(to: url)
}
func generate(_ input: URL, _ output: URL, size: Int? = nil) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["bun", "run", "--cwd", root.appendingPathComponent("apps/desktop").path,
        "tauri", "icon", input.path, "--output", output.path]
    if let size { process.arguments! += ["--png", String(size)] }
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        FileHandle.standardError.write(Data("Tauri 아이콘 생성 실패\n".utf8))
        exit(1)
    }
}

let original = try read(source)
let size = original.pixelsWide
precondition(size == original.pixelsHigh && !original.hasAlpha, "선택 원본은 정사각형 RGB PNG여야 합니다")
let desktop = canvas(size)
let data = desktop.bitmapData!
for y in 0..<size {
    for x in 0..<size {
        // AppKit은 RGB PNG도 RGBX 32비트로 풀 수 있으므로 실제 픽셀 간격을 사용한다.
        let from = original.bitmapData! + y * original.bytesPerRow + x * (original.bitsPerPixel / 8)
        let to = data + (y * size + x) * 4
        to[0] = from[0]; to[1] = from[1]; to[2] = from[2]; to[3] = 255
    }
}
// 내부 크림화이트 도형에 닿지 않도록 네 모서리에 연결된 저채도 배경만 따라간다.
// RGB는 그대로 두고, 원본 외곽의 안티앨리어싱 픽셀에만 알파를 적용한다.
var visited = [Bool](repeating: false, count: size * size)
var queue = [0, size - 1, size * (size - 1), size * size - 1]
var head = 0
while head < queue.count {
    let index = queue[head]; head += 1
    if visited[index] { continue }
    visited[index] = true
    let pixel = data + index * 4
    let contrast = Int(pixel[0]) - min(Int(pixel[1]), Int(pixel[2]))
    if contrast >= 150 { continue }
    pixel[3] = UInt8(max(0, contrast - 24) * 255 / 126)
    let x = index % size, y = index / size
    if x > 0 { queue.append(index - 1) }
    if x + 1 < size { queue.append(index + 1) }
    if y > 0 { queue.append(index - size) }
    if y + 1 < size { queue.append(index + size) }
}
let desktopInput = work.appendingPathComponent("desktop.png")
try save(desktop, desktopInput)
// PNG 인코딩을 거친 뒤에도 원본 RGB와 내부 도형의 불투명도가 유지되는지 확인한다.
let decoded = try read(desktopInput)
var before = [Int](repeating: 0, count: 4), after = before
for y in 0..<size {
    for x in 0..<size {
        original.getPixel(&before, atX: x, y: y)
        decoded.getPixel(&after, atX: x, y: y)
        precondition(before[0..<3] == after[0..<3], "원본 RGB 손상")
        precondition(after[3] == Int(data[(y * size + x) * 4 + 3]), "알파 손상")
    }
}
let desktopOutput = work.appendingPathComponent("desktop", isDirectory: true)
try generate(desktopInput, desktopOutput)

// Dock에서 이웃 앱과 크기가 맞도록 1024 캔버스 안에 824 크기로 배치한다(각 변 100 여백).
let scaledOutput = work.appendingPathComponent("scaled", isDirectory: true)
try generate(desktopInput, scaledOutput, size: 824)
let scaled = try read(scaledOutput.appendingPathComponent("824x824.png"))
let mac = canvas(1024)
for y in 0..<824 {
    (mac.bitmapData! + (y + 100) * mac.bytesPerRow + 100 * 4)
        .update(from: scaled.bitmapData! + y * scaled.bytesPerRow, count: 824 * 4)
}
let macInput = work.appendingPathComponent("macos.png")
try save(mac, macInput)
let macOutput = work.appendingPathComponent("macos", isDirectory: true)
try generate(macInput, macOutput)

let desktopNames = ["32x32.png", "64x64.png", "128x128.png", "128x128@2x.png", "icon.ico",
    "Square30x30Logo.png", "Square44x44Logo.png", "Square71x71Logo.png", "Square89x89Logo.png",
    "Square107x107Logo.png", "Square142x142Logo.png", "Square150x150Logo.png",
    "Square284x284Logo.png", "Square310x310Logo.png", "StoreLogo.png"]
for name in desktopNames + ["icon.icns", "icon.png"] {
    let generated = (name == "icon.icns" || name == "icon.png" ? macOutput : desktopOutput).appendingPathComponent(name)
    let target = icons.appendingPathComponent(name)
    if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
    try fm.copyItem(at: generated, to: target)
}
print("선택 원본을 보존하고 데스크톱 아이콘 17개를 생성했습니다.")
