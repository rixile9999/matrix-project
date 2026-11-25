@main def tests(): Unit =
  Judge.check("기본")(transform(List(1, 2, 3)), List(3, 5, 7))
  Judge.check("0과 음수")(transform(List(0, -1, -5)), List(1, -1, -9))
  Judge.check("빈 리스트")(transform(Nil), List.empty[Int])
  Judge.check("하나")(transform(List(10)), List(21))
