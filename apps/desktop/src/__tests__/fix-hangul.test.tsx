import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

type User = Awaited<ReturnType<typeof renderApp>>["user"];
const nfd = (s: string) => s.normalize("NFD");
const nfc = (s: string) => s.normalize("NFC");

const runAction = async (user: User, query: string) => {
  await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
  const input = await screen.findByRole("textbox", { name: "액션 검색" });
  await user.clear(input);
  await user.type(input, query);
  await user.keyboard("{Enter}");
};
const names = async (b: FakeBackend, dir: string) => (await b.listDir(dir, true)).map((e) => e.name).sort();

const seed = () =>
  new FakeBackend().seed({
    [`/home/a/${nfd("가나다.txt")}`]: "1",
    [`/home/a/${nfd("라마바.txt")}`]: "2",
    "/home/a/plain.txt": "3",
    [`/home/a/${nfd("폴더")}/${nfd("안쪽.txt")}`]: "4",
    "/home/b/x.txt": "5",
  });

describe("한글 자소 문제 수정 (이슈 #50)", () => {
  it("선택한 파일 명령은 커서가 가리킨 항목의 이름만 조합형으로 고친다", async () => {
    const b = seed();
    const { user } = await renderApp(b, "mac");
    // 목록은 폴더 먼저, 이름순이다: 폴더, plain.txt, 가나다, 라마바. 커서를 세 번째(가나다)로 옮긴다.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await runAction(user, "선택한 파일 한글 자소 문제 수정");
    await waitFor(async () => expect(await names(b, "/home/a")).toContain(nfc("가나다.txt")));
    const after = await names(b, "/home/a");
    expect(after).toContain(nfd("라마바.txt")); // 선택하지 않은 항목은 그대로
    expect(after).toContain(nfd("폴더")); // 폴더도 선택하지 않았으면 그대로
    expect(after).not.toContain(nfd("가나다.txt"));
    expect(await screen.findByText("자소가 분리된 이름 1개를 고쳤습니다")).toBeInTheDocument();
  });

  it("현재 폴더 명령은 바로 아래만 고치고 하위 폴더 안은 그대로 두며 고친 개수를 알린다", async () => {
    const b = seed();
    const { user } = await renderApp(b, "mac");
    await runAction(user, "현재 폴더 한글 자소 문제 수정");
    await waitFor(async () => expect(await names(b, "/home/a")).toEqual([nfc("가나다.txt"), nfc("라마바.txt"), nfc("폴더"), "plain.txt"].sort()));
    expect(await names(b, `/home/a/${nfc("폴더")}`)).toEqual([nfd("안쪽.txt")]); // 하위 폴더 안은 그대로
    expect(await screen.findByText("자소가 분리된 이름 3개를 고쳤습니다")).toBeInTheDocument();
  });

  it("고칠 이름이 없으면 그렇게 알린다", async () => {
    const b = new FakeBackend().seed({ "/home/a/plain.txt": "1", "/home/b/x.txt": "2" });
    const { user } = await renderApp(b, "mac");
    await runAction(user, "현재 폴더 한글 자소 문제 수정");
    expect(await screen.findByText("자소가 분리된 이름이 없습니다")).toBeInTheDocument();
  });

  it("같은 조합형 이름이 이미 있으면 덮어쓰지 않고 건너뛴 수를 알린다", async () => {
    const b = new FakeBackend().seed({
      [`/home/a/${nfd("겹침.txt")}`]: "분해",
      [`/home/a/${nfc("겹침.txt")}`]: "조합",
      "/home/b/x.txt": "2",
    });
    const { user } = await renderApp(b, "mac");
    await runAction(user, "현재 폴더 한글 자소 문제 수정");
    expect(await screen.findByText(/같은 이름이 이미 있어 1개는 건너뜀/)).toBeInTheDocument();
    expect(await names(b, "/home/a")).toEqual([nfc("겹침.txt"), nfd("겹침.txt")].sort());
  });

  it("두 액션이 Actions Panel에 위 이름으로 보인다", async () => {
    const { user } = await renderApp(seed(), "mac");
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    const input = await screen.findByRole("textbox", { name: "액션 검색" });
    await user.clear(input);
    await user.type(input, "한글 자소");
    expect(await screen.findByText("선택한 파일 한글 자소 문제 수정")).toBeInTheDocument();
    expect(screen.getByText("현재 폴더 한글 자소 문제 수정")).toBeInTheDocument();
  });

  it("macOS가 아니면 두 액션이 Actions Panel에 보이지 않는다", async () => {
    const { user } = await renderApp(seed(), "windows");
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    const input = await screen.findByRole("textbox", { name: "액션 검색" });
    await user.type(input, "자소");
    expect(screen.queryByText("선택한 파일 한글 자소 문제 수정")).not.toBeInTheDocument();
    expect(screen.queryByText("현재 폴더 한글 자소 문제 수정")).not.toBeInTheDocument();
  });
});
