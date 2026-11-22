@main def tests(): Unit =
  Judge.check("n이 1이면 비어 있음")(powersBelow(1), Nil)
  Judge.check("n이 0")(powersBelow(0), Nil)
  Judge.check("n이 2")(powersBelow(2), List(1))
  Judge.check("n이 9")(powersBelow(9), List(1, 2, 4, 8))
  Judge.check("n이 거듭제곱이면 n은 제외")(powersBelow(8), List(1, 2, 4))
  Judge.check("n이 100")(powersBelow(100), List(1, 2, 4, 8, 16, 32, 64))
