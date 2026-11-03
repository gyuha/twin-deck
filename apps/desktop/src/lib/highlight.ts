import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scala from "highlight.js/lib/languages/scala";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = { bash, c, cpp, csharp, css, dart, diff, dockerfile, go, graphql, ini, java, javascript, kotlin, less, lua, makefile, perl, php, powershell, python, r, ruby, rust, scala, scss, sql, swift, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

/** 확장자(소문자, 점 없이) → 언어. Markdown과 JSON은 전용 보기가 있어서 넣지 않는다. */
const BY_EXTENSION: Record<string, keyof typeof LANGUAGES> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  py: "python", pyw: "python", rs: "rust", go: "go", java: "java", kt: "kotlin", kts: "kotlin", swift: "swift",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", cs: "csharp",
  php: "php", rb: "ruby", pl: "perl", pm: "perl", lua: "lua", dart: "dart", scala: "scala", r: "r",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell",
  sql: "sql", css: "css", scss: "scss", less: "less", html: "xml", htm: "xml", xml: "xml", plist: "xml", vue: "xml",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", cfg: "ini", conf: "ini",
  graphql: "graphql", gql: "graphql", diff: "diff", patch: "diff", mk: "makefile",
};

/** 확장자가 없는 파일 이름(소문자) → 언어. */
const BY_NAME: Record<string, keyof typeof LANGUAGES> = { dockerfile: "dockerfile", makefile: "makefile" };

export function languageFor(fileName: string): keyof typeof LANGUAGES | null {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return (dot > 0 ? BY_EXTENSION[lower.slice(dot + 1)] : undefined) ?? BY_NAME[lower] ?? null;
}

/** 소스를 하이라이트한 HTML. 입력은 highlight.js가 이스케이프하므로 그대로 넣어도 안전하다. */
export function highlight(text: string, language: keyof typeof LANGUAGES): string {
  return hljs.highlight(text, { language, ignoreIllegals: true }).value;
}

const SHELL_KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "case", "esac", "in", "function", "time"]);
const WORD = /[^\s|&;()<>'"`$#\\]+/y;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 따옴표가 시작하는 위치에서 닫는 따옴표 바로 다음 위치를 돌려준다(닫히지 않으면 끝). */
function skipQuote(text: string, start: number): number {
  const q = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\" && q !== "'") i++;
    else if (text[i] === q) return i + 1;
  }
  return text.length;
}

/** 셸 한 줄에서 명령 자리 단어(줄 첫머리와 따옴표·주석 밖의 `|` `&` `;` `(` 뒤, `VAR=값` 대입 뒤)의 [시작, 끝) 범위. */
function commandWordRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let expect = true;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "#") {
      break;
    } else if (expect && /[^\s|&;()<>'"`$\\]/.test(c)) {
      WORD.lastIndex = i;
      const word = WORD.exec(text)![0];
      const end = i + word.length;
      if (ASSIGNMENT.test(word)) {
        // 대입의 값(따옴표 포함)을 건너뛰고 계속 명령 자리를 기다린다.
        i = end;
        while (i < text.length && !/[\s|&;()<>]/.test(text[i])) i = /['"`]/.test(text[i]) ? skipQuote(text, i) : i + 1;
      } else {
        if (!SHELL_KEYWORDS.has(word)) {
          ranges.push([i, end]);
          expect = false;
        }
        i = end;
      }
    } else if (c === "'" || c === '"' || c === "`") {
      expect = false;
      i = skipQuote(text, i);
    } else if (c === "\\") {
      expect = false;
      i += 2;
    } else if (c === "|" || c === ";" || c === "(" || (c === "&" && !/[<>]/.test(text[i - 1] ?? ""))) {
      expect = true;
      i++;
    } else {
      expect = false;
      i++;
    }
  }
  return ranges;
}

/** 명령어 줄용 bash 하이라이트: highlight.js가 칠하지 않는 외부 명령 이름도 명령 자리면 `hljs-built_in`으로 칠한다. 모든 조각이 escape되어 있다. */
export function highlightCommandLine(text: string): string {
  let html = "";
  let at = 0;
  for (const [start, end] of commandWordRanges(text)) {
    if (start > at) html += highlight(text.slice(at, start), "bash");
    html += `<span class="hljs-built_in">${escapeHtml(text.slice(start, end))}</span>`;
    at = end;
  }
  return html + (at < text.length ? highlight(text.slice(at), "bash") : "");
}
