@main def tests(): Unit =
  Judge.check("정수 덧셈 부분 적용")(partial1(10, (a: Int, b: Int) => a + b)(5), 15)
  Judge.check("첫 인자 위치 유지: 뺄셈")(partial1(10, (a: Int, b: Int) => a - b)(3), 7)
  Judge.check("타입이 다른 인자")(partial1("ab", (s: String, n: Int) => s * n)(3), "ababab")
  Judge.check("결과 타입이 다름")(partial1(4, (a: Int, b: Int) => a < b)(9), true)
  Judge.check("한 번 만든 함수를 여러 번")({ val f = partial1(2, (a: Int, b: Int) => a * b); scala.List(1, 2, 3).map(f) }, scala.List(2, 4, 6))
  Judge.check("greet")(greet("Scala"), "Hello, Scala")
  Judge.check("greet 빈 문자열")(greet(""), "Hello, ")
