// 브라우저용 묶음(arrayBuffer 입력을 받는다). Node용 진입점은 arrayBuffer를 받지 않아 테스트와 앱이 같은 것을 쓰도록 이쪽을 직접 가리킨다.
declare module "mammoth/mammoth.browser" {
  import mammoth = require("mammoth");
  export = mammoth;
}
