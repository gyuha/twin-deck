import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

const open = (user: Awaited<ReturnType<typeof renderApp>>["user"]) => user.keyboard("{Control>},{/Control}");
const button = (name: string) => screen.getByRole("button", { name });
const field = (name: string) => screen.getByRole("textbox", { name });
const servers = async (backend: ReturnType<typeof seedBackend>) => (await backend.getConfig()).config.remote.servers;

const TD = { name: "집", protocol: "twindeck", host: "home.local", port: 2222, user: "me", base_dir: "" };
const SFTP = { name: "회사", protocol: "sftp", host: "files.example.com", port: 22, user: "kim", base_dir: "/srv" };

async function openTab(tab: string, backend = seedBackend()) {
  const app = await renderApp(backend);
  await open(app.user);
  await screen.findByRole("dialog", { name: "설정" });
  await app.user.click(screen.getByRole("tab", { name: tab }));
  return app;
}
const openTwinDeck = (backend = seedBackend()) => openTab("Twin Deck Remote", backend);

describe("Twin Deck Remote 탭", () => {
  it("연결 그룹에서 SFTP·FTP 탭 뒤에 보인다", async () => {
    await openTwinDeck();
    const group = screen.getByRole("group", { name: "연결" });
    expect(within(group).getAllByRole("tab").map((t) => t.textContent)).toEqual(["SMB 서버", "SFTP·FTP 서버", "Twin Deck Remote"]);
    expect(screen.getByRole("tab", { name: "Twin Deck Remote" })).toHaveAttribute("aria-selected", "true");
  });

  describe("서버 켜기·끄기", () => {
    it("비밀번호가 없으면 켤 수 없고 이유가 보인다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote_server.root = "/home/a"));
      await openTwinDeck(backend);
      expect(screen.getByRole("switch", { name: "서버 켜기" })).toBeDisabled();
      expect(screen.getByText("비밀번호를 먼저 설정해야 켤 수 있습니다")).toBeInTheDocument();
    });

    it("루트 폴더가 비어 있으면 켤 수 없고 이유가 보인다", async () => {
      const backend = seedBackend();
      backend.remoteServerPassword = "pw";
      await openTwinDeck(backend);
      expect(screen.getByRole("switch", { name: "서버 켜기" })).toBeDisabled();
      expect(screen.getByText("루트 폴더를 먼저 정해야 켤 수 있습니다")).toBeInTheDocument();
    });

    it("비밀번호를 설정하고 루트를 정하면 켜고 끌 수 있고 접속 정보가 보인다", async () => {
      const backend = seedBackend();
      const { user } = await openTwinDeck(backend);
      await user.type(screen.getByLabelText("새 비밀번호"), "s3cret");
      await user.click(button("비밀번호 설정"));
      await waitFor(() => expect(backend.remoteServerPassword).toBe("s3cret"));
      await user.clear(field("루트 폴더"));
      await user.type(field("루트 폴더"), "/home/a{Enter}");
      await waitFor(async () => expect((await backend.getConfig()).config.remote_server.root).toBe("/home/a"));
      const sw = screen.getByRole("switch", { name: "서버 켜기" });
      await waitFor(() => expect(sw).toBeEnabled());
      expect(screen.queryByTestId("twindeck-addresses")).toBeNull();

      await user.click(sw);
      await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
      expect((await backend.remoteServerStatus()).running).toBe(true);
      expect(screen.getByTestId("twindeck-addresses")).toHaveTextContent("127.0.0.1:2222");
      expect(screen.getByTestId("twindeck-fingerprint")).toHaveTextContent("SHA256:");

      await user.click(sw);
      await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "false"));
      expect((await backend.remoteServerStatus()).running).toBe(false);
      expect(screen.queryByTestId("twindeck-addresses")).toBeNull();
    });

    it("서버가 거부하면 한글 오류가 탭 안에 보이고 켜지지 않는다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote_server.root = "/home/a"));
      backend.remoteServerPassword = "pw";
      backend.remoteServerStart = async () => {
        throw new Error("포트 2222를 이미 다른 프로그램이 쓰고 있습니다");
      };
      const { user } = await openTwinDeck(backend);
      await user.click(screen.getByRole("switch", { name: "서버 켜기" }));
      const alert = await within(screen.getByRole("tabpanel", { name: "Twin Deck Remote" })).findByRole("alert");
      expect(alert).toHaveTextContent("포트 2222를 이미 다른 프로그램이 쓰고 있습니다");
      expect(screen.getByRole("switch", { name: "서버 켜기" })).toHaveAttribute("aria-checked", "false");
    });

    it("켜져 있는 동안 설정을 바꾸면 다시 켜야 적용된다는 안내가 보인다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote_server.root = "/home/a"));
      backend.remoteServerPassword = "pw";
      const { user } = await openTwinDeck(backend);
      await user.click(screen.getByRole("switch", { name: "서버 켜기" }));
      await waitFor(() => expect(screen.getByRole("switch", { name: "서버 켜기" })).toHaveAttribute("aria-checked", "true"));
      expect(screen.queryByText(/다시 켜야 적용/)).toBeNull();
      await user.click(screen.getByRole("switch", { name: "쓰기 허용" }));
      expect(await screen.findByText(/껐다 다시 켜야 적용/)).toBeInTheDocument();
      expect((await backend.getConfig()).config.remote_server.allow_write).toBe(true);
    });

    it("쓰기·셸 허용은 기본이 꺼짐이고 셸에는 위험 설명이 붙는다", async () => {
      await openTwinDeck();
      expect(screen.getByRole("switch", { name: "쓰기 허용" })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByRole("switch", { name: "셸 허용" })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText(/위험합니다/)).toBeInTheDocument();
    });
  });

  describe("비밀번호", () => {
    it("입력한 값은 Backend로만 가고 화면에 되돌려 보이지 않는다", async () => {
      const backend = seedBackend();
      const { user } = await openTwinDeck(backend);
      expect(screen.getByText("비밀번호가 없습니다")).toBeInTheDocument();
      const input = screen.getByLabelText("새 비밀번호");
      expect(input).toHaveAttribute("type", "password");
      await user.type(input, "hunter2-secret");
      await user.click(button("비밀번호 설정"));
      await waitFor(() => expect(backend.remoteServerPassword).toBe("hunter2-secret"));
      expect(await screen.findByText("비밀번호가 설정되어 있습니다")).toBeInTheDocument();
      expect(screen.getByLabelText("새 비밀번호")).toHaveValue("");
      expect(document.body.textContent).not.toContain("hunter2-secret");
      expect(screen.queryByDisplayValue("hunter2-secret")).toBeNull();
    });

    it("비밀번호 삭제는 빈 문자열을 보낸다", async () => {
      const backend = seedBackend();
      backend.remoteServerPassword = "pw";
      const { user } = await openTwinDeck(backend);
      await user.click(await waitFor(() => {
        const b = button("비밀번호 삭제");
        expect(b).toBeEnabled();
        return b;
      }));
      await waitFor(() => expect(backend.remoteServerPassword).toBe(""));
      expect(await screen.findByText("비밀번호가 없습니다")).toBeInTheDocument();
    });
  });

  describe("접속 주소", () => {
    const list = () => screen.getByRole("listbox", { name: "접속 주소" });

    it("추가 → 입력 → 저장하면 protocol twindeck 항목이 저장되고 기본 포트는 2222다", async () => {
      const backend = seedBackend();
      const { user } = await openTwinDeck(backend);
      expect(screen.getByText("저장된 서버가 없습니다. 추가를 눌러 만듭니다")).toBeInTheDocument();
      await user.click(button("추가"));
      expect(screen.queryByRole("combobox", { name: "프로토콜" })).toBeNull();
      expect(field("포트")).toHaveAttribute("placeholder", "2222");
      await user.type(field("표시 이름"), "집");
      await user.type(field("호스트"), "home.local");
      await user.type(field("사용자"), "me");
      await user.click(button("저장"));
      await waitFor(async () => expect(await servers(backend)).toEqual([TD]));
    });

    it("수정하고 삭제할 수 있다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote = { servers: [TD, { ...TD, name: "사무실", host: "office.local" }] }));
      const { user } = await openTwinDeck(backend);
      expect(within(list()).getAllByRole("option").map((o) => o.textContent)).toEqual(["집TWINDECK · home.local:2222", "사무실TWINDECK · office.local:2222"]);
      await user.click(within(list()).getByRole("option", { name: /사무실/ }));
      await user.click(button("편집"));
      await user.clear(field("호스트"));
      await user.type(field("호스트"), "office2.local{Enter}");
      await user.click(within(list()).getByRole("option", { name: /집/ }));
      await user.click(button("삭제"));
      await user.click(button("저장"));
      await waitFor(async () => expect(await servers(backend)).toEqual([{ ...TD, name: "사무실", host: "office2.local" }]));
    });

    it("호스트가 비면 저장하지 않고 오류를 보인다", async () => {
      const backend = seedBackend();
      const { user } = await openTwinDeck(backend);
      await user.click(button("추가"));
      await user.click(button("저장"));
      expect(await screen.findByText("1번째 항목: 호스트를 입력하세요")).toBeInTheDocument();
      expect(await servers(backend)).toEqual([]);
    });
  });

  describe("SFTP·FTP 탭과 서로 덮어쓰지 않는다", () => {
    it("Twin Deck Remote 탭에는 twindeck 항목만, SFTP·FTP 탭에는 그 밖의 항목만 보인다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote = { servers: [SFTP, TD] }));
      const { user } = await openTwinDeck(backend);
      expect(within(screen.getByRole("listbox", { name: "접속 주소" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["집TWINDECK · home.local:2222"]);
      await user.click(screen.getByRole("tab", { name: "SFTP·FTP 서버" }));
      expect(within(screen.getByRole("listbox", { name: "저장된 원격 서버" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["회사SFTP · files.example.com:22"]);
    });

    it("Twin Deck Remote 탭에서 저장해도 SFTP 항목이 그대로 남고 순서도 유지된다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote = { servers: [SFTP, TD] }));
      const { user } = await openTwinDeck(backend);
      await user.click(button("추가"));
      await user.type(field("호스트"), "new.local");
      await user.click(button("저장"));
      await waitFor(async () => expect((await servers(backend))?.length).toBe(3));
      expect(await servers(backend)).toEqual([SFTP, TD, { name: "new.local", protocol: "twindeck", host: "new.local", port: 2222, user: "", base_dir: "" }]);
      // 삭제도 SFTP 항목은 건드리지 않는다.
      await user.click(within(screen.getByRole("listbox", { name: "접속 주소" })).getByRole("option", { name: /집/ }));
      await user.click(button("삭제"));
      await user.click(button("저장"));
      await waitFor(async () => expect((await servers(backend))?.length).toBe(2));
      expect((await servers(backend))?.[0]).toEqual(SFTP);
    });

    it("SFTP·FTP 탭에서 저장·삭제해도 twindeck 항목이 남는다", async () => {
      const backend = seedBackend();
      backend.setConfig((l) => (l.config.remote = { servers: [TD, SFTP] }));
      const { user } = await openTab("SFTP·FTP 서버", backend);
      await user.click(within(screen.getByRole("listbox", { name: "저장된 원격 서버" })).getByRole("option", { name: /회사/ }));
      await user.click(button("편집"));
      await user.clear(field("호스트"));
      await user.type(field("호스트"), "files2.example.com{Enter}");
      await user.click(button("저장"));
      await waitFor(async () => expect((await servers(backend))?.[1].host).toBe("files2.example.com"));
      expect((await servers(backend))?.[0]).toEqual(TD);
      await user.click(button("삭제"));
      await user.click(button("저장"));
      await waitFor(async () => expect(await servers(backend)).toEqual([TD]));
    });
  });
});
