@main def tests(): Unit =
  def e(level: String, message: String = "m") = LogEntry(level, message)
  def seq(levels: String*) = levels.toList.map(l => e(l))

  // 1단계: parseLine
  Judge.check("1단계 parseLine › 시각, 수준, 메시지")(
    parseLine("2024-05-01T10:00:00 ERROR disk full"),
    Some(LogEntry("ERROR", "disk full")))
  Judge.check("1단계 parseLine › 메시지 안의 공백은 그대로, 구분 공백은 여러 칸이어도 하나")(
    (parseLine("  t1   WARN   retry   in  5 s  "), parseLine("t INFO a")),
    (Some(LogEntry("WARN", "retry   in  5 s")), Some(LogEntry("INFO", "a"))))
  Judge.check("1단계 parseLine › 수준은 INFO · WARN · ERROR만, 대소문자 구분")(
    (parseLine("t DEBUG x"), parseLine("t error x"), parseLine("t Warn x")),
    (None, None, None))
  Judge.check("1단계 parseLine › 조각이 모자라면 None")(
    (parseLine(""), parseLine("t"), parseLine("t ERROR"), parseLine("  t ERROR  ")),
    (None, None, None, None))

  // 2단계: countByLevel
  Judge.check("2단계 countByLevel › 수준별 개수")(
    countByLevel(seq("INFO", "ERROR", "INFO", "WARN", "INFO", "ERROR")),
    Map("INFO" -> 3, "ERROR" -> 2, "WARN" -> 1))
  Judge.check("2단계 countByLevel › 나온 적 없는 수준은 키가 없다")(
    countByLevel(seq("WARN", "WARN")),
    Map("WARN" -> 2))
  Judge.check("2단계 countByLevel › 빈 목록")(countByLevel(Nil), Map.empty[String, Int])

  // 3단계: longestErrorRun
  Judge.check("3단계 longestErrorRun › 빈 목록과 ERROR 없음")(
    (longestErrorRun(Nil), longestErrorRun(seq("INFO", "WARN", "INFO"))),
    (0, 0))
  Judge.check("3단계 longestErrorRun › 가장 긴 연속 구간")(
    longestErrorRun(seq("ERROR", "INFO", "ERROR", "ERROR", "ERROR", "WARN", "ERROR", "ERROR")),
    3)
  Judge.check("3단계 longestErrorRun › 끝까지 이어지는 구간")(
    longestErrorRun(seq("INFO", "ERROR", "ERROR", "ERROR", "ERROR")),
    4)
  Judge.check("3단계 longestErrorRun › WARN도 연속을 끊는다")(
    longestErrorRun(seq("ERROR", "ERROR", "WARN", "ERROR", "ERROR", "INFO", "ERROR")),
    2)

  // 4단계: topErrors
  val errs = List("disk", "net", "disk", "db", "net", "disk", "cpu").map(m => e("ERROR", m))
  Judge.check("4단계 topErrors › 많이 나온 순")(
    topErrors(errs, 2),
    List(("disk", 3), ("net", 2)))
  Judge.check("4단계 topErrors › 횟수가 같으면 메시지 오름차순")(
    topErrors(errs, 4),
    List(("disk", 3), ("net", 2), ("cpu", 1), ("db", 1)))
  Judge.check("4단계 topErrors › 동점이 많아도 먼저 나온 순서가 아니라 메시지 순서")(
    topErrors(List("pear", "kiwi", "fig", "plum", "apple", "lime", "date").map(m => e("ERROR", m)), 3),
    List(("apple", 1), ("date", 1), ("fig", 1)))
  Judge.check("4단계 topErrors › ERROR만 센다")(
    topErrors(List(e("WARN", "x"), e("WARN", "x"), e("ERROR", "y"), e("INFO", "x")), 5),
    List(("y", 1)))
  Judge.check("4단계 topErrors › n이 0이거나 크거나 목록이 비어 있을 때")(
    (topErrors(errs, 0), topErrors(errs, 99).size, topErrors(Nil, 3)),
    (Nil, 4, Nil))

  // 5단계: analyse
  val lines = List(
    "10:00 ERROR db down",
    "10:01 ERROR db down",
    "garbage",
    "10:02 INFO started",
    "10:03 ERROR cache miss",
    "10:04 TRACE ignored",
    "10:05 ERROR cache miss",
    "10:06 ERROR cache miss")
  Judge.check("5단계 analyse › 건너뛴 줄은 연속을 끊지 않는다")(
    analyse(lines, 1),
    Report(2, Map("ERROR" -> 5, "INFO" -> 1), 3, List(("cache miss", 3))))
  Judge.check("5단계 analyse › 빈 입력")(
    analyse(Nil, 3),
    Report(0, Map.empty, 0, Nil))
