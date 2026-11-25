# Matrix Project

혼자 쓰려고 만든 훈련 플랫폼입니다. 지금은 코딩(알고리즘, Scala, 함수형 프로그래밍)을 다루고, 체스는 계획만 있습니다.
개념을 먼저 읽고 문제를 푸는 대신, 짧은 제한 시간 안에 문제부터 풀고 그 과정에서 개념이 잡히게 하는 방식입니다.
설계 의도는 [`notes/idea.md`](notes/idea.md), 콘텐츠와 기능을 만들 때 따르는 원칙은 [`CLAUDE.md`](CLAUDE.md)에 있습니다.

## 들어 있는 것

| 화면 | 내용 |
|---|---|
| 훈련 | Codeforces 문제를 내 레이팅에 맞춰 세 가지 모드(스피드·표준·깊이)로 추천하고, 제출 결과를 가져와 레이팅을 다시 계산합니다. |
| 언어 | 브라우저 편집기에서 푸는 Scala 3 문제 150개. 기본·응용·복합, 책 문제, "컴파일러 변환" 묶음. 로컬 채점기가 실제로 컴파일하고 실행합니다. |
| 치트시트 | 문제를 풀면서 여는 문법 예제 116개. 예제의 결과 값은 실행으로 확인한 것입니다. |
| 암기 | 휴대폰용 복습 카드 208장과 문제 점검 93개. 간격 반복(FSRS)으로 다음 복습 시점을 정합니다. |
| Operator | 문제를 마친 뒤 질문하는 창. Claude Code, Codex, Qwen Code CLI를 도구 없이 호출합니다. 타이머가 도는 동안은 잠깁니다. |

## 주의: 공개 서버에 올리지 마세요

이 앱에는 **로그인이 없고, 제출한 Scala 코드를 서버 컴퓨터에서 그대로 실행합니다.**
내 컴퓨터나 사설망(예: Tailscale) 안에서만 쓰도록 만들었습니다. 사설 주소가 아닌 곳에서 온 요청은 상태를 바꾸지 못하게 막아 두었지만
(`app/src/hooks.server.ts`), 이것은 안전장치일 뿐 인증이 아닙니다. 인터넷에 그대로 노출하면 누구나 그 컴퓨터에서 코드를 실행할 수 있습니다.

## 실행

필요한 것: Node.js 26 이상(`node:sqlite` 사용), pnpm, 그리고 Scala 문제를 채점할 [scala-cli](https://scala-cli.virtuslab.org/).

```sh
pnpm -C app install
# scala-cli 실행 파일을 tools/scala-cli 에 두거나, SCALA_CLI 환경변수로 경로를 알려 줍니다.
pnpm build
PORT=5173 pnpm start      # 개발 중에는 pnpm dev
```

데이터는 `app/data/trainer.db`(SQLite)에 쌓입니다. 기록이 원본이고, 레이팅과 복습 일정은 기록에서 다시 계산합니다.

환경변수(모두 선택):

| 이름 | 뜻 |
|---|---|
| `DB_PATH` | 데이터베이스 파일 경로 |
| `SCALA_CLI`, `JUDGE_DIR` | scala-cli 경로, 채점 작업 폴더 |
| `COACH_DIR` | Operator가 CLI를 실행하는 빈 폴더 |
| `COACH_CLAUDE_MODEL`, `COACH_CODEX_MODEL`, `COACH_QWEN_MODEL` | Operator 백엔드별 모델 |

Operator를 쓰려면 `claude`, `codex`, `qwen` 중 쓰려는 CLI가 설치되어 있고 로그인되어 있어야 합니다. API 키는 이 저장소에 없고, 각 CLI가 자기 설정에서 읽습니다.

## 콘텐츠 검증

콘텐츠는 기계로 확인한 것만 넣습니다.

```sh
cd app
node scripts/verify-problems.ts scala      # 모범답안 통과, 시작 코드 실패, 금지어 검사
node scripts/verify-cheatsheet.ts scala    # 예제의 "// => 값" 줄을 실행 결과와 대조
node scripts/verify-memo.ts scala          # 카드·점검의 코드와 답
pnpm test && pnpm check
```

## 출처

- `app/problems/scala/fp-*` 문제와 관련 암기 카드는 Paul Chiusano, Rúnar Bjarnason의 책 *Functional Programming in Scala* (Manning)의 연습문제를 바탕으로 새로 쓴 것입니다. 책 본문은 포함하지 않습니다. 연습문제 코드의 원 저장소는 [fpinscala/fpinscala](https://github.com/fpinscala/fpinscala) (MIT)입니다.
- 훈련 화면의 문제와 레이팅은 [Codeforces](https://codeforces.com) API에서 가져옵니다. 문제 본문은 저장하지 않고 링크만 겁니다.

## 라이선스

[MIT](LICENSE)
