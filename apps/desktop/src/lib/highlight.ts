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
  sql: "sql", css: "css", scss: "scss", less: "less", html: "xml", htm: "xml", xml: "xml", vue: "xml",
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
