@main def tests(): Unit =
  Judge.check("빈 리스트")(isArithmetic(Nil), true)
  Judge.check("원소 하나")(isArithmetic(List(4)), true)
  Judge.check("증가 등차")(isArithmetic(List(1, 3, 5, 7)), true)
  Judge.check("감소 등차")(isArithmetic(List(9, 6, 3, 0, -3)), true)
  Judge.check("모두 같음")(isArithmetic(List(2, 2, 2)), true)
  Judge.check("끝에서 깨짐")(isArithmetic(List(1, 2, 3, 5)), false)
  Judge.check("차의 부호가 바뀜")(isArithmetic(List(1, 3, 2)), false)
  Judge.check("중간에서 깨짐")(isArithmetic(List(0, 2, 4, 5, 6)), false)
