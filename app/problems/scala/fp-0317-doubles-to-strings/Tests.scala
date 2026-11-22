@main def tests(): Unit =
  Judge.check("여러 값")(doublesToStrings(List(1.0, 2.5, -3.25)), List("1.0", "2.5", "-3.25"))
  Judge.check("빈 리스트")(doublesToStrings(Nil), Nil)
  Judge.check("정수처럼 보이는 값")(doublesToStrings(List(0.0)), List("0.0"))
  Judge.check("순서 유지")(doublesToStrings(List(3.5, 1.5, 2.5)), List("3.5", "1.5", "2.5"))
  Judge.check("지수 표기")(doublesToStrings(List(1.0e10)), List((1.0e10).toString))
