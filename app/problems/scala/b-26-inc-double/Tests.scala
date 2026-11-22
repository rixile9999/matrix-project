@main def tests(): Unit =
  Judge.check("먼저 더하고 2배")(incThenDouble(3), 8)
  Judge.check("먼저 2배 하고 더하기")(doubleThenInc(3), 7)
  Judge.check("0에서 더하고 2배")(incThenDouble(0), 2)
  Judge.check("0에서 2배 하고 더하기")(doubleThenInc(0), 1)
  Judge.check("리스트에 적용")(List(1, 2).map(incThenDouble), List(4, 6))
