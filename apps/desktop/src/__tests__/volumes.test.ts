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
