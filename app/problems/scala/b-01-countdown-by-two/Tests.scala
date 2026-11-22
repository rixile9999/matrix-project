@main def tests(): Unit =
  Judge.check("홀수에서 시작")(countdown(7), List(7, 5, 3, 1))
  Judge.check("짝수에서 시작, 0 포함")(countdown(6), List(6, 4, 2, 0))
  Judge.check("0")(countdown(0), List(0))
  Judge.check("1")(countdown(1), List(1))
  Judge.check("음수")(countdown(-3), List.empty[Int])
