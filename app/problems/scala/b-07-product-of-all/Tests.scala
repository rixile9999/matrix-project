@main def tests(): Unit =
  Judge.check("기본")(product(List(2, 3, 4)), 24)
  Judge.check("빈 리스트")(product(Nil), 1)
  Judge.check("원소 하나")(product(List(5)), 5)
  Judge.check("음수 포함")(product(List(-2, 3)), -6)
