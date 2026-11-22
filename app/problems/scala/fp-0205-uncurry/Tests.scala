@main def tests(): Unit =
  Judge.check("덧셈")(uncurry((a: Int) => (b: Int) => a + b)(2, 3), 5)
  Judge.check("인자 순서 유지: 뺄셈")(uncurry((a: Int) => (b: Int) => a - b)(10, 3), 7)
  Judge.check("타입이 다른 인자")(uncurry((s: String) => (n: Int) => s.take(n))("scala", 2), "sc")
  Judge.check("curry와의 왕복")(uncurry(curry((a: Int, b: Int) => a * 10 + b))(4, 7), 47)
  Judge.check("curry 왕복 순서 확인")(uncurry(curry((s: String, n: Int) => s * n))("ab", 2), "abab")
  Judge.check("결과가 Boolean")(uncurry((a: Int) => (b: Int) => a < b)(2, 1), false)
