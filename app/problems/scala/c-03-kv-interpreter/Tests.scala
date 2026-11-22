import Command.*

@main def tests(): Unit =
  // 1단계: parseCommand
  Judge.check("1단계 parseCommand › 네 가지 명령")(
    List("SET a 1", "GET a", "DEL a", "INCR a").map(parseCommand),
    List(Right(Put("a", 1)), Right(Get("a")), Right(Del("a")), Right(Incr("a"))))
  Judge.check("1단계 parseCommand › 대소문자 무시, 공백은 여러 칸·앞뒤 모두 허용, 음수 값")(
    List("  set   total   -42 ", "gEt x").map(parseCommand),
    List(Right(Put("total", -42)), Right(Get("x"))))
  Judge.check("1단계 parseCommand › 빈 줄과 알 수 없는 명령")(
    List("", "   ", "PUSH a 1", "get").map(parseCommand),
    List(Left("빈 줄"), Left("빈 줄"), Left("알 수 없는 명령: PUSH"), Left("GET: 인자 개수 오류")))
  Judge.check("1단계 parseCommand › 인자 개수 오류는 대문자 명령 이름으로")(
    List("SET a", "set a 1 2", "DEL", "incr a b").map(parseCommand),
    List(Left("SET: 인자 개수 오류"), Left("SET: 인자 개수 오류"), Left("DEL: 인자 개수 오류"), Left("INCR: 인자 개수 오류")))
  Judge.check("1단계 parseCommand › SET의 값이 정수가 아님")(
    List("SET a x", "SET a 1.5", "SET a 99999999999").map(parseCommand),
    List(Left("SET: 숫자가 아님: x"), Left("SET: 숫자가 아님: 1.5"), Left("SET: 숫자가 아님: 99999999999")))

  // 2단계: step
  val base = Map("a" -> 1, "b" -> 5)
  Judge.check("2단계 step › SET은 덮어쓰고 OK")(
    step(base, Put("a", 9)),
    (Map("a" -> 9, "b" -> 5), "OK"))
  Judge.check("2단계 step › GET은 값이나 (nil)이고 상태는 그대로")(
    (step(base, Get("b")), step(base, Get("zz"))),
    ((base, "5"), (base, "(nil)")))
  Judge.check("2단계 step › DEL은 지웠으면 1, 없었으면 0")(
    (step(base, Del("a")), step(base, Del("zz"))),
    ((Map("b" -> 5), "1"), (base, "0")))
  Judge.check("2단계 step › INCR은 없으면 0에서 시작, 새 값을 출력")(
    (step(base, Incr("b")), step(base, Incr("new")), step(Map("n" -> -1), Incr("n"))),
    ((Map("a" -> 1, "b" -> 6), "6"), (Map("a" -> 1, "b" -> 5, "new" -> 1), "1"), (Map("n" -> 0), "0")))

  // 3단계: runAll
  Judge.check("3단계 runAll › 상태를 이어 가며 출력을 모은다")(
    runAll(List("SET a 1", "INCR a", "GET a", "DEL a", "GET a")),
    (Map.empty[String, Int], List("OK", "2", "2", "1", "(nil)")))
  Judge.check("3단계 runAll › 잘못된 줄은 ERR 출력만 남기고 상태는 유지")(
    runAll(List("SET a 1", "FLY away", "SET b", "INCR a")),
    (Map("a" -> 2), List("OK", "ERR 알 수 없는 명령: FLY", "ERR SET: 인자 개수 오류", "2")))
  Judge.check("3단계 runAll › 키는 서로 독립")(
    runAll(List("INCR x", "INCR y", "INCR x", "SET z 7", "DEL y")),
    (Map("x" -> 2, "z" -> 7), List("1", "1", "2", "OK", "1")))
  Judge.check("3단계 runAll › 빈 입력")(runAll(Nil), (Map.empty[String, Int], Nil))

  // 4단계: transcript
  Judge.check("4단계 transcript › 번호 붙인 출력, 구분선, 키 순서의 최종 상태")(
    transcript(List("SET b 2", "SET a 1", "INCR c", "GET b", "")),
    List("1: OK", "2: OK", "3: 1", "4: 2", "5: ERR 빈 줄", "--", "a=1", "b=2", "c=1"))
  Judge.check("4단계 transcript › 상태가 비면 구분선만")(
    transcript(List("GET a", "DEL a")),
    List("1: (nil)", "2: 0", "--"))
  Judge.check("4단계 transcript › 입력이 없으면 구분선만")(transcript(Nil), List("--"))
