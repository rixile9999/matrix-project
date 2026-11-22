@main def tests(): Unit =
  Judge.check("기본")(runningTotal(List(1, 2, 3, 4)), List(1, 3, 6, 10))
  Judge.check("빈 리스트")(runningTotal(Nil), List.empty[Int])
  Judge.check("원소 하나")(runningTotal(List(5)), List(5))
  Judge.check("음수로 되돌아감")(runningTotal(List(3, -3, 2)), List(3, 0, 2))
