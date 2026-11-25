@main def tests(): Unit =
  val p = Poly(List(1, 2, 3))
  Judge.check("x=2")(p(2), 17)
  Judge.check("x=0은 상수항")(p(0), 1)
  Judge.check("음수 x")(p(-1), 2)
  Judge.check("빈 계수")(Poly(Nil)(5), 0)
  Judge.check("상수 다항식")(Poly(List(7))(100), 7)
