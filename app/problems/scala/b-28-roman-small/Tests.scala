@main def tests(): Unit =
  Judge.check("1")(romanSmall(1), "I")
  Judge.check("3")(romanSmall(3), "III")
  Judge.check("정의된 값")(romanSmall.isDefinedAt(2), true)
  Judge.check("0은 정의되지 않음")(romanSmall.isDefinedAt(0), false)
  Judge.check("4는 lift하면 None")(romanSmall.lift(4), None)
  Judge.check("collect는 정의된 값만")(List(3, 7, 1, -2).collect(romanSmall), List("III", "I"))
