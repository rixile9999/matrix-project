@main def tests(): Unit =
  Judge.check("정수 함수 합성")(compose((n: Int) => n * 2, (n: Int) => n + 1)(5), 12)
  Judge.check("적용 순서: g가 먼저")(compose((n: Int) => n + 1, (n: Int) => n * 2)(5), 11)
  Judge.check("타입이 바뀌는 합성")(compose((s: String) => s.length, (n: Int) => "x" * n)(4), 4)
  Judge.check("문자열 처리")(compose((s: String) => s.toUpperCase, (s: String) => s.trim)("  hi "), "HI")
  Judge.check("합성 결과를 여러 번 사용")({ val h = compose((n: Int) => n * n, (n: Int) => n - 1); scala.List(1, 2, 3).map(h) }, scala.List(0, 1, 4))
  Judge.check("항등 함수와의 합성")(compose((n: Int) => n + 3, identity[Int])(4), 7)
