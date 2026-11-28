# Matrix Project — 교육 원칙

## English and Korean

- English is the default for first-time visitors. Provide equivalent Korean labels, instructions, exercises, hints, explanations, feedback, accessibility text and coach replies. Respect the learner’s selection on every route.
- Use `t('한국어', 'English')` for interface text. Localize authored material at the point where the server releases it. Keep code, expected outputs, identifiers and learners’ own words intact.
- Both languages share the same exercise IDs, timers, attempts and review history. Check an English → Korean → English switch during an active exercise when changing learning flows.
- Keep the English [README](README.md) and [한국어 README](README.ko.md) in sync, including setup commands and links.

## Publishing connected content

- For a new lesson, extend the track's canonical catalogue. Give it a stable ID and bilingual learning targets, answer fields, feedback, hints, solution, and cheat sheet. Keep published IDs and the meaning/order of stored answers stable. Migrate or version existing attempts when those meanings change.
- Trace an attempt through the learner-facing course, the Sparring question pool, Debrief, Garden, and Coach. Reuse the same account-scoped attempt and server-side deadline. Count a completed attempt once and keep live answers, private history, and post-session coaching behind the appropriate access checks.
- New tracks must implement those entry points and provide their own catalogue-wide integration test. Executable examples are [stats-connectivity.test.ts](app/src/lib/server/stats-connectivity.test.ts) and [scala-connectivity.test.ts](app/src/lib/server/scala-connectivity.test.ts). They verify catalogue discovery, course/sparring dealing, debrief/garden reflection, post-session coach unlock, bilingual parity, and account isolation. Also add independently checked sample answers (e.g. [stats.test.ts](app/src/lib/server/stats.test.ts)).
- Verification runs in three speeds without heavy git hooks:
  - `pnpm verify:fast`: static schema, ID/reference integrity, required bilingual fields, and cross-layer pedagogy warnings (no compiler, DB, or network).
  - `pnpm verify:changed`: `verify:fast` plus diff-scoped execution checks for changed content and referencing items (escalates to full check/test when shared rules, verifiers, or judges change).
  - Before publishing (`pnpm verify:full` or `pnpm -C app check`, `pnpm -C app test`, `pnpm -C app build`): the build also runs [HTTP route checks](app/scripts/verify-stats-connections.mjs) against a disposable account. Update these checks when adding a learning route. When changing a learner flow, exercise the real route in both languages with a temporary account. Report which connections were tested and whether a provider response was live or simulated.

문제·기능·콘텐츠를 만드는 에이전트는 아래 원칙을 따른다.
원칙과 어긋나는 작업은 진행하기 전에 사용자에게 알린다.

## A. 목표
1. 목표는 스피드·정확도·깊이를 모두 올리는 것이다.
2. 세 축은 모드를 나눠 따로 훈련한다. 한 문항으로 셋을 함께 재지 않는다.
3. 요구사항이 검증된 학습 연구와 어긋나면 근거를 대고 수정안을 낸다.

## B. 학습 방식
4. 읽기보다 인출이다. 모든 개념은 직접 써 보는 문제로 끝난다.
5. 이론·문제풀이·암기는 한 사이클로 묶는다. 따로 떨어진 기능으로 만들지 않는다.
6. 호흡은 짧게, 모든 문제에 제한시간을 둔다. (기본 1–3분, 응용 5–10분, 복합 15–25분)
7. 난이도는 실력 바로 아래에 맞춘다. (목표 정답률 약 85%)
8. 약점이 더 자주 나온다. 못하는 태그·고전한 주제에 가중치를 준다.
9. 쉬운 것에서 어려운 것으로 간다. 기본 → 응용 → 복합, 책 문제는 책 순서.

## C. 도움과 피드백
10. **소크라테스식 문답(산파술)을 기본 원칙으로 삼는다.** 사고·설계·디버깅에는 답을 먼저 주지 않고, 최소한의 반례·질문·더 작은 하위 문제(비계 설정 → 원래 문제로 상향 복귀)로 학습자가 스스로 깨달을 때까지 안내한다. 단, 단순 문법·API 사실 조회는 최소한으로 즉시 답해 흐름을 끊지 않으며, 풀이 예제·모범답안은 학습자가 스스로 포기·요청하거나 단계적 도움(`힌트 1 → 힌트 2 → 모범답안`)의 끝에서만 공개한다.
11. 답을 누설하는 정보는 서버가 쥐고, 세션 상태가 허용할 때만 보낸다.
12. 참고자료는 막지 않고 측정한다. 치트시트는 언제든 열 수 있고 조회는 기록한다.
13. 통과가 끝이 아니다. 통과 후 모범답안·노트·출제 취지를 보여준다.
14. 피드백은 판정이 아니라 정보다. 어느 케이스가 왜 틀렸는지 보여준다.
15. "통과"와 "관용적 풀이"를 구분한다. (`avoid` 키워드, clean 표시)
16. 시간 초과·포기도 기록이다. 세션을 끊지 않고 다음 추천에 반영한다.

## D. 콘텐츠
17. 문제마다 가르칠 대상(`targets`)을 명시한다. 책 문제는 출제 취지(`intent`)도 쓴다.
18. 검증되지 않은 콘텐츠는 넣지 않는다. 모범답안 통과, starter 실패, 치트시트 예제 값을 기계로 확인한다.
19. 유형을 섞는다: 작성(write)·수정(fix)·리팩터(refactor)·완성(complete).
20. 복합 문제는 단계별 테스트로 중간 진척을 보여준다.
21. 설명·힌트·노트는 짧고 명확하게 쓴다. 기본 노출은 영어이며, 한국어 locale에는 한국어 대응 문구를 제공한다.

## E. 측정
22. 레이팅은 외부 척도(Codeforces)에 고정한다. 내부에서만 통하는 점수를 만들지 않는다.
23. 시도 기록이 원본이다. 레이팅은 저장하지 않고 기록에서 재계산한다.
24. 정답 여부만 재지 않는다. 소요 시간, 힌트 사용, 조회, 초과 여부를 함께 남긴다.

## F. 동기
25. 선택권을 준다. 다음 문제는 후보 2–3개로 제시하고 경로를 강제하지 않는다.
26. 보상이 아니라 성장을 보여준다. 포인트·배지·스트릭을 쓰지 않는다.
27. 비교 대상은 타인이 아니라 과거의 나다.

## G. 화면의 글과 디자인
28. 시크하게 쓴다. 설명은 최소한으로, 없어도 된다. 분위기와 느낌을 전하는 데 공을 들인다.
29. 장황한 데이터 설명을 쓰지 않는다. 산출 방식, 건수, 근거, 각주, 면책 문구, "~를 보여 줍니다" 같은 안내문을 화면에 늘어놓지 않는다.
30. 제목은 한두 단어, 부제는 짧은 한 줄 이하. 안내 문장보다 배치·여백·글꼴·움직임으로 전한다.
31. 예외는 짧게 둔다. 외부 전송 고지, 오류 메시지, 문제 지문·힌트·노트(21번)는 필요한 만큼만 쓴다.
32. 숫자와 근거는 기록에 그대로 남긴다(23번). 화면에 다 보여 줄 필요는 없다.

## 구현 현황 메모 (채택 원칙 중 미구현 항목)
- 정확도 모드(확신도 입력 기반 보정)
- 체스 팩
- 교차 출제의 일반 커리큘럼 확대 *(암기 FSRS·점검·Sparring Recall/Sprint·모바일 암기 창구·Debrief는 구현됨)*

근거: `notes/idea.md`, `app/src/lib/core/`, `app/scripts/verify-*.ts`
