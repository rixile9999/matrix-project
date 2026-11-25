@main def tests(): Unit =
  Judge.check("기본")(withTax(List(100, 250, 30)), List(110, 275, 33))
  Judge.check("빈 리스트")(withTax(Nil), List.empty[Int])
  Judge.check("정수 나눗셈은 버린다")(withTax(List(9, 19)), List(9, 20))
  Judge.check("원소 하나")(withTax(List(1000)), List(1100))
