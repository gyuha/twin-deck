import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

const seed = () => new FakeBackend().seed({ "/home/a/docs/in.txt": "x", "/home/a/f.txt": "y", "/home/a/z.zip": "z", "/home/b": null });
// 이름순: docs, f.txt, z.zip

describe("파일 실행", () => {
  it("Enter는 파일을 기본 프로그램으로 실행한다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(backend.opened).toEqual(["/home/a/f.txt"]));
  });

  it("더블클릭도 파일을 실행하고, 폴더는 실행이 아니라 들어간다", async () => {
    const backend = seed();
    const { user } = await renderApp(backend);
    const rows = within(list("left")).getAllByRole("option");
    await user.dblClick(rows[1]);
    await waitFor(() => expect(backend.opened).toEqual(["/home/a/f.txt"]));
    await user.dblClick(rows[0]);
    await waitFor(() => expect(within(list("left")).getAllByRole("option")).toHaveLength(1));
    expect(backend.opened).toEqual(["/home/a/f.txt"]);
  });

  it("실행에 실패하면 오류를 알린다", async () => {
    const backend = seed();
    backend.openPath = async () => {
      throw new Error("실행 실패");
    };
    const { user } = await renderApp(backend);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByText(/실행 실패/)).toBeTruthy();
  });
});
