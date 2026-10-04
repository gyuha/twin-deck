import { describe, expect, it } from "vitest";
import { isInside, volumeOf } from "../lib/volumes";

const vols = [
  { name: "/", mountPoint: "/" },
  { name: "USB", mountPoint: "/Volumes/USB" },
  { name: "USB2", mountPoint: "/Volumes/USB2" },
  { name: "Deep", mountPoint: "/Volumes/USB/mnt/deep" },
];

describe("volumeOf", () => {
  it("경로를 포함하는 마운트 경로 중 가장 긴 것을 고른다", () => {
    expect(volumeOf("/home/a", vols)?.name).toBe("/");
    expect(volumeOf("/Volumes/USB", vols)?.name).toBe("USB");
    expect(volumeOf("/Volumes/USB/docs/x", vols)?.name).toBe("USB");
    expect(volumeOf("/Volumes/USB/mnt/deep/y", vols)?.name).toBe("Deep");
  });

  it("접두 문자열이 아니라 경로 경계로 판단한다(/Volumes/USB2는 /Volumes/USB 밖)", () => {
    expect(volumeOf("/Volumes/USB2/a", vols)?.name).toBe("USB2");
    expect(isInside("/Volumes/USB2/a", "/Volumes/USB")).toBe(false);
    expect(isInside("/Volumes/USBx", "/Volumes/USB")).toBe(false);
    expect(isInside("/Volumes/USB/", "/Volumes/USB/")).toBe(true);
  });

  it("어느 볼륨에도 속하지 않으면 null이다", () => {
    expect(volumeOf("/Volumes/Other/a", vols.slice(1))).toBeNull();
    expect(volumeOf("/home", [])).toBeNull();
  });
});

describe("Windows 드라이브", () => {
  const win = [
    { name: "C:\\", mountPoint: "C:\\" },
    { name: "D:\\", mountPoint: "D:\\" },
    { name: "I:\\", mountPoint: "I:\\" },
  ];

  it("드라이브 루트 아래의 폴더도 그 드라이브에 속한다", () => {
    expect(volumeOf("C:\\Users\\gyuha", win)?.name).toBe("C:\\");
    expect(volumeOf("C:\\", win)?.name).toBe("C:\\");
    expect(volumeOf("I:\\workspace\\a\\b", win)?.name).toBe("I:\\");
    expect(volumeOf("D:/mixed/slash", win)?.name).toBe("D:\\");
  });

  it("드라이브 문자는 대소문자를 가리지 않는다", () => {
    expect(volumeOf("c:\\users", win)?.name).toBe("C:\\");
    expect(isInside("c:\\users", "C:\\")).toBe(true);
  });

  it("다른 드라이브나 비슷한 접두는 속하지 않는다", () => {
    expect(volumeOf("E:\\a", win)).toBeNull();
    expect(isInside("C:\\Users", "D:\\")).toBe(false);
    expect(isInside("C:foo", "C:\\")).toBe(false);
  });

  it("아카이브 안의 경로도 그 드라이브에 속한다", () => {
    expect(volumeOf("C:\\a\\x.zip!/inner/d", win)?.name).toBe("C:\\");
  });
});

describe("macOS: 한글 볼륨 이름은 NFC/NFD가 달라도 같은 볼륨이다", () => {
  const nfd = (t: string) => t.normalize("NFD");
  const korean = [
    { name: "/", mountPoint: "/" },
    { name: "한글", mountPoint: nfd("/Volumes/한글") }, // OS는 NFD로 준다
  ];

  it("UI의 NFC 경로가 NFD 마운트 경로 안에 있다고 본다", () => {
    expect(volumeOf("/Volumes/한글/docs", korean)?.name).toBe("한글");
    expect(isInside("/Volumes/한글", nfd("/Volumes/한글"))).toBe(true);
  });

  it("리눅스/맥의 `\\`는 구분자가 아니다", () => {
    expect(isInside("/Volumes/USB\\x", "/Volumes/USB")).toBe(false);
  });
});
