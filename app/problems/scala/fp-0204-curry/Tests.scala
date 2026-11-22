@main def tests(): Unit =
  Judge.check("덧셈")(curry((a: Int, b: Int) => a + b)(2)(3), 5)
  Judge.check("인자 순서 유지: 뺄셈")(curry((a: Int, b: Int) => a - b)(10)(3), 7)
  Judge.check("타입이 다른 인자")(curry((s: String, n: Int) => s.take(n))("scala")(2), "sc")
  Judge.check("첫 인자만 적용해 재사용")({ val addFive = curry((a: Int, b: Int) => a + b)(5); scala.List(1, 2, 3).map(addFive) }, scala.List(6, 7, 8))
  Judge.check("첫 인자가 다르면 다른 함수")({ val p = curry((a: Int, b: Int) => a * b); (p(2)(10), p(3)(10)) }, (20, 30))
  Judge.check("결과가 Boolean")(curry((a: Int, b: Int) => a < b)(1)(2), true)
